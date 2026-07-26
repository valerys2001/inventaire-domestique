/**
 * Contrat de nommage des onglets/colonnes du Google Sheet.
 * Toute lecture/écriture (PWA ET extension Chrome) DOIT passer par ces constantes
 * plutôt que par des chaînes en dur, pour garder un seul point de vérité.
 */

export const SHEET_TAB_INVENTAIRE = 'Inventaire';
export const SHEET_TAB_MOUVEMENTS = 'Mouvements';

/** Ordre des colonnes = ordre des cellules A, B, C... dans l'onglet Inventaire. */
export const INVENTAIRE_COLUMNS = [
  'id',
  'nom',
  'marque',
  'categorie',
  'contenance_unitaire',
  'unite',
  'quantite_totale',
  'code_barre',
  'date_maj',
  'utilisateur',
  'cle_fusion',
  'seuil_alerte',
] as const;

/** Ordre des colonnes de l'onglet Mouvements (journal append-only). */
export const MOUVEMENTS_COLUMNS = ['date', 'cle_fusion', 'delta', 'type', 'utilisateur', 'commentaire'] as const;

export const INVENTAIRE_RANGE = `${SHEET_TAB_INVENTAIRE}!A:L`;
export const MOUVEMENTS_RANGE = `${SHEET_TAB_MOUVEMENTS}!A:F`;
