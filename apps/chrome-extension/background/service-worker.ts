/**
 * NUANCE OAUTH IMPORTANTE : une extension Chrome ne peut pas littéralement "réutiliser"
 * le token OAuth d'un onglet web de la PWA — ce sont deux contextes d'exécution
 * séparés (page web vs. service worker d'extension), chacun avec son propre cycle
 * d'authentification. L'équivalent correct côté extension est chrome.identity.getAuthToken
 * (API Chrome Identity, Manifest V3), configuré avec le MÊME client OAuth Google
 * (client_id, cf. manifest.json > oauth2.client_id) que la PWA — ou un client id
 * distinct de type "Chrome App" mais autorisé sur le même projet Google Cloud — et
 * avec le même compte Google connecté au navigateur. On partage donc le même
 * UTILISATEUR (et le même projet OAuth), pas le même token technique.
 */

import {
  INVENTAIRE_COLUMNS,
  INVENTAIRE_RANGE,
  MOUVEMENTS_RANGE,
  SHEET_TAB_INVENTAIRE,
  rowToInventoryLine,
  inventoryLineToRow,
  movementToRow,
  resolveMerge,
  parseQuantity,
  computeDeltaFromPack,
  lastColumnLetter,
  type CandidateEntry,
  type InventoryLine,
  type Movement,
  type Category,
  type Unit,
} from '@inventaire/shared';

// Duplication volontaire et minimale de la forme envoyée par le content script :
// le passage par chrome.runtime.sendMessage n'est pas typé de bout en bout, donc on
// revalide/retype ici plutôt que d'importer un fichier du content script.
interface ScrapedItem {
  nom: string;
  marque?: string;
  quantityRaw?: string;
}

// Chronodrive ne fournit pas de catégorie exploitable automatiquement (pas d'équivalent
// direct avec les 8 catégories figées du cahier des charges). Plutôt qu'inventer une
// catégorie "à deviner" par heuristique fragile, on assigne une catégorie par défaut et
// on documente explicitement, dans le commentaire du mouvement journalisé, que la ligne
// nécessite une recatégorisation manuelle depuis la PWA (le schéma Inventaire n'a pas de
// champ dédié "à catégoriser" — cf. packages/shared/src/sheetsSchema.ts — donc on utilise
// le champ libre `commentaire` de Mouvements plutôt que d'étendre le contrat de schéma).
const DEFAULT_CATEGORY: Category = 'epicerie_salee';
const DEFAULT_UNIT: Unit = 'unite';
const EXTENSION_USER = 'extension-chronodrive';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

class SheetsApiError extends Error {
  status: number;

  constructor(status: number, body: string) {
    super(`Sheets API error ${status}: ${body}`);
    this.status = status;
  }
}

async function getAuthToken(interactive: boolean): Promise<string> {
  const result = await chrome.identity.getAuthToken({ interactive });
  if (!result?.token) {
    throw new Error("Impossible d'obtenir un token Google (utilisateur non connecté ou consentement refusé).");
  }
  return result.token;
}

async function sheetsFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

async function getValues(spreadsheetId: string, range: string, token: string): Promise<string[][]> {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await sheetsFetch(url, token);
  if (!res.ok) throw new SheetsApiError(res.status, await res.text());
  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}

async function appendValues(spreadsheetId: string, range: string, values: string[][], token: string): Promise<void> {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await sheetsFetch(url, token, { method: 'POST', body: JSON.stringify({ values }) });
  if (!res.ok) throw new SheetsApiError(res.status, await res.text());
}

async function updateValues(spreadsheetId: string, range: string, values: string[][], token: string): Promise<void> {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await sheetsFetch(url, token, { method: 'PUT', body: JSON.stringify({ values }) });
  if (!res.ok) throw new SheetsApiError(res.status, await res.text());
}

/**
 * Récupère un token, exécute `run`, et en cas de 401 (token expiré/révoqué) purge
 * le cache et retente UNE fois avec un nouveau token interactif.
 * Limite connue : si le token expire APRES le GET initial mais EN COURS de boucle
 * d'écriture (cas rare vu la durée de vie ~1h des tokens), `run` est rejoué depuis
 * le début, ce qui peut réécrire des lignes déjà traitées lors du 1er passage
 * (idempotent pour les updates de quantité totale, mais peut dupliquer des lignes
 * "create" et des mouvements). Acceptable pour ce MVP ; à durcir si besoin (ex:
 * découper l'import en transactions plus fines) dans une itération ultérieure.
 */
async function withAuthRetry<T>(run: (token: string) => Promise<T>): Promise<T> {
  const token = await getAuthToken(true);
  try {
    return await run(token);
  } catch (err) {
    if (err instanceof SheetsApiError && err.status === 401) {
      await chrome.identity.removeCachedAuthToken({ token });
      const freshToken = await getAuthToken(true);
      return await run(freshToken);
    }
    throw err;
  }
}

async function importItems(spreadsheetId: string, items: ScrapedItem[], token: string): Promise<number> {
  const values = await getValues(spreadsheetId, INVENTAIRE_RANGE, token);
  const [, ...dataRows] = values; // 1ère ligne = en-têtes de colonnes (cf. INVENTAIRE_COLUMNS)
  const existingLines: InventoryLine[] = dataRows.map(rowToInventoryLine);

  const rowByClefusion = new Map<string, number>();
  existingLines.forEach((line, idx) => rowByClefusion.set(line.cle_fusion, idx + 2));
  // Hypothèse simplificatrice : les lignes créées par cet import s'ajoutent
  // séquentiellement juste après la dernière ligne existante (aucune écriture
  // concurrente pendant l'import). Raisonnable pour un import déclenché à la main.
  let nextRow = existingLines.length + 2;

  const now = new Date().toISOString();
  let processed = 0;

  for (const item of items) {
    if (!item?.nom) continue;

    // "Poids ou quantité" décrit le conditionnement du produit (ex. "4 x 125 g" = une
    // boîte de 4 portions), pas le nombre de boîtes commandées. On l'explose donc en
    // contenance_unitaire/unite/delta avec le même parseur que le scan (règle 3bis) ;
    // s'il est absent ou non reconnu, on retombe sur 1 unité (l'utilisateur corrige
    // ensuite dans la PWA, comme pour la catégorie par défaut).
    const parsed = item.quantityRaw ? parseQuantity(item.quantityRaw) : null;
    const contenance_unitaire = parsed?.contenanceUnitaire ?? 1;
    const unite = parsed?.unite ?? DEFAULT_UNIT;
    const delta = parsed?.deltaPack ?? (parsed ? computeDeltaFromPack(1, parsed.contenanceUnitaire) : 1);

    const candidate: CandidateEntry = {
      nom: item.nom,
      marque: item.marque ?? '',
      categorie: DEFAULT_CATEGORY,
      contenance_unitaire,
      unite,
      delta,
      code_barre: null,
    };

    // Logique de fusion/cumul partagée avec la PWA et le scan (packages/shared) :
    // ne pas réimplémenter de comparaison de doublons ici.
    const decision = resolveMerge(candidate, existingLines);

    if (decision.action === 'merge') {
      const rowNumber = rowByClefusion.get(decision.cle_fusion);
      if (rowNumber === undefined) {
        throw new Error(`Ligne existante introuvable pour la clé de fusion ${decision.cle_fusion}`);
      }
      const updatedLine: InventoryLine = {
        ...decision.target,
        quantite_totale: decision.nouvelle_quantite,
        date_maj: now,
      };
      await updateValues(
        spreadsheetId,
        `${SHEET_TAB_INVENTAIRE}!A${rowNumber}:${lastColumnLetter(INVENTAIRE_COLUMNS.length)}${rowNumber}`,
        [inventoryLineToRow(updatedLine)],
        token,
      );
      const idx = existingLines.findIndex((line) => line.cle_fusion === decision.cle_fusion);
      existingLines[idx] = updatedLine;
    } else {
      const newLine: InventoryLine = {
        id: crypto.randomUUID(),
        nom: candidate.nom,
        marque: candidate.marque,
        categorie: candidate.categorie,
        contenance_unitaire: candidate.contenance_unitaire,
        unite: candidate.unite,
        quantite_totale: candidate.delta,
        code_barre: null,
        date_maj: now,
        utilisateur: EXTENSION_USER,
        cle_fusion: decision.cle_fusion,
        seuil_alerte: null,
        quantite_cible: null,
      };
      const rowNumber = nextRow;
      nextRow += 1;
      await appendValues(spreadsheetId, INVENTAIRE_RANGE, [inventoryLineToRow(newLine)], token);
      existingLines.push(newLine);
      rowByClefusion.set(decision.cle_fusion, rowNumber);
    }

    const movement: Movement = {
      date: now,
      cle_fusion: decision.cle_fusion,
      delta: candidate.delta,
      type: 'entree_extension',
      utilisateur: EXTENSION_USER,
      commentaire: `Chronodrive : ${item.nom}${item.marque ? ` (${item.marque})` : ''} — catégorie par défaut à vérifier dans la PWA`,
    };
    await appendValues(spreadsheetId, MOUVEMENTS_RANGE, [movementToRow(movement)], token);

    processed += 1;
  }

  return processed;
}

// Nombre de commandes récentes mémorisées pour la détection de doublon (évite une croissance
// illimitée de chrome.storage.local ; largement suffisant pour repérer un double-clic accidentel
// ou une réimportation du même jour/semaine).
const IMPORTED_ORDERS_STORAGE_KEY = 'importedOrderIds';
const MAX_REMEMBERED_ORDERS = 200;

async function isOrderAlreadyImported(orderId: string): Promise<boolean> {
  const { [IMPORTED_ORDERS_STORAGE_KEY]: ids } = await chrome.storage.local.get(IMPORTED_ORDERS_STORAGE_KEY);
  return Array.isArray(ids) && ids.includes(orderId);
}

async function rememberImportedOrder(orderId: string): Promise<void> {
  const { [IMPORTED_ORDERS_STORAGE_KEY]: ids } = await chrome.storage.local.get(IMPORTED_ORDERS_STORAGE_KEY);
  const existing: string[] = Array.isArray(ids) ? ids : [];
  const updated = [...existing.filter((id) => id !== orderId), orderId].slice(-MAX_REMEMBERED_ORDERS);
  await chrome.storage.local.set({ [IMPORTED_ORDERS_STORAGE_KEY]: updated });
}

type HandleScrapedItemsResult = { alreadyImported: true } | { alreadyImported: false; count: number };

async function handleScrapedItems(
  items: ScrapedItem[],
  orderId: string | null,
  force: boolean,
): Promise<HandleScrapedItemsResult> {
  if (orderId && !force && (await isOrderAlreadyImported(orderId))) {
    return { alreadyImported: true };
  }

  if (!Array.isArray(items) || items.length === 0) return { alreadyImported: false, count: 0 };

  const { spreadsheetId } = await chrome.storage.sync.get('spreadsheetId');
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    throw new Error(
      "Aucun Google Sheet configuré : ouvrez le popup de l'extension pour renseigner l'ID du spreadsheet.",
    );
  }

  const count = await withAuthRetry((token) => importItems(spreadsheetId, items, token));

  await chrome.storage.local.set({
    lastImportCount: count,
    lastImportDate: new Date().toISOString(),
  });
  if (orderId) await rememberImportedOrder(orderId);

  return { alreadyImported: false, count };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'CHRONODRIVE_ITEMS_SCRAPED') {
    return undefined;
  }

  const orderId = typeof message.orderId === 'string' ? message.orderId : null;
  const force = Boolean(message.force);

  handleScrapedItems(message.items as ScrapedItem[], orderId, force)
    .then((result) =>
      sendResponse(result.alreadyImported ? { ok: true, alreadyImported: true } : { ok: true, count: result.count }),
    )
    .catch((err) => {
      console.error('[Inventaire][background] import Chronodrive échoué', err);
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });

  return true; // indique une réponse asynchrone à sendResponse
});
