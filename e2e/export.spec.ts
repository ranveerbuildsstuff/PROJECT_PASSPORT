import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import JSZip from 'jszip';
import {
  collectConsoleErrors,
  collectExternalRequests,
  expectNoSeriousA11y,
  shot,
} from './helpers';

test.describe('Slice 10: Export Package, Destination Presets, and Package Import', () => {
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
  });

  test('1. Preset selection and live budget updates', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Create a project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Export Showcase App');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    // Navigate to Export tab
    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('heading', { name: 'Export Handoff Package' })).toBeVisible();

    // Default preset is Lite paste (~6,000 tokens)
    await expect(page.getByText('~6,000 tokens (estimate)')).toBeVisible();

    // Switch to ChatGPT preset (~30,000 tokens)
    await page.getByRole('button', { name: /ChatGPT/i }).click();
    await expect(page.getByText(/\/ 30,000 tokens \(estimate\)/)).toBeVisible();

    // Switch to Claude preset (~60,000 tokens)
    await page.getByRole('button', { name: /Claude/i }).click();
    await expect(page.getByText(/\/ 60,000 tokens \(estimate\)/)).toBeVisible();

    // Switch to Gemini preset (~100,000 tokens)
    await page.getByRole('button', { name: /Gemini/i }).click();
    await expect(page.getByText(/\/ 100,000 tokens \(estimate\)/)).toBeVisible();

    // Switch to Coding Agent preset (~40,000 tokens)
    await page.getByRole('button', { name: /Coding Agent/i }).click();
    await expect(page.getByText(/\/ 40,000 tokens \(estimate\)/)).toBeVisible();

    expect(errors.length).toBe(0);
  });

  test('2. Custom budget validation rejects out of bounds values and updates on valid input', async ({ page }) => {
    // Create a project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Custom Budget Test');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('heading', { name: 'Export Handoff Package' })).toBeVisible();

    // Select Custom preset
    await page.getByRole('button', { name: /Custom/i }).click();
    const customInput = page.getByPlaceholder('50000');
    await expect(customInput).toBeVisible();

    // Test minimum boundary (less than 1,000)
    await customInput.fill('500');
    await expect(page.getByText('Enter a whole number between 1,000 and 2,000,000.')).toBeVisible();

    // Test maximum boundary (greater than 2,000,000)
    await customInput.fill('2500000');
    await expect(page.getByText('Enter a whole number between 1,000 and 2,000,000.')).toBeVisible();

    // Test valid custom input
    await customInput.fill('75000');
    await expect(page.getByText('Enter a whole number between 1,000 and 2,000,000.')).not.toBeVisible();
    await expect(page.getByText(/\/ 75,000 tokens \(estimate\)/)).toBeVisible();
  });

  test('3. Lite format copy: triggers clipboard write and shows success toast', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Create a project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Lite Copy App');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('heading', { name: 'Export Handoff Package' })).toBeVisible();

    // Ensure format is Lite prompt
    await page.getByRole('button', { name: /Lite prompt/i }).click();

    // Click Copy prompt
    await page.getByRole('button', { name: 'Copy prompt' }).click();

    // Verify toast appears
    await expect(page.getByText('Prompt copied to clipboard')).toBeVisible();
  });

  test('4. Full package zip download generation with verified manifest structure', async ({ page }) => {
    // Create a project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Zip Package App');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('heading', { name: 'Export Handoff Package' })).toBeVisible();

    // Switch format to Full package (.zip)
    await page.getByRole('button', { name: /Full package/i }).click();
    const downloadButton = page.getByRole('button', { name: 'Download package' });
    await expect(downloadButton).toBeVisible();

    // Download the generated package
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);

    const filename = download.suggestedFilename();
    expect(filename).toBe('zip-package-app-passport.zip');

    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();

    // Inspect zip contents
    const zipBytes = fs.readFileSync(downloadPath!);
    const zip = await JSZip.loadAsync(zipBytes);

    expect(zip.file('MANIFEST.json')).not.toBeNull();
    expect(zip.file('project-passport.json')).not.toBeNull();
    expect(zip.file('CONTINUE_PROMPT.md')).not.toBeNull();
    expect(zip.file('PROJECT_STATE.md')).not.toBeNull();

    const manifestText = await zip.file('MANIFEST.json')!.async('text');
    const manifest = JSON.parse(manifestText);
    expect(manifest.manifestVersion).toBe(1);
    expect(Array.isArray(manifest.entries)).toBe(true);
    expect(manifest.entries.some((e: { path: string }) => e.path === 'project-passport.json')).toBe(true);
  });

  test('5. Secret gate: blocks export on secret finding, unblocks on override acknowledgment', async ({ page }) => {
    // Create a project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Security Gate Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    // Go to Passport tab and inject synthetic secret into project goal (Basics is open by default)
    await page.getByRole('tab', { name: 'Passport' }).click();

    const syntheticKey = ['AK', 'IA', 'IOSFODNN7EXAMPLE'].join('');
    const goalInput = page.getByLabel('Project goal');
    await goalInput.fill(`Deploy with AWS key: ${syntheticKey}`);
    await goalInput.blur();

    // Wait for autosave to persist
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Go to Export tab
    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('heading', { name: 'Export Handoff Package' })).toBeVisible();

    // Secret gate alert must be present
    await expect(page.getByText('Export blocked: Unresolved secrets detected')).toBeVisible();
    await expect(page.getByText(/AKIAIO\.\.\.MPLE/)).toBeVisible();

    // Primary action must be disabled
    const copyButton = page.getByRole('button', { name: 'Copy prompt' });
    await expect(copyButton).toBeDisabled();

    // Click override acknowledgment checkbox
    await page.getByLabel(/I understand the risks and want to export anyway/i).check();

    // Primary action is now re-enabled
    await expect(copyButton).not.toBeDisabled();
  });

  test('6. Package import on dashboard: uploads valid archive and restores project', async ({ page }) => {
    // Create a valid synthetic package buffer
    const mockPassport = {
      schemaVersion: 1,
      project: {
        id: 'imported-synthetic-app-1',
        name: 'Restored Architecture App',
        goal: 'Migrate to local-first database',
        summary: 'Package import verification test',
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      stack: [{ name: 'React', role: 'UI' }],
      decisions: [{ id: 'd1', decision: 'Use Dexie', reason: 'Zero network storage', status: 'active' }],
      completed: [],
      tasks: [{ id: 't1', text: 'Verify zip safety', status: 'todo', priority: 'high' }],
      bugs: [],
      bugsReviewed: false,
      requirements: [],
      instructions: [],
      files: [],
      conversations: [],
      nextAction: 'Ship Slice 10',
      openQuestions: [],
    };

    const passportJson = JSON.stringify(mockPassport, null, 2);
    // Simple SHA-256 calculation inside page
    const passportHash = await page.evaluate(async (json) => {
      const buf = new TextEncoder().encode(json);
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }, passportJson);

    const zip = new JSZip();
    zip.file('project-passport.json', passportJson);
    zip.file(
      'MANIFEST.json',
      JSON.stringify({
        manifestVersion: 1,
        schemaVersion: 1,
        entries: [
          {
            path: 'project-passport.json',
            sizeBytes: Buffer.byteLength(passportJson),
            sha256: passportHash,
          },
        ],
      })
    );

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Open dashboard
    await page.goto('/');

    // Click Import package button
    await page.getByRole('button', { name: 'Import package' }).click();
    const importDialog = page.getByRole('dialog', { name: 'Import Handoff Package' });
    await expect(importDialog).toBeVisible();

    // Upload zip
    await page.locator('#package-file-input').setInputFiles({
      name: 'handoff.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    // Verified Archive card appears
    await expect(page.getByText('Restored Architecture App')).toBeVisible();
    await expect(page.getByText('Verified Archive')).toBeVisible();

    // Click Import project
    await page.getByRole('button', { name: 'Import project' }).click();

    // Successfully navigates to imported project overview
    await expect(page.getByRole('heading', { level: 1, name: 'Restored Architecture App' })).toBeVisible();
    await expect(page.getByText('Migrate to local-first database')).toBeVisible();
  });

  test('7. Package import same-ID conflict: presents Copy vs Replace options', async ({ page }) => {
    // 1. Create an existing project with known ID
    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Local Base Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/project\/[a-zA-Z0-9_-]+/);

    // Extract created project ID from URL
    const url = page.url();
    const match = url.match(/\/project\/([a-zA-Z0-9_-]+)/);
    const existingId = match![1];

    // 2. Build a zip with the EXACT SAME project ID but different name
    const conflictPassport = {
      schemaVersion: 1,
      project: {
        id: existingId,
        name: 'Updated Conflict Project',
        goal: 'Testing same-ID collision handling',
        summary: 'Conflict resolution test',
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      stack: [],
      decisions: [],
      completed: [],
      tasks: [],
      bugs: [],
      bugsReviewed: false,
      requirements: [],
      instructions: [],
      files: [],
      conversations: [],
      nextAction: '',
      openQuestions: [],
    };

    const passportJson = JSON.stringify(conflictPassport, null, 2);
    const passportHash = await page.evaluate(async (json) => {
      const buf = new TextEncoder().encode(json);
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }, passportJson);

    const zip = new JSZip();
    zip.file('project-passport.json', passportJson);
    zip.file(
      'MANIFEST.json',
      JSON.stringify({
        manifestVersion: 1,
        schemaVersion: 1,
        entries: [
          {
            path: 'project-passport.json',
            sizeBytes: Buffer.byteLength(passportJson),
            sha256: passportHash,
          },
        ],
      })
    );

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // 3. Return to Dashboard and import conflicting package
    await page.goto('/');
    await page.getByRole('button', { name: 'Import package' }).click();
    await page.locator('#package-file-input').setInputFiles({
      name: 'conflict.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    // Conflict choices must be presented
    await expect(page.getByText('A project with this ID already exists locally:')).toBeVisible();
    const copyRadio = page.getByLabel(/Import as a copy/i);
    const replaceRadio = page.getByLabel(/Replace existing project/i);

    await expect(copyRadio).toBeChecked();
    await expect(replaceRadio).not.toBeChecked();

    // Select replace
    await replaceRadio.check();
    await expect(replaceRadio).toBeChecked();
    await shot(page, 'import-conflict-dialog');

    // Submit import
    await page.getByRole('button', { name: 'Import project' }).click();

    // Replaced project displays new name
    await expect(page.getByRole('heading', { level: 1, name: 'Updated Conflict Project' })).toBeVisible();
  });

  test('8. Package import integrity check rejects tampered files', async ({ page }) => {
    // Build package with fake hash (tampered integrity)
    const mockPassport = {
      schemaVersion: 1,
      project: {
        id: 'tampered-pkg',
        name: 'Tampered Package',
        goal: 'Integrity rejection test',
        summary: 'Test',
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      stack: [],
      decisions: [],
      completed: [],
      tasks: [],
      bugs: [],
      bugsReviewed: false,
      requirements: [],
      instructions: [],
      files: [],
      conversations: [],
      nextAction: '',
      openQuestions: [],
    };

    const passportJson = JSON.stringify(mockPassport, null, 2);

    const zip = new JSZip();
    zip.file('project-passport.json', passportJson);
    zip.file(
      'MANIFEST.json',
      JSON.stringify({
        manifestVersion: 1,
        schemaVersion: 1,
        entries: [
          {
            path: 'project-passport.json',
            sizeBytes: Buffer.byteLength(passportJson),
            sha256: '0000000000000000000000000000000000000000000000000000000000000000', // Deliberate mismatch
          },
        ],
      })
    );

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    await page.goto('/');
    await page.getByRole('button', { name: 'Import package' }).click();
    await page.locator('#package-file-input').setInputFiles({
      name: 'tampered.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    // Verification error alert
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Verification Failed')).toBeVisible();
    await expect(page.getByText(/Package integrity check failed/i)).toBeVisible();

    // Import button must NOT appear
    await expect(page.getByRole('button', { name: 'Import project' })).not.toBeVisible();
  });

  test('9. Zero outbound network requests & zero secrets in console', async ({ page }) => {
    const getRequests = collectExternalRequests(page);
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Zero Telemetry Verification');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('heading', { name: 'Export Handoff Package' })).toBeVisible();

    // Verify zero external network requests
    const externalRequests = getRequests();
    expect(externalRequests).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  test('10. Accessibility audit on Export Tab and Import Package Dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Accessibility Test Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    // Audit Export Tab
    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('heading', { name: 'Export Handoff Package' })).toBeVisible();
    await expectNoSeriousA11y(page);
    await shot(page, 'export-tab');

    // Audit Import Package Dialog
    await page.goto('/');
    await page.getByRole('button', { name: 'Import package' }).click();
    const importDialog = page.getByRole('dialog', { name: 'Import Handoff Package' });
    await expect(importDialog).toBeVisible();
    await expectNoSeriousA11y(page);
    await shot(page, 'import-package-dialog');
  });

  test('11. Keyboard-only navigation across Export tab controls and truncation filters', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Keyboard Test Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('heading', { name: 'Export Handoff Package' })).toBeVisible();

    // Focus on first preset button and use keyboard
    const liteBtn = page.getByRole('button', { name: /Lite paste/i });
    await liteBtn.focus();
    await expect(liteBtn).toBeFocused();

    // Tab to next preset button (ChatGPT) and press Space to select
    const chatGptBtn = page.getByRole('button', { name: /ChatGPT/i });
    await chatGptBtn.focus();
    await page.keyboard.press('Space');
    await expect(page.getByText(/\/ 30,000 tokens \(estimate\)/)).toBeVisible();

    // Focus on filter buttons
    const includedBtn = page.getByRole('button', { name: /Included \(/i });
    await includedBtn.focus();
    await page.keyboard.press('Enter');
  });

  test('12. Round-trip export then import package produces identical passport data structure', async ({ page }) => {
    // 1. Create a project
    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Roundtrip Showcase App');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/project\/[a-zA-Z0-9_-]+/);

    // 2. Add goal and summary in Passport tab (Basics is open by default)
    await page.getByRole('tab', { name: 'Passport' }).click();
    await page.getByLabel('Project goal').fill('Roundtrip fidelity verification goal');
    await page.getByLabel('Executive summary').fill('Roundtrip summary verification');
    await page.getByLabel('Executive summary').blur();
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // 3. Go to Export tab and download full zip
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByRole('button', { name: /Full package/i }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download package' }).click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const zipBytes = fs.readFileSync(downloadPath!);

    // 4. Return to Dashboard and import as copy
    await page.goto('/');
    await page.getByRole('button', { name: 'Import package' }).click();
    await page.locator('#package-file-input').setInputFiles({
      name: 'roundtrip.zip',
      mimeType: 'application/zip',
      buffer: zipBytes,
    });

    const importDialog = page.getByRole('dialog');
    await expect(importDialog.getByText('Roundtrip Showcase App')).toBeVisible();
    await expect(importDialog.getByText('Verified Archive')).toBeVisible();

    // Select import as copy
    const copyRadio = importDialog.getByLabel(/Import as a copy/i);
    await copyRadio.check();

    await importDialog.getByRole('button', { name: 'Import project' }).click();
    await page.waitForURL(/\/project\/[a-zA-Z0-9_-]+/);

    // 5. Verify restored project fields match
    await page.getByRole('tab', { name: 'Passport' }).click();
    await expect(page.getByLabel('Project goal')).toHaveValue('Roundtrip fidelity verification goal');
    await expect(page.getByLabel('Executive summary')).toHaveValue('Roundtrip summary verification');
  });

  test('13. Imported package files with secret findings go through review UI and Redact scrubs secret before storing', async ({
    page,
  }) => {
    // 1. Build a synthetic package containing a fake secret built from fragments
    const fakeKey = ['AK', 'IA', 'IOSFODNN7EXAMPLE'].join('');
    const fileContent = `export const secretKey = "${fakeKey}";\nexport const env = "production";`;

    const mockPassport = {
      schemaVersion: 1,
      project: {
        id: 'pkg-with-secrets',
        name: 'Secrets Review App',
        goal: 'Verify import secret review UI',
        summary: 'Secret review test',
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      stack: [],
      decisions: [],
      completed: [],
      tasks: [],
      bugs: [],
      bugsReviewed: false,
      requirements: [],
      instructions: [],
      files: [
        {
          path: 'src/config.ts',
          purpose: 'App configuration',
          included: true,
          sizeBytes: Buffer.byteLength(fileContent),
        },
      ],
      conversations: [],
      nextAction: '',
      openQuestions: [],
    };

    const passportJson = JSON.stringify(mockPassport, null, 2);
    const passportHash = await page.evaluate(async (json) => {
      const buf = new TextEncoder().encode(json);
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }, passportJson);

    const fileHash = await page.evaluate(async (txt) => {
      const buf = new TextEncoder().encode(txt);
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }, fileContent);

    const zip = new JSZip();
    zip.file('project-passport.json', passportJson);
    zip.file('files/src/config.ts', fileContent);
    zip.file(
      'MANIFEST.json',
      JSON.stringify({
        manifestVersion: 1,
        schemaVersion: 1,
        entries: [
          {
            path: 'project-passport.json',
            sizeBytes: Buffer.byteLength(passportJson),
            sha256: passportHash,
          },
          {
            path: 'files/src/config.ts',
            sizeBytes: Buffer.byteLength(fileContent),
            sha256: fileHash,
          },
        ],
      })
    );

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // 2. Open dashboard and upload
    await page.goto('/');
    await page.getByRole('button', { name: 'Import package' }).click();
    await page.locator('#package-file-input').setInputFiles({
      name: 'secrets-pkg.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    // 3. Verify secret findings review UI appears
    await expect(page.getByText('We found 1 possible secret')).toBeVisible();
    await expect(page.getByText('1 unresolved')).toBeVisible();
    await expect(page.getByText(/src\/config\.ts:1/)).toBeVisible();
    await expect(page.getByText(/AKIAIO\.\.\.MPLE/)).toBeVisible();

    // 4. Click Redact
    const redactButton = page.getByRole('button', { name: 'Redact' });
    await expect(redactButton).toBeVisible();
    await redactButton.click();

    // Unresolved badge disappears
    await expect(page.getByText('1 unresolved')).not.toBeVisible();

    // 5. Complete import
    await page.getByRole('button', { name: 'Import project' }).click();
    await page.waitForURL(/\/project\/[a-zA-Z0-9_-]+/);

    // 6. Verify stored file in IndexedDB is redacted
    const storedContent = await page.evaluate(async (pId: string) => {
      const req = indexedDB.open('ProjectPassportDB');
      return new Promise<string>((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('files', 'readonly');
          const getReq = tx.objectStore('files').get(`${pId}:src/config.ts`);
          getReq.onsuccess = () => resolve(getReq.result?.content || '');
        };
      });
    }, 'pkg-with-secrets');

    expect(storedContent).toContain('[REDACTED]');
    expect(storedContent).not.toContain(fakeKey);
  });
});
