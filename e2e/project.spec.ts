import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers';

test.describe('Project Page E2E Flows', () => {
  test.beforeEach(async ({ page }) => {
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

  test('5. Open project: Overview shows readiness checklist; other tabs show placeholder; direct URL loading & reloading works', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');

    // Create a project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Full Stack Agent Platform');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await expect(page).toHaveURL(/\/project\/([a-f0-9-]+)\/overview/);

    // Extract project ID from URL
    const url = page.url();
    const match = url.match(/\/project\/([a-f0-9-]+)\/overview/);
    expect(match).not.toBeNull();
    const projectId = match![1];

    // Assert Overview elements: header, readiness ring, checklist, quick stats, next action
    await expect(
      page.getByRole('heading', { level: 1, name: 'Full Stack Agent Platform' })
    ).toBeVisible();
    await expect(page.getByText('Readiness Checklist')).toBeVisible();
    await expect(page.getByText('Objective defined')).toBeVisible();
    await expect(page.getByText('Stack recorded')).toBeVisible();
    await expect(page.getByText('Active decisions')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Next Action' })).toBeVisible();

    // Click Passport tab
    await page.getByRole('tab', { name: 'Passport' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/passport`));
    await expect(page.getByRole('heading', { name: 'Passport Tab' })).toBeVisible();
    await expect(page.getByText('Coming in a later slice')).toBeVisible();

    // Click Conversations tab
    await page.getByRole('tab', { name: 'Conversations' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/conversations`));
    await expect(page.getByRole('heading', { name: 'Conversations Tab' })).toBeVisible();

    // Click Files tab
    await page.getByRole('tab', { name: 'Files' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/files`));
    await expect(page.getByRole('heading', { name: 'Files Tab' })).toBeVisible();

    // Click Checkpoints tab
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/checkpoints`));
    await expect(page.getByRole('heading', { name: 'Checkpoints Tab' })).toBeVisible();

    // Click Export tab
    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/export`));
    await expect(page.getByRole('heading', { name: 'Export Tab' })).toBeVisible();

    // Direct loading of a tab URL
    await page.goto(`/project/${projectId}/passport`);
    await expect(page.getByRole('heading', { name: 'Passport Tab' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Passport' })).toHaveAttribute('aria-selected', 'true');

    // Reload directly and verify it still displays cleanly
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Passport Tab' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Passport' })).toHaveAttribute('aria-selected', 'true');

    expect(errors).toEqual([]);
  });

  test('6. Unknown project id shows friendly "project not found" state', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/project/non-existent-uuid-99999/overview');

    await expect(page.getByRole('heading', { name: 'Project not found' })).toBeVisible();
    await expect(
      page.getByText(/Project "non-existent-uuid-99999" was not found\. It may have been deleted\. Go back to your projects and try again\./)
    ).toBeVisible();

    const returnBtn = page.getByRole('button', { name: 'Return to projects' });
    await expect(returnBtn).toBeVisible();

    await returnBtn.click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 2, name: 'Projects' })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
