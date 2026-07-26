import { create } from 'zustand';
import type { Category, InventoryLine, MovementType, PendingOperation } from '@inventaire/shared';
import { resolveMerge, type CandidateEntry, type MergeDecision } from '@inventaire/shared';
import { getCachedInventory } from '../services/localCache';
import { enqueue, getPendingCount } from '../services/offlineQueue';

const UTILISATEUR_STORAGE_KEY = 'inventaire.utilisateur';

function readStoredUtilisateur(): string {
  if (typeof localStorage === 'undefined') return 'local';
  return localStorage.getItem(UTILISATEUR_STORAGE_KEY) ?? 'local';
}

/**
 * Heuristique : une entrée détectée par scan porte toujours un code-barre, une
 * saisie manuelle directe n'en porte généralement pas. Faute d'un champ dédié
 * dans CandidateEntry (partagé), c'est le meilleur indicateur disponible pour
 * choisir le MovementType envoyé au journal.
 */
function inferEntryType(candidate: CandidateEntry): MovementType {
  return candidate.code_barre ? 'entree_scan' : 'entree_manuelle';
}

function toLineSnapshot(line: InventoryLine, utilisateur: string): PendingOperation['line_snapshot'] {
  return {
    nom: line.nom,
    marque: line.marque,
    categorie: line.categorie,
    contenance_unitaire: line.contenance_unitaire,
    unite: line.unite,
    code_barre: line.code_barre,
    utilisateur,
    cle_fusion: line.cle_fusion,
    seuil_alerte: line.seuil_alerte,
  };
}

export interface ExitPayload {
  cle_fusion: string;
  delta: number;
  utilisateur: string;
}

interface LastEntryRecord {
  candidate: CandidateEntry;
  decision: MergeDecision;
}

interface InventoryStoreState {
  lines: InventoryLine[];
  pendingCount: number;
  filterCategory: Category | 'toutes';
  utilisateur: string;
  lastEntry: LastEntryRecord | null;
  loadFromCache: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
  applyEntry: (candidate: CandidateEntry) => Promise<MergeDecision>;
  applyExit: (payload: ExitPayload) => Promise<void>;
  setFilterCategory: (category: Category | 'toutes') => void;
  setUtilisateur: (utilisateur: string) => void;
  /** Convertit la dernière fusion silencieuse en ligne distincte (action "Annuler / séparer"). */
  undoLastEntry: () => Promise<void>;
}

export const useInventoryStore = create<InventoryStoreState>((set, get) => ({
  lines: [],
  pendingCount: 0,
  filterCategory: 'toutes',
  utilisateur: readStoredUtilisateur(),
  lastEntry: null,

  loadFromCache: async () => {
    const lines = await getCachedInventory();
    set({ lines });
    await get().refreshPendingCount();
  },

  refreshPendingCount: async () => {
    const pendingCount = await getPendingCount();
    set({ pendingCount });
  },

  applyEntry: async (candidate) => {
    const state = get();
    const decision = resolveMerge(candidate, state.lines);
    const nowIso = new Date().toISOString();
    const utilisateur = state.utilisateur || 'local';
    const type = inferEntryType(candidate);

    let lineSnapshot: PendingOperation['line_snapshot'];

    if (decision.action === 'merge') {
      const updatedLine: InventoryLine = {
        ...decision.target,
        quantite_totale: decision.nouvelle_quantite,
        date_maj: nowIso,
        utilisateur,
      };
      set({
        lines: state.lines.map((line) => (line.id === decision.target.id ? updatedLine : line)),
      });
      lineSnapshot = toLineSnapshot(updatedLine, utilisateur);
    } else {
      const newLine: InventoryLine = {
        id: crypto.randomUUID(),
        nom: candidate.nom,
        marque: candidate.marque,
        categorie: candidate.categorie,
        contenance_unitaire: candidate.contenance_unitaire,
        unite: candidate.unite,
        quantite_totale: candidate.delta,
        code_barre: candidate.code_barre ?? null,
        date_maj: nowIso,
        utilisateur,
        cle_fusion: decision.cle_fusion,
        seuil_alerte: null,
      };
      set({ lines: [...state.lines, newLine] });
      lineSnapshot = toLineSnapshot(newLine, utilisateur);
    }

    const operation: PendingOperation = {
      local_id: crypto.randomUUID(),
      cle_fusion: decision.cle_fusion,
      line_snapshot: lineSnapshot,
      delta: candidate.delta,
      type,
      utilisateur,
      created_at: nowIso,
    };

    set({ lastEntry: { candidate, decision } });
    await enqueue(operation);
    await get().refreshPendingCount();

    return decision;
  },

  applyExit: async ({ cle_fusion, delta, utilisateur }) => {
    const state = get();
    const target = state.lines.find((line) => line.cle_fusion === cle_fusion);
    if (!target) return;

    const nowIso = new Date().toISOString();
    const updatedLine: InventoryLine = {
      ...target,
      quantite_totale: Math.max(0, target.quantite_totale + delta),
      date_maj: nowIso,
      utilisateur,
    };
    set({ lines: state.lines.map((line) => (line.id === target.id ? updatedLine : line)) });

    const operation: PendingOperation = {
      local_id: crypto.randomUUID(),
      cle_fusion,
      line_snapshot: toLineSnapshot(updatedLine, utilisateur),
      delta,
      type: 'sortie',
      utilisateur,
      created_at: nowIso,
    };

    await enqueue(operation);
    await get().refreshPendingCount();
  },

  setFilterCategory: (filterCategory) => set({ filterCategory }),

  setUtilisateur: (utilisateur) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UTILISATEUR_STORAGE_KEY, utilisateur);
    }
    set({ utilisateur });
  },

  undoLastEntry: async () => {
    const state = get();
    const { lastEntry } = state;
    if (!lastEntry || lastEntry.decision.action !== 'merge') return;

    const { candidate, decision } = lastEntry;
    const target = state.lines.find((line) => line.id === decision.target.id);
    if (!target) return;

    const nowIso = new Date().toISOString();
    const utilisateur = state.utilisateur || 'local';

    const revertedLine: InventoryLine = {
      ...target,
      quantite_totale: Math.max(0, target.quantite_totale - candidate.delta),
      date_maj: nowIso,
      utilisateur,
    };
    const separateLine: InventoryLine = {
      id: crypto.randomUUID(),
      nom: candidate.nom,
      marque: candidate.marque,
      categorie: candidate.categorie,
      contenance_unitaire: candidate.contenance_unitaire,
      unite: candidate.unite,
      quantite_totale: candidate.delta,
      code_barre: candidate.code_barre ?? null,
      date_maj: nowIso,
      utilisateur,
      cle_fusion: decision.cle_fusion,
      seuil_alerte: null,
    };

    set({
      lines: state.lines.map((line) => (line.id === target.id ? revertedLine : line)).concat(separateLine),
      lastEntry: null,
    });

    await enqueue({
      local_id: crypto.randomUUID(),
      cle_fusion: decision.cle_fusion,
      line_snapshot: toLineSnapshot(revertedLine, utilisateur),
      delta: -candidate.delta,
      type: 'sortie',
      utilisateur,
      created_at: nowIso,
    });
    await enqueue({
      local_id: crypto.randomUUID(),
      cle_fusion: decision.cle_fusion,
      line_snapshot: toLineSnapshot(separateLine, utilisateur),
      delta: candidate.delta,
      type: inferEntryType(candidate),
      utilisateur,
      created_at: nowIso,
    });
    await get().refreshPendingCount();
  },
}));
