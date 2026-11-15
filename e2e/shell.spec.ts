import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  shot,
  expectNoSeriousA11y,
  collectConsoleErrors,
  auditPageLayoutAndTouchTargets,
  seedProjects,
  getBackgroundAlpha,
} from './helpers';

test.describe('App Shell, Accessibility & Visuals', () => {
  test('8. Storage blocked: displays full-screen friendly screen without crashing', async ({
    page,
  }) => {
    // Inject failure into indexedDB.open before scripts run
    await page.addInitScript(() => {
      window.indexedDB.open = () => {
        throw new DOMException('Storage access denied by user settings', 'SecurityError');
      };
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Storage is blocked' })).toBeVisible();
    await expect(page.getByText('Project Passport runs entirely on your device')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry storage check' })).toBeVisible();

    // Axe scan of storage-blocked screen in dark theme
    await expectNoSeriousA11y(page);

    // Axe scan of storage-blocked screen in light theme
    await page.locator('html').evaluate((el) => el.setAttribute('data-theme', 'light'));
    await expectNoSeriousA11y(page);
    await page.locator('html').evaluate((el) => el.removeAttribute('data-theme'));

    // Capture screenshot of blocked screen
    await shot(page, 'storage-blocked');
  });

  test('9. Theme toggle switches dark/light, persists after reload with only theme key in localStorage', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');

    // Initially dark theme
    const isDarkInitially = await page.evaluate(() => {
      return !document.documentElement.hasAttribute('data-theme') ||
        document.documentElement.getAttribute('data-theme') === 'dark';
    });
    expect(isDarkInitially).toBe(true);

    // Click theme toggle
    const themeBtn = page.getByRole('button', { name: /Switch to light theme/i });
    await themeBtn.click();

    // Verify data-theme="light" set on html
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Verify ONLY theme stored in localStorage
    const localKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(localKeys).toEqual(['theme']);
    const storedVal = await page.evaluate(() => localStorage.getItem('theme'));
    expect(storedVal).toBe('light');

    // Screenshot light theme
    await shot(page, 'light-theme');

    // Reload and assert light theme persists
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Toggle back to dark
    const darkBtn = page.getByRole('button', { name: /Switch to dark theme/i });
    await darkBtn.click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');

    expect(errors).toEqual([]);
  });

  test('10. Keyboard only: Tab to "New project", Enter opens dialog, focus trapped, Escape closes, focus returns', async ({
    page,
  }) => {
    await page.goto('/');

    // Wait for the button to be rendered before keyboard navigation
    const targetButton = page.getByRole('button', { name: 'New project' }).first();
    await expect(targetButton).toBeVisible();

    // Press Tab until "New project" button is focused
    let focusedText = '';
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
      if (focusedText.includes('New project')) {
        break;
      }
    }
    expect(focusedText).toContain('New project');

    // Press Enter to open dialog
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'New project' });
    await expect(dialog).toBeVisible();

    // Verify focus is trapped inside dialog
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const isInside = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        return d ? d.contains(document.activeElement) : false;
      });
      expect(isInside).toBe(true);
    }

    // Press Escape to close dialog
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Verify focus returned to trigger
    const returnedFocusText = await page.evaluate(
      () => document.activeElement?.textContent?.trim() || ''
    );
    expect(returnedFocusText).toContain('New project');
  });

  test('11. Touch target & layout overflow audit across empty state, 3 projects, overview, and all dialogs', async ({
    page,
  }) => {
    // 1. Empty dashboard audit
    await page.goto('/');
    await page.evaluate(async () => {
      const dbs = (await window.indexedDB.databases?.()) || [];
      for (const d of dbs) {
        if (d.name) window.indexedDB.deleteDatabase(d.name);
      }
      localStorage.clear();
    });
    await page.reload();
    await expect(page.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeVisible();
    await auditPageLayoutAndTouchTargets(page, 'empty-dashboard');

    // 2. Open New project dialog audit
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await expect(createDialog).toBeVisible();
    await auditPageLayoutAndTouchTargets(page, 'new-project-dialog');

    // 3. Create 3 projects
    await createDialog.getByLabel('Project name').fill('Project Alpha: Autonomous Agent');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    await createDialog.getByLabel('Project name').fill('Project Beta: Code Review Harness');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    await createDialog.getByLabel('Project name').fill('Project Gamma: Local LLM Engine');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    // 4. Project Overview audit (including tab strip)
    await expect(page.getByRole('heading', { level: 1, name: 'Project Gamma: Local LLM Engine' })).toBeVisible();
    await auditPageLayoutAndTouchTargets(page, 'project-overview-tabstrip');

    // 5. Dashboard with 3 projects audit
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Project Alpha/ })).toBeVisible();
    await auditPageLayoutAndTouchTargets(page, 'dashboard-3-projects');

    // 6. Open Rename dialog audit
    await page.getByRole('button', { name: 'Rename Project Alpha: Autonomous Agent' }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename project' });
    await expect(renameDialog).toBeVisible();
    await auditPageLayoutAndTouchTargets(page, 'rename-dialog');
    await renameDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(renameDialog).not.toBeVisible();

    // 7. Open Delete dialog audit
    await page.getByRole('button', { name: 'Delete Project Alpha: Autonomous Agent' }).click();
    const deleteDialog = page.getByRole('dialog', { name: 'Delete project' });
    await expect(deleteDialog).toBeVisible();
    await auditPageLayoutAndTouchTargets(page, 'delete-dialog');
    await deleteDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(deleteDialog).not.toBeVisible();

    // 8. Open Backup & restore dialog audit
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    const backupDialog = page.getByRole('dialog', { name: 'Backup & restore' });
    await expect(backupDialog).toBeVisible();
    await auditPageLayoutAndTouchTargets(page, 'backup-dialog');
    await backupDialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(backupDialog).not.toBeVisible();
  });

  test('12a. Dark theme axe scan: Dashboard with 3 projects', async ({ page }) => {
    await seedProjects(page, 3);
    await expect(page.getByRole('link', { name: /Project Alpha/ })).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('12b. Dark theme axe scan: New project dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await expect(createDialog).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('12c. Dark theme axe scan: Rename project dialog', async ({ page }) => {
    await seedProjects(page, 1);
    await page.getByRole('button', { name: /Rename Project Alpha/i }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename project' });
    await expect(renameDialog).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('12d. Dark theme axe scan: Delete project dialog', async ({ page }) => {
    await seedProjects(page, 1);
    await page.getByRole('button', { name: /Delete Project Alpha/i }).click();
    const deleteDialog = page.getByRole('dialog', { name: 'Delete project' });
    await expect(deleteDialog).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('12e. Dark theme axe scan: Backup & restore dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    const backupDialog = page.getByRole('dialog', { name: 'Backup & restore' });
    await expect(backupDialog).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('12f. Dark theme axe scan: Project overview', async ({ page }) => {
    await seedProjects(page, 1);
    await page.getByRole('link', { name: /Project Alpha/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Project Alpha/i })).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('12g. Dark theme axe scan: Placeholder tab', async ({ page }) => {
    await seedProjects(page, 1);
    await page.getByRole('link', { name: /Project Alpha/i }).click();
    await page.getByRole('tab', { name: 'Files' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Files' })).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('13a. Light theme axe scan: Dashboard with 3 projects', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await seedProjects(page, 3);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Project Alpha/ })).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('13b. Light theme axe scan: New project dialog', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.reload();
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await expect(createDialog).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('13c. Light theme axe scan: Rename project dialog', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await seedProjects(page, 1);
    await page.getByRole('button', { name: /Rename Project Alpha/i }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename project' });
    await expect(renameDialog).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('13d. Light theme axe scan: Delete project dialog', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await seedProjects(page, 1);
    await page.getByRole('button', { name: /Delete Project Alpha/i }).click();
    const deleteDialog = page.getByRole('dialog', { name: 'Delete project' });
    await expect(deleteDialog).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('13e. Light theme axe scan: Backup & restore dialog', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.reload();
    await page.getByRole('button', { name: 'Backup and restore' }).click();
    const backupDialog = page.getByRole('dialog', { name: 'Backup & restore' });
    await expect(backupDialog).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('13f. Light theme axe scan: Project overview', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await seedProjects(page, 1);
    await page.getByRole('link', { name: /Project Alpha/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Project Alpha/i })).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('13g. Light theme axe scan: Placeholder tab', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await seedProjects(page, 1);
    await page.getByRole('link', { name: /Project Alpha/i }).click();
    await page.getByRole('tab', { name: 'Files' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Files' })).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('14. Full screenshot suite for visual review', async ({ page }) => {
    const isMobile = test.info().project.name === 'mobile-360';

    // 1. Empty dashboard screenshot
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeVisible();
    await shot(page, 'empty-dashboard', { fullPage: true });

    // 2. Open New project dialog screenshot
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await expect(createDialog).toBeVisible();
    await shot(page, 'open-dialog');
    await createDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(createDialog).not.toBeVisible();

    // 3. Seed 3 projects
    await seedProjects(page, 3);

    // 4. Dashboard with 3 projects screenshot
    await expect(page.getByRole('link', { name: /Project Alpha/ })).toBeVisible();
    await shot(page, 'dashboard-3-projects', {
      fullPage: true,
      reviewName: isMobile ? 'mobile-360-dashboard-3-projects.png' : undefined,
    });

    // 5. Light theme dashboard screenshot
    await page.locator('html').evaluate((el) => el.setAttribute('data-theme', 'light'));
    await shot(page, 'light-theme', { fullPage: true });
    await page.locator('html').evaluate((el) => el.removeAttribute('data-theme'));

    // 6. Project overview screenshot
    await page.getByRole('link', { name: 'Project Gamma: Local LLM Engine' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Project Gamma: Local LLM Engine' })).toBeVisible();
    await shot(page, 'project-overview', { fullPage: true });
  });

  test('15. Header background opacity is 1 and backdrop-filter is none in both themes, ON DEVICE badge single line without header overflow at 360px', async ({
    page,
  }) => {
    collectConsoleErrors(page);
    await page.goto('/');

    const isMobile = test.info().project.name === 'mobile-360';
    const header = page.locator('header');
    await expect(header).toBeVisible();

    const assertHeaderOpaqueAndContained = async () => {
      const alpha = await getBackgroundAlpha(header);
      expect(alpha).toBe(1);

      const { opacity, backdropFilter, scrollWidth, clientWidth, headerHVar } = await header.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        const rootComputed = window.getComputedStyle(document.documentElement);
        const bf =
          computed.backdropFilter ||
          (computed as unknown as Record<string, string>)['webkitBackdropFilter'] ||
          'none';
        return {
          opacity: computed.opacity,
          backdropFilter: bf,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          headerHVar: rootComputed.getPropertyValue('--app-header-h').trim(),
        };
      });

      expect(opacity).toBe('1');
      expect(backdropFilter).toBe('none');
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      expect(headerHVar).toBe('64px');
    };

    // 1. Dark theme check on both projects
    await assertHeaderOpaqueAndContained();

    // 2. Light theme check on both projects (no if condition around assertions)
    const themeBtn = page.getByRole('button', { name: 'Switch to light theme' });
    await themeBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await assertHeaderOpaqueAndContained();

    // Restore dark theme
    const darkBtn = page.getByRole('button', { name: 'Switch to dark theme' });
    await darkBtn.click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');

    // 3. Mobile-360 project specific assertions (branching on test.info().project.name)
    if (isMobile) {
      const onDeviceBadge = page.getByLabel('Stored only on this device');
      await expect(onDeviceBadge).toBeVisible();

      const badgeBox = await onDeviceBadge.boundingBox();
      expect(badgeBox).not.toBeNull();
      // Single line height <= 32px
      expect(badgeBox!.height).toBeLessThanOrEqual(32);

      // Header width equals viewport width (360px) and no horizontal overflow
      const headerBox = await header.boundingBox();
      expect(headerBox).not.toBeNull();
      expect(headerBox!.width).toBe(360);

      const headerOverflow = await header.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(headerOverflow).toBe(false);

      // Screenshot review image using shot() with { locator: header, reviewName: ... }
      const imgPath = await shot(page, 'header-badge', {
        locator: header,
        reviewName: 'mobile-360-header-badge.png',
      });

      // Assert the screenshot is the header only: width 360, height equals measured header height
      const imgBuf = await fs.promises.readFile(imgPath);
      const imgWidth = imgBuf.readUInt32BE(16);
      const imgHeight = imgBuf.readUInt32BE(20);
      expect(imgWidth).toBe(360);
      expect(imgHeight).toBe(Math.round(headerBox!.height));

      const reviewBuf = await fs.promises.readFile('e2e-results/review/mobile-360-header-badge.png');
      expect(reviewBuf.readUInt32BE(16)).toBe(360);
      expect(reviewBuf.readUInt32BE(20)).toBe(Math.round(headerBox!.height));
    }
  });
});
