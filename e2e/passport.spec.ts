import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import {
  shot,
  shotViewportTop,
  expectNoSeriousA11y,
  auditPageLayoutAndTouchTargets,
  collectConsoleErrors,
} from './helpers';

test.describe('Passport Editor E2E Tests', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant clipboard permissions for copy tests
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

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

  // Helper to create a fresh project and navigate directly to its passport editor
  async function createAndOpenPassport(page: Page, projectName = 'Passport Test Project') {
    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill(projectName);
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await expect(page).toHaveURL(/\/project\/([a-f0-9-]+)\/overview/);
    const url = page.url();
    const match = url.match(/\/project\/([a-f0-9-]+)\/overview/);
    expect(match).not.toBeNull();
    const projectId = match![1];

    // Click Passport tab
    await page.getByRole('tab', { name: 'Passport' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/passport`));
    await expect(page.getByRole('button', { name: /Basics/i })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    return { projectId, projectName };
  }

  test('1. Edit basics; wait for the Saved indicator; reload; values persist', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Alpha Core Engine');

    // Fill Goal and Summary
    const goalInput = page.getByLabel('Project goal');
    await goalInput.fill('Build an autonomous AI orchestration engine');

    const summaryInput = page.getByLabel('Executive summary');
    await summaryInput.fill('Local-first reactive state engine with Dexie storage');

    // Select status
    const statusSelect = page.getByLabel('Project status');
    await statusSelect.selectOption('in_progress');

    // Wait for the debounced autosave status indicator
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Reload page
    await page.reload();

    // Verify all edited values persisted
    await expect(page.getByLabel('Project goal')).toHaveValue(
      'Build an autonomous AI orchestration engine'
    );
    await expect(page.getByLabel('Executive summary')).toHaveValue(
      'Local-first reactive state engine with Dexie storage'
    );
    await expect(page.getByLabel('Project status')).toHaveValue('in_progress');
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');
  });

  test('2. Add one item in every list plus next action; reload; all persist', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Full Feature App');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // 1. Stack
    await page.getByRole('button', { name: /Add stack item/i }).first().click();
    const stack1 = page.getByRole('group', { name: 'Stack item 1' });
    await stack1.getByRole('textbox', { name: 'Name' }).fill('React');
    await stack1.getByRole('textbox', { name: 'Role' }).fill('Frontend framework');
    await stack1.getByRole('textbox', { name: 'Version' }).fill('18.3.1');
    await stack1.getByRole('textbox', { name: 'Notes' }).fill('Strict mode enabled');

    // 2. Requirements
    await page.getByRole('button', { name: /Add requirement/i }).first().click();
    const req1 = page.getByRole('group', { name: 'Requirement 1' });
    await req1.getByRole('textbox', { name: 'Description' }).fill('Zero outbound telemetry');

    // 3. Decisions
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    const dec1 = page.getByRole('group', { name: 'Decision 1' });
    await dec1.getByRole('textbox', { name: 'Decision' }).fill('Use PostgreSQL for order data');
    await dec1.getByRole('textbox', { name: 'Reason' }).fill('Provides strict ACID guarantees for transaction data');

    // 4. Completed
    await page.getByRole('button', { name: /Add completed item/i }).first().click();
    const comp1 = page.getByRole('group', { name: 'Completed item 1' });
    await comp1.getByRole('textbox', { name: 'Description' }).fill('Completed initial scaffold');

    // 5. Tasks
    await page.getByRole('button', { name: /Add task/i }).first().click();
    const task1 = page.getByRole('group', { name: 'Task 1' });
    await task1.getByRole('textbox', { name: 'Description' }).fill('Implement passport editor test suite');

    // 6. Bugs
    await page.getByRole('button', { name: /Add bug/i }).first().click();
    const bug1 = page.getByRole('group', { name: 'Bug 1' });
    await bug1.getByRole('textbox', { name: 'Description' }).fill('Windows file path backslash normalization');

    // 7. Instructions
    await page.getByRole('button', { name: /Add instruction/i }).first().click();
    const inst1 = page.getByRole('group', { name: 'Instruction 1' });
    await inst1.getByRole('textbox', { name: 'Rule / Instruction' }).fill('Always use TypeScript strict mode');

    // 8. Next Action
    await page.getByRole('textbox', { name: 'Immediate next action' }).fill('Run E2E test verification');

    // 9. Open Questions
    await page.getByRole('button', { name: /Add open question/i }).first().click();
    const q1 = page.getByRole('group', { name: 'Question 1' });
    await q1.getByRole('textbox', { name: 'Question' }).fill('What cloud sync options should be considered?');

    // Wait for Saved
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Reload
    await page.reload();
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Verify all fields persisted
    const stack1Reloaded = page.getByRole('group', { name: 'Stack item 1' });
    await expect(stack1Reloaded.getByRole('textbox', { name: 'Name' })).toHaveValue('React');
    await expect(stack1Reloaded.getByRole('textbox', { name: 'Role' })).toHaveValue('Frontend framework');
    await expect(stack1Reloaded.getByRole('textbox', { name: 'Version' })).toHaveValue('18.3.1');
    await expect(stack1Reloaded.getByRole('textbox', { name: 'Notes' })).toHaveValue('Strict mode enabled');

    const req1Reloaded = page.getByRole('group', { name: 'Requirement 1' });
    await expect(req1Reloaded.getByRole('textbox', { name: 'Description' })).toHaveValue('Zero outbound telemetry');

    const dec1Reloaded = page.getByRole('group', { name: 'Decision 1' });
    await expect(dec1Reloaded.getByRole('textbox', { name: 'Decision' })).toHaveValue('Use PostgreSQL for order data');
    await expect(dec1Reloaded.getByRole('textbox', { name: 'Reason' })).toHaveValue('Provides strict ACID guarantees for transaction data');

    const comp1Reloaded = page.getByRole('group', { name: 'Completed item 1' });
    await expect(comp1Reloaded.getByRole('textbox', { name: 'Description' })).toHaveValue('Completed initial scaffold');

    const task1Reloaded = page.getByRole('group', { name: 'Task 1' });
    await expect(task1Reloaded.getByRole('textbox', { name: 'Description' })).toHaveValue('Implement passport editor test suite');

    const bug1Reloaded = page.getByRole('group', { name: 'Bug 1' });
    await expect(bug1Reloaded.getByRole('textbox', { name: 'Description' })).toHaveValue('Windows file path backslash normalization');

    const inst1Reloaded = page.getByRole('group', { name: 'Instruction 1' });
    await expect(inst1Reloaded.getByRole('textbox', { name: 'Rule / Instruction' })).toHaveValue('Always use TypeScript strict mode');

    await expect(page.getByRole('textbox', { name: 'Immediate next action' })).toHaveValue('Run E2E test verification');

    const q1Reloaded = page.getByRole('group', { name: 'Question 1' });
    await expect(q1Reloaded.getByRole('textbox', { name: 'Question' })).toHaveValue('What cloud sync options should be considered?');
  });

  test('3. Reorder with the keyboard buttons; reload; order persists', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Reorder Test Project');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Add Task 1
    await page.getByRole('button', { name: /Add task/i }).first().click();
    const task1 = page.getByRole('group', { name: 'Task 1' });
    await task1.getByRole('textbox', { name: 'Description' }).fill('Task Alpha (First)');

    // Add Task 2
    await page.getByRole('button', { name: /Add task/i }).first().click();
    const task2 = page.getByRole('group', { name: 'Task 2' });
    await task2.getByRole('textbox', { name: 'Description' }).fill('Task Beta (Second)');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Click "Move task 2 up"
    const moveUpBtn = page.getByRole('button', { name: 'Move task 2 up' });
    await expect(moveUpBtn).toBeVisible();
    await moveUpBtn.click();

    // Verify visual order swapped
    await expect(page.getByRole('group', { name: 'Task 1' }).getByRole('textbox', { name: 'Description' })).toHaveValue('Task Beta (Second)');
    await expect(page.getByRole('group', { name: 'Task 2' }).getByRole('textbox', { name: 'Description' })).toHaveValue('Task Alpha (First)');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Reload and check persisted order
    await page.reload();
    await page.getByRole('button', { name: /Expand all/i }).click();

    await expect(page.getByRole('group', { name: 'Task 1' }).getByRole('textbox', { name: 'Description' })).toHaveValue('Task Beta (Second)');
    await expect(page.getByRole('group', { name: 'Task 2' }).getByRole('textbox', { name: 'Description' })).toHaveValue('Task Alpha (First)');
  });

  test('4. Delete an item, then Undo restores it; delete without undo persists after reload', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Delete Undo Project');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Add two completed items
    await page.getByRole('button', { name: /Add completed item/i }).first().click();
    const comp1 = page.getByRole('group', { name: 'Completed item 1' });
    await comp1.getByRole('textbox', { name: 'Description' }).fill('Milestone One');

    await page.getByRole('button', { name: /Add completed item/i }).first().click();
    const comp2 = page.getByRole('group', { name: 'Completed item 2' });
    await comp2.getByRole('textbox', { name: 'Description' }).fill('Milestone Two');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Delete item 1
    await page.getByRole('button', { name: 'Delete completed item 1' }).click();

    // Item 1 deleted immediately, toast with Undo appears
    await expect(page.getByRole('group', { name: /^Completed item \d+$/ })).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Completed item 1' }).getByRole('textbox', { name: 'Description' })).toHaveValue('Milestone Two');

    const undoButton = page.getByRole('button', { name: 'Undo' });
    await expect(undoButton).toBeVisible();

    // Click Undo
    await undoButton.click();

    // Both items present again!
    await expect(page.getByRole('group', { name: /^Completed item \d+$/ })).toHaveCount(2);
    await expect(page.getByRole('group', { name: 'Completed item 1' }).getByRole('textbox', { name: 'Description' })).toHaveValue('Milestone One');
    await expect(page.getByRole('group', { name: 'Completed item 2' }).getByRole('textbox', { name: 'Description' })).toHaveValue('Milestone Two');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Now delete item 1 again without undo
    await page.getByRole('button', { name: 'Delete completed item 1' }).click();
    await expect(page.getByRole('group', { name: /^Completed item \d+$/ })).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Completed item 1' }).getByRole('textbox', { name: 'Description' })).toHaveValue('Milestone Two');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Reload
    await page.reload();
    await page.getByRole('button', { name: /Expand all/i }).click();

    await expect(page.getByRole('group', { name: /^Completed item \d+$/ })).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Completed item 1' }).getByRole('textbox', { name: 'Description' })).toHaveValue('Milestone Two');
  });

  test('5. Validation: empty task text shows plain-language error and Not saved; fixing saves; navigating away asks confirmation', async ({ page }) => {
    collectConsoleErrors(page);
    const { projectId } = await createAndOpenPassport(page, 'Validation Test Project');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Add empty task
    await page.getByRole('button', { name: /Add task/i }).first().click();

    // Plain-language error appears inline and status is "Not saved"
    await expect(page.getByRole('alert').filter({ hasText: 'Task 1 needs some text' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Not saved');

    // Attempt to navigate to Overview tab
    await page.getByRole('tab', { name: 'Overview' }).click();

    // Discard confirmation dialog opens
    const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Your passport currently has validation errors/i)).toBeVisible();

    // Click "Keep editing"
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/passport`));

    // Fix the error by entering valid task text
    const task1 = page.getByRole('group', { name: 'Task 1' });
    await task1.getByRole('textbox', { name: 'Description' }).fill('Write comprehensive E2E specs');

    // Error clears and status becomes Saved
    await expect(page.getByRole('alert').filter({ hasText: 'Task 1 needs some text' })).not.toBeVisible();
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Now navigation succeeds without dialog
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/overview`));
    await expect(page.getByRole('heading', { level: 1, name: 'Validation Test Project' })).toBeVisible();
  });

  test('6. Readiness updates live as fields are filled; bugsReviewed toggle alone passes bugs check; Overview & dashboard reflect score', async ({ page }) => {
    collectConsoleErrors(page);

    // Restore synthetic backup containing 1 project with a file in its passport manifest
    await page.goto('/');
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    const backupDialog = page.getByRole('dialog', { name: 'Backup & restore' });
    await expect(backupDialog).toBeVisible();

    const fileInput = backupDialog.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/readiness-seed-backup.json');

    // Confirm restore
    await backupDialog.getByRole('button', { name: 'Confirm and restore' }).click();
    await expect(backupDialog).not.toBeVisible();
    await expect(page.getByText('Restored 1 project', { exact: true })).toBeVisible();

    // Open the restored project
    await page.getByRole('link', { name: /Readiness Live Test/ }).first().click();

    // Navigate to Passport editor
    await page.getByRole('tab', { name: 'Passport' }).click();
    await expect(page.getByRole('button', { name: /Basics/i })).toBeVisible();

    const sidePanel = page.locator('aside');
    await expect(sidePanel.getByText('Handoff Readiness')).toBeVisible();
    // Context check is already passed due to the attached file
    await expect(sidePanel.getByText('Context attached')).toBeVisible();

    // 1. Fill Objective
    await page.getByRole('textbox', { name: 'Project goal' }).fill('Build full-featured offline assistant');
    await expect(sidePanel.getByText('Objective defined')).toBeVisible();

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // 2. Add Stack
    await page.getByRole('button', { name: /Add stack item/i }).first().click();
    const stack1 = page.getByRole('group', { name: 'Stack item 1' });
    await stack1.getByRole('textbox', { name: 'Name' }).fill('TypeScript');

    // 3. Add Active Decision
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    const dec1 = page.getByRole('group', { name: 'Decision 1' });
    await dec1.getByRole('textbox', { name: 'Decision' }).fill('Zero network calls');
    await dec1.getByRole('textbox', { name: 'Reason' }).fill('Security and privacy');

    // 4. Add Task
    await page.getByRole('button', { name: /Add task/i }).first().click();
    const task1 = page.getByRole('group', { name: 'Task 1' });
    await task1.getByRole('textbox', { name: 'Description' }).fill('Initial migration');

    // 5. Test the bugsReviewed toggle alone passes the bugs check
    const bugsToggle = page.getByLabel('I reviewed bugs and there are none');
    await bugsToggle.check();

    // 6. Fill Next Action
    await page.getByRole('textbox', { name: 'Immediate next action' }).fill('Publish release v1');

    // Wait for autosave to complete
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // All 7 checks have passed -> 100/100 score
    await expect(sidePanel.getByText('100/100 score', { exact: true })).toBeVisible();

    // Navigate to Overview tab
    await page.getByRole('tab', { name: 'Overview' }).click();

    // Overview header and summary shows the updated readiness score (100/100)
    await expect(page.getByRole('heading', { name: 'Readiness Checklist' })).toBeVisible();
    await expect(page.getByText('7/7 PASSED', { exact: true })).toBeVisible();
    await expect(page.getByText('100/100', { exact: true })).toBeVisible();
    await expect(page.getByText('Objective defined')).toBeVisible();
    await expect(page.getByText('Stack recorded')).toBeVisible();
    await expect(page.getByText('Active decisions')).toBeVisible();
    await expect(page.getByText('Context attached')).toBeVisible();
    await expect(page.getByText('Pending tasks')).toBeVisible();
    await expect(page.getByText('Bugs or limitations noted')).toBeVisible();
    await expect(page.getByText('Next action defined')).toBeVisible();

    // Navigate to Dashboard and verify card shows updated readiness (100%)
    await page.getByRole('link', { name: /Back to all projects/i }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Readiness Live Test')).toBeVisible();
    await expect(page.getByTitle('Readiness: 100%')).toBeVisible();
  });

  test('7. Markdown preview shows entered content and updates live; Copy button copies to clipboard with toast', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Markdown Live Preview App');

    // Set goal
    await page.getByRole('textbox', { name: 'Project goal' }).fill('Verify markdown preview and copy functionality');

    // Expand all sections to fill stack, decision, task per requirement 6
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Fill stack item
    await page.getByRole('button', { name: /Add stack item/i }).first().click();
    const stack1 = page.getByRole('group', { name: 'Stack item 1' });
    await stack1.getByRole('textbox', { name: 'Name' }).fill('React 19 Framework');

    // Fill decision
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    const dec1 = page.getByRole('group', { name: 'Decision 1' });
    await dec1.getByRole('textbox', { name: 'Decision' }).fill('Use IndexedDB for local-first persistence');
    await dec1.getByRole('textbox', { name: 'Reason' }).fill('Guarantees zero outbound data leakage');

    // Fill task
    await page.getByRole('button', { name: /Add task/i }).first().click();
    const task1 = page.getByRole('group', { name: 'Task 1' });
    await task1.getByRole('textbox', { name: 'Description' }).fill('Implement offline export packaging');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // On mobile viewport, ensure preview is expanded
    const isMobile = test.info().project.name === 'mobile-360';
    if (isMobile) {
      const togglePreviewBtn = page.getByRole('button', { name: 'Toggle markdown preview' });
      await expect(togglePreviewBtn).toBeVisible();
      await expect(togglePreviewBtn).toHaveAttribute('aria-expanded', 'true');
    }

    // Verify markdown preview is a keyboard-focusable scrollable region with role="region" and aria-label="Markdown preview"
    const previewRegion = page.getByRole('region', { name: 'Markdown preview' });
    await expect(previewRegion).toBeVisible();

    // Assert full text in preview region contains entered text (not just visible clipped part)
    const previewFullText = await previewRegion.textContent();
    expect(previewFullText).not.toBeNull();
    expect(previewFullText).toContain('React 19 Framework');
    expect(previewFullText).toContain('Use IndexedDB for local-first persistence');
    expect(previewFullText).toContain('Guarantees zero outbound data leakage');
    expect(previewFullText).toContain('Implement offline export packaging');
    expect(previewFullText).toContain('Verify markdown preview and copy functionality');

    // Assert that the token label equals ~estimateTokens(full text) (estimate)
    const expectedTokens = Math.ceil((previewFullText?.length || 0) / 4);
    const tokenRegex = new RegExp(`~${expectedTokens.toLocaleString()}\\s+tokens\\s+\\(estimate\\)`);
    await expect(page.getByText(tokenRegex)).toBeVisible();

    // Click Copy button
    await page.getByRole('button', { name: 'Copy markdown' }).click();

    // Success toast appears
    await expect(page.getByText(/Markdown copied to clipboard/i)).toBeVisible();

    // Check clipboard content directly (no catch)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('# Markdown Live Preview App');
    expect(clipboardText).toContain('React 19 Framework');
    expect(clipboardText).toContain('Verify markdown preview and copy functionality');

    // One axe scan on the editor with the region present
    await expectNoSeriousA11y(page);
  });

  test('8. Edit and immediately click another tab, then come back; nothing is lost', async ({ page }) => {
    collectConsoleErrors(page);
    const { projectId } = await createAndOpenPassport(page, 'Immediate Switch Project');

    // Edit project summary and IMMEDIATELY click Overview tab without waiting for debounce
    const summaryInput = page.getByRole('textbox', { name: 'Executive summary' });
    await summaryInput.fill('Instant save on tab switch verification');

    // Click Overview immediately
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/overview`));

    // Click Passport tab to return
    await page.getByRole('tab', { name: 'Passport' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/passport`));

    // Value must be fully intact
    await expect(page.getByRole('textbox', { name: 'Executive summary' })).toHaveValue('Instant save on tab switch verification');
  });

  test('9. Superseded decision renders dimmed but remains listed', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Superseded Decisions Test');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Add decision
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    const dec1 = page.getByRole('group', { name: 'Decision 1' });
    await dec1.getByRole('textbox', { name: 'Decision' }).fill('Deprecated REST API v1');
    await dec1.getByRole('textbox', { name: 'Reason' }).fill('Migrated to local storage engine');

    // Change status to superseded
    const statusSelect = dec1.getByRole('combobox', { name: 'Decision status' });
    await statusSelect.selectOption('superseded');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Verify superseded card has dimmed opacity and "Superseded" badge
    await expect(dec1).toHaveClass(/opacity-60/);
    await expect(dec1.locator('span').filter({ hasText: /^Superseded$/ })).toBeVisible();
    await expect(dec1.getByRole('textbox', { name: 'Decision' })).toHaveValue('Deprecated REST API v1');
  });

  test('10a. Dark theme: layout/touch-target audit and axe scan on editor with all sections expanded; no overflow at 360px', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'A11y Dark Project');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Run touch-target and layout audit
    await auditPageLayoutAndTouchTargets(page, 'passport-editor-expanded-dark');

    // Run Axe scan in dark theme
    await expectNoSeriousA11y(page);
  });

  test('10b. Light theme: layout/touch-target audit and axe scan on editor with all sections expanded; no overflow at 360px', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'A11y Light Project');

    // Switch to light theme
    const themeBtn = page.getByRole('button', { name: 'Switch to light theme' });
    await themeBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Run touch-target and layout audit in light theme
    await auditPageLayoutAndTouchTargets(page, 'passport-editor-expanded-light');

    // Run Axe scan in light theme
    await expectNoSeriousA11y(page);
  });

  test('11. Screenshots: editor populated on desktop and mobile-360', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Project Passport Platform');

    // Populate realistic data across sections using group and label locators
    await page.getByRole('textbox', { name: 'Project goal' }).fill('Build a resilient local-first developer handoff platform');
    await page.getByRole('textbox', { name: 'Executive summary' }).fill('Project Passport preserves full architectural intent across AI context switches.');
    await page.getByRole('combobox', { name: 'Project status' }).selectOption('in_progress');

    // Expand all
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Stack
    await page.getByRole('button', { name: /Add stack item/i }).first().click();
    const stack1 = page.getByRole('group', { name: 'Stack item 1' });
    await stack1.getByRole('textbox', { name: 'Name' }).fill('Vite + React');
    await stack1.getByRole('textbox', { name: 'Role' }).fill('Frontend framework');
    await stack1.getByRole('textbox', { name: 'Version' }).fill('5.4.0');
    await stack1.getByRole('textbox', { name: 'Notes' }).fill('Strict mode enabled');

    // Requirement
    await page.getByRole('button', { name: /Add requirement/i }).first().click();
    const req1 = page.getByRole('group', { name: 'Requirement 1' });
    await req1.getByRole('textbox', { name: 'Description' }).fill('Zero outbound telemetry; fully offline functional');

    // Decision
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    const dec1 = page.getByRole('group', { name: 'Decision 1' });
    await dec1.getByRole('textbox', { name: 'Decision' }).fill('PostgreSQL for order data');
    await dec1.getByRole('textbox', { name: 'Reason' }).fill('Provides strict ACID guarantees for transaction data');

    // Task
    await page.getByRole('button', { name: /Add task/i }).first().click();
    const task1 = page.getByRole('group', { name: 'Task 1' });
    await task1.getByRole('textbox', { name: 'Description' }).fill('Finalize Slice 4b passport editor verification');

    // Bug toggle
    await page.getByLabel('I reviewed bugs and there are none').check();

    // Next action
    await page.getByRole('textbox', { name: 'Immediate next action' }).fill('Complete Slice 4b report and commit');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // On mobile, verify markdown preview is expanded so screenshot captures everything
    const isDesktop = test.info().project.name === 'desktop';
    if (!isDesktop) {
      const togglePreviewBtn = page.getByRole('button', { name: 'Toggle markdown preview' });
      await expect(togglePreviewBtn).toHaveAttribute('aria-expanded', 'true');
    }

    // Capture viewport-only top screenshot with review copy via shotViewportTop
    await shotViewportTop(page, 'passport-editor', {
      reviewName: isDesktop ? 'desktop-passport-editor-viewport-top.png' : 'mobile-360-passport-editor-viewport-top.png',
    });

    // Capture full-page screenshot with review copy via shot()
    await shot(page, 'passport-editor-populated', {
      fullPage: true,
      reviewName: isDesktop ? 'desktop-passport-editor-populated.png' : 'mobile-360-passport-editor-populated.png',
    });

    // On mobile, if height > 6000px, capture part1 and part2; otherwise remove stale part files
    if (!isDesktop) {
      const fullHeight = await page.evaluate(() => document.body.scrollHeight);
      if (fullHeight > 6000) {
        const halfHeight = Math.ceil(fullHeight / 2);
        await shot(page, 'passport-editor-populated-part1', {
          clip: { x: 0, y: 0, width: 360, height: halfHeight },
          reviewName: 'mobile-360-passport-editor-populated-part1.png',
        });
        await shot(page, 'passport-editor-populated-part2', {
          clip: { x: 0, y: halfHeight, width: 360, height: fullHeight - halfHeight },
          reviewName: 'mobile-360-passport-editor-populated-part2.png',
        });
      } else {
        await fs.promises.rm(path.join('e2e-results', 'review', 'mobile-360-passport-editor-populated-part1.png'), {
          force: true,
        });
        await fs.promises.rm(path.join('e2e-results', 'review', 'mobile-360-passport-editor-populated-part2.png'), {
          force: true,
        });
      }
    }
  });

  test('12. Auto-growing textareas: 140-char decision and reason expand visibly without scrollbar or horizontal overflow', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'AutoGrow Test Project');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Add decision
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    const decisionGroup = page.getByRole('group', { name: 'Decision 1' });
    await expect(decisionGroup).toBeVisible();

    const decisionTextarea = decisionGroup.getByRole('textbox', { name: 'Decision' });
    const reasonTextarea = decisionGroup.getByRole('textbox', { name: 'Reason' });

    // Exactly 140 characters each
    const text140Decision =
      'Adopt PostgreSQL with JSONB columns for flexible, resilient, ACID-compliant persistence across all microservices and local execution runtime';
    const text140Reason =
      'Provides structured transactional integrity while retaining schema evolution flexibility needed when orchestrating state transitions locally';
    expect(text140Decision.length).toBe(140);
    expect(text140Reason.length).toBe(140);

    await decisionTextarea.fill(text140Decision);
    await reasonTextarea.fill(text140Reason);

    // Verify textarea expanded such that full text is visible without scrollbar (scrollHeight <= clientHeight + 1)
    // and no horizontal overflow (scrollWidth <= clientWidth)
    const decisionMetrics = await decisionTextarea.evaluate((el: HTMLTextAreaElement) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(decisionMetrics.scrollHeight).toBeLessThanOrEqual(decisionMetrics.clientHeight + 1);
    expect(decisionMetrics.scrollWidth).toBeLessThanOrEqual(decisionMetrics.clientWidth);

    const reasonMetrics = await reasonTextarea.evaluate((el: HTMLTextAreaElement) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(reasonMetrics.scrollHeight).toBeLessThanOrEqual(reasonMetrics.clientHeight + 1);
    expect(reasonMetrics.scrollWidth).toBeLessThanOrEqual(reasonMetrics.clientWidth);

    // Layout audit still passes
    await auditPageLayoutAndTouchTargets(page, 'passport-editor-140char-textareas');
  });

  test('13. Autosave status is sticky and stays visible in viewport while scrolled to bottom, transitioning Saving to Saved', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Sticky Autosave Project');

    // Expand all sections so the page is long
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Scroll to the very bottom of the long editor
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Locate the visible Autosave status indicator and assert in viewport
    const autosaveStatus = page.getByRole('status', { name: 'Autosave status' });
    await expect(autosaveStatus).toBeInViewport();

    // Sticky offsets verification (Ticket T2 Item 3)
    const header = page.locator('header');
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    const isMobile = test.info().project.name === 'mobile-360';

    if (isMobile) {
      // Confirm header width equals viewport width at 360px
      expect(headerBox!.width).toBe(360);

      // On mobile-360 with page scrolled, autosave bar top === header bottom (±1px)
      const bar = page.locator('div.sticky').filter({ has: autosaveStatus });
      const barBox = await bar.boundingBox();
      expect(barBox).not.toBeNull();
      const headerBottom = headerBox!.y + headerBox!.height;
      expect(Math.abs(barBox!.y - headerBottom)).toBeLessThanOrEqual(1);
    } else {
      // On desktop the panel header top >= header bottom
      const panelHeader = page.locator('div.sticky').filter({ has: autosaveStatus });
      const panelHeaderBox = await panelHeader.boundingBox();
      expect(panelHeaderBox).not.toBeNull();
      const headerBottom = headerBox!.y + headerBox!.height;
      expect(panelHeaderBox!.y).toBeGreaterThanOrEqual(headerBottom);
    }

    // Install MutationObserver on autosave status BEFORE editing (Ticket T2 Item 5)
    await autosaveStatus.evaluate((el) => {
      (window as unknown as { __autosaveLog: string[] }).__autosaveLog = [el.textContent?.trim() || ''];
      const observer = new MutationObserver(() => {
        (window as unknown as { __autosaveLog: string[] }).__autosaveLog.push(el.textContent?.trim() || '');
      });
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    });

    // Edit a field near the bottom: fill() already scrolls into view
    const nextActionField = page.getByRole('textbox', { name: 'Immediate next action' });
    await nextActionField.fill('Verify sticky autosave status while scrolled to bottom');

    // Assert status stays in viewport throughout and settles on Saved
    await expect(autosaveStatus).toBeInViewport();
    await expect(autosaveStatus).toContainText('Saved');
    await expect(autosaveStatus).toBeInViewport();

    // Verify recorded MutationObserver sequence contains "Saving" followed later by "Saved"
    const log: string[] = await page.evaluate(
      () => (window as unknown as { __autosaveLog?: string[] }).__autosaveLog || []
    );
    const savingIndex = log.findIndex((text: string) => text.includes('Saving'));
    let savedIndex = -1;
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i];
      if (entry && entry.includes('Saved')) {
        savedIndex = i;
        break;
      }
    }
    expect(savingIndex).toBeGreaterThanOrEqual(0);
    expect(savedIndex).toBeGreaterThan(savingIndex);
  });

  test('16. External-change conflict protection: two pages in one browser context, conflict detection, reload latest, keep my version, and axe scan', async ({
    page,
    context,
  }) => {
    collectConsoleErrors(page);
    const { projectId } = await createAndOpenPassport(page, 'Concurrent Collaboration Project');

    // Open Page B in the same browser context pointing to the same project editor
    const pageB = await context.newPage();
    collectConsoleErrors(pageB);
    await pageB.goto(`/project/${projectId}/passport`);
    await expect(pageB.getByRole('heading', { level: 1, name: 'Concurrent Collaboration Project' })).toBeVisible();
    await expect(pageB.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Page A makes an edit and saves
    const goalA = page.getByRole('textbox', { name: 'Project goal' });
    await goalA.fill('Goal set by Page A');
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Page B (which loaded before Page A saved) now makes an edit
    const goalB = pageB.getByRole('textbox', { name: 'Project goal' });
    await goalB.fill('Goal attempted by Page B');

    // Page B's autosave triggers conflict because stored goal has changed from baseline
    const autosaveStatusB = pageB.getByRole('status', { name: 'Autosave status' });
    await expect(autosaveStatusB).toContainText('This passport was changed somewhere else');
    const reloadBtn = pageB.getByRole('button', { name: 'Reload latest' });
    const keepBtn = pageB.getByRole('button', { name: 'Keep my version' });
    await expect(reloadBtn).toBeVisible();
    await expect(keepBtn).toBeVisible();

    // Verify Page B did not overwrite Page A's value in storage
    const storedGoal = await page.evaluate(async (pId: string) => {
      const req = indexedDB.open('ProjectPassportDB');
      return new Promise<string>((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('passports', 'readonly');
          const getReq = tx.objectStore('passports').get(pId);
          getReq.onsuccess = () => resolve(getReq.result?.passport?.project?.goal || '');
        };
      });
    }, projectId!);
    expect(storedGoal).toBe('Goal set by Page A');

    // Axe scan of the conflict state in Page B (desktop + mobile-360)
    await expectNoSeriousA11y(pageB);

    // Scenario 1: Click "Reload latest" in Page B -> shows A's value
    await reloadBtn.click();
    await expect(autosaveStatusB).toContainText('Saved');
    await expect(goalB).toHaveValue('Goal set by Page A');

    // Scenario 2: "Keep my version"
    // In Page A, edit goal again and wait for Saved
    await goalA.fill('New Goal from Page A');
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // In Page B, edit goal to Page B's intended version
    await goalB.fill('Decisive Goal from Page B');

    // Page B detects conflict again
    await expect(autosaveStatusB).toContainText('This passport was changed somewhere else');

    // Click "Keep my version" -> rebases baseline on stored, then saves
    await keepBtn.click();
    await expect(autosaveStatusB).toContainText('Saved');
    await expect(goalB).toHaveValue('Decisive Goal from Page B');

    // Reload Page B and verify Page B's value persisted
    await pageB.reload();
    await expect(pageB.getByRole('textbox', { name: 'Project goal' })).toHaveValue('Decisive Goal from Page B');

    // Close Page B
    await pageB.close();
  });
});
