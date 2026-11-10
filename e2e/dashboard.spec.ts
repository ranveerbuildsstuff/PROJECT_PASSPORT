import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers';

test.describe('Dashboard E2E Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test for fresh context
    await page.goto('/');
    await page.evaluate(async () => {
      const dbs = await window.indexedDB.databases?.() || [];
      for (const d of dbs) {
        if (d.name) window.indexedDB.deleteDatabase(d.name);
      }
      localStorage.clear();
    });
    await page.reload();
  });

  test('1. First load: empty state with a create button; zero console errors', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Project Passport' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeVisible();
    await expect(
      page.getByText('Project Passport keeps a structured, portable record of your AI-assisted project')
    ).toBeVisible();

    const newProjectButtons = page.getByRole('button', { name: /^New project$/i });
    await expect(newProjectButtons.first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('2. Create project: name is required (validation message shown); card appears; RELOAD persists', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');

    // Click "New project"
    await page.getByRole('button', { name: /^New project$/i }).first().click();

    const dialog = page.getByRole('dialog', { name: 'New Project' });
    await expect(dialog).toBeVisible();

    // Submit with empty name
    const submitBtn = dialog.getByRole('button', { name: 'Create project' });
    await submitBtn.click();

    // Validation error shown
    const alert = dialog.getByRole('alert');
    await expect(alert).toHaveText('Project name cannot be empty');

    // Fill valid name and submit
    const nameInput = dialog.getByLabel('Project name');
    await nameInput.fill('Distributed Agent Harness');
    await submitBtn.click();

    // Automatically redirected to project overview
    await expect(page).toHaveURL(/\/project\/[a-f0-9-]+\/overview/);
    await expect(
      page.getByRole('heading', { name: 'Distributed Agent Harness' })
    ).toBeVisible();

    // Return to dashboard and verify card appears
    await page.goto('/');
    const cardLink = page.getByRole('link', { name: /Distributed Agent Harness/ });
    await expect(cardLink).toBeVisible();

    // Reload page and assert persistence
    await page.reload();
    await expect(page.getByRole('link', { name: /Distributed Agent Harness/ })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('3. Rename: rename dialog saves trimmed name and persists after reload', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');

    // Create a project first
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New Project' });
    await createDialog.getByLabel('Project name').fill('Initial Project Name');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    // Return to dashboard
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Initial Project Name/ })).toBeVisible();

    // Click rename button
    await page.getByRole('button', { name: 'Rename Initial Project Name' }).click();

    const renameDialog = page.getByRole('dialog', { name: 'Rename Project' });
    await expect(renameDialog).toBeVisible();

    const nameInput = renameDialog.getByLabel('New project name');
    await nameInput.fill('   ');
    await renameDialog.getByRole('button', { name: 'Save name' }).click();

    // Validation error
    await expect(renameDialog.getByRole('alert')).toHaveText('Project name cannot be empty');

    // Fill valid name
    await nameInput.fill('  Renamed Persistent Project  ');
    await renameDialog.getByRole('button', { name: 'Save name' }).click();

    // Assert rename dialog closed and new name is on card
    await expect(renameDialog).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Renamed Persistent Project/ })).toBeVisible();
    await expect(page.getByText('Initial Project Name')).not.toBeVisible();

    // Reload and check persistence
    await page.reload();
    await expect(page.getByRole('link', { name: /Renamed Persistent Project/ })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('4. Delete: cancel keeps it; confirm removes it; reload and it is gone', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');

    // Create a project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New Project' });
    await createDialog.getByLabel('Project name').fill('Project To Delete');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await page.goto('/');
    await expect(page.getByRole('link', { name: /Project To Delete/ })).toBeVisible();

    // Open delete dialog
    await page.getByRole('button', { name: 'Delete Project To Delete' }).click();

    const deleteDialog = page.getByRole('dialog', { name: 'Delete Project' });
    await expect(deleteDialog).toBeVisible();
    await expect(
      deleteDialog.getByText(/Are you sure you want to delete “Project To Delete”?/)
    ).toBeVisible();
    await expect(
      deleteDialog.getByText(/This action cannot be undone/)
    ).toBeVisible();

    // Cancel deletion
    await deleteDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(deleteDialog).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Project To Delete/ })).toBeVisible();

    // Reopen and confirm deletion
    await page.getByRole('button', { name: 'Delete Project To Delete' }).click();
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Delete project' }).click();

    await expect(deleteDialog).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Project To Delete/ })).not.toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeVisible();

    // Reload and confirm it remains gone
    await page.reload();
    await expect(page.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
