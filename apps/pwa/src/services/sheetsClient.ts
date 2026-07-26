import {
  INVENTAIRE_RANGE,
  MOUVEMENTS_RANGE,
  SHEET_TAB_INVENTAIRE,
  rowToInventoryLine,
  inventoryLineToRow,
  movementToRow,
  type InventoryLine,
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
    const freshToken = await requestAccessToken();
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
    const updateRange = `${SHEET_TAB_INVENTAIRE}!A${rowNumber}:L${rowNumber}`;
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

export async function appendMovement(spreadsheetId: string, token: string, movement: Movement): Promise<void> {
  await sheetsFetch(appendUrl(spreadsheetId, MOUVEMENTS_RANGE), token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [movementToRow(movement)] }),
  });
}
