import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { InventoryLine, PendingOperation } from '@inventaire/shared';

const DB_NAME = 'inventaire-domestique';
const DB_VERSION = 1;
const STORE_INVENTORY = 'inventoryLines';
const STORE_PENDING = 'pendingOperations';

interface InventaireDB extends DBSchema {
  inventoryLines: {
    key: string;
    value: InventoryLine;
  };
  pendingOperations: {
    key: string;
    value: PendingOperation;
  };
}

let dbPromise: Promise<IDBPDatabase<InventaireDB>> | null = null;

function getDb(): Promise<IDBPDatabase<InventaireDB>> {
  if (!dbPromise) {
    dbPromise = openDB<InventaireDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_INVENTORY)) {
          db.createObjectStore(STORE_INVENTORY, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_PENDING)) {
          db.createObjectStore(STORE_PENDING, { keyPath: 'local_id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedInventory(): Promise<InventoryLine[]> {
  const db = await getDb();
  return db.getAll(STORE_INVENTORY);
}

export async function setCachedInventory(lines: InventoryLine[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE_INVENTORY, 'readwrite');
  await tx.store.clear();
  await Promise.all(lines.map((line) => tx.store.put(line)));
  await tx.done;
}

export async function enqueueOperation(op: PendingOperation): Promise<void> {
  const db = await getDb();
  await db.put(STORE_PENDING, op);
}

export async function getPendingOperations(): Promise<PendingOperation[]> {
  const db = await getDb();
  const all = await db.getAll(STORE_PENDING);
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function removePendingOperation(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_PENDING, localId);
}
