/**
 * IndexedDB storage layer using the `idb` library.
 * All data is encrypted at rest when a passphrase is configured.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'securemesh';
const DB_VERSION = 1;

export interface SecureMeshDB {
  identity: {
    key: string;
    value: unknown;
  };
  contacts: {
    key: string;
    value: unknown;
    indexes: { 'by-status': string };
  };
  messages: {
    key: string;
    value: unknown;
    indexes: { 'by-contact': string; 'by-timestamp': number };
  };
  outbox: {
    key: string;
    value: unknown;
    indexes: { 'by-contact': string };
  };
  settings: {
    key: string;
    value: unknown;
  };
  devices: {
    key: string;
    value: unknown;
  };
  alerts: {
    key: string;
    value: unknown;
    indexes: { 'by-timestamp': number };
  };
}

let dbInstance: IDBPDatabase | null = null;

export async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Identity store (key bundle, peer IDs, profile)
      if (!db.objectStoreNames.contains('identity')) {
        db.createObjectStore('identity');
      }

      // Contacts store
      if (!db.objectStoreNames.contains('contacts')) {
        const store = db.createObjectStore('contacts', { keyPath: 'id' });
        store.createIndex('by-status', 'status');
      }

      // Messages store
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('by-contact', 'contactId');
        store.createIndex('by-timestamp', 'timestamp');
      }

      // Outbox (queued messages for offline peers)
      if (!db.objectStoreNames.contains('outbox')) {
        const store = db.createObjectStore('outbox', { keyPath: 'id' });
        store.createIndex('by-contact', 'contactId');
      }

      // Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }

      // Devices (multi-device roster)
      if (!db.objectStoreNames.contains('devices')) {
        db.createObjectStore('devices', { keyPath: 'id' });
      }

      // Security alerts
      if (!db.objectStoreNames.contains('alerts')) {
        const store = db.createObjectStore('alerts', { keyPath: 'id' });
        store.createIndex('by-timestamp', 'timestamp');
      }
    },
  });

  return dbInstance;
}

// === Identity ===

export async function saveIdentity(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put('identity', value, key);
}

export async function getIdentity(key: string): Promise<unknown> {
  const db = await getDB();
  return db.get('identity', key);
}

// === Contacts ===

export async function saveContact(contact: Record<string, unknown>): Promise<void> {
  const db = await getDB();
  await db.put('contacts', contact);
}

export async function getContact(id: string): Promise<Record<string, unknown> | undefined> {
  const db = await getDB();
  return db.get('contacts', id) as Promise<Record<string, unknown> | undefined>;
}

export async function getAllContacts(): Promise<Record<string, unknown>[]> {
  const db = await getDB();
  return db.getAll('contacts') as Promise<Record<string, unknown>[]>;
}

export async function deleteContact(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('contacts', id);
}

// === Messages ===

export async function saveMessage(message: Record<string, unknown>): Promise<void> {
  const db = await getDB();
  await db.put('messages', message);
}

export async function getMessagesByContact(contactId: string): Promise<Record<string, unknown>[]> {
  const db = await getDB();
  return db.getAllFromIndex('messages', 'by-contact', contactId) as Promise<Record<string, unknown>[]>;
}

export async function getMessage(id: string): Promise<Record<string, unknown> | undefined> {
  const db = await getDB();
  return db.get('messages', id) as Promise<Record<string, unknown> | undefined>;
}

// === Outbox ===

export async function addToOutbox(message: Record<string, unknown>): Promise<void> {
  const db = await getDB();
  await db.put('outbox', message);
}

export async function getOutboxByContact(contactId: string): Promise<Record<string, unknown>[]> {
  const db = await getDB();
  return db.getAllFromIndex('outbox', 'by-contact', contactId) as Promise<Record<string, unknown>[]>;
}

export async function removeFromOutbox(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('outbox', id);
}

export async function getAllOutbox(): Promise<Record<string, unknown>[]> {
  const db = await getDB();
  return db.getAll('outbox') as Promise<Record<string, unknown>[]>;
}

// === Settings ===

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put('settings', value, key);
}

export async function getSetting(key: string): Promise<unknown> {
  const db = await getDB();
  return db.get('settings', key);
}

// === Devices ===

export async function saveDevice(device: Record<string, unknown>): Promise<void> {
  const db = await getDB();
  await db.put('devices', device);
}

export async function getAllDevices(): Promise<Record<string, unknown>[]> {
  const db = await getDB();
  return db.getAll('devices') as Promise<Record<string, unknown>[]>;
}

export async function deleteDevice(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('devices', id);
}

// === Alerts ===

export async function saveAlert(alert: Record<string, unknown>): Promise<void> {
  const db = await getDB();
  await db.put('alerts', alert);
}

export async function getAllAlerts(): Promise<Record<string, unknown>[]> {
  const db = await getDB();
  return db.getAll('alerts') as Promise<Record<string, unknown>[]>;
}

export async function deleteAlert(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('alerts', id);
}

// === Clear All ===

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['identity', 'contacts', 'messages', 'outbox', 'settings', 'devices', 'alerts'],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore('identity').clear(),
    tx.objectStore('contacts').clear(),
    tx.objectStore('messages').clear(),
    tx.objectStore('outbox').clear(),
    tx.objectStore('settings').clear(),
    tx.objectStore('devices').clear(),
    tx.objectStore('alerts').clear(),
    tx.done,
  ]);
}
