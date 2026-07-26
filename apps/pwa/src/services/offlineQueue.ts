import type { InventoryLine, PendingOperation } from '@inventaire/shared';
import {
  getCachedInventory,
  setCachedInventory,
  enqueueOperation,
  getPendingOperations,
  removePendingOperation,
} from './localCache';
import { fetchInventory, upsertInventoryLine, appendMovement } from './sheetsClient';
import { getCachedToken, getConfiguredSpreadsheetId } from './googleAuth';

/**
 * Applique l'opération au cache local de façon optimiste : incrémente la ligne existante
 * si elle est déjà connue localement (via cle_fusion), sinon matérialise une ligne à partir
 * du line_snapshot. On réutilise `local_id` comme `id` provisoire : c'est déjà un uuid généré
 * côté client destiné à servir d'identifiant, donc aucune réconciliation d'id n'est nécessaire
 * après le flush.
 */
async function applyOptimistic(op: PendingOperation): Promise<void> {
  const lines = await getCachedInventory();
  const existing = lines.find((line) => line.cle_fusion === op.cle_fusion);
  const now = new Date().toISOString();

  if (existing) {
    const updated: InventoryLine = {
      ...existing,
      quantite_totale: existing.quantite_totale + op.delta,
      date_maj: now,
    };
    await setCachedInventory(lines.map((line) => (line.cle_fusion === op.cle_fusion ? updated : line)));
    return;
  }

  const newLine: InventoryLine = {
    ...op.line_snapshot,
    id: op.local_id,
    quantite_totale: op.delta,
    date_maj: now,
  };
  await setCachedInventory([...lines, newLine]);
}

export async function enqueue(op: PendingOperation): Promise<void> {
  await applyOptimistic(op);
  await enqueueOperation(op);
}

/**
 * Relit la ligne serveur par `cle_fusion` (jamais par `id`) juste avant d'appliquer le delta :
 * entre la mise en file (offline) et le flush, un autre appareil a pu créer ou modifier cette
 * même ligne. Relire par id figerait une valeur potentiellement obsolète ou raterait une ligne
 * créée entre-temps par l'autre appareil sous un id différent ; la cle_fusion est la clé
 * fonctionnelle stable du produit (règle 3bis), donc c'est elle qui doit servir de pivot pour
 * ne jamais écraser une quantité concurrente.
 */
async function flushOne(spreadsheetId: string, token: string, op: PendingOperation): Promise<void> {
  const serverLines = await fetchInventory(spreadsheetId, token);
  const serverLine = serverLines.find((line) => line.cle_fusion === op.cle_fusion);
  const now = new Date().toISOString();

  const updatedLine: InventoryLine = serverLine
    ? { ...serverLine, quantite_totale: serverLine.quantite_totale + op.delta, date_maj: now }
    : { ...op.line_snapshot, id: op.local_id, quantite_totale: op.delta, date_maj: now };

  await upsertInventoryLine(spreadsheetId, token, updatedLine);
  await appendMovement(spreadsheetId, token, {
    date: now,
    cle_fusion: op.cle_fusion,
    delta: op.delta,
    type: op.type,
    utilisateur: op.utilisateur,
    commentaire: undefined,
  });
}

let isFlushing = false;

export async function flush(spreadsheetId: string, token: string): Promise<void> {
  if (isFlushing) {
    return;
  }
  isFlushing = true;
  try {
    const pending = await getPendingOperations();
    for (const op of pending) {
      await flushOne(spreadsheetId, token, op);
      await removePendingOperation(op.local_id);
    }
  } finally {
    isFlushing = false;
  }
}

export async function getPendingCount(): Promise<number> {
  const pending = await getPendingOperations();
  return pending.length;
}

/**
 * Le flush automatique au retour du réseau ne déclenche jamais de popup de consentement :
 * requestAccessToken() exigerait un geste utilisateur direct, absent ici (événement 'online').
 * S'il n'y a pas de jeton déjà en cache, on abandonne silencieusement ; l'UI se chargera de
 * proposer un flush manuel après la prochaine authentification interactive.
 */
async function autoFlush(): Promise<void> {
  const token = getCachedToken();
  if (!token) {
    return;
  }
  try {
    const spreadsheetId = getConfiguredSpreadsheetId();
    await flush(spreadsheetId, token);
  } catch (error) {
    console.error('Échec du flush automatique après reconnexion réseau', error);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void autoFlush();
  });
}
