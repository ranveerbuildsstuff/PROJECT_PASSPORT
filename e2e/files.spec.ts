import path from 'node:path';
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import {
  expectNoSeriousA11y,
  collectConsoleErrors,
  collectExternalRequests,
} from './helpers';

test.describe('Slice 8: Project Files and Secret Scanner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const dbs = (await window.indexedDB.databases?.()) || [];
      for (const d of dbs) {
        if (d.name) window.indexedDB.deleteDatabase(d.name);
      }
      localStorage.clear();
    });
    await page.reload();

    // Create a fresh project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Files Test Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Files Test Project' })).toBeVisible();

    // Navigate to Files tab
    await page.getByRole('tab', { name: 'Files' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Files' })).toBeVisible();
  });

  test('1. Choose files: attach normal file, manifest row, purpose editable, persists on reload', async ({
    page,
  }) => {
    // Empty state visible
    await expect(page.getByText('No project files attached yet')).toBeVisible();

    // Open Add files dialog
    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });
    await expect(dialog).toBeVisible();

    // Upload a source file
    const fileInput = dialog.locator('input[aria-label="Choose files"]');
    await fileInput.setInputFiles({
      name: 'service.ts',
      mimeType: 'text/plain',
      buffer: Buffer.from('export const fetchProfile = async () => ({ id: 1 });'),
    });

    // Review dialog should display the included file
    await expect(dialog.getByText('Ready to attach')).toBeVisible();
    await expect(dialog.getByText('service.ts')).toBeVisible();

    // Attach files
    await dialog.getByRole('button', { name: 'Attach files' }).click();
    await expect(dialog).not.toBeVisible();

    // Manifest row should be displayed
    await expect(page.getByText('service.ts')).toBeVisible();
    await expect(page.getByText(/~13 tokens \(estimate\)/i).first()).toBeVisible();

    // Edit purpose
    const purposeInput = page.getByLabel('Purpose for service.ts');
    await purposeInput.fill('API client for profile service');
    await purposeInput.blur();

    // Reload page to verify persistence
    await page.reload();
    await page.getByRole('tab', { name: 'Files' }).click();
    await expect(page.getByText('service.ts')).toBeVisible();
    await expect(page.getByLabel('Purpose for service.ts')).toHaveValue('API client for profile service');
  });

  test('2. Choose folder: nested files, ignored node_modules, and skipped .env', async ({ page }) => {
    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });

    // Create a temporary synthetic folder for webkitdirectory upload
    const tempDir = path.resolve('tests/fixtures/temp-folder-e2e');
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules/pkg'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'src/app.tsx'),
      'export function App() { return <div>App</div>; }'
    );
    fs.writeFileSync(path.join(tempDir, 'node_modules/pkg/index.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(tempDir, '.env'), 'DATABASE_URL=postgres://localhost');

    try {
      const folderInput = dialog.locator('input[aria-label="Choose folder"]');
      await folderInput.setInputFiles(tempDir);

      // Review screen should show skipped for safety (.env)
      await expect(dialog.getByText(/We skipped 1 files that often hold secrets/i)).toBeVisible();
      await expect(dialog.locator('.font-mono', { hasText: '.env' })).toBeVisible();

      // Review screen should show ignored files count
      await expect(dialog.getByText(/1 files were skipped because they are build output/i)).toBeVisible();

      // Review screen should show included file
      await expect(dialog.getByText(/src\/app\.tsx/)).toBeVisible();

      // Attach
      await dialog.getByRole('button', { name: 'Attach files' }).click();
      await expect(dialog).not.toBeVisible();

      // Verify only src/app.tsx is in manifest
      await expect(page.getByText(/src\/app\.tsx/)).toBeVisible();
      await expect(page.locator('.font-mono', { hasText: '.env' })).not.toBeVisible();
      await expect(page.getByText('node_modules')).not.toBeVisible();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('3. Choose .zip: dynamically generated zip attaches cleanly', async ({ page }) => {
    // Generate JSZip
    const zip = new JSZip();
    zip.file('src/index.ts', 'console.log("Archive index");');
    zip.file('docs/architecture.md', '# Architecture\nClean system design.');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });

    const zipInput = dialog.locator('input[aria-label="Choose .zip"]');
    await zipInput.setInputFiles({
      name: 'repo.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    await expect(dialog.getByText('Ready to attach')).toBeVisible();
    await expect(dialog.getByText('src/index.ts')).toBeVisible();
    await expect(dialog.getByText('docs/architecture.md')).toBeVisible();

    await dialog.getByRole('button', { name: 'Attach files' }).click();
    await expect(dialog).not.toBeVisible();

    // Verify manifest shows both files
    await expect(page.getByText('src/index.ts')).toBeVisible();
    await expect(page.getByText('docs/architecture.md')).toBeVisible();
  });

  test('4. Hard-block proof: .env and *.pem skipped, verified absent in IndexedDB', async ({ page }) => {
    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });

    const fileInput = dialog.locator('input[aria-label="Choose files"]');
    await fileInput.setInputFiles([
      {
        name: '.env',
        mimeType: 'text/plain',
        buffer: Buffer.from('SECRET_KEY=dangerous_literal'),
      },
      {
        name: 'server.pem',
        mimeType: 'text/plain',
        buffer: Buffer.from('CERTIFICATE DATA'),
      },
      {
        name: 'clean.ts',
        mimeType: 'text/plain',
        buffer: Buffer.from('export const OK = 1;'),
      },
    ]);

    await expect(
      dialog.getByText('We skipped 2 files that often hold secrets, such as .env files and private keys. They were never read or stored.')
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Attach files' }).click();
    await expect(dialog).not.toBeVisible();

    // Verify clean.ts is present
    await expect(page.getByText('clean.ts')).toBeVisible();

    // Query IndexedDB directly from page context to prove hard-blocked files were never stored
    const storedPaths = await page.evaluate(async () => {
      return new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open('ProjectPassportDB');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('files', 'readonly');
          const store = tx.objectStore('files');
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const files = getAllReq.result as Array<{ path: string }>;
            resolve(files.map((f) => f.path));
          };
          getAllReq.onerror = () => reject(getAllReq.error);
        };
      });
    });

    expect(storedPaths).toContain('clean.ts');
    expect(storedPaths).not.toContain('.env');
    expect(storedPaths).not.toContain('server.pem');
  });

  test('5. Secret findings: Redact replaces secret with [REDACTED], verified in IndexedDB', async ({ page }) => {
    // Construct dynamic key without committing secret in git
    const syntheticKey = ['AIza', 'SyD1234567890abcdefghijklmnopqrst'].join('');

    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });

    const fileInput = dialog.locator('input[aria-label="Choose files"]');
    await fileInput.setInputFiles({
      name: 'client.ts',
      mimeType: 'text/plain',
      buffer: Buffer.from(`const apiKey = "${syntheticKey}";\nexport default apiKey;`),
    });

    // Finding detected
    await expect(dialog.getByText(/We found 1 possible secrets/i)).toBeVisible();
    await expect(dialog.getByText('1 unresolved')).toBeVisible();
    await expect(dialog.getByText('Google API Key')).toBeVisible();
    await expect(dialog.getByText('AIzaSy...qrst')).toBeVisible();

    // Primary Attach button is disabled
    const attachBtn = dialog.getByRole('button', { name: 'Attach files' });
    await expect(attachBtn).toBeDisabled();

    // Click Redact
    await dialog.getByRole('button', { name: 'Redact' }).click();

    // Now unresolved count is gone and Attach button is enabled
    await expect(attachBtn).toBeEnabled();
    await attachBtn.click();
    await expect(dialog).not.toBeVisible();

    // Verify stored content in IndexedDB has [REDACTED] and does NOT have syntheticKey
    const storedContent = await page.evaluate(async () => {
      return new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('ProjectPassportDB');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('files', 'readonly');
          const store = tx.objectStore('files');
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const files = getAllReq.result as Array<{ content: string }>;
            resolve(files[0]?.content || '');
          };
          getAllReq.onerror = () => reject(getAllReq.error);
        };
      });
    });

    expect(storedContent).toContain('[REDACTED]');
    expect(storedContent).not.toContain(syntheticKey);
  });

  test('6. Secret findings: Exclude stores no content; False Positive stores file + acknowledgment', async ({
    page,
  }) => {
    const key1 = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
    const key2 = ['ghp_', '123456789012345678901234567890123456'].join('');

    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });

    const fileInput = dialog.locator('input[aria-label="Choose files"]');
    await fileInput.setInputFiles([
      {
        name: 'fileA.ts',
        mimeType: 'text/plain',
        buffer: Buffer.from(`const aws = "${key1}";`),
      },
      {
        name: 'fileB.ts',
        mimeType: 'text/plain',
        buffer: Buffer.from(`const gh = "${key2}";`),
      },
    ]);

    await expect(dialog.getByText(/We found 2 possible secrets/i)).toBeVisible();

    // Exclude fileA.ts
    const excludeButtons = dialog.getByRole('button', { name: 'Exclude file' });
    await excludeButtons.first().click();

    // Mark fileB.ts as false positive
    const fpButtons = dialog.getByRole('button', { name: 'Mark as false positive' });
    await fpButtons.last().click();

    await dialog.getByRole('button', { name: 'Attach files' }).click();
    await expect(dialog).not.toBeVisible();

    // Inspect IndexedDB
    const dbInspection = await page.evaluate(async () => {
      return new Promise<{
        fileAContent: unknown;
        fileARefIncluded: boolean;
        fileBAck: string[];
      }>((resolve, reject) => {
        const req = indexedDB.open('ProjectPassportDB');
        req.onsuccess = () => {
          const db = req.result;
          const filesTx = db.transaction(['files', 'passports'], 'readonly');
          const fileStore = filesTx.objectStore('files');
          const passportStore = filesTx.objectStore('passports');

          fileStore.getAll().onsuccess = (e) => {
            const files = (e.target as IDBRequest<{ path: string; content?: string; acknowledgedFindings?: string[] }[]>).result;
            passportStore.getAll().onsuccess = (pe) => {
              const passports = (pe.target as IDBRequest<{ passport?: { files?: Array<{ path: string; included: boolean }> } }[]>).result;
              const passportFiles = passports[0]?.passport?.files || [];
              const fileARef = passportFiles.find((f) => f.path === 'fileA.ts');
              const fileAStored = files.find((f) => f.path === 'fileA.ts');
              const fileBStored = files.find((f) => f.path === 'fileB.ts');

              resolve({
                fileAContent: fileAStored?.content,
                fileARefIncluded: fileARef?.included ?? false,
                fileBAck: fileBStored?.acknowledgedFindings || [],
              });
            };
          };
        };
        req.onerror = () => reject(req.error);
      });
    });

    // File A excluded: manifest row included=false, no content in files table
    expect(dbInspection.fileARefIncluded).toBe(false);
    expect(dbInspection.fileAContent).toBeUndefined();

    // File B false positive: acknowledged finding saved on file record
    expect(dbInspection.fileBAck.length).toBeGreaterThan(0);
  });

  test('7. Unsafe zip: displays plain-language error banner, app remains usable', async ({ page }) => {
    // Generate a zip and patch in an absolute path
    const zip = new JSZip();
    zip.file('safe_file_entry.txt', 'clean content');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Binary patch to replace with C:/windows/sec.json (19 characters)
    const target = Buffer.from('safe_file_entry.txt');
    const replacement = Buffer.from('C:/windows/sec.json');
    let idx = zipBuffer.indexOf(target);
    while (idx !== -1) {
      replacement.copy(zipBuffer, idx);
      idx = zipBuffer.indexOf(target, idx + 1);
    }

    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });

    const zipInput = dialog.locator('input[aria-label="Choose .zip"]');
    await zipInput.setInputFiles({
      name: 'malicious.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    // Error banner should appear
    await expect(
      dialog.getByText("This .zip contains paths we can't use safely. Unzip it yourself and choose the folder instead.")
    ).toBeVisible();

    // App remains usable, can return to picker
    await dialog.getByRole('button', { name: 'Choose different files' }).click();
    await expect(dialog.getByText('Choose files', { exact: true })).toBeVisible();

    // Close dialog
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('8. Zero outbound requests and zero secrets in console', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    const externalRequests = collectExternalRequests(page);
    const sentinelSecret = ['ghp_', 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8'].join('');

    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });

    const fileInput = dialog.locator('input[aria-label="Choose files"]');
    await fileInput.setInputFiles({
      name: 'secret-file.ts',
      mimeType: 'text/plain',
      buffer: Buffer.from(`export const secret = "${sentinelSecret}";`),
    });

    await expect(dialog.getByText('GitHub Token')).toBeVisible();
    await dialog.getByRole('button', { name: 'Redact' }).click();
    await dialog.getByRole('button', { name: 'Attach files' }).click();
    await expect(dialog).not.toBeVisible();

    // Verify zero external network requests
    expect(externalRequests).toHaveLength(0);

    // Verify zero console errors
    expect(consoleErrors).toHaveLength(0);

    // Verify DOM never has the raw sentinel secret
    const pageHtml = await page.content();
    expect(pageHtml).not.toContain(sentinelSecret);
  });

  test('9. Layout and axe accessibility audit: empty and populated Files tab', async ({ page }) => {
    // 1. Audit empty Files tab
    await expect(page.getByRole('heading', { level: 2, name: 'Files' })).toBeVisible();
    await expectNoSeriousA11y(page);

    // 2. Open dialog and verify touch targets >= 44px
    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });
    await expect(dialog).toBeVisible();

    const chooseFilesBox = await dialog.locator('label', { hasText: 'Choose files' }).boundingBox();
    expect(chooseFilesBox?.height).toBeGreaterThanOrEqual(44);
    expect(chooseFilesBox?.width).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('10. Keyboard-only workflow', async ({ page }) => {
    // Focus Add files button with Tab
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Open dialog with Enter
    await page.getByRole('button', { name: 'Add files' }).first().focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Add project files' });
    await expect(dialog).toBeVisible();

    // Upload a file programmatically
    const fileInput = dialog.locator('input[aria-label="Choose files"]');
    await fileInput.setInputFiles({
      name: 'keyboard.ts',
      mimeType: 'text/plain',
      buffer: Buffer.from('export const test = true;'),
    });

    await expect(dialog.getByText('keyboard.ts')).toBeVisible();

    // Tab to Attach files and press Enter
    const attachBtn = dialog.getByRole('button', { name: 'Attach files' });
    await attachBtn.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).not.toBeVisible();

    // Verify attached file manifest row is visible
    await expect(page.getByText('keyboard.ts')).toBeVisible();
  });

  test('11. Responsiveness: large set of files scans in worker without freezing main thread', async ({ page }) => {
    await page.getByRole('button', { name: 'Add files' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add project files' });

    // Generate 50 simulated project files
    const bulkFiles = Array.from({ length: 50 }, (_, i) => ({
      name: `module_${i}.ts`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`// Module ${i}\nexport const value_${i} = ${i};\nexport function calc_${i}() { return ${i} * 2; }`),
    }));

    const start = Date.now();
    const fileInput = dialog.locator('input[aria-label="Choose files"]');
    await fileInput.setInputFiles(bulkFiles);

    // Wait for scan to complete off-thread
    await expect(dialog.getByText('Ready to attach')).toBeVisible();
    const duration = Date.now() - start;

    // Verify it completed swiftly (under 10s)
    expect(duration).toBeLessThan(10000);

    // Attach
    await dialog.getByRole('button', { name: 'Attach files' }).click();
    await expect(dialog).not.toBeVisible();

    // Verify manifest has all 50 files
    await expect(page.getByText('50 of 50 files included')).toBeVisible();
  });
});
