import { UNIT_LABELS, type Category, type Unit } from './categories';

/**
 * Calcule la quantité à ajouter au total à partir d'un conditionnement.
 * Ex: pack de 6 bouteilles de 1.5 L -> nombreContenants=6, contenanceUnitaire=1.5 -> 9 L.
 * Pour un achat unitaire simple, nombreContenants=1.
 */
export function computeDeltaFromPack(nombreContenants: number, contenanceUnitaire: number): number {
  if (nombreContenants <= 0 || contenanceUnitaire <= 0) {
    throw new Error('nombreContenants et contenanceUnitaire doivent être strictement positifs');
  }
  return nombreContenants * contenanceUnitaire;
}

/** Arrondi d'affichage (2 décimales) sans accumuler d'erreurs flottantes en stockage. */
export function roundForDisplay(quantite: number): number {
  return Math.round(quantite * 100) / 100;
}

export interface PackagedQuantityDisplay {
  /** Contenants pleins, non entamés. */
  fullContainers: number;
  /** % restant du dernier contenant entamé, ou null si aucun contenant n'est entamé. */
  lastContainerPercent: number | null;
  /** fullContainers + 1 si un dernier contenant est entamé, sinon fullContainers. */
  totalContainers: number;
}

/**
 * Décompose un stock conditionné (liquide ou solide en contenants identiques : bouteilles,
 * pots de yaourt...) en contenants pleins + % du dernier entamé. Le % vient de la jauge du
 * dernier contenant (cf. ProductOut) : il ne doit jamais se traduire en quantité brute pour
 * l'utilisateur, seulement servir à compter "combien de contenants ai-je / me faut-il".
 */
export function computePackagedQuantityDisplay(
  quantiteTotale: number,
  contenanceUnitaire: number,
): PackagedQuantityDisplay {
  if (!(contenanceUnitaire > 0) || !(quantiteTotale > 0)) {
    return { fullContainers: 0, lastContainerPercent: null, totalContainers: 0 };
  }

  const ratio = quantiteTotale / contenanceUnitaire;
  const fullContainers = Math.floor(ratio + 1e-6);
  const remainderRatio = ratio - fullContainers;

  if (remainderRatio < 0.02) {
    return { fullContainers, lastContainerPercent: null, totalContainers: fullContainers };
  }
  return {
    fullContainers,
    lastContainerPercent: Math.round(remainderRatio * 100),
    totalContainers: fullContainers + 1,
  };
}

/**
 * Ex: "2 contenants (3 L)" ou "3 contenants (300 grammes)" ou, contenant entamé,
 * "6 contenants (8.2 L, dernier à 47%)". Toujours les deux informations à la fois — le compte de
 * contenants (ce qu'on manipule à l'achat/au rangement) ET la quantité brute totale (ce que
 * pèse/contient le stock réellement) — jamais l'une sans l'autre.
 *
 * `niveauDernierContenant` (0-100 ou null) est le niveau du dernier contenant mémorisé
 * séparément (cf. InventoryLine.niveau_dernier_contenant, réglable dans Sortie) : purement
 * cosmétique, il prime sur le reste calculé à partir de `quantiteTotale` (qui, lui, reste
 * toujours un compte entier de contenants et ne doit jamais produire ce %). Absent/`undefined`,
 * on retombe sur le reste dérivé de `quantiteTotale` (cas d'une quantité brute non arrondie
 * saisie ailleurs que via Sortie, ex. le champ "précis").
 */
export function formatContainerQuantity(
  quantiteTotale: number,
  contenanceUnitaire: number,
  unite: Unit,
  niveauDernierContenant?: number | null,
): string {
  const { lastContainerPercent, totalContainers } = computePackagedQuantityDisplay(quantiteTotale, contenanceUnitaire);
  const totalLabel = `${roundForDisplay(quantiteTotale)} ${UNIT_LABELS[unite]}`;
  const percent = niveauDernierContenant !== undefined ? niveauDernierContenant : lastContainerPercent;
  const countLabel = `${totalContainers} contenant${totalContainers > 1 ? 's' : ''}`;
  const detail = percent === null ? totalLabel : `${totalLabel}, dernier à ${percent}%`;
  return `${countLabel} (${detail})`;
}

/**
 * Vrai quand il ne reste plus qu'un seul contenant (entier ou entamé) en stock — c'est la seule
 * situation où `niveau_dernier_contenant` (cf. models.ts) a un sens : au-delà d'un contenant, ou
 * à 0, ce niveau cosmétique doit être remis à `null` (cf. `resetNiveauDernierContenant`).
 */
export function isLastContainerQuantity(quantiteTotale: number, contenanceUnitaire: number): boolean {
  return contenanceUnitaire > 0 && quantiteTotale > 0 && quantiteTotale <= contenanceUnitaire + 1e-6;
}

/**
 * Remet `niveau_dernier_contenant` à `null` dès que le stock ne représente plus "un seul
 * contenant restant" (remonté à 2+ contenants après un achat, ou totalement épuisé) : ce niveau
 * ne décrit jamais que LE dernier contenant, jamais un état antérieur devenu obsolète.
 */
export function resetNiveauDernierContenant(
  quantiteTotale: number,
  contenanceUnitaire: number,
  niveauActuel: number | null,
): number | null {
  return isLastContainerQuantity(quantiteTotale, contenanceUnitaire) ? niveauActuel : null;
}

// Pour entretien/hygiène/boissons/thés, "combien de paquets restants" perd son sens une fois qu'il
// n'en reste qu'un : mieux vaut jauger le niveau du dernier contenant en pourcentage (ex. le
// dernier flacon de vinaigre passe de 100% à 50%, le dernier paquet de "thé vert menthe" de 100% à
// 30%) que de compter en fractions de contenant. Purement cosmétique (cf.
// InventoryLine.niveau_dernier_contenant) : le stock réel (le "vrai compte") reste toujours un
// nombre entier de contenants. Partagé entre Sortie ET Entrée : le niveau doit être réglable des
// deux côtés, exactement comme pour un produit en `unite='pourcent'`.
export const GAUGE_CATEGORIES: Category[] = ['produits_entretien', 'cosmetiques_hygiene', 'boissons', 'thes'];

export function isLastContainerGauge(line: {
  categorie: Category;
  unite: Unit;
  quantite_totale: number;
  contenance_unitaire: number;
}): boolean {
  return (
    GAUGE_CATEGORIES.includes(line.categorie) &&
    line.unite !== 'unite' &&
    line.unite !== 'pourcent' &&
    isLastContainerQuantity(line.quantite_totale, line.contenance_unitaire)
  );
}

/**
 * Grandeur comparable à un seuil "stock bas" : pour les liquides, en nombre de contenants
 * (fractionnaire, ex. 1.4) plutôt qu'en litres — un seuil en litres n'a pas de sens générique
 * puisque la contenance varie d'un produit à l'autre. Pour les autres unités, la quantité brute.
 */
export function stockComparableQuantity(line: {
  unite: Unit;
  quantite_totale: number;
  contenance_unitaire: number;
}): number {
  if (line.unite === 'l' && line.contenance_unitaire > 0) {
    return line.quantite_totale / line.contenance_unitaire;
  }
  return line.quantite_totale;
}

/**
 * "Un pack" ne veut rien dire tout seul : on affiche toujours le total ET le détail par
 * contenant, jamais l'un sans l'autre, dès que la contenance unitaire est significative.
 * Pour les liquides et solides conditionnés (unite 'l'/'g' — bouteilles, pots de yaourt...), le
 * détail devient "N contenants (X L/g)" (cf. formatContainerQuantity) : le compte de contenants
 * ET la quantité brute totale, toujours les deux ensemble.
 */
export function formatQuantityDetailed(
  quantiteTotale: number,
  contenanceUnitaire: number,
  unite: Unit,
  niveauDernierContenant?: number | null,
): string {
  if ((unite === 'l' || unite === 'g') && contenanceUnitaire > 0) {
    return formatContainerQuantity(quantiteTotale, contenanceUnitaire, unite, niveauDernierContenant);
  }

  const total = `${roundForDisplay(quantiteTotale)} ${UNIT_LABELS[unite]}`;

  // Une "contenance unitaire" n'apporte rien de plus quand l'unité EST déjà l'unité de compte
  // (unite/pourcent), ou quand il n'y a qu'un seul contenant (contenance == total).
  if (unite === 'unite' || unite === 'pourcent') return total;
  if (!(contenanceUnitaire > 0) || Math.abs(contenanceUnitaire - quantiteTotale) < 0.001) return total;

  const count = quantiteTotale / contenanceUnitaire;
  const rounded = Math.round(count);
  const countLabel = Math.abs(count - rounded) < 0.02 ? `${rounded}` : `≈${count.toFixed(1)}`;
  return `${total} (${countLabel} × ${roundForDisplay(contenanceUnitaire)} ${UNIT_LABELS[unite]})`;
}

export interface ParsedQuantity {
  contenanceUnitaire: number;
  unite: Unit;
  nombreContenants?: number;
  deltaPack?: number;
}

const NUMBER = '\\d+(?:[.,]\\d+)?';
// Séparateur "x" toléré sous plusieurs graphies rencontrées en pratique (Open*Facts, saisie
// manuelle, import Chronodrive) : "x"/"X" ASCII, "×" signe multiplication, "*" astérisque.
const PACK_RE = new RegExp(`^(${NUMBER})\\s*[x×*]\\s*(${NUMBER})\\s*([a-zµ%]*)$`, 'i');
const SIMPLE_RE = new RegExp(`^(${NUMBER})\\s*([a-zµ%]*)$`, 'i');
// Préfixe français fréquent devant un pack ("Pack de 6 x 1,5 L", "Lot de 12") : ignoré avant le
// matching, il ne change pas la quantité elle-même.
const PACK_PREFIX_RE = /^(?:pack|lot|carton)\s+de\s+/i;

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

/**
 * Parseur tolérant d'une chaîne de contenance/conditionnement (ex: "1.5 l", "500 g",
 * "6 x 1.5 l", "2x125g"). Partagé entre le scan produit (Open*Facts `product.quantity`)
 * et l'import Chronodrive (champ "Poids ou quantité") : ce sont le même format de texte,
 * pas deux formats différents à parser séparément. Retourne null si non reconnu (l'UI
 * ou l'appelant demandera alors la contenance manuellement).
 */
export function parseQuantity(raw: string): ParsedQuantity | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(PACK_PREFIX_RE, '')
    .replace(',', '.')
    .replace(/\s+/g, ' ');

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

    if (converted.unit === 'unite') {
      // Pas de poids/volume reconnu (ex: "12 rouleaux", "4 sachets", ou un simple "4") : ce
      // nombre décrit COMBIEN d'articles individuels sont dans le lot, pas la taille d'UN gros
      // contenant. Un article compté à l'unité fait toujours 1 unité ; le nombre lu devient le
      // nombre de contenants, pour pouvoir baisser le stock un par un (ex. rouleau par rouleau)
      // plutôt que de tout retirer d'un coup.
      return {
        contenanceUnitaire: 1,
        unite: 'unite',
        nombreContenants: converted.value,
        deltaPack: converted.value,
      };
    }

    return { contenanceUnitaire: converted.value, unite: converted.unit };
  }

  return null;
}
