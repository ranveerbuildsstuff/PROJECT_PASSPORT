import { test, expect } from '@playwright/test';
import { shot, expectNoSeriousA11y, collectConsoleErrors } from './helpers';

test.describe('Smoke Spec', () => {
  test('loads placeholder app with visible h1, passes axe scan, zero console errors, and captures screenshot', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    // (a) loads and h1 "Project Passport" visible
    await page.goto('/');
    const heading = page.getByRole('heading', { level: 1, name: 'Project Passport' });
    await expect(heading).toBeVisible();

    // (b) axe scan passes
    await expectNoSeriousA11y(page);

    // (d) screenshot
    await shot(page, 'home');

    // (a) zero console errors
    expect(errors).toEqual([]);
  });

  test('proves real-browser storage: raw IndexedDB write, read Uint8Array, and database deletion', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');

    // (c) REAL-BROWSER storage proof: inside page.evaluate open a raw IndexedDB database,
    // write and read a record including a Uint8Array, delete the database, assert the values match
    const storageProof = await page.evaluate(async () => {
      const dbName = 'smoke-real-browser-proof-db';
      const storeName = 'proof-store';

      // 1. Open raw IndexedDB and create object store
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          const database = req.result;
          database.createObjectStore(storeName, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      // 2. Write record containing a Uint8Array
      const testBytes = new Uint8Array([1, 2, 3, 4, 42, 255]);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put({
          id: 'storage-proof-1',
          name: 'Real Browser Storage Proof',
          payload: testBytes,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      // 3. Read record back in a fresh transaction
      const retrieved = await new Promise<{
        id: string;
        name: string;
        payload: Uint8Array;
      }>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get('storage-proof-1');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const isUint8Array = retrieved?.payload instanceof Uint8Array;
      const readBytes = retrieved?.payload ? Array.from(retrieved.payload) : [];

      // 4. Close database connection
      db.close();

      // 5. Delete database
      const deleted = await new Promise<boolean>((resolve, reject) => {
        const delReq = indexedDB.deleteDatabase(dbName);
        delReq.onsuccess = () => resolve(true);
        delReq.onerror = () => reject(delReq.error);
        delReq.onblocked = () => reject(new Error('IndexedDB deleteDatabase was blocked'));
      });

      return {
        id: retrieved?.id,
        name: retrieved?.name,
        isUint8Array,
        readBytes,
        deleted,
      };
    });

    expect(storageProof.id).toBe('storage-proof-1');
    expect(storageProof.name).toBe('Real Browser Storage Proof');
    expect(storageProof.isUint8Array).toBe(true);
    expect(storageProof.readBytes).toEqual([1, 2, 3, 4, 42, 255]);
    expect(storageProof.deleted).toBe(true);

    // Zero console errors
    expect(errors).toEqual([]);
  });
});
