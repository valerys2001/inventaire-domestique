import { normalize, parseQuantity, type Category, type ProductLookupResult } from '@inventaire/shared';

export { parseQuantity };

const FETCH_TIMEOUT_MS = 5000;

export type LookupSource = Exclude<ProductLookupResult['source'], 'manuel'>;

interface SourceConfig {
  source: LookupSource;
  buildUrl: (barcode: string) => string;
}

const SOURCES: SourceConfig[] = [
  { source: 'open-food-facts', buildUrl: (b) => `https://world.openfoodfacts.org/api/v2/product/${b}.json` },
  { source: 'open-beauty-facts', buildUrl: (b) => `https://world.openbeautyfacts.org/api/v2/product/${b}.json` },
  {
    source: 'open-products-facts',
    buildUrl: (b) => `https://world.openproductsfacts.org/api/v2/product/${b}.json`,
  },
];

/** Sous-ensemble des champs Open*Facts réellement utilisés, le reste de la charge utile est ignoré. */
export interface OpenFactsProduct {
  product_name?: string | null;
  brands?: string | null;
  quantity?: string | null;
  image_front_url?: string | null;
  image_url?: string | null;
  categories?: string | null;
  categories_tags?: string[] | null;
}

interface OpenFactsApiResponse {
  status?: number;
  status_verbose?: string;
  product?: OpenFactsProduct;
}

/**
 * Recherche un produit par code-barres en cascade OFF -> OBF -> OPF.
 * Retourne un résultat `source: 'manuel'` (tous les champs à null hormis `code_barre`) si le
 * produit n'est trouvé sur aucune des 3 bases, ou si le réseau est indisponible : l'UI doit
 * alors basculer sur le formulaire de saisie manuelle pré-rempli avec le code-barres.
 */
export async function lookupProduct(barcode: string): Promise<ProductLookupResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return manualResult(barcode);
  }

  for (const { source, buildUrl } of SOURCES) {
    const product = await fetchProduct(buildUrl(barcode));
    if (product) {
      return buildResult(barcode, source, product);
    }
  }

  return manualResult(barcode);
}

function manualResult(barcode: string): ProductLookupResult {
  return {
    source: 'manuel',
    code_barre: barcode,
    nom: null,
    marque: null,
    quantity_raw: null,
    contenance_unitaire: null,
    unite: null,
    categorie_suggeree: null,
    image_url: null,
  };
}

async function fetchProduct(url: string): Promise<OpenFactsProduct | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const data = (await response.json()) as OpenFactsApiResponse;
    if (data.status !== 1 || !data.product) return null;

    return data.product;
  } catch {
    // Réseau indisponible, timeout, ou JSON invalide : on considère simplement que la source n'a rien.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildResult(barcode: string, source: LookupSource, product: OpenFactsProduct): ProductLookupResult {
  const quantityRaw = product.quantity?.trim() || null;
  const parsedQuantity = quantityRaw ? parseQuantity(quantityRaw) : null;

  const result: ProductLookupResult = {
    source,
    code_barre: barcode,
    nom: nonEmpty(product.product_name),
    marque: firstBrand(product.brands),
    quantity_raw: quantityRaw,
    contenance_unitaire: parsedQuantity?.contenanceUnitaire ?? null,
    unite: parsedQuantity?.unite ?? null,
    categorie_suggeree: suggestCategory(source, product),
    image_url: nonEmpty(product.image_front_url) ?? nonEmpty(product.image_url),
  };

  if (parsedQuantity?.nombreContenants !== undefined) {
    result.nombre_contenants = parsedQuantity.nombreContenants;
    result.delta_pack = parsedQuantity.deltaPack;
  }

  return result;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function firstBrand(brands: string | null | undefined): string | null {
  if (!brands) return null;
  const first = brands.split(',')[0]?.trim();
  return first ? first : null;
}

// Open*Facts renvoie des tags structurés en anglais (categories_tags, déjà couverts) MAIS le
// champ libre `categories` est très souvent en français pour les produits français peu/mal
// taggés — d'où un mot-clé français à côté de chaque mot-clé anglais, jamais l'un sans l'autre.
// Les mots courts ambigus (ex. "vin", "eau", "sale") sont évités : ils apparaissent en préfixe
// de mots sans rapport ("vinaigre", "veau", "salade") et provoqueraient un mauvais classement -
// on préfère la forme plus longue ou le pluriel qui ne collisionne pas (cf. tests).
const HYGIENE_KEYWORDS = [
  'cosmetic',
  'cosmetique',
  'cosmetiques',
  'hygiene',
  'shampoo',
  'shampooing',
  'shampooings',
  'soap',
  'savon',
  'savons',
  'toothpaste',
  'dentifrice',
  'dentifrices',
  'deodorant',
  'deodorants',
  'skin-care',
  'shower-gel',
  'perfume',
  'parfum',
  'parfums',
  'body-care',
];
const CLEANING_KEYWORDS = [
  'cleaning',
  'detergent',
  'lessive',
  'lessives',
  'laundry',
  'household',
  'dish-washing',
  'vaisselle',
  'disinfectant',
  'desinfectant',
  'desinfectants',
  'nettoyant',
  'nettoyants',
  'nettoyage',
  'entretien',
  'menage',
];
const FRUIT_KEYWORDS = ['fruit', 'fruits'];
const VEGETABLE_KEYWORDS = ['vegetable', 'vegetables', 'legume', 'legumes'];
const FRESH_KEYWORDS = [
  'dairies',
  'dairy',
  'fresh',
  'frais',
  'meat',
  'viande',
  'viandes',
  'fish',
  'poisson',
  'poissons',
  'cheese',
  'fromage',
  'fromages',
  'yogurt',
  'yoghurt',
  'yaourt',
  'yaourts',
  'milk',
  'lait',
  'laitier',
  'laitiers',
  'charcuterie',
];
// Les thés/infusions sont catégorisés par Open Food Facts comme une sous-catégorie de
// "beverages" (ex. tags "hot-beverages, teas") : testé AVANT BEVERAGE_KEYWORDS pour que "Thés"
// gagne sur "Boissons" plutôt que l'inverse. Pas de "the"/"thé" seul (accent retiré = "the",
// qui matcherait l'anglais "the" dans n'importe quel tag) : formes plus longues/sûres uniquement,
// même logique que "vins"/"salee" ailleurs dans ce fichier.
const TEA_KEYWORDS = ['teas', 'thes', 'infusion', 'infusions', 'tisane', 'tisanes', 'rooibos'];
// Même logique que TEA_KEYWORDS : le café est catégorisé par Open Food Facts comme une
// sous-catégorie de "beverages" (ex. tags "hot-beverages, coffees"), testé AVANT BEVERAGE_KEYWORDS
// pour que "Cafés" gagne sur "Boissons". "cafe"/"cafes" sans risque de faux positif ici (pas de
// mot français courant qui les contienne accidentellement, contrairement à "the"/"vin"/"sale").
const COFFEE_KEYWORDS = ['cafes', 'cafe', 'coffee', 'coffees', 'espresso', 'expresso'];
// Eau, soda, jus, vin, bière... vont dans "Boissons", pas "Épicerie sucrée" (une boisson n'est
// pas un produit sucré). Testé AVANT les mots-clés sucré/salé pour éviter tout chevauchement
// (ex. "sweetened-beverages" contient "sweet" mais doit rester une boisson).
const BEVERAGE_KEYWORDS = [
  'beverages',
  'boisson',
  'boissons',
  'waters',
  'water',
  'eaux', // pas "eau" seul : préfixe de "veau" (viande) et autres faux positifs
  'sodas',
  'soda',
  'juice',
  'jus',
  'wine',
  'wines',
  'vins', // pas "vin" seul : préfixe de "vinaigre"
  'beer',
  'beers',
  'biere',
  'bieres',
  'alcohol',
  'alcool',
  'alcools',
  'alcoholic-beverages',
  'sirop',
  'sirops',
];
const SWEET_KEYWORDS = [
  'sugar',
  'sucre',
  'sucres',
  'sucree',
  'sucrees',
  'sweet',
  'chocolate',
  'chocolat',
  'chocolats',
  'biscuit',
  'cake',
  'gateau',
  'gateaux',
  'candies',
  'confiserie',
  'confiseries',
  'bonbon',
  'bonbons',
  'dessert',
];
// La soupe est salée, pas sucrée, même si "canned" est un indice ambigu par ailleurs.
const SALTY_KEYWORDS = [
  'salty',
  'salee', // pas "sale" seul : préfixe de "salade" (légume/frais, pas épicerie salée)
  'salees',
  'snack',
  'chips',
  'pasta',
  'pates',
  'rice',
  'riz',
  'canned',
  'conserve',
  'conserves',
  'sauces',
  'sauce',
  'condiment',
  'condiments',
  'soup',
  'soups',
  'soupe',
  'soupes',
];
const FINE_KEYWORDS = ['gourmet', 'gastronomie', 'foie-gras', 'caviar', 'truffle', 'truffe', 'truffes', 'fine-grocery'];

/**
 * Heuristique simple de catégorisation : suggestion seulement, jamais imposée.
 * L'utilisateur confirme/corrige toujours la catégorie dans l'UI.
 */
export function suggestCategory(source: LookupSource, product: OpenFactsProduct): Category | null {
  const tags = collectTags(product);

  if (source === 'open-beauty-facts' || matchesAny(tags, HYGIENE_KEYWORDS)) return 'cosmetiques_hygiene';
  if (matchesAny(tags, CLEANING_KEYWORDS)) return 'produits_entretien';
  if (matchesAny(tags, FRUIT_KEYWORDS)) return 'fruits';
  if (matchesAny(tags, VEGETABLE_KEYWORDS)) return 'legumes';
  if (matchesAny(tags, FRESH_KEYWORDS)) return 'produits_frais';
  if (matchesAny(tags, TEA_KEYWORDS)) return 'thes';
  if (matchesAny(tags, COFFEE_KEYWORDS)) return 'cafes';
  if (matchesAny(tags, BEVERAGE_KEYWORDS)) return 'boissons';
  if (matchesAny(tags, SWEET_KEYWORDS)) return 'epicerie_sucree';
  if (matchesAny(tags, SALTY_KEYWORDS)) return 'epicerie_salee';
  if (matchesAny(tags, FINE_KEYWORDS)) return 'epicerie_fine';
  // Open Products Facts couvre surtout des produits non-alimentaires/non-cosmétiques (ménage, bricolage...).
  if (source === 'open-products-facts') return 'produits_entretien';

  return null;
}

function collectTags(product: OpenFactsProduct): string[] {
  const tags: string[] = [];

  if (Array.isArray(product.categories_tags)) {
    for (const tag of product.categories_tags) {
      if (typeof tag === 'string') {
        tags.push(normalize(tag.split(':').pop()!));
      }
    }
  }

  if (typeof product.categories === 'string') {
    for (const category of product.categories.split(',')) {
      // Le champ libre `categories` est souvent en français accentué ("Épicerie salée") : sans
      // ce retrait d'accents, aucun mot-clé ASCII ("epicerie", "salee"...) ne pourrait matcher.
      tags.push(normalize(category));
    }
  }

  return tags;
}

function matchesAny(tags: string[], keywords: string[]): boolean {
  return tags.some((tag) => keywords.some((keyword) => tag.includes(keyword)));
}
