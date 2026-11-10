import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers';

test.describe('Backup and Restore E2E Flow', () => {
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

  test('7. Backup: export downloads dated JSON, delete project, import restores with replacement warning, invalid file shows error', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');

    // 1. Create a project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New Project' });
    await createDialog.getByLabel('Project name').fill('Archival Preservation Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await page.goto('/');
    await expect(page.getByRole('link', { name: /Archival Preservation Project/ })).toBeVisible();

    // 2. Open Backup dialog from header
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    const backupDialog = page.getByRole('dialog', { name: 'Backup & Restore' });
    await expect(backupDialog).toBeVisible();

    // 3. Export backup and capture download event
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      backupDialog.getByRole('button', { name: 'Export backup file' }).click(),
    ]);

    const downloadedName = download.suggestedFilename();
    expect(downloadedName).toMatch(/^project-passport-backup-\d{4}-\d{2}-\d{2}\.json$/);

    // Read and parse downloaded backup JSON without node Buffer
    const readStream = await download.createReadStream();
    let backupContent = '';
    if (readStream) {
      for await (const chunk of readStream) {
        backupContent += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk as Uint8Array);
      }
    }
    const parsedBackup = JSON.parse(backupContent);

    expect(parsedBackup.backupVersion).toBe(1);
    expect(Array.isArray(parsedBackup.projects)).toBe(true);
    expect(
      parsedBackup.projects.some(
        (p: { project: { name: string } }) => p.project.name === 'Archival Preservation Project'
      )
    ).toBe(true);

    // Close backup dialog
    await backupDialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(backupDialog).not.toBeVisible();

    // 4. Delete the project from local storage
    await page.getByRole('button', { name: 'Delete Archival Preservation Project' }).click();
    const deleteDialog = page.getByRole('dialog', { name: 'Delete Project' });
    await deleteDialog.getByRole('button', { name: 'Delete project' }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeVisible();

    // 5. Test invalid file import error
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    await expect(backupDialog).toBeVisible();

    const fileInput = backupDialog.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/corrupted-backup.json');

    await expect(backupDialog.getByRole('alert')).toBeVisible();
    await expect(backupDialog.getByText(/The selected file is not valid JSON/)).toBeVisible();

    // 6. Test valid import with replacement confirmation
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    await fileInput.setInputFiles(downloadedPath!);

    // Verify replacement confirmation appears and explicitly mentions replacement
    await expect(backupDialog.getByText('Confirm Project Replacement')).toBeVisible();
    await expect(
      backupDialog.getByText(/Projects in this backup sharing the same ID as existing local projects will be/)
    ).toBeVisible();
    await expect(backupDialog.getByText('REPLACED')).toBeVisible();

    // Confirm restore
    await backupDialog.getByRole('button', { name: 'Confirm and replace projects' }).click();
    await expect(backupDialog).not.toBeVisible();

    // 7. Verify the project is restored on the dashboard
    await expect(page.getByRole('link', { name: /Archival Preservation Project/ })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
