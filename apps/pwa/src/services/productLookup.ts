import { parseQuantity, type Category, type ProductLookupResult } from '@inventaire/shared';

export { parseQuantity };

const FETCH_TIMEOUT_MS = 5000;

type LookupSource = Exclude<ProductLookupResult['source'], 'manuel'>;

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
interface OpenFactsProduct {
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

const HYGIENE_KEYWORDS = [
  'cosmetic',
  'hygiene',
  'shampoo',
  'soap',
  'toothpaste',
  'deodorant',
  'skin-care',
  'shower-gel',
  'perfume',
  'body-care',
];
const CLEANING_KEYWORDS = [
  'cleaning',
  'detergent',
  'laundry',
  'household',
  'dish-washing',
  'disinfectant',
  'entretien',
  'menage',
];
const FRUIT_KEYWORDS = ['fruit'];
const VEGETABLE_KEYWORDS = ['vegetable', 'legume'];
const FRESH_KEYWORDS = ['dairies', 'dairy', 'fresh', 'meat', 'fish', 'cheese', 'yogurt', 'yoghurt', 'milk', 'charcuterie'];
// Eau, soda, jus, vin, bière... vont dans "Boissons", pas "Épicerie sucrée" (une boisson n'est
// pas un produit sucré). Testé AVANT les mots-clés sucré/salé pour éviter tout chevauchement
// (ex. "sweetened-beverages" contient "sweet" mais doit rester une boisson).
const BEVERAGE_KEYWORDS = ['beverages', 'waters', 'water', 'sodas', 'soda', 'juice', 'wine', 'wines', 'beer', 'beers', 'alcohol', 'alcoholic-beverages'];
const SWEET_KEYWORDS = ['sugar', 'sweet', 'chocolate', 'biscuit', 'cake', 'candies', 'dessert'];
// La soupe est salée, pas sucrée, même si "canned" est un indice ambigu par ailleurs.
const SALTY_KEYWORDS = ['salty', 'snack', 'chips', 'pasta', 'rice', 'canned', 'sauces', 'condiment', 'soup', 'soups', 'soupe'];
const FINE_KEYWORDS = ['gourmet', 'foie-gras', 'caviar', 'truffle', 'fine-grocery'];

/**
 * Heuristique simple de catégorisation : suggestion seulement, jamais imposée.
 * L'utilisateur confirme/corrige toujours la catégorie dans l'UI.
 */
function suggestCategory(source: LookupSource, product: OpenFactsProduct): Category | null {
  const tags = collectTags(product);

  if (source === 'open-beauty-facts' || matchesAny(tags, HYGIENE_KEYWORDS)) return 'cosmetiques_hygiene';
  if (matchesAny(tags, CLEANING_KEYWORDS)) return 'produits_entretien';
  if (matchesAny(tags, FRUIT_KEYWORDS)) return 'fruits';
  if (matchesAny(tags, VEGETABLE_KEYWORDS)) return 'legumes';
  if (matchesAny(tags, FRESH_KEYWORDS)) return 'produits_frais';
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
        tags.push(tag.split(':').pop()!.toLowerCase());
      }
    }
  }

  if (typeof product.categories === 'string') {
    for (const category of product.categories.split(',')) {
      tags.push(category.trim().toLowerCase());
    }
  }

  return tags;
}

function matchesAny(tags: string[], keywords: string[]): boolean {
  return tags.some((tag) => keywords.some((keyword) => tag.includes(keyword)));
}
