import { computeDeltaFromPack, type Category, type ProductLookupResult, type Unit } from '@inventaire/shared';

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

interface ParsedQuantity {
  contenanceUnitaire: number;
  unite: Unit;
  nombreContenants?: number;
  deltaPack?: number;
}

const NUMBER = '\\d+(?:[.,]\\d+)?';
const PACK_RE = new RegExp(`^(${NUMBER})\\s*x\\s*(${NUMBER})\\s*([a-zµ%]*)$`, 'i');
const SIMPLE_RE = new RegExp(`^(${NUMBER})\\s*([a-zµ%]*)$`, 'i');

/**
 * Parseur tolérant de `product.quantity` (ex: "1.5 l", "500 g", "6 x 1.5 l", "2x125g").
 * Retourne null si le format n'est pas reconnu (l'UI demandera alors la contenance manuellement).
 */
export function parseQuantity(raw: string): ParsedQuantity | null {
  const normalized = raw.trim().toLowerCase().replace(',', '.').replace(/\s+/g, ' ');

  const packMatch = normalized.match(PACK_RE);
  if (packMatch) {
    const nombreContenants = parseFloat(packMatch[1]);
    const rawValue = parseFloat(packMatch[2]);
    const converted = convertUnit(rawValue, packMatch[3]);
    if (!converted || nombreContenants <= 0) return null;

    return {
      contenanceUnitaire: converted.value,
      unite: converted.unit,
      nombreContenants,
      deltaPack: computeDeltaFromPack(nombreContenants, converted.value),
    };
  }

  const simpleMatch = normalized.match(SIMPLE_RE);
  if (simpleMatch) {
    const rawValue = parseFloat(simpleMatch[1]);
    const converted = convertUnit(rawValue, simpleMatch[2]);
    if (!converted) return null;

    return { contenanceUnitaire: converted.value, unite: converted.unit };
  }

  return null;
}

function convertUnit(value: number, token: string): { value: number; unit: Unit } | null {
  if (!Number.isFinite(value) || value <= 0) return null;

  switch (token.trim()) {
    case 'l':
    case 'litre':
    case 'litres':
      return { value, unit: 'l' };
    case 'cl':
      return { value: value * 0.01, unit: 'l' };
    case 'ml':
      return { value: value * 0.001, unit: 'l' };
    case 'kg':
      return { value: value * 1000, unit: 'g' };
    case 'g':
    case 'gr':
    case 'gramme':
    case 'grammes':
      return { value, unit: 'g' };
    default:
      // Unité non reconnue (ou absente, ex: "4") : on retombe sur 'unite', laissant l'UI corriger.
      return { value, unit: 'unite' };
  }
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
const SWEET_KEYWORDS = ['sugar', 'sweet', 'chocolate', 'biscuit', 'cake', 'candies', 'dessert', 'beverages', 'waters', 'sodas', 'juice'];
const SALTY_KEYWORDS = ['salty', 'snack', 'chips', 'pasta', 'rice', 'canned', 'sauces', 'condiment'];
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
