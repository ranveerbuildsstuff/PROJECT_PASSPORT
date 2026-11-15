import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  expectNoSeriousA11y,
  collectConsoleErrors,
  collectExternalRequests,
  auditPageLayoutAndTouchTargets,
  shot,
} from './helpers';

const VALID_FIXTURE_PATH = path.resolve('tests/fixtures/paste-back/valid-reply.txt');
const TRUNCATED_FIXTURE_PATH = path.resolve('tests/fixtures/paste-back/truncated-reply.txt');

test.describe('Slice 5a: Capture From AI Dialog & Paste-Back Flow', () => {
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

    // Create a standard project to work with
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('AI Capture Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'AI Capture Project' })).toBeVisible();
  });

  test('1a. Entry point: opens from Overview next-action and copies prompt to clipboard', async ({
    page,
    context,
  }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // 1. Open from Overview tab next-action area
    const overviewCaptureBtn = page.getByRole('button', { name: 'Capture from AI' });
    await expect(overviewCaptureBtn).toBeVisible();
    await overviewCaptureBtn.click();

    const dialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(dialog).toBeVisible();

    // Verify prompt box content contains required instructions and fields
    const promptPre = dialog.getByLabel('Capture prompt text');
    await expect(promptPre).toBeVisible();
    const promptText = await promptPre.innerText();
    expect(promptText).toContain('bugsReviewed');
    expect(promptText).toContain('Reply with ONLY one JSON object');
    expect(promptText).toContain('Never include secrets');

    // Click "Copy prompt" button and verify toast
    await dialog.getByRole('button', { name: 'Copy prompt' }).click();
    await expect(page.getByText('Capture prompt copied to clipboard')).toBeVisible();

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('bugsReviewed');
    expect(clipboardText).toContain('project.status options:');

    // Close dialog with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('1b. Entry point: opens from Passport tab toolbar with axe scan', async ({ page }) => {
    // 2. Open from Passport tab toolbar
    await page.getByRole('tab', { name: 'Passport' }).click();
    const passportCaptureBtn = page.getByRole('button', { name: 'Capture from AI' }).first();
    await expect(passportCaptureBtn).toBeVisible();
    await passportCaptureBtn.click();

    await expect(page.getByRole('dialog', { name: 'Capture from AI' })).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('2. Valid fenced reply with smart quotes and trailing prose gives success summary listing repairs with 0 console errors', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.getByRole('button', { name: 'Capture from AI' }).click();
    const dialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(dialog).toBeVisible();

    // Load synthetic valid reply fixture
    const fixtureText = fs.readFileSync(VALID_FIXTURE_PATH, 'utf8');

    // Fill textarea
    const textarea = dialog.getByLabel('Paste AI response');
    await textarea.fill(fixtureText);

    // Click "Check reply"
    await dialog.getByRole('button', { name: 'Check reply' }).click();

    // Verify verified success card appears
    const statusCard = dialog.getByRole('status');
    await expect(statusCard).toBeVisible();
    await expect(statusCard.getByRole('heading', { name: 'Passport reply verified' })).toBeVisible();

    // Verify section counts
    await expect(statusCard.getByText('Basics')).toBeVisible();
    await expect(statusCard.getByText('Stack')).toBeVisible();
    await expect(statusCard.getByText('Tasks')).toBeVisible();
    await expect(statusCard.getByText('Reply readiness')).toBeVisible();

    // Verify repairs are listed
    await expect(statusCard.getByText(/Repairs applied:/)).toBeVisible();
    await expect(statusCard.getByText(/smart double quotes/i)).toBeVisible();
    await expect(statusCard.getByText(/trailing commas/i)).toBeVisible();

    // Verify section-by-section merge controls and Apply merge button
    await expect(statusCard.getByRole('button', { name: 'Apply merge' })).toBeVisible();

    // Assert zero console errors
    expect(consoleErrors).toEqual([]);
  });

  test('3. Error path: truncated reply displays plain-language alert, then fixing text and re-checking succeeds', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Capture from AI' }).click();
    const dialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(dialog).toBeVisible();

    // Load truncated reply fixture
    const truncatedText = fs.readFileSync(TRUNCATED_FIXTURE_PATH, 'utf8');

    const textarea = dialog.getByLabel('Paste AI response');
    await textarea.fill(truncatedText);
    await dialog.getByRole('button', { name: 'Check reply' }).click();

    // Verify plain-language alert
    const alert = dialog.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('heading', { name: 'Incomplete JSON' })).toBeVisible();
    await expect(
      alert.getByText('The JSON stops before it ends. Ask the AI to send the complete reply again.')
    ).toBeVisible();

    // Assert message is free of curly braces or Zod errors
    const alertText = await alert.innerText();
    expect(alertText).not.toContain('{');
    expect(alertText).not.toContain('}');
    expect(alertText).not.toContain('ZodError');
    expect(alertText).not.toContain('invalid_');

    // Fix the text with valid JSON
    const validText = fs.readFileSync(VALID_FIXTURE_PATH, 'utf8');
    await textarea.fill(validText);
    await dialog.getByRole('button', { name: 'Check reply' }).click();

    // Verify success card replaces error
    await expect(dialog.getByRole('status')).toBeVisible();
    await expect(dialog.getByRole('alert')).not.toBeVisible();
    await expect(dialog.getByText('Passport reply verified')).toBeVisible();

    await expectNoSeriousA11y(page);
  });

  test('4. Zero outbound network requests and zero storage writes across entire flow', async ({
    page,
  }) => {
    const getExternalRequests = collectExternalRequests(page);

    // Navigate to Passport editor tab and set a known baseline goal
    await page.getByRole('tab', { name: 'Passport' }).click();
    const goalTextarea = page.getByLabel('Project goal');
    await goalTextarea.fill('Baseline unwritten goal');

    // Wait for autosave to complete
    await expect(page.getByText('Saved')).toBeVisible();

    // Open capture dialog
    await page.getByRole('button', { name: 'Capture from AI' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(dialog).toBeVisible();

    // Load and paste valid reply with different goal
    const fixtureText = fs.readFileSync(VALID_FIXTURE_PATH, 'utf8');
    await dialog.getByLabel('Paste AI response').fill(fixtureText);
    await dialog.getByRole('button', { name: 'Check reply' }).click();
    await expect(dialog.getByRole('status')).toBeVisible();

    // Assert zero outbound network requests occurred throughout
    const externalRequests = getExternalRequests();
    expect(externalRequests).toHaveLength(0);

    // Close dialog and reload page to prove zero storage writes
    await page.keyboard.press('Escape');
    await page.reload();

    // Verify project still has baseline goal (not overwritten by capture)
    await page.getByRole('tab', { name: 'Passport' }).click();
    await expect(page.getByLabel('Project goal')).toHaveValue('Baseline unwritten goal');
  });

  test('5. Dark theme: Step 1 and Success states layout, touch targets, axe scan and screenshots', async ({
    page,
  }) => {
    // 1. Step 1 state (Dark theme)
    await page.getByRole('button', { name: 'Capture from AI' }).click();
    const dialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(dialog).toBeVisible();

    await auditPageLayoutAndTouchTargets(page, 'capture-dialog-step1-dark');
    await shot(page, 'capture-dialog-step1-dark');

    // 2. Success state (Dark theme)
    const validText = fs.readFileSync(VALID_FIXTURE_PATH, 'utf8');
    await dialog.getByLabel('Paste AI response').fill(validText);
    await dialog.getByRole('button', { name: 'Check reply' }).click();
    await expect(dialog.getByRole('status')).toBeVisible();

    await auditPageLayoutAndTouchTargets(page, 'capture-dialog-success-dark');
    await expectNoSeriousA11y(page);
    await shot(page, 'capture-dialog-success-dark');
  });

  test('6. Light theme: Error state layout, touch targets, axe scan and screenshots', async ({
    page,
  }) => {
    // 1. Toggle to Light Theme before opening dialog
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // 2. Open dialog
    await page.getByRole('button', { name: 'Capture from AI' }).click();
    const dialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(dialog).toBeVisible();

    // 3. Error state (Light theme)
    const truncatedText = fs.readFileSync(TRUNCATED_FIXTURE_PATH, 'utf8');
    await dialog.getByLabel('Paste AI response').fill(truncatedText);
    await dialog.getByRole('button', { name: 'Check reply' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();

    await auditPageLayoutAndTouchTargets(page, 'capture-dialog-error-light');
    await expectNoSeriousA11y(page);
    await shot(page, 'capture-dialog-error-light');
  });

  test('7. Merge happy path with undo via checkpoint', async ({ page }) => {
    // 1. Navigate to Passport tab and set baseline goal
    await page.getByRole('tab', { name: 'Passport' }).click();
    const goalTextarea = page.getByLabel('Project goal');
    await goalTextarea.fill('Original baseline goal');
    await expect(page.getByText('Saved')).toBeVisible();

    // 2. Open Capture dialog
    await page.getByRole('button', { name: 'Capture from AI' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(dialog).toBeVisible();

    // 3. Paste valid fixture response and check reply
    const validText = fs.readFileSync(VALID_FIXTURE_PATH, 'utf8');
    await dialog.getByLabel('Paste AI response').fill(validText);
    await dialog.getByRole('button', { name: 'Check reply' }).click();
    await expect(dialog.getByRole('status')).toBeVisible();

    // 4. Verify section-by-section merge controls and apply merge
    await expect(dialog.getByText('Section-by-section merge')).toBeVisible();
    const applyBtn = dialog.getByRole('button', { name: 'Apply merge' });
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // 5. Verify dialog closes and toast appears with Undo
    await expect(dialog).not.toBeVisible();
    const toast = page.getByText(/Merged \d+ sections into passport\./i);
    await expect(toast).toBeVisible();
    const undoBtn = page.getByRole('button', { name: 'Undo' });
    await expect(undoBtn).toBeVisible();

    // 6. Verify editor displays merged content
    await expect(page.getByLabel('Project goal')).toHaveValue(
      'Provide cross-device local-first document sync'
    );

    // 7. Click Undo in the toast and verify passport reverts to pre-merge baseline
    await undoBtn.click();
    await expect(page.getByText('Merge undone.')).toBeVisible();
    await expect(page.getByLabel('Project goal')).toHaveValue('Original baseline goal');
  });

  test('8. Stale-write conflict detection and recovery', async ({ page }) => {
    // 1. Navigate to Passport tab
    await page.getByRole('tab', { name: 'Passport' }).click();

    // 2. Open Capture dialog
    await page.getByRole('button', { name: 'Capture from AI' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(dialog).toBeVisible();

    // 3. Paste valid fixture response and check reply
    const validText = fs.readFileSync(VALID_FIXTURE_PATH, 'utf8');
    await dialog.getByLabel('Paste AI response').fill(validText);
    await dialog.getByRole('button', { name: 'Check reply' }).click();
    await expect(dialog.getByRole('status')).toBeVisible();

    // 4. Simulate a concurrent edit in IndexedDB while dialog is open
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('ProjectPassportDB');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          try {
            const idb = req.result;
            const tx = idb.transaction(['projects', 'passports'], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));

            const pStore = tx.objectStore('projects');
            const passStore = tx.objectStore('passports');
            const getReq = pStore.getAll();
            getReq.onsuccess = () => {
              try {
                const projects = getReq.result;
                if (projects.length > 0) {
                  const p = projects[0];
                  const newTime = new Date(Date.now() + 60000).toISOString();
                  p.updatedAt = newTime;
                  p.name = 'Concurrent Rename';
                  pStore.put(p);

                  const passReq = passStore.get(p.id);
                  passReq.onsuccess = () => {
                    try {
                      const record = passReq.result;
                      if (record && record.passport && record.passport.project) {
                        record.passport.project.updatedAt = newTime;
                        record.passport.project.name = 'Concurrent Rename';
                        passStore.put(record);
                      }
                    } catch (e) {
                      reject(e);
                    }
                  };
                  passReq.onerror = () => reject(passReq.error);
                } else {
                  resolve();
                }
              } catch (e) {
                reject(e);
              }
            };
            getReq.onerror = () => reject(getReq.error);
          } catch (e) {
            reject(e);
          }
        };
      });
    });

    // 5. Click Apply merge -> StaleWrite error
    await dialog.getByRole('button', { name: 'Apply merge' }).click();

    // 6. Verify stale write alert appears and dialog stays open
    const errorAlert = dialog.getByRole('alert');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText(
      'This passport was modified in another tab or window. Please reload to see the latest version.'
    );

    // 7. Click Reload latest
    const reloadBtn = dialog.getByRole('button', { name: 'Reload latest' });
    await expect(reloadBtn).toBeVisible();
    await reloadBtn.click();

    // 8. Verify error clears and applying merge succeeds with reloaded baseline
    await expect(errorAlert).not.toBeVisible();
    await dialog.getByRole('button', { name: 'Apply merge' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(/Merged \d+ sections into passport\./i)).toBeVisible();
  });

  test('9. Undo-after-merge safety: editing after merge and clicking Undo preserves edit in Before restore checkpoint and allows recovery', async ({
    page,
  }) => {
    // 1. Navigate to Passport tab and set baseline goal
    await page.getByRole('tab', { name: 'Passport' }).click();
    const goalTextarea = page.getByLabel('Project goal');
    await goalTextarea.fill('Original baseline goal');
    await expect(page.getByText('Saved')).toBeVisible();

    // 2. Open Capture dialog
    await page.getByRole('button', { name: 'Capture from AI' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(dialog).toBeVisible();

    // 3. Paste valid fixture response and check reply
    const validText = fs.readFileSync(VALID_FIXTURE_PATH, 'utf8');
    await dialog.getByLabel('Paste AI response').fill(validText);
    await dialog.getByRole('button', { name: 'Check reply' }).click();
    await expect(dialog.getByRole('status')).toBeVisible();

    // 4. Apply merge
    await dialog.getByRole('button', { name: 'Apply merge' }).click();
    await expect(dialog).not.toBeVisible();

    // 5. Verify merge toast with Undo button is visible
    const undoBtn = page.getByRole('button', { name: 'Undo' });
    await expect(undoBtn).toBeVisible();

    // Verify merged content is present
    await expect(page.getByLabel('Project goal')).toHaveValue(
      'Provide cross-device local-first document sync'
    );

    // 6. User makes a newer edit after merge
    await goalTextarea.fill('User post-merge modification');
    await expect(page.getByText('Saved')).toBeVisible();

    // 7. Click Undo in the toast
    await undoBtn.click();

    // 8. Verify toast informs user that newer edits were saved in "Before restore" checkpoint
    await expect(
      page.getByText('Merge undone. Newer edits saved in a "Before restore" checkpoint.')
    ).toBeVisible();

    // 9. Verify passport reverted to pre-merge baseline
    await expect(page.getByLabel('Project goal')).toHaveValue('Original baseline goal');

    // 10. Verify that the newer edit is preserved and recoverable from the "Before restore" checkpoint in IndexedDB
    const checkpointData = await page.evaluate(async () => {
      return new Promise<{ beforeRestoreGoal: string }>((resolve, reject) => {
        const req = indexedDB.open('ProjectPassportDB');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          try {
            const idb = req.result;
            const tx = idb.transaction(['checkpoints'], 'readonly');
            const store = tx.objectStore('checkpoints');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              const cps = getAllReq.result as Array<{
                description: string;
                passport?: { project?: { goal?: string } };
              }>;
              const beforeRestoreCp = cps.find((c) => c.description === 'Before restore');
              resolve({
                beforeRestoreGoal: beforeRestoreCp?.passport?.project?.goal || '',
              });
            };
            getAllReq.onerror = () => reject(getAllReq.error);
          } catch (e) {
            reject(e);
          }
        };
      });
    });

    expect(checkpointData.beforeRestoreGoal).toBe('User post-merge modification');
  });
});
