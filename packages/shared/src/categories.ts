/** Catégories figées (cahier des charges §2). Ne pas rendre dynamique pour l'instant. */
export const CATEGORIES = [
  'epicerie_fine',
  'epicerie_salee',
  'epicerie_sucree',
  'fruits',
  'legumes',
  'produits_frais',
  'boissons',
  'cosmetiques_hygiene',
  'produits_entretien',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  epicerie_fine: 'Épicerie fine',
  epicerie_salee: 'Épicerie salée',
  epicerie_sucree: 'Épicerie sucrée',
  fruits: 'Fruits',
  legumes: 'Légumes',
  produits_frais: 'Produits frais',
  boissons: 'Boissons',
  cosmetiques_hygiene: 'Cosmétiques / hygiène',
  produits_entretien: "Produits d'entretien",
};

/** Unité pertinente pour exprimer une quantité de stock. */
export const UNITS = ['unite', 'g', 'l', 'm', 'pourcent'] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  unite: 'unité(s)',
  g: 'grammes',
  l: 'litres',
  m: 'mètres',
  pourcent: '% restant',
};

/**
 * Seuils d'alerte "stock bas" par défaut, utilisés quand la ligne n'a pas de
 * `seuil_alerte` explicite dans le Sheet. Valeurs arbitraires de démarrage,
 * ajustables par l'agent Interface / QA sans toucher au schéma.
 */
export const DEFAULT_LOW_STOCK_THRESHOLD: Record<Unit, number> = {
  unite: 1,
  g: 100,
  l: 0.3,
  m: 0.5,
  pourcent: 15,
};

/**
 * Seuil "stock bas" par défaut pour les liquides, en nombre de contenants (pas en litres) :
 * la contenance varie d'un produit à l'autre, donc un seuil en litres n'a pas de sens générique.
 * Remplace DEFAULT_LOW_STOCK_THRESHOLD.l pour toute comparaison sur un produit liquide.
 */
export const DEFAULT_LOW_STOCK_CONTAINERS = 1;
