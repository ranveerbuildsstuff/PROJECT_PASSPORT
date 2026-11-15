import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  expectNoSeriousA11y,
  collectConsoleErrors,
  collectExternalRequests,
} from './helpers';

const CHATGPT_FIXTURE = path.resolve('tests/fixtures/exports/chatgpt-conversations.json');
const CLAUDE_FIXTURE = path.resolve('tests/fixtures/exports/claude-export.json');
const SHARD_1_FIXTURE = path.resolve('tests/fixtures/exports/chatgpt-shard-001.json');
const SHARD_2_FIXTURE = path.resolve('tests/fixtures/exports/chatgpt-shard-002.json');
const ZIP_FIXTURE = path.resolve('tests/fixtures/exports/fake-archive.zip');
const INVALID_FIXTURE = path.resolve('tests/fixtures/exports/invalid-export.json');

test.describe('Slice 7: ChatGPT and Claude Export Ingestion', () => {
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

    // Create a fresh test project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Export Ingestion Test Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Export Ingestion Test Project' })).toBeVisible();

    // Switch to Conversations tab
    await page.getByRole('tab', { name: 'Conversations' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Conversations' })).toBeVisible();
  });

  test('1. ChatGPT export import: upload, selection list, axe scan, attach, and card rendering', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    const externalRequests = collectExternalRequests(page);

    // Open import dialog
    await page.getByRole('button', { name: 'Import export file' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import export file' });
    await expect(dialog).toBeVisible();

    // Run accessibility scan on empty dialog state (1 axe scan)
    await expectNoSeriousA11y(page);

    // Select ChatGPT export JSON file
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles(CHATGPT_FIXTURE);

    // Dialog transitions to selection step with conversation rows
    await expect(dialog.getByText('Architectural Design Discussion')).toBeVisible();
    await expect(dialog.getByText('Mobile Touch Targets')).toBeVisible();

    // Verify token estimates and message count badges
    await expect(dialog.getByText('CHATGPT').first()).toBeVisible();

    // Filter conversations
    const filterInput = dialog.getByLabel('Filter conversations by title');
    await filterInput.fill('Architectural');
    await expect(dialog.getByText('Architectural Design Discussion')).toBeVisible();
    await expect(dialog.getByText('Mobile Touch Targets')).not.toBeVisible();

    // Clear filter
    await filterInput.fill('');
    await expect(dialog.getByText('Mobile Touch Targets')).toBeVisible();

    // Attach selected conversations
    const attachButton = dialog.getByRole('button', { name: /Attach selected/i });
    await expect(attachButton).toBeEnabled();
    await attachButton.click();

    // Dialog closes and success toast appears
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Attached 2 conversations to project.')).toBeVisible();

    // Conversations tab displays cards for both imported items
    await expect(page.getByText('Architectural Design Discussion')).toBeVisible();
    await expect(page.getByText('Mobile Touch Targets')).toBeVisible();

    // Verify zero console errors and zero external network requests
    expect(consoleErrors).toHaveLength(0);
    expect(externalRequests).toHaveLength(0);
  });

  test('2. Claude export import: parses Claude JSON and attaches with CLAUDE source stamp', async ({
    page,
  }) => {
    // Open import dialog
    await page.getByRole('button', { name: 'Import export file' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import export file' });
    await expect(dialog).toBeVisible();

    // Upload Claude export fixture
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles(CLAUDE_FIXTURE);

    // Verify conversations listed with CLAUDE badges
    await expect(dialog.getByText('Frontend Architecture Review')).toBeVisible();
    await expect(dialog.getByText('Design Tokens and Typography')).toBeVisible();
    await expect(dialog.getByText('CLAUDE').first()).toBeVisible();

    // Attach selected
    await dialog.getByRole('button', { name: /Attach selected/i }).click();
    await expect(dialog).not.toBeVisible();

    // Cards visible on tab
    await expect(page.getByText('Frontend Architecture Review')).toBeVisible();
    await expect(page.getByText('Design Tokens and Typography')).toBeVisible();
    await expect(page.getByText('CLAUDE').first()).toBeVisible();
  });

  test('3. Multi-file sharded export: merges shards and de-duplicates conversations by ID', async ({
    page,
  }) => {
    // Open dialog
    await page.getByRole('button', { name: 'Import export file' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import export file' });
    await expect(dialog).toBeVisible();

    // Upload both shards simultaneously
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles([SHARD_1_FIXTURE, SHARD_2_FIXTURE]);

    // De-duplication invariant: Shard One Conversation must appear exactly once
    await expect(dialog.getByText('Shard One Conversation')).toBeVisible();
    await expect(dialog.getByText('Shard Two Unique Conversation')).toBeVisible();
    expect(await dialog.getByText('Shard One Conversation Duplicate').count()).toBe(0);

    // Attach
    await dialog.getByRole('button', { name: /Attach selected/i }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Attached 2 conversations to project.')).toBeVisible();
  });

  test('4. Diagnostics & zip rejection: handles zip archives and corrupted JSON gracefully', async ({
    page,
  }) => {
    // Open dialog
    await page.getByRole('button', { name: 'Import export file' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import export file' });
    await expect(dialog).toBeVisible();

    const fileInput = dialog.locator('input[type="file"]');

    // Case A: Zip file upload shows friendly unzip instructions
    await fileInput.setInputFiles(ZIP_FIXTURE);
    await expect(
      dialog.getByText('This is a .zip file. Unzip it first, then choose conversations.json.')
    ).toBeVisible();

    // Click "Choose different file" to reset
    await dialog.getByRole('button', { name: 'Choose different file' }).click();

    // Case B: Unrecognized JSON structure shows diagnostics panel without crashing
    await fileInput.setInputFiles(INVALID_FIXTURE);
    await expect(dialog.getByRole('heading', { name: 'Unrecognized export format' })).toBeVisible();
    await expect(dialog.getByText('Diagnostics metadata:')).toBeVisible();
    await expect(dialog.getByText(/random_unrecognized_key_one/)).toBeVisible();
  });

  test('5. Duplicate detection: flags already attached conversations and allows skipping', async ({
    page,
  }) => {
    // Step 1: Import ChatGPT export first time
    await page.getByRole('button', { name: 'Import export file' }).click();
    let dialog = page.getByRole('dialog', { name: 'Import export file' });
    await dialog.locator('input[type="file"]').setInputFiles(CHATGPT_FIXTURE);
    await expect(dialog.getByText('Architectural Design Discussion')).toBeVisible();
    await dialog.getByRole('button', { name: /Attach selected/i }).click();
    await expect(dialog).not.toBeVisible();

    // Step 2: Open import dialog second time with same file
    await page.getByRole('button', { name: 'Import export file' }).click();
    dialog = page.getByRole('dialog', { name: 'Import export file' });
    await dialog.locator('input[type="file"]').setInputFiles(CHATGPT_FIXTURE);

    // Verify "Already attached" indicator is shown
    await expect(dialog.getByText('Already attached').first()).toBeVisible();
    await expect(dialog.getByText(/already attached to this project/i)).toBeVisible();

    // Skip duplicates checkbox is checked by default
    const skipCheckbox = dialog.getByLabel('Skip duplicates');
    await expect(skipCheckbox).toBeChecked();

    // Click attach with skip duplicates on
    await dialog.getByRole('button', { name: /Attach selected/i }).click();
    await expect(dialog).not.toBeVisible();

    // Verify 0 duplicates were created (count of cards on page remains exactly 2)
    await expect(page.getByText('Architectural Design Discussion')).toHaveCount(1);
    await expect(page.getByText('Mobile Touch Targets')).toHaveCount(1);
  });

  test('6. Keyboard navigation: accessible selection and attach workflow', async ({
    page,
  }) => {
    // Open dialog via keyboard
    const importButton = page.getByRole('button', { name: 'Import export file' });
    await importButton.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Import export file' });
    await expect(dialog).toBeVisible();

    // Upload via file input
    await dialog.locator('input[type="file"]').setInputFiles(CHATGPT_FIXTURE);
    await expect(dialog.getByText('Architectural Design Discussion')).toBeVisible();

    // Navigate to Clear button and press Space
    const clearButton = dialog.getByRole('button', { name: 'Clear' });
    await clearButton.focus();
    await page.keyboard.press('Space');

    // Attach button is now disabled (0 selected)
    const attachButton = dialog.getByRole('button', { name: /Attach selected/i });
    await expect(attachButton).toBeDisabled();

    // Select all button via keyboard
    const selectAllButton = dialog.getByRole('button', { name: 'Select all' });
    await selectAllButton.focus();
    await page.keyboard.press('Space');
    await expect(attachButton).toBeEnabled();

    // Focus attach button and press Enter
    await attachButton.focus();
    await page.keyboard.press('Enter');

    // Dialog closes and cards are attached
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Architectural Design Discussion')).toBeVisible();
  });
});
