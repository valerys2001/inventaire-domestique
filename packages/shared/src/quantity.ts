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

/**
 * "Un pack" ne veut rien dire tout seul : on affiche toujours le total ET le détail par
 * contenant (ex. "9 L (6 × 1,5 L)"), jamais l'un sans l'autre, dès que la contenance unitaire
 * est significative. Le nombre de contenants est recalculé depuis quantite_totale/contenance
 * plutôt que stocké séparément (peut ne plus être un compte entier après une sortie partielle,
 * ex. un contenant entamé -> "≈X" plutôt qu'un chiffre rond trompeur).
 */
export function formatQuantityDetailed(
  quantiteTotale: number,
  contenanceUnitaire: number,
  unite: Unit,
): string {
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
