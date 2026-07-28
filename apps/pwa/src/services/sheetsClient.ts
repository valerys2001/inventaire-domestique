import {
  INVENTAIRE_COLUMNS,
  INVENTAIRE_RANGE,
  LISTE_COURSES_COLUMNS,
  LISTE_COURSES_RANGE,
  MOUVEMENTS_RANGE,
  SHEET_TAB_INVENTAIRE,
  SHEET_TAB_LISTE_COURSES,
  SHEET_TAB_MOUVEMENTS,
  rowToInventoryLine,
  inventoryLineToRow,
  movementToRow,
  rowToListeCoursesItem,
  listeCoursesItemToRow,
  lastColumnLetter,
  type InventoryLine,
  type ListeCoursesItem,
  type Movement,
} from '@inventaire/shared';
import { invalidateCachedToken, requestAccessToken } from './googleAuth';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const MAX_RATE_LIMIT_RETRIES = 3;
const BACKOFF_BASE_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SheetsValuesResponse {
  values?: string[][];
}

async function sheetsFetch(url: string, token: string, init?: RequestInit, attempt = 0): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 && attempt === 0) {
    invalidateCachedToken();
    // interactive:false - ce retry peut survenir en pleine synchro automatique en arrière-plan ;
    // il ne doit jamais surprendre l'utilisateur avec une popup de connexion inattendue.
    const freshToken = await requestAccessToken(false);
    return sheetsFetch(url, freshToken, init, attempt + 1);
  }

  if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
    await delay(BACKOFF_BASE_MS * (attempt + 1));
    return sheetsFetch(url, token, init, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sheets API error ${response.status}: ${body}`);
  }

  return response;
}

function valuesUrl(spreadsheetId: string, range: string): string {
  return `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
}

function appendUrl(spreadsheetId: string, range: string): string {
  return `${valuesUrl(spreadsheetId, range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
}

export async function fetchInventory(spreadsheetId: string, token: string): Promise<InventoryLine[]> {
  const response = await sheetsFetch(valuesUrl(spreadsheetId, INVENTAIRE_RANGE), token);
  const body = (await response.json()) as SheetsValuesResponse;
  const rows = body.values ?? [];

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell !== undefined && cell !== ''))
    .map(rowToInventoryLine);
}

export async function upsertInventoryLine(spreadsheetId: string, token: string, line: InventoryLine): Promise<void> {
  const idColumnRange = `${SHEET_TAB_INVENTAIRE}!A:A`;
  const idResponse = await sheetsFetch(valuesUrl(spreadsheetId, idColumnRange), token);
  const idBody = (await idResponse.json()) as SheetsValuesResponse;
  const idColumn = idBody.values ?? [];
  const existingRowIndex = idColumn.findIndex((row, index) => index > 0 && row[0] === line.id);

  const row = inventoryLineToRow(line);

  if (existingRowIndex > 0) {
    const rowNumber = existingRowIndex + 1;
    const updateRange = `${SHEET_TAB_INVENTAIRE}!A${rowNumber}:${lastColumnLetter(INVENTAIRE_COLUMNS.length)}${rowNumber}`;
    await sheetsFetch(`${valuesUrl(spreadsheetId, updateRange)}?valueInputOption=RAW`, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: updateRange, majorDimension: 'ROWS', values: [row] }),
    });
    return;
  }

  await sheetsFetch(appendUrl(spreadsheetId, INVENTAIRE_RANGE), token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
}

interface SpreadsheetMetadataResponse {
  sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
}

/**
 * Résout le sheetId numérique (requis par batchUpdate/deleteDimension, distinct du nom d'onglet
 * utilisé partout ailleurs) en lisant les métadonnées du spreadsheet — jamais mis en cache : un
 * appel supplémentaire par suppression, acceptable vu la fréquence rare de cette action.
 */
async function getSheetId(spreadsheetId: string, token: string, tabName: string): Promise<number> {
  const response = await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties`, token);
  const body = (await response.json()) as SpreadsheetMetadataResponse;
  const sheet = body.sheets?.find((s) => s.properties?.title === tabName);
  if (!sheet || sheet.properties?.sheetId === undefined) {
    throw new Error(`Onglet "${tabName}" introuvable dans le spreadsheet.`);
  }
  return sheet.properties.sheetId;
}

/** Supprime définitivement la ligne portant cet id — jamais mis en file offline, cf. deleteArticle. */
export async function deleteInventoryLine(spreadsheetId: string, token: string, id: string): Promise<void> {
  const idColumnRange = `${SHEET_TAB_INVENTAIRE}!A:A`;
  const idResponse = await sheetsFetch(valuesUrl(spreadsheetId, idColumnRange), token);
  const idBody = (await idResponse.json()) as SheetsValuesResponse;
  const idColumn = idBody.values ?? [];
  const rowIndex = idColumn.findIndex((row, index) => index > 0 && row[0] === id);
  if (rowIndex < 0) return;

  const sheetId = await getSheetId(spreadsheetId, token, SHEET_TAB_INVENTAIRE);
  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
          },
        },
      ],
    }),
  });
}

export async function appendMovement(spreadsheetId: string, token: string, movement: Movement): Promise<void> {
  await sheetsFetch(appendUrl(spreadsheetId, MOUVEMENTS_RANGE), token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [movementToRow(movement)] }),
  });
}

/**
 * Vide les lignes de données de l'onglet Mouvements (garde la ligne d'en-tête). Le journal
 * n'est qu'un audit humain, jamais relu par la logique de synchronisation (qui relit toujours
 * `Inventaire` par cle_fusion) : le purger après un flush réussi est donc sans risque pour la
 * cohérence des données, et évite que le Sheet grossisse indéfiniment.
 */
export async function clearMovements(spreadsheetId: string, token: string): Promise<void> {
  const range = `${SHEET_TAB_MOUVEMENTS}!A2:F`;
  await sheetsFetch(`${valuesUrl(spreadsheetId, range)}:clear`, token, { method: 'POST' });
}

export async function fetchListeCourses(spreadsheetId: string, token: string): Promise<ListeCoursesItem[]> {
  const response = await sheetsFetch(valuesUrl(spreadsheetId, LISTE_COURSES_RANGE), token);
  const body = (await response.json()) as SheetsValuesResponse;
  const rows = body.values ?? [];

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell !== undefined && cell !== ''))
    .map(rowToListeCoursesItem);
}

/** Même logique update-par-id-ou-append que upsertInventoryLine, appliquée à ListeCourses. */
export async function upsertListeCoursesItem(
  spreadsheetId: string,
  token: string,
  item: ListeCoursesItem,
): Promise<void> {
  const idColumnRange = `${SHEET_TAB_LISTE_COURSES}!A:A`;
  const idResponse = await sheetsFetch(valuesUrl(spreadsheetId, idColumnRange), token);
  const idBody = (await idResponse.json()) as SheetsValuesResponse;
  const idColumn = idBody.values ?? [];
  const existingRowIndex = idColumn.findIndex((row, index) => index > 0 && row[0] === item.id);

  const row = listeCoursesItemToRow(item);

  if (existingRowIndex > 0) {
    const rowNumber = existingRowIndex + 1;
    const updateRange = `${SHEET_TAB_LISTE_COURSES}!A${rowNumber}:${lastColumnLetter(LISTE_COURSES_COLUMNS.length)}${rowNumber}`;
    await sheetsFetch(`${valuesUrl(spreadsheetId, updateRange)}?valueInputOption=RAW`, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: updateRange, majorDimension: 'ROWS', values: [row] }),
    });
    return;
  }

  await sheetsFetch(appendUrl(spreadsheetId, LISTE_COURSES_RANGE), token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
}

/** Vide entièrement l'onglet ListeCourses (garde l'en-tête) — action "Supprimer la liste". */
export async function clearListeCourses(spreadsheetId: string, token: string): Promise<void> {
  const range = `${SHEET_TAB_LISTE_COURSES}!A2:${lastColumnLetter(LISTE_COURSES_COLUMNS.length)}`;
  await sheetsFetch(`${valuesUrl(spreadsheetId, range)}:clear`, token, { method: 'POST' });
}
