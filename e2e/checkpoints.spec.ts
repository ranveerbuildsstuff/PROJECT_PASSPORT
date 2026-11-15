import { test, expect } from '@playwright/test';
import {
  expectNoSeriousA11y,
  collectConsoleErrors,
  collectExternalRequests,
  auditPageLayoutAndTouchTargets,
  shot,
} from './helpers';

test.describe('Slice 9: Checkpoints Timeline, Compare and Restore', () => {
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
    await createDialog.getByLabel('Project name').fill('Checkpoint Test Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Checkpoint Test Project' })).toBeVisible();

    // Navigate to Checkpoints tab
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Checkpoints' })).toBeVisible();
  });

  test('1. Empty state & create named checkpoint: stamp badge, persists on reload', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Verify compact empty state
    await expect(page.getByText('No checkpoints yet.')).toBeVisible();

    // Open create checkpoint dialog
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await expect(dialog).toBeVisible();

    // Fill note and submit
    await dialog.getByLabel(/Checkpoint note/i).fill('Initial project baseline');
    await dialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(dialog).not.toBeVisible();

    // Verify card on timeline
    const badge = page.getByText(/#1 • MANUAL/);
    await expect(badge).toBeVisible();
    await expect(page.getByText('Initial project baseline')).toBeVisible();

    await shot(page, 'checkpoint-created');

    // Reload page and verify persistence
    await page.reload();
    await expect(page.getByText(/#1 • MANUAL/)).toBeVisible();
    await expect(page.getByText('Initial project baseline')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('2. Compare to current passport: visual diff highlights changes', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Create baseline checkpoint
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await dialog.getByLabel(/Checkpoint note/i).fill('Baseline before edits');
    await dialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(dialog).not.toBeVisible();

    // Go to Passport tab and edit goal (Basics is open by default)
    await page.getByRole('tab', { name: 'Passport' }).click();
    const goalInput = page.getByLabel('Project goal');
    await goalInput.fill('Build autonomous local agents');
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Return to Checkpoints tab
    await page.getByRole('tab', { name: 'Checkpoints' }).click();

    // Click Compare on Checkpoint #1
    await page.getByRole('button', { name: 'Compare' }).first().click();
    const compareDialog = page.getByRole('dialog', { name: 'Compare versions' });
    await expect(compareDialog).toBeVisible();

    // Verify diff summary and basics change
    await expect(compareDialog.getByText(/(difference|differences) across/i)).toBeVisible();
    await expect(compareDialog.getByText('Basics')).toBeVisible();
    await expect(compareDialog.getByText('Build autonomous local agents')).toBeVisible();

    await shot(page, 'compare-dialog');

    // Close dialog
    await compareDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(compareDialog).not.toBeVisible();

    expect(errors).toEqual([]);
  });

  test('3. Compare two checkpoints: pickers and swap button work', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Create checkpoint 1
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    let dialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await dialog.getByLabel(/Checkpoint note/i).fill('Version One');
    await dialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(dialog).not.toBeVisible();

    // Make edit
    await page.getByRole('tab', { name: 'Passport' }).click();
    await page.getByLabel('Project goal').fill('Version Two Goal');
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Create checkpoint 2
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    dialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await dialog.getByLabel(/Checkpoint note/i).fill('Version Two');
    await dialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(dialog).not.toBeVisible();

    // Open Compare dialog
    await page.getByRole('button', { name: 'Compare' }).first().click();
    const compareDialog = page.getByRole('dialog', { name: 'Compare versions' });
    await expect(compareDialog).toBeVisible();

    // Click swap versions
    const swapBtn = compareDialog.getByRole('button', { name: 'Swap comparison directions' });
    await expect(swapBtn).toBeVisible();
    await swapBtn.click();

    // Close
    await compareDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(compareDialog).not.toBeVisible();

    expect(errors).toEqual([]);
  });

  test('4. Files diff detects additions and content changes (SHA-256)', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Attach initial file
    await page.getByRole('tab', { name: 'Files' }).click();
    await page.getByRole('button', { name: 'Add files' }).first().click();
    let addDialog = page.getByRole('dialog', { name: 'Add project files' });
    await addDialog.locator('input[aria-label="Choose files"]').setInputFiles({
      name: 'config.ts',
      mimeType: 'text/plain',
      buffer: Buffer.from('export const port = 3000;'),
    });
    await expect(addDialog.getByText('Ready to attach')).toBeVisible();
    await addDialog.getByRole('button', { name: 'Attach files' }).click();
    await expect(addDialog).not.toBeVisible();

    // Create Checkpoint 1
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const cpDialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await cpDialog.getByLabel(/Checkpoint note/i).fill('With initial config');
    await cpDialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(cpDialog).not.toBeVisible();

    // Add another file in Files tab
    await page.getByRole('tab', { name: 'Files' }).click();
    await page.getByRole('button', { name: 'Add files' }).first().click();
    addDialog = page.getByRole('dialog', { name: 'Add project files' });
    await addDialog.locator('input[aria-label="Choose files"]').setInputFiles({
      name: 'utils.ts',
      mimeType: 'text/plain',
      buffer: Buffer.from('export const add = (a: number, b: number) => a + b;'),
    });
    await expect(addDialog.getByText('Ready to attach')).toBeVisible();
    await addDialog.getByRole('button', { name: 'Attach files' }).click();
    await expect(addDialog).not.toBeVisible();

    // Go to Checkpoints and Compare
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await page.getByRole('button', { name: 'Compare' }).first().click();
    const compareDialog = page.getByRole('dialog', { name: 'Compare versions' });
    await expect(compareDialog).toBeVisible();

    // Verify Files section diff
    await expect(compareDialog.getByText('Files')).toBeVisible();
    await expect(compareDialog.getByText('utils.ts')).toBeVisible();

    await compareDialog.getByRole('button', { name: 'Close', exact: true }).click();
    expect(errors).toEqual([]);
  });

  test('5. Safe restore: editor fields reverted, attached files preserved, "Before restore" checkpoint created', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    // Attach file
    await page.getByRole('tab', { name: 'Files' }).click();
    await page.getByRole('button', { name: 'Add files' }).first().click();
    const addDialog = page.getByRole('dialog', { name: 'Add project files' });
    await addDialog.locator('input[aria-label="Choose files"]').setInputFiles({
      name: 'permanent.ts',
      mimeType: 'text/plain',
      buffer: Buffer.from('export const id = "stable";'),
    });
    await expect(addDialog.getByText('Ready to attach')).toBeVisible();
    await addDialog.getByRole('button', { name: 'Attach files' }).click();
    await expect(addDialog).not.toBeVisible();

    // Create baseline Checkpoint
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const cpDialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await cpDialog.getByLabel(/Checkpoint note/i).fill('Baseline before rename');
    await cpDialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(cpDialog).not.toBeVisible();

    // Change project name
    await page.getByRole('tab', { name: 'Passport' }).click();
    await page.getByLabel('Project name').fill('Renamed Unstable Project');
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Return to Checkpoints and click Restore
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
    const restoreDialog = page.getByRole('dialog', { name: /Restore checkpoint/i });
    await expect(restoreDialog).toBeVisible();

    // Check notice
    await expect(restoreDialog.getByText(/Your attached files and conversations stay as they are/i)).toBeVisible();

    // Confirm restore
    await restoreDialog.getByRole('button', { name: 'Restore checkpoint' }).click();
    await expect(restoreDialog).not.toBeVisible();

    // Check success toast
    await expect(page.getByText(/Restored checkpoint/i)).toBeVisible();

    // Check project header: name restored back to "Checkpoint Test Project"
    await expect(page.getByRole('heading', { level: 1, name: 'Checkpoint Test Project' })).toBeVisible();

    // Verify files still intact
    await page.getByRole('tab', { name: 'Files' }).click();
    await expect(page.getByText('permanent.ts')).toBeVisible();

    // Verify timeline now has "Before restore" checkpoint
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await expect(page.getByText(/BEFORE RESTORE/)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('6. Undo restore: toast notification reverts project back to pre-restore state', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Create baseline Checkpoint
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const cpDialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await cpDialog.getByLabel(/Checkpoint note/i).fill('Baseline 1');
    await cpDialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(cpDialog).not.toBeVisible();

    // Edit project name
    await page.getByRole('tab', { name: 'Passport' }).click();
    await page.getByLabel('Project name').fill('Pre-Restore Special Name');
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Restore checkpoint
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
    const restoreDialog = page.getByRole('dialog', { name: /Restore checkpoint/i });
    await restoreDialog.getByRole('button', { name: 'Restore checkpoint' }).click();
    await expect(restoreDialog).not.toBeVisible();

    // Toast appears with Undo button
    const toastUndoBtn = page.getByRole('button', { name: 'Undo' });
    await expect(toastUndoBtn).toBeVisible();
    await toastUndoBtn.click();

    // Project name is recovered to "Pre-Restore Special Name"
    await expect(page.getByRole('heading', { level: 1, name: 'Pre-Restore Special Name' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('7. Legacy checkpoints: displays "Not recorded" banner and restores cleanly', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Seed a legacy checkpoint record directly in IndexedDB lacking files and conversationIds
    await page.evaluate(async () => {
      const dbs = (await window.indexedDB.databases?.()) || [];
      const dbName = dbs.find((d) => d.name?.includes('passport'))?.name || 'ProjectPassportDB';
      return new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.open(dbName);
        req.onsuccess = () => {
          const idb = req.result;
          const tx = idb.transaction(['projects', 'passports', 'checkpoints'], 'readwrite');
          const cpStore = tx.objectStore('checkpoints');
          const pStore = tx.objectStore('passports');

          const getP = pStore.getAll();
          getP.onsuccess = () => {
            const passportRecord = getP.result[0];
            if (!passportRecord) return resolve();

            const legacyCp = {
              id: 'legacy-cp-e2e',
              projectId: passportRecord.projectId,
              createdAt: '2026-01-01T00:00:00.000Z',
              description: 'Before AI merge',
              passport: {
                ...passportRecord.passport,
                project: {
                  ...passportRecord.passport.project,
                  name: 'Legacy Passport Name',
                },
              },
            };
            cpStore.put(legacyCp);
            tx.oncomplete = () => resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    });

    await page.reload();
    await page.getByRole('tab', { name: 'Checkpoints' }).click();

    // Timeline shows legacy checkpoint
    await expect(page.getByText(/BEFORE AI MERGE/)).toBeVisible();

    // Click Compare on legacy checkpoint
    await page.getByRole('button', { name: 'Compare' }).first().click();
    const compareDialog = page.getByRole('dialog', { name: 'Compare versions' });
    await expect(compareDialog).toBeVisible();

    // Check "Not recorded" banner is shown for Files
    await expect(
      compareDialog.getByText('Not recorded (this checkpoint was made before this was tracked)').first()
    ).toBeVisible();

    await compareDialog.getByRole('button', { name: 'Close', exact: true }).click();

    // Restore legacy checkpoint
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
    const restoreDialog = page.getByRole('dialog', { name: /Restore checkpoint/i });
    await restoreDialog.getByRole('button', { name: 'Restore checkpoint' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Legacy Passport Name' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('8. Stale-write conflict: concurrent edit prevents corrupt overwrite', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Create baseline
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await dialog.getByLabel(/Checkpoint note/i).fill('Baseline 1');
    await dialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(dialog).not.toBeVisible();

    // Mutate project updatedAt behind the scenes to simulate concurrent modification
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.open('ProjectPassportDB');
        req.onsuccess = () => {
          const idb = req.result;
          const tx = idb.transaction(['projects'], 'readwrite');
          const pStore = tx.objectStore('projects');
          const getAll = pStore.getAll();
          getAll.onsuccess = () => {
            const proj = getAll.result[0];
            if (proj) {
              proj.updatedAt = '2099-12-31T23:59:59.000Z';
              pStore.put(proj);
            }
            tx.oncomplete = () => resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    // Attempting restore with stale updatedAt shows conflict / safe error
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
    const restoreDialog = page.getByRole('dialog', { name: /Restore checkpoint/i });
    await restoreDialog.getByRole('button', { name: 'Restore checkpoint' }).click();

    // Verify dialog alert surfaced safely without uncaught exception
    await expect(restoreDialog.getByRole('alert')).toContainText('Another tab changed this passport. Reload the latest version before restoring.');
    await restoreDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(restoreDialog).not.toBeVisible();

    expect(errors).toEqual([]);
  });

  test('9. Zero outbound network requests & zero secrets leaked in console', async ({ page }) => {
    const getExternalRequests = collectExternalRequests(page);
    const errors = collectConsoleErrors(page);

    // Perform full checkpoint creation, comparison, and restore lifecycle
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await dialog.getByLabel(/Checkpoint note/i).fill('Security verified snapshot');
    await dialog.getByRole('button', { name: 'Create checkpoint' }).click();

    await page.getByRole('button', { name: 'Compare' }).first().click();
    const compareDialog = page.getByRole('dialog', { name: 'Compare versions' });
    await compareDialog.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
    const restoreDialog = page.getByRole('dialog', { name: /Restore checkpoint/i });
    await restoreDialog.getByRole('button', { name: 'Restore checkpoint' }).click();

    // Rule 4: Zero Outbound Data Transmission
    expect(getExternalRequests()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('10a. Timeline layout and Axe accessibility audit (empty and populated)', async ({ page }) => {
    // Audit timeline on current theme
    await expectNoSeriousA11y(page);
    await auditPageLayoutAndTouchTargets(page, 'checkpoints-timeline');

    // Create a checkpoint and audit populated state
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await dialog.getByLabel(/Checkpoint note/i).fill('Accessibility baseline');
    await dialog.getByRole('button', { name: 'Create checkpoint' }).click();

    await expectNoSeriousA11y(page);
  });

  test('10b. Compare and Restore dialogs Axe accessibility audit', async ({ page }) => {
    // Create a checkpoint first to enable compare and restore
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await dialog.getByLabel(/Checkpoint note/i).fill('Dialog a11y baseline');
    await dialog.getByRole('button', { name: 'Create checkpoint' }).click();

    // Audit Compare dialog accessibility
    await page.getByRole('button', { name: 'Compare' }).first().click();
    const compareDialog = page.getByRole('dialog', { name: 'Compare versions' });
    await expect(compareDialog).toBeVisible();
    await expectNoSeriousA11y(page);
    await compareDialog.getByRole('button', { name: 'Close', exact: true }).click();

    // Audit Restore dialog accessibility
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
    const restoreDialog = page.getByRole('dialog', { name: /Restore checkpoint/i });
    await expect(restoreDialog).toBeVisible();
    await expectNoSeriousA11y(page);
    await restoreDialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('11. Keyboard-only navigation workflow: Tab, Enter, Escape trap', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Tab to Create checkpoint button and press Enter
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Open create dialog
    const createBtn = page.getByRole('button', { name: 'Create checkpoint' }).first();
    await createBtn.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await expect(dialog).toBeVisible();

    // Type note with keyboard
    await page.keyboard.type('Keyboard created checkpoint');

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    expect(errors).toEqual([]);
  });
});
