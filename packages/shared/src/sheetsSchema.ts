/**
 * Contrat de nommage des onglets/colonnes du Google Sheet.
 * Toute lecture/écriture (PWA ET extension Chrome) DOIT passer par ces constantes
 * plutôt que par des chaînes en dur, pour garder un seul point de vérité.
 */

export const SHEET_TAB_INVENTAIRE = 'Inventaire';
export const SHEET_TAB_MOUVEMENTS = 'Mouvements';
export const SHEET_TAB_LISTE_COURSES = 'ListeCourses';

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
  'quantite_cible',
  'nombre_contenants_defaut',
  'niveau_dernier_contenant',
] as const;

/** Ordre des colonnes de l'onglet Mouvements (journal append-only). */
export const MOUVEMENTS_COLUMNS = ['date', 'cle_fusion', 'delta', 'type', 'utilisateur', 'commentaire'] as const;

/** Ordre des colonnes de l'onglet ListeCourses (liste de courses générée, partagée et éditable). */
export const LISTE_COURSES_COLUMNS = [
  'id',
  'nom',
  'marque',
  'categorie',
  'quantite',
  'unite',
  'contenance_unitaire',
] as const;

export const INVENTAIRE_RANGE = `${SHEET_TAB_INVENTAIRE}!A:O`;
export const MOUVEMENTS_RANGE = `${SHEET_TAB_MOUVEMENTS}!A:F`;
export const LISTE_COURSES_RANGE = `${SHEET_TAB_LISTE_COURSES}!A:G`;

/**
 * Lettre de colonne Sheets pour un nombre de colonnes donné (1 -> A, 26 -> Z, 27 -> AA...).
 * Partagé entre la PWA et l'extension pour éviter qu'une plage de mise à jour ligne-par-ligne
 * (ex. `A{n}:L{n}`) reste figée en dur et se désynchronise du nombre réel de colonnes après un
 * ajout de champ au schéma (déjà arrivé une fois avec quantite_cible).
 */
export function lastColumnLetter(columnCount: number): string {
  let n = columnCount;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
