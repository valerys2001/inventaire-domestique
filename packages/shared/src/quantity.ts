import { UNIT_LABELS, type Unit } from './categories';

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

export interface LiquidQuantityDisplay {
  /** Contenants pleins, non entamés. */
  fullContainers: number;
  /** % restant du dernier contenant entamé, ou null si aucun contenant n'est entamé. */
  lastContainerPercent: number | null;
  /** fullContainers + 1 si un dernier contenant est entamé, sinon fullContainers. */
  totalContainers: number;
}

/**
 * Décompose un stock liquide en contenants pleins + % du dernier entamé. Le % vient de la
 * jauge du dernier contenant (cf. ProductOut) : il ne doit jamais se traduire en litres pour
 * l'utilisateur, seulement servir à compter "combien de contenants ai-je / me faut-il".
 */
export function computeLiquidQuantityDisplay(
  quantiteTotale: number,
  contenanceUnitaire: number,
): LiquidQuantityDisplay {
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

/** Ex: "6 contenants" ou "6 contenants (dernier à 47%)". Jamais de L/mL/cL, cf. demande utilisateur. */
export function formatLiquidQuantity(quantiteTotale: number, contenanceUnitaire: number): string {
  const { lastContainerPercent, totalContainers } = computeLiquidQuantityDisplay(quantiteTotale, contenanceUnitaire);
  if (totalContainers === 0) return '0 contenant';
  const base = `${totalContainers} contenant${totalContainers > 1 ? 's' : ''}`;
  return lastContainerPercent === null ? base : `${base} (dernier à ${lastContainerPercent}%)`;
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
 * Pour les liquides (unite 'l'), le détail devient "N contenants (dernier à X%)" plutôt qu'une
 * quantité en L/mL/cL, jugée peu parlante pour ce type de produit (cf. formatLiquidQuantity).
 */
export function formatQuantityDetailed(
  quantiteTotale: number,
  contenanceUnitaire: number,
  unite: Unit,
): string {
  if (unite === 'l' && contenanceUnitaire > 0) {
    return formatLiquidQuantity(quantiteTotale, contenanceUnitaire);
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
const PACK_RE = new RegExp(`^(${NUMBER})\\s*x\\s*(${NUMBER})\\s*([a-zµ%]*)$`, 'i');
const SIMPLE_RE = new RegExp(`^(${NUMBER})\\s*([a-zµ%]*)$`, 'i');

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
