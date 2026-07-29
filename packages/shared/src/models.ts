import type { Category, Unit } from './categories';

/** Une ligne de l'onglet `Inventaire` du Google Sheet. Miroir exact des colonnes. */
export interface InventoryLine {
  id: string;
  nom: string;
  marque: string;
  categorie: Category;
  contenance_unitaire: number;
  unite: Unit;
  quantite_totale: number;
  code_barre: string | null;
  date_maj: string; // ISO datetime
  utilisateur: string;
  cle_fusion: string;
  seuil_alerte: number | null;
  /**
   * Quantité cible du mode "Construction de liste", partagée entre appareils/utilisateurs comme
   * le reste de la ligne. `null` = pas de brouillon en cours pour ce produit. Distincte de
   * quantite_totale : modifier la cible ne change jamais le stock réel, seulement l'écart calculé
   * au moment de "Générer la liste" (cible - quantite_totale, si positif).
   */
  quantite_cible: number | null;
  /**
   * Nombre de contenants mémorisé pour ce produit (ex: 6 pour "pack de 6 canettes de 33cl"),
   * réutilisé pour préremplir le champ "Nombre de contenants" au prochain scan du même
   * code-barres — sans ça, un pack sans info de conditionnement exploitable côté Open*Facts
   * retombe sur 1 à chaque scan et l'utilisateur doit recorriger indéfiniment. Écrit à chaque
   * saisie (comme categorie/contenance_unitaire), jamais imposé.
   */
  nombre_contenants_defaut: number | null;
}

/** Ligne append-only de l'onglet `Mouvements` (journal / audit). */
export type MovementType = 'entree_scan' | 'entree_manuelle' | 'entree_extension' | 'sortie';

export interface Movement {
  date: string; // ISO datetime
  cle_fusion: string;
  delta: number; // positif pour une entrée, négatif pour une sortie
  type: MovementType;
  utilisateur: string;
  commentaire?: string;
}

/** Résultat brut d'une recherche produit (OFF / OBF / OPF) avant catégorisation locale. */
export interface ProductLookupResult {
  source: 'open-food-facts' | 'open-beauty-facts' | 'open-products-facts' | 'manuel';
  code_barre: string;
  nom: string | null;
  marque: string | null;
  /** Contenance déclarée par le produit lui-même, ex. "1.5 L", "500 g", non parsée. */
  quantity_raw: string | null;
  /** Contenance unitaire parsée dans l'unité `unite` ci-dessous, si extraction possible. */
  contenance_unitaire: number | null;
  unite: Unit | null;
  /** Catégorie suggérée, jamais imposée : l'utilisateur confirme/corrige toujours. */
  categorie_suggeree: Category | null;
  image_url: string | null;
  /**
   * Extension non-cassante (agent Scan & Enrichissement) : nombre de contenants détecté quand
   * `quantity_raw` décrit un pack (ex. "6 x 1.5 l" -> 6). Absent si le produit n'est pas un pack
   * ou si la contenance n'a pas pu être parsée.
   */
  nombre_contenants?: number;
  /**
   * Extension non-cassante : quantité totale du pack déjà "explosée" via `computeDeltaFromPack`
   * (ex. "6 x 1.5 l" -> 9, dans l'unité `unite`). Fournie en plus de `contenance_unitaire` pour
   * que l'UI puisse pré-remplir directement le delta de mouvement d'un pack.
   */
  delta_pack?: number;
}

/** Une ligne de l'onglet `ListeCourses` (liste de courses générée, partagée et éditable). */
export interface ListeCoursesItem {
  id: string;
  nom: string;
  marque: string;
  categorie: Category;
  quantite: number;
  unite: Unit;
  /**
   * Contenance d'un contenant, reprise de la ligne Inventaire d'origine. Sert à afficher "N
   * contenants" pour les liquides (au lieu de litres) et à regrouper par dossier/taille comme
   * dans l'inventaire (cf. groupLiquidLines). `null` pour les produits non liquides ou les
   * articles créés avant l'ajout de ce champ.
   */
  contenance_unitaire: number | null;
}

/** Une opération en attente dans la file de synchronisation offline. */
export interface PendingOperation {
  local_id: string; // uuid généré côté client, sert d'idempotency key
  cle_fusion: string;
  /** Nécessaire pour créer la ligne si elle n'existe pas encore côté serveur au flush. */
  line_snapshot: Omit<InventoryLine, 'id' | 'quantite_totale' | 'date_maj'>;
  delta: number;
  type: MovementType;
  utilisateur: string;
  created_at: string; // ISO datetime, horodatage de création de l'opération (pas du flush)
}
