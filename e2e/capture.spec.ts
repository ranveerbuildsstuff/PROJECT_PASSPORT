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

  test('1. Entry points: opens from Overview next-action and Passport tab, copies prompt to clipboard', async ({
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

    // Verify muted note
    await expect(statusCard.getByText('Merging arrives in the next update')).toBeVisible();

    // Assert zero console errors
    expect(consoleErrors).toEqual([]);
    await expectNoSeriousA11y(page);
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
});
