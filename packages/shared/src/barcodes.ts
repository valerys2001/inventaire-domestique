/**
 * `code_barre` stocke une liste de codes-barres séparés par ";" plutôt qu'un seul — un même
 * produit physique existe souvent sous plusieurs EAN différents (bouteille seule, pack de 6...),
 * cf. bouton "Fusionner" du panneau "Modifier les articles". Un seul code-barre reste le cas
 * courant (liste à un seul élément), aucune migration nécessaire pour les lignes existantes.
 */
export function parseBarcodes(codeBarre: string | null): string[] {
  if (!codeBarre) return [];
  return codeBarre
    .split(';')
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Fusionne plusieurs listes de codes-barres en une chaîne dédupliquée, ou null si aucune. */
export function joinBarcodes(barcodes: string[]): string | null {
  const unique = [...new Set(barcodes.map((b) => b.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(';') : null;
}
