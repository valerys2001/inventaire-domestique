import { create } from 'zustand';
import type { Category, InventoryLine, ListeCoursesItem, MovementType, PendingOperation } from '@inventaire/shared';
import { buildListeCoursesKey, buildMergeKey, resolveMerge, type CandidateEntry, type MergeDecision } from '@inventaire/shared';
import {
  getCachedInventory,
  getCachedListeCourses,
  removePendingOperationsForCleFusion,
  setCachedInventory,
  setCachedListeCourses,
} from '../services/localCache';
import { enqueue, flush, getPendingCount } from '../services/offlineQueue';
import {
  clearListeCourses,
  clearMovements,
  deleteInventoryLine,
  fetchInventory,
  fetchListeCourses,
  upsertInventoryLine,
  upsertListeCoursesItem,
} from '../services/sheetsClient';
import { getCachedToken, getConfiguredSpreadsheetId, requestAccessToken, signOut } from '../services/googleAuth';

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
    quantite_cible: line.quantite_cible,
    nombre_contenants_defaut: line.nombre_contenants_defaut,
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
  /**
   * Règle (ou retire, avec `null`) le seuil "Besoins" d'un produit. Réutilise `seuil_alerte` :
   * une ligne avec un seuil explicite est celle que l'utilisateur a choisi de suivre dans
   * l'onglet Besoins, pas seulement le seuil générique par défaut (qui s'applique à tout le
   * monde sans opt-in). Delta 0 : ceci ne change jamais la quantité.
   */
  updateThreshold: (cle_fusion: string, seuilAlerte: number | null) => Promise<void>;
  /**
   * Corrige n'importe quel champ descriptif d'un produit déjà enregistré (panneau "Modifier les
   * articles" des réglages) : une erreur à la première saisie (scan mal catégorisé, contenance
   * mal lue, saisie manuelle hâtive) doit pouvoir être corrigée sans ressaisir le produit. Si
   * nom/marque/contenance_unitaire/unite changent, `cle_fusion` est recalculée (elle en dépend) ;
   * si la nouvelle valeur entre en collision avec une AUTRE ligne existante, l'édition est
   * refusée plutôt que de fusionner silencieusement deux lignes en une seule cle_fusion ambiguë.
   */
  updateArticle: (
    id: string,
    patch: Partial<
      Pick<
        InventoryLine,
        'nom' | 'marque' | 'categorie' | 'contenance_unitaire' | 'unite' | 'quantite_totale' | 'nombre_contenants_defaut'
      >
    >,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Supprime définitivement une ligne du Sheet (panneau "Modifier les articles"). Contrairement
   * au reste de l'app, ce n'est PAS mis en file offline : une suppression est rare, délibérée, et
   * doit échouer bruyamment plutôt que silencieusement si la connexion manque, plutôt que risquer
   * de supprimer la mauvaise ligne après une resynchronisation tardive.
   */
  deleteArticle: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** true dès qu'un jeton Google valide a été obtenu (silencieusement ou via un clic) — sert de
   * porte d'entrée à l'app : tant que false, l'UI n'affiche qu'un écran de connexion. */
  connected: boolean;
  signOutGoogle: () => void;

  /** Liste de courses générée, partagée (onglet ListeCourses). */
  listeCourses: ListeCoursesItem[];
  listeCoursesLoading: boolean;
  listeCoursesError: string | null;
  loadListeCourses: () => Promise<void>;
  /**
   * Règle la quantité cible du mode "Construction de liste" pour un produit (partagée entre
   * appareils, comme seuil_alerte). Ne modifie jamais quantite_totale : c'est un brouillon, pas
   * un mouvement de stock.
   */
  updateTargetQuantity: (cle_fusion: string, quantiteCible: number | null) => Promise<void>;
  /**
   * Calcule l'écart (cible - actuel) pour chaque produit dont la cible dépasse le stock actuel,
   * l'envoie dans l'onglet ListeCourses (fusionné avec la liste déjà existante par produit+marque+
   * unité), puis remet à null la cible de ces lignes dans l'Inventaire - le brouillon est
   * "résolu" une fois transformé en liste.
   */
  generateShoppingList: () => Promise<void>;
  /** Modifie la quantité d'un article déjà généré ; 0 le retire de l'affichage (pas de suppression
   * de ligne, plus simple qu'une suppression de ligne Sheets et suffisant côté UI). */
  updateShoppingListItem: (id: string, quantite: number) => Promise<void>;
  /** Vide entièrement la liste de courses générée. */
  deleteShoppingList: () => Promise<void>;
}

export const useInventoryStore = create<InventoryStoreState>((set, get) => ({
  lines: [],
  pendingCount: 0,
  filterCategory: 'toutes',
  utilisateur: readStoredUtilisateur(),
  lastEntry: null,
  syncing: false,
  syncError: null,
  connected: false,
  listeCourses: [],
  listeCoursesLoading: false,
  listeCoursesError: null,

  loadFromCache: async () => {
    const [lines, listeCourses] = await Promise.all([getCachedInventory(), getCachedListeCourses()]);
    set({ lines, listeCourses });
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

      set({ connected: true });
      await flush(spreadsheetId, token);
      const [serverLines, serverListeCourses] = await Promise.all([
        fetchInventory(spreadsheetId, token),
        fetchListeCourses(spreadsheetId, token),
      ]);
      await Promise.all([setCachedInventory(serverLines), setCachedListeCourses(serverListeCourses)]);
      set({ lines: serverLines, listeCourses: serverListeCourses });
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
        // Contrairement aux autres champs descriptifs (ignorés en fusion, cf. règle 3bis), celui-ci
        // est explicitement mis à jour à chaque saisie : c'est tout l'intérêt de la mémorisation —
        // une correction faite au second scan doit s'appliquer immédiatement, pas seulement à un
        // hypothétique troisième scan.
        nombre_contenants_defaut: candidate.nombre_contenants ?? decision.target.nombre_contenants_defaut,
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
        quantite_cible: null,
        nombre_contenants_defaut: candidate.nombre_contenants ?? null,
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

  updateThreshold: async (cle_fusion, seuilAlerte) => {
    const state = get();
    const target = state.lines.find((line) => line.cle_fusion === cle_fusion);
    if (!target) return;

    const nowIso = new Date().toISOString();
    const utilisateur = state.utilisateur || 'local';
    const updatedLine: InventoryLine = { ...target, seuil_alerte: seuilAlerte, date_maj: nowIso, utilisateur };
    set({ lines: state.lines.map((line) => (line.id === target.id ? updatedLine : line)) });

    await enqueue({
      local_id: crypto.randomUUID(),
      cle_fusion,
      line_snapshot: toLineSnapshot(updatedLine, utilisateur),
      delta: 0,
      type: 'entree_manuelle',
      utilisateur,
      created_at: nowIso,
    });
    await get().refreshPendingCount();
    void get().syncNow();
  },

  updateArticle: async (id, patch) => {
    const state = get();
    const target = state.lines.find((line) => line.id === id);
    if (!target) return { ok: false, error: 'Produit introuvable.' };

    const nom = patch.nom ?? target.nom;
    const marque = patch.marque ?? target.marque;
    const categorie = patch.categorie ?? target.categorie;
    const contenance_unitaire = patch.contenance_unitaire ?? target.contenance_unitaire;
    const unite = patch.unite ?? target.unite;
    const quantite_totale = patch.quantite_totale ?? target.quantite_totale;
    const nombre_contenants_defaut =
      patch.nombre_contenants_defaut !== undefined ? patch.nombre_contenants_defaut : target.nombre_contenants_defaut;

    const cle_fusion = buildMergeKey(nom, marque, contenance_unitaire, unite);
    const collision = state.lines.find((line) => line.id !== target.id && line.cle_fusion === cle_fusion);
    if (collision) {
      return {
        ok: false,
        error: `Un produit identique existe déjà ("${collision.nom} ${collision.marque}") — fusionnez-les plutôt que d'avoir deux fiches.`,
      };
    }

    const nowIso = new Date().toISOString();
    const utilisateur = state.utilisateur || 'local';
    const delta = quantite_totale - target.quantite_totale;
    const updatedLine: InventoryLine = {
      ...target,
      nom,
      marque,
      categorie,
      contenance_unitaire,
      unite,
      quantite_totale,
      cle_fusion,
      nombre_contenants_defaut,
      date_maj: nowIso,
      utilisateur,
    };
    set({ lines: state.lines.map((line) => (line.id === target.id ? updatedLine : line)) });

    // cle_fusion AVANT édition : sert de pivot pour retrouver la ligne côté cache/serveur au
    // flush (cf. applyOptimistic/flushOne) ; line_snapshot porte déjà la NOUVELLE cle_fusion.
    await enqueue({
      local_id: crypto.randomUUID(),
      cle_fusion: target.cle_fusion,
      line_snapshot: toLineSnapshot(updatedLine, utilisateur),
      delta,
      type: delta >= 0 ? 'entree_manuelle' : 'sortie',
      utilisateur,
      created_at: nowIso,
    });
    await get().refreshPendingCount();
    void get().syncNow();
    return { ok: true };
  },

  deleteArticle: async (id) => {
    const state = get();
    const target = state.lines.find((line) => line.id === id);
    if (!target) return { ok: false, error: 'Produit introuvable.' };

    try {
      const spreadsheetId = getConfiguredSpreadsheetId();
      let token = getCachedToken();
      if (!token) token = await requestAccessToken(true);
      await deleteInventoryLine(spreadsheetId, token, id);

      const updatedLines = state.lines.filter((line) => line.id !== id);
      await Promise.all([
        setCachedInventory(updatedLines),
        removePendingOperationsForCleFusion(target.cle_fusion),
      ]);
      set({ lines: updatedLines });
      await get().refreshPendingCount();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Suppression impossible.' };
    }
  },

  signOutGoogle: () => {
    signOut();
    set({ connected: false });
  },

  loadListeCourses: async () => {
    await get().syncNow({ interactive: true });
  },

  updateTargetQuantity: async (cle_fusion, quantiteCible) => {
    const state = get();
    const target = state.lines.find((line) => line.cle_fusion === cle_fusion);
    if (!target) return;

    const nowIso = new Date().toISOString();
    const utilisateur = state.utilisateur || 'local';
    const updatedLine: InventoryLine = { ...target, quantite_cible: quantiteCible, date_maj: nowIso, utilisateur };
    set({ lines: state.lines.map((line) => (line.id === target.id ? updatedLine : line)) });

    await enqueue({
      local_id: crypto.randomUUID(),
      cle_fusion,
      line_snapshot: toLineSnapshot(updatedLine, utilisateur),
      delta: 0,
      type: 'entree_manuelle',
      utilisateur,
      created_at: nowIso,
    });
    await get().refreshPendingCount();
    void get().syncNow();
  },

  generateShoppingList: async () => {
    const state = get();
    const toGenerate = state.lines
      .filter((line) => line.quantite_cible !== null && line.quantite_cible > line.quantite_totale)
      .map((line) => ({ line, diff: line.quantite_cible! - line.quantite_totale }));
    if (toGenerate.length === 0) return;

    set({ listeCoursesLoading: true, listeCoursesError: null });
    try {
      const spreadsheetId = getConfiguredSpreadsheetId();
      // Action explicite déclenchée par un clic sur "Générer la liste" : interactive:true est
      // légitime ici (peut ouvrir la popup de consentement si besoin).
      let token = getCachedToken();
      if (!token) token = await requestAccessToken(true);

      let listeCourses = await fetchListeCourses(spreadsheetId, token);
      const nowIso = new Date().toISOString();

      for (const { line, diff } of toGenerate) {
        const key = buildListeCoursesKey(line.nom, line.marque, line.contenance_unitaire, line.unite);
        const existingItem = listeCourses.find(
          (it) => buildListeCoursesKey(it.nom, it.marque, it.contenance_unitaire, it.unite) === key,
        );

        if (existingItem) {
          const updatedItem: ListeCoursesItem = { ...existingItem, quantite: existingItem.quantite + diff };
          await upsertListeCoursesItem(spreadsheetId, token, updatedItem);
          listeCourses = listeCourses.map((it) => (it.id === existingItem.id ? updatedItem : it));
        } else {
          const newItem: ListeCoursesItem = {
            id: crypto.randomUUID(),
            nom: line.nom,
            marque: line.marque,
            categorie: line.categorie,
            quantite: diff,
            unite: line.unite,
            contenance_unitaire: line.contenance_unitaire,
          };
          await upsertListeCoursesItem(spreadsheetId, token, newItem);
          listeCourses = [...listeCourses, newItem];
        }

        // Le brouillon est "résolu" une fois transformé en liste : la cible ne représente plus
        // rien tant qu'une nouvelle construction de liste ne la redéfinit pas.
        const resolvedLine: InventoryLine = { ...line, quantite_cible: null, date_maj: nowIso };
        await upsertInventoryLine(spreadsheetId, token, resolvedLine);
      }

      const resolvedIds = new Set(toGenerate.map((x) => x.line.id));
      const updatedLines = state.lines.map((line) => (resolvedIds.has(line.id) ? { ...line, quantite_cible: null } : line));

      await Promise.all([setCachedInventory(updatedLines), setCachedListeCourses(listeCourses)]);
      set({ lines: updatedLines, listeCourses });
    } catch (err) {
      set({ listeCoursesError: err instanceof Error ? err.message : 'Génération de la liste impossible.' });
    } finally {
      set({ listeCoursesLoading: false });
    }
  },

  updateShoppingListItem: async (id, quantite) => {
    const state = get();
    const target = state.listeCourses.find((item) => item.id === id);
    if (!target) return;

    const updatedItem: ListeCoursesItem = { ...target, quantite: Math.max(0, quantite) };
    const updatedList = state.listeCourses.map((item) => (item.id === id ? updatedItem : item));
    set({ listeCourses: updatedList });
    await setCachedListeCourses(updatedList);

    set({ listeCoursesLoading: true, listeCoursesError: null });
    try {
      const spreadsheetId = getConfiguredSpreadsheetId();
      let token = getCachedToken();
      if (!token) token = await requestAccessToken(true);
      await upsertListeCoursesItem(spreadsheetId, token, updatedItem);
    } catch (err) {
      set({ listeCoursesError: err instanceof Error ? err.message : 'Mise à jour impossible.' });
    } finally {
      set({ listeCoursesLoading: false });
    }
  },

  deleteShoppingList: async () => {
    set({ listeCoursesLoading: true, listeCoursesError: null });
    try {
      const spreadsheetId = getConfiguredSpreadsheetId();
      let token = getCachedToken();
      if (!token) token = await requestAccessToken(true);
      await clearListeCourses(spreadsheetId, token);
      await setCachedListeCourses([]);
      set({ listeCourses: [] });
    } catch (err) {
      set({ listeCoursesError: err instanceof Error ? err.message : 'Suppression impossible.' });
    } finally {
      set({ listeCoursesLoading: false });
    }
  },
}));
