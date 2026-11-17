import { test, expect } from '@playwright/test';

test.describe('Cross-Browser Smoke Pass (Firefox & WebKit)', () => {
  test('Smoke flow: load, create project, edit passport, attach file with finding, checkpoint, copy Lite prompt, export and re-import package', async ({
    page,
  }) => {
    // 1. App loads
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Project Passport' })).toBeVisible();

    // 2. Create a project
    await page.getByRole('button', { name: /New project/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel('Project name').fill('Smoke Cross Browser');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(createDialog).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Smoke Cross Browser' })).toBeVisible();

    // 3. Edit the passport
    await page.getByRole('tab', { name: 'Passport' }).click();
    const goalInput = page.getByLabel('Project goal');
    await goalInput.fill('Cross-browser compatibility verification project.');
    await goalInput.blur();
    await page.waitForTimeout(600);

    // 4. Attach a file with a finding
    await page.getByRole('tab', { name: 'Files' }).click();
    await page.getByRole('button', { name: 'Add files' }).first().click();
    const filesDialog = page.getByRole('dialog', { name: 'Add project files' });
    await expect(filesDialog).toBeVisible();

    const syntheticSecret = ['AIza', 'SyD1234567890abcdefghijklmnopqrstuv'].join('');
    const fileInput = filesDialog.locator('input[aria-label="Choose files"]');
    await fileInput.setInputFiles([
      {
        name: 'smoke-secret.ts',
        mimeType: 'text/plain',
        buffer: Buffer.from(`export const apiKey = "${syntheticSecret}";`),
      },
    ]);

    await expect(filesDialog.getByText(/We found 1 possible secrets/i)).toBeVisible();
    // Redact finding
    await filesDialog.getByRole('button', { name: 'Redact' }).click();
    const attachBtn = filesDialog.getByRole('button', { name: 'Attach files' });
    await expect(attachBtn).toBeEnabled();
    await attachBtn.click();
    await expect(filesDialog).not.toBeVisible();
    await expect(page.getByText('smoke-secret.ts')).toBeVisible();

    // 5. Create a checkpoint
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();
    const cpDialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await expect(cpDialog).toBeVisible();
    await cpDialog.getByLabel('Checkpoint note').fill('Smoke checkpoint test');
    await cpDialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(cpDialog).not.toBeVisible();
    await expect(page.getByText('1 checkpoint recorded')).toBeVisible();

    // 6. Copy a Lite prompt
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByRole('button', { name: /Lite prompt/i }).click();
    await page.getByRole('button', { name: 'Copy prompt', exact: true }).click();
    await expect(page.getByText(/Copied to clipboard/i)).toBeVisible();

    // 7. Download and re-import a package
    await page.getByRole('button', { name: /Full package/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download package', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('smoke-cross-browser-passport.zip');
    const downloadPath = await download.path();

    // Re-import package on Dashboard
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'Projects' })).toBeVisible();
    await page.getByRole('button', { name: 'Import package' }).first().click();
    const importDialog = page.getByRole('dialog', { name: 'Import package' });
    await expect(importDialog).toBeVisible();

    const importChooserPromise = page.waitForEvent('filechooser');
    await importDialog.getByRole('button', { name: 'Choose .zip package' }).click();
    const importChooser = await importChooserPromise;
    await importChooser.setFiles(downloadPath!);

    // Re-import dialog shows collision options
    await expect(
      importDialog.getByRole('button', { name: 'Import as a copy (Recommended)' })
    ).toBeVisible();
    await importDialog.getByRole('button', { name: 'Import as a copy (Recommended)' }).click();
    await expect(importDialog).not.toBeVisible();
    await expect(page.getByText(/Imported 1 project/i)).toBeVisible();
  });
});
