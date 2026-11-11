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
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Archival Preservation Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Archival Preservation Project' })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('link', { name: /Archival Preservation Project/ })).toBeVisible();

    // 2. Open Backup dialog from header
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    const backupDialog = page.getByRole('dialog', { name: 'Backup & restore' });
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
    const deleteDialog = page.getByRole('dialog', { name: 'Delete project' });
    await deleteDialog.getByRole('button', { name: 'Delete project' }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeVisible();

    // 5. Test invalid file import error (corrupted JSON, wrong structure, unknown backupVersion)
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    await expect(backupDialog).toBeVisible();

    const fileInput = backupDialog.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/corrupted-backup.json');

    await expect(backupDialog.getByRole('alert')).toBeVisible();
    await expect(backupDialog.getByText(/The selected file is not valid JSON/)).toBeVisible();

    // Invalid structure fixture
    await fileInput.setInputFiles('tests/fixtures/invalid-structure-backup.json');
    await expect(backupDialog.getByRole('alert')).toBeVisible();
    await expect(backupDialog.getByText(/The backup file format is not recognized/)).toBeVisible();

    // Unknown backupVersion fixture
    await fileInput.setInputFiles('tests/fixtures/unknown-version-backup.json');
    await expect(backupDialog.getByRole('alert')).toBeVisible();
    await expect(backupDialog.getByText(/Unsupported backup version: 99/)).toBeVisible();

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
    await backupDialog.getByRole('button', { name: 'Confirm and restore' }).click();
    await expect(backupDialog).not.toBeVisible();

    // Assert toast shows count of restored projects
    await expect(page.getByText('Restored 1 project')).toBeVisible();

    // 7. Verify the project is restored on the dashboard
    await expect(page.getByRole('link', { name: /Archival Preservation Project/ })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('8. Same-ID replace: create, export, rename, import exported file reverts project name and maintains exactly one project', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');

    // 1. Create a project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Original Project Name');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Original Project Name' })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Original Project Name' })).toBeVisible();

    // 2. Export backup
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    const backupDialog = page.getByRole('dialog', { name: 'Backup & restore' });
    await expect(backupDialog).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      backupDialog.getByRole('button', { name: 'Export backup file' }).click(),
    ]);

    await backupDialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(backupDialog).not.toBeVisible();

    // 3. Rename the project on dashboard
    await page.getByRole('button', { name: 'Rename Original Project Name' }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename project' });
    await renameDialog.getByLabel('New project name').fill('Renamed Project Name');
    await renameDialog.getByRole('button', { name: 'Save name' }).click();
    await expect(renameDialog).not.toBeVisible();

    await expect(page.getByRole('link', { name: 'Renamed Project Name' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Original Project Name' })).not.toBeVisible();

    // 4. Import the exported backup file (which has the original name and same project ID)
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    await expect(backupDialog).toBeVisible();

    const fileInput = backupDialog.locator('input[type="file"]');
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    await fileInput.setInputFiles(downloadedPath!);

    // Confirm replacement dialog appears
    await expect(backupDialog.getByText('Confirm Project Replacement')).toBeVisible();
    await backupDialog.getByRole('button', { name: 'Confirm and restore' }).click();
    await expect(backupDialog).not.toBeVisible();

    // Assert success toast shows restored count
    await expect(page.getByText('Restored 1 project')).toBeVisible();

    // 5. Verify the project name reverted to "Original Project Name"
    await expect(page.getByRole('link', { name: 'Original Project Name' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Renamed Project Name' })).not.toBeVisible();

    // Verify there is still exactly one project on dashboard
    await expect(page.getByText('1 local project')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
