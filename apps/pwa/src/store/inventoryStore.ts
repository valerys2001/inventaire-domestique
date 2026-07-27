import { create } from 'zustand';
import type { Category, InventoryLine, MovementType, PendingOperation } from '@inventaire/shared';
import { resolveMerge, type CandidateEntry, type MergeDecision } from '@inventaire/shared';
import { getCachedInventory, setCachedInventory } from '../services/localCache';
import { enqueue, flush, getPendingCount } from '../services/offlineQueue';
import { clearMovements, fetchInventory } from '../services/sheetsClient';
import { getCachedToken, getConfiguredSpreadsheetId, requestAccessToken } from '../services/googleAuth';

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
  syncing: boolean;
  syncError: string | null;
  loadFromCache: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
  /**
   * Pousse d'abord la file locale (flush) puis relit le Sheet, dans cet ordre :
   * si on relisait avant de pousser, les opérations pas encore synchronisées de CET
   * appareil seraient écrasées par l'état serveur (elles ne sont déjà "vues" que dans
   * le cache local optimiste, pas encore côté serveur).
   */
  syncNow: (options?: { interactive?: boolean }) => Promise<void>;
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
  syncing: false,
  syncError: null,

  loadFromCache: async () => {
    const lines = await getCachedInventory();
    set({ lines });
    await get().refreshPendingCount();
  },

  refreshPendingCount: async () => {
    const pendingCount = await getPendingCount();
    set({ pendingCount });
  },

  syncNow: async ({ interactive = false } = {}) => {
    if (get().syncing) return;
    set({ syncing: true, syncError: null });
    try {
      const spreadsheetId = getConfiguredSpreadsheetId();
      let token = getCachedToken();
      if (!token) {
        try {
          // interactive:false -> prompt:'none' (aucune popup) : réussit silencieusement si une
          // session Google + un consentement valides existent déjà, échoue silencieusement sinon.
          token = await requestAccessToken(interactive);
        } catch (err) {
          if (interactive) throw err;
          return; // pas encore connecté / session expirée : normal en synchro automatique
        }
      }

      await flush(spreadsheetId, token);
      const serverLines = await fetchInventory(spreadsheetId, token);
      await setCachedInventory(serverLines);
      set({ lines: serverLines });
      await get().refreshPendingCount();
      // Purge après coup : le journal Mouvements n'est qu'un audit humain jamais relu par la
      // logique de sync, donc le vider ici n'affecte pas la cohérence — ça évite juste que le
      // Sheet grossisse indéfiniment. Non bloquant pour le reste de la sync s'il échoue.
      await clearMovements(spreadsheetId, token).catch(() => {});
    } catch (err) {
      set({ syncError: err instanceof Error ? err.message : 'Synchronisation impossible.' });
    } finally {
      set({ syncing: false });
    }
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
    // Tentative de sync immédiate, silencieuse (pas de popup) : ne bloque pas la saisie si elle
    // échoue (hors-ligne, pas encore connecté) - l'opération reste de toute façon dans la file.
    void get().syncNow();

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
    void get().syncNow();
  },

  setFilterCategory: (filterCategory) => set({ filterCategory }),

  setUtilisateur: (utilisateur) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UTILISATEUR_STORAGE_KEY, utilisateur);
    }
    set({ utilisateur });
  },

  /**
   * `cle_fusion` doit rester unique par ligne : c'est la clé sur laquelle Backend-Sync
   * relit la valeur serveur avant d'appliquer un delta, et sur laquelle `resolveMerge`
   * recherche une ligne existante. Créer une seconde ligne portant la même clé (une
   * vraie "séparation") rendrait les deux lignes indiscernables pour ces deux
   * mécanismes. "Annuler" ne fait donc qu'annuler la fusion (retire le delta ajouté) ;
   * une séparation réelle n'a de sens que pour une contenance unitaire différente,
   * ce qui crée déjà naturellement une `cle_fusion` distincte via une saisie normale.
   */
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

    set({
      lines: state.lines.map((line) => (line.id === target.id ? revertedLine : line)),
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
    await get().refreshPendingCount();
    void get().syncNow();
  },
}));
