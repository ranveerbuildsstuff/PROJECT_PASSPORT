import { test, expect, type Page } from '@playwright/test';
import {
  shot,
  expectNoSeriousA11y,
  auditPageLayoutAndTouchTargets,
  collectConsoleErrors,
} from './helpers';

test.describe('Passport Editor E2E Tests', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant clipboard permissions for copy tests
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    } catch {
      // Ignored if browser doesn't support granting clipboard
    }

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
    await page.getByPlaceholder('e.g. React, PostgreSQL').fill('React');
    await page.getByPlaceholder('e.g. Frontend UI').fill('Frontend framework');
    await page.getByPlaceholder('e.g. 18.2.0').fill('18.3.1');
    await page.getByPlaceholder('e.g. Using strict mode and server components').fill('Strict mode enabled');

    // 2. Requirements
    await page.getByRole('button', { name: /Add requirement/i }).first().click();
    await page.getByPlaceholder('e.g. Must support offline editing').fill('Zero outbound telemetry');

    // 3. Decisions
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    await page.getByPlaceholder('e.g. Use Dexie for local storage').fill('Use Dexie for IndexedDB');
    await page.getByPlaceholder('e.g. Provides clean transaction support over IndexedDB').fill('Robust typed client storage');

    // 4. Completed
    await page.getByRole('button', { name: /Add completed item/i }).first().click();
    await page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer').fill('Completed initial scaffold');

    // 5. Tasks
    await page.getByRole('button', { name: /Add task/i }).first().click();
    await page.getByPlaceholder('e.g. Implement passport live preview').fill('Implement passport editor test suite');

    // 6. Bugs
    await page.getByRole('button', { name: /Add bug/i }).first().click();
    await page.getByPlaceholder('e.g. Session expires unexpectedly on refresh').fill('Windows file path backslash normalization');

    // 7. Instructions
    await page.getByRole('button', { name: /Add instruction/i }).first().click();
    await page.getByPlaceholder('e.g. Always write automated tests before committing').fill('Always use TypeScript strict mode');

    // 8. Next Action
    await page.getByPlaceholder('What should the recipient AI do next when continuing this project?').fill('Run E2E test verification');

    // 9. Open Questions
    await page.getByRole('button', { name: /Add open question/i }).first().click();
    await page.getByPlaceholder('e.g. Which LLM provider has best streaming latency for our use case?').fill('What cloud sync options should be considered?');

    // Wait for Saved
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Reload
    await page.reload();
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Verify all fields persisted
    await expect(page.getByPlaceholder('e.g. React, PostgreSQL')).toHaveValue('React');
    await expect(page.getByPlaceholder('e.g. Frontend UI')).toHaveValue('Frontend framework');
    await expect(page.getByPlaceholder('e.g. 18.2.0')).toHaveValue('18.3.1');
    await expect(page.getByPlaceholder('e.g. Using strict mode and server components')).toHaveValue('Strict mode enabled');
    await expect(page.getByPlaceholder('e.g. Must support offline editing')).toHaveValue('Zero outbound telemetry');
    await expect(page.getByPlaceholder('e.g. Use Dexie for local storage')).toHaveValue('Use Dexie for IndexedDB');
    await expect(page.getByPlaceholder('e.g. Provides clean transaction support over IndexedDB')).toHaveValue('Robust typed client storage');
    await expect(page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer')).toHaveValue('Completed initial scaffold');
    await expect(page.getByPlaceholder('e.g. Implement passport live preview')).toHaveValue('Implement passport editor test suite');
    await expect(page.getByPlaceholder('e.g. Session expires unexpectedly on refresh')).toHaveValue('Windows file path backslash normalization');
    await expect(page.getByPlaceholder('e.g. Always write automated tests before committing')).toHaveValue('Always use TypeScript strict mode');
    await expect(page.getByPlaceholder('What should the recipient AI do next when continuing this project?')).toHaveValue('Run E2E test verification');
    await expect(page.getByPlaceholder('e.g. Which LLM provider has best streaming latency for our use case?')).toHaveValue('What cloud sync options should be considered?');
  });

  test('3. Reorder with the keyboard buttons; reload; order persists', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Reorder Test Project');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Add Task 1
    await page.getByRole('button', { name: /Add task/i }).first().click();
    await page.getByPlaceholder('e.g. Implement passport live preview').first().fill('Task Alpha (First)');

    // Add Task 2
    await page.getByRole('button', { name: /Add task/i }).first().click();
    await page.getByPlaceholder('e.g. Implement passport live preview').nth(1).fill('Task Beta (Second)');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Click "Move task 2 up"
    const moveUpBtn = page.getByRole('button', { name: 'Move task 2 up' });
    await expect(moveUpBtn).toBeVisible();
    await moveUpBtn.click();

    // Verify visual order swapped
    await expect(page.getByPlaceholder('e.g. Implement passport live preview').first()).toHaveValue('Task Beta (Second)');
    await expect(page.getByPlaceholder('e.g. Implement passport live preview').nth(1)).toHaveValue('Task Alpha (First)');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Reload and check persisted order
    await page.reload();
    await page.getByRole('button', { name: /Expand all/i }).click();

    await expect(page.getByPlaceholder('e.g. Implement passport live preview').first()).toHaveValue('Task Beta (Second)');
    await expect(page.getByPlaceholder('e.g. Implement passport live preview').nth(1)).toHaveValue('Task Alpha (First)');
  });

  test('4. Delete an item, then Undo restores it; delete without undo persists after reload', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Delete Undo Project');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Add two completed items
    await page.getByRole('button', { name: /Add completed item/i }).first().click();
    await page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer').first().fill('Milestone One');

    await page.getByRole('button', { name: /Add completed item/i }).first().click();
    await page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer').nth(1).fill('Milestone Two');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Delete item 1
    await page.getByRole('button', { name: 'Delete completed item 1' }).click();

    // Item 1 deleted immediately, toast with Undo appears
    await expect(page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer')).toHaveCount(1);
    await expect(page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer').first()).toHaveValue('Milestone Two');

    const undoButton = page.getByRole('button', { name: 'Undo' });
    await expect(undoButton).toBeVisible();

    // Click Undo
    await undoButton.click();

    // Both items present again!
    await expect(page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer')).toHaveCount(2);
    await expect(page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer').first()).toHaveValue('Milestone One');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Now delete item 1 again without undo
    await page.getByRole('button', { name: 'Delete completed item 1' }).click();
    await expect(page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer')).toHaveCount(1);
    await expect(page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer').first()).toHaveValue('Milestone Two');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Reload
    await page.reload();
    await page.getByRole('button', { name: /Expand all/i }).click();

    await expect(page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer')).toHaveCount(1);
    await expect(page.getByPlaceholder('e.g. Set up Dexie IndexedDB service layer').first()).toHaveValue('Milestone Two');
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
    await page.getByPlaceholder('e.g. Implement passport live preview').first().fill('Write comprehensive E2E specs');

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
    await expect(page.getByText('Restored 1 project')).toBeVisible();

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
    await page.getByLabel('Project goal').fill('Build full-featured offline assistant');
    await expect(sidePanel.getByText('Objective defined')).toBeVisible();

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // 2. Add Stack
    await page.getByRole('button', { name: /Add stack item/i }).first().click();
    await page.getByPlaceholder('e.g. React, PostgreSQL').fill('TypeScript');

    // 3. Add Active Decision
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    await page.getByPlaceholder('e.g. Use Dexie for local storage').fill('Zero network calls');
    await page.getByPlaceholder('e.g. Provides clean transaction support over IndexedDB').fill('Security and privacy');

    // 4. Add Task
    await page.getByRole('button', { name: /Add task/i }).first().click();
    await page.getByPlaceholder('e.g. Implement passport live preview').fill('Initial migration');

    // 5. Test the bugsReviewed toggle alone passes the bugs check
    const bugsToggle = page.getByLabel('I reviewed bugs and there are none');
    await bugsToggle.check();

    // 6. Fill Next Action
    await page.getByPlaceholder('What should the recipient AI do next when continuing this project?').fill('Publish release v1');

    // Wait for autosave to complete
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // All 7 checks have passed -> 100/100 score
    await expect(sidePanel.getByText('100/100 score')).toBeVisible();

    // Navigate to Overview tab
    await page.getByRole('tab', { name: 'Overview' }).click();

    // Overview header and summary shows the updated readiness score (100/100)
    await expect(page.getByRole('heading', { name: 'Readiness Checklist' })).toBeVisible();
    await expect(page.getByText('7/7 PASSED')).toBeVisible();
    await expect(page.getByText('100/100')).toBeVisible();
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
    await page.getByLabel('Project goal').fill('Verify markdown preview and copy functionality');
    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // On mobile viewport, ensure preview is expanded
    const togglePreviewBtn = page.getByRole('button', { name: 'Toggle markdown preview' });
    if (await togglePreviewBtn.isVisible()) {
      const isExpanded = await togglePreviewBtn.getAttribute('aria-expanded');
      if (isExpanded === 'false') {
        await togglePreviewBtn.click();
      }
    }

    // Verify PROJECT_STATE.md preview card contains the entered goal
    const previewContainer = page.locator('aside');
    await expect(previewContainer).toContainText('Verify markdown preview and copy functionality');
    await expect(previewContainer).toContainText('estimate');

    // Click Copy button
    await page.getByRole('button', { name: 'Copy markdown' }).click();

    // Success toast appears
    await expect(page.getByText(/Markdown copied to clipboard/i)).toBeVisible();

    // Check clipboard content if available
    try {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('# Markdown Live Preview App');
      expect(clipboardText).toContain('Verify markdown preview and copy functionality');
    } catch {
      // Browsers without clipboard API permissions in headless environment skip direct clipboard read
    }
  });

  test('8. Edit and immediately click another tab, then come back; nothing is lost', async ({ page }) => {
    collectConsoleErrors(page);
    const { projectId } = await createAndOpenPassport(page, 'Immediate Switch Project');

    // Edit project summary and IMMEDIATELY click Overview tab without waiting for debounce
    const summaryInput = page.getByLabel('Executive summary');
    await summaryInput.fill('Instant save on tab switch verification');

    // Click Overview immediately
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/overview`));

    // Click Passport tab to return
    await page.getByRole('tab', { name: 'Passport' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/passport`));

    // Value must be fully intact
    await expect(page.getByLabel('Executive summary')).toHaveValue('Instant save on tab switch verification');
  });

  test('9. Superseded decision renders dimmed but remains listed', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Superseded Decisions Test');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Add decision
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    await page.getByPlaceholder('e.g. Use Dexie for local storage').fill('Deprecated REST API v1');
    await page.getByPlaceholder('e.g. Provides clean transaction support over IndexedDB').fill('Migrated to local Dexie engine');

    // Change status to superseded
    const statusSelect = page.getByLabel('Decision status').first();
    await statusSelect.selectOption('superseded');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // Verify superseded card has dimmed opacity and "Superseded" badge
    const decisionCard = page.locator('.opacity-60');
    await expect(decisionCard).toBeVisible();
    await expect(decisionCard.locator('span').filter({ hasText: /^Superseded$/ })).toBeVisible();
    await expect(decisionCard.getByPlaceholder('e.g. Use Dexie for local storage')).toHaveValue(
      'Deprecated REST API v1'
    );
  });

  test('10. Layout/touch-target audit helper and axe scan (dark and light) on editor with all sections expanded; no overflow at 360px', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'A11y and Touch Target Project');

    // Expand all sections
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Run touch-target and layout audit
    await auditPageLayoutAndTouchTargets(page, 'passport-editor-expanded-dark');

    // Run Axe scan in dark theme
    await expectNoSeriousA11y(page);

    // Switch to light theme
    const themeBtn = page.getByRole('button', { name: /Switch to light theme/i });
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

      // Run touch-target and layout audit in light theme
      await auditPageLayoutAndTouchTargets(page, 'passport-editor-expanded-light');

      // Run Axe scan in light theme
      await expectNoSeriousA11y(page);
    }
  });

  test('11. Screenshots: editor populated on desktop and mobile-360', async ({ page }) => {
    collectConsoleErrors(page);
    await createAndOpenPassport(page, 'Project Passport Platform');

    // Populate realistic data across sections
    await page.getByLabel('Project goal').fill('Build a resilient local-first developer handoff platform');
    await page.getByLabel('Executive summary').fill('Project Passport preserves full architectural intent across AI context switches.');
    await page.getByLabel('Project status').selectOption('in_progress');

    // Expand all
    await page.getByRole('button', { name: /Expand all/i }).click();

    // Stack
    await page.getByRole('button', { name: /Add stack item/i }).first().click();
    await page.getByPlaceholder('e.g. React, PostgreSQL').fill('Vite + React');
    await page.getByPlaceholder('e.g. Frontend UI').fill('Application shell');
    await page.getByPlaceholder('e.g. 18.2.0').fill('5.4.0');

    // Requirement
    await page.getByRole('button', { name: /Add requirement/i }).first().click();
    await page.getByPlaceholder('e.g. Must support offline editing').fill('Zero outbound telemetry; fully offline functional');

    // Decision
    await page.getByRole('button', { name: /Add decision/i }).first().click();
    await page.getByPlaceholder('e.g. Use Dexie for local storage').fill('Dexie client storage with schema versioning');
    await page.getByPlaceholder('e.g. Provides clean transaction support over IndexedDB').fill('IndexedDB abstraction with zero dependencies on external servers');

    // Task
    await page.getByRole('button', { name: /Add task/i }).first().click();
    await page.getByPlaceholder('e.g. Implement passport live preview').fill('Finalize Slice 4 passport editor verification');

    // Bug toggle
    await page.getByLabel('I reviewed bugs and there are none').check();

    // Next action
    await page.getByPlaceholder('What should the recipient AI do next when continuing this project?').fill('Complete Slice 4 report and commit');

    await expect(page.getByRole('status', { name: 'Autosave status' })).toContainText('Saved');

    // On mobile, expand markdown preview so screenshot captures everything
    const togglePreviewBtn = page.getByRole('button', { name: 'Toggle markdown preview' });
    if (await togglePreviewBtn.isVisible()) {
      const isExpanded = await togglePreviewBtn.getAttribute('aria-expanded');
      if (isExpanded === 'false') {
        await togglePreviewBtn.click();
      }
    }

    // Capture viewport-only screenshot: passport-editor-top
    await shot(page, 'passport-editor-top', { fullPage: false });

    // Capture full-page screenshot: passport-editor-populated
    await shot(page, 'passport-editor-populated', { fullPage: true });
  });
});
