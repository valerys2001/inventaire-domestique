/**
 * `code_barre` stocke une liste de codes-barres séparés par ";" plutôt qu'un seul — un même
 * produit physique existe souvent sous plusieurs EAN différents (bouteille seule, pack de 6...),
 * cf. bouton "Fusionner" du panneau "Modifier les articles". Un seul code-barre reste le cas
 * courant (liste à un seul élément), aucune migration nécessaire pour les lignes existantes.
 *
 * Chaque entrée peut en plus porter son propre "nombre de contenants" mémorisé, au format
 * `barcode:count` (ex: `3057640257427:6` pour l'EAN du pack de 6). C'est indispensable après une
 * fusion pack <-> bouteille seule : les deux EAN pointent alors vers la MÊME ligne (même stock),
 * mais chaque EAN doit garder son propre conditionnement au rescan — scanner la bouteille seule ne
 * doit jamais réutiliser le "6" mémorisé pour l'EAN du pack. Une entrée sans suffixe (le cas
 * courant, et toutes les lignes créées avant cet ajout) n'a pas de conditionnement mémorisé propre.
 */
export function parseBarcodes(codeBarre: string | null): string[] {
  return parseBarcodeEntries(codeBarre).map((entry) => entry.barcode);
}

export interface BarcodeEntry {
  barcode: string;
  /** Nombre de contenants mémorisé pour CET EAN précis, ou null si jamais renseigné. */
  nombreContenants: number | null;
}

export function parseBarcodeEntries(codeBarre: string | null): BarcodeEntry[] {
  if (!codeBarre) return [];
  return codeBarre
    .split(';')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const sepIndex = raw.lastIndexOf(':');
      if (sepIndex === -1) return { barcode: raw, nombreContenants: null };
      const barcode = raw.slice(0, sepIndex).trim();
      const count = Number(raw.slice(sepIndex + 1).trim());
      return { barcode, nombreContenants: count > 0 ? count : null };
    })
    .filter((entry) => entry.barcode.length > 0);
}

/** Nombre de contenants mémorisé pour un EAN précis (indépendamment des autres EAN fusionnés). */
export function getNombreContenantsForBarcode(codeBarre: string | null, barcode: string): number | null {
  const entry = parseBarcodeEntries(codeBarre).find((e) => e.barcode === barcode);
  return entry?.nombreContenants ?? null;
}

/** Fusionne plusieurs listes de codes-barres en une chaîne dédupliquée, ou null si aucune. */
export function joinBarcodes(barcodes: string[]): string | null {
  const unique = [...new Set(barcodes.map((b) => b.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(';') : null;
}

/**
 * Pendant de `joinBarcodes` qui préserve le conditionnement par EAN. En cas de doublon (même EAN
 * apporté par deux entrées, ex. lors d'une fusion), la première entrée avec un conditionnement
 * connu gagne.
 */
export function joinBarcodeEntries(entries: BarcodeEntry[]): string | null {
  const byBarcode = new Map<string, number | null>();
  for (const entry of entries) {
    const barcode = entry.barcode.trim();
    if (!barcode) continue;
    const existing = byBarcode.get(barcode);
    if (existing === undefined) {
      byBarcode.set(barcode, entry.nombreContenants);
    } else if (existing === null && entry.nombreContenants !== null) {
      byBarcode.set(barcode, entry.nombreContenants);
    }
  }
  if (byBarcode.size === 0) return null;
  return [...byBarcode.entries()].map(([barcode, count]) => (count ? `${barcode}:${count}` : barcode)).join(';');
}

/**
 * Met à jour (ou ajoute) le conditionnement mémorisé d'un EAN précis, sans toucher aux autres EAN
 * de la liste. Utilisé à chaque saisie confirmée par scan, pour que la correction faite au second
 * scan d'un EAN donné s'applique immédiatement à CET EAN, sans écraser celui des autres EAN
 * fusionnés sur la même ligne.
 */
export function upsertBarcodeCount(codeBarre: string | null, barcode: string, nombreContenants: number | null): string {
  const entries = parseBarcodeEntries(codeBarre);
  const index = entries.findIndex((e) => e.barcode === barcode);
  if (index === -1) {
    entries.push({ barcode, nombreContenants });
  } else {
    entries[index] = { barcode, nombreContenants };
  }
  return joinBarcodeEntries(entries) ?? barcode;
}
