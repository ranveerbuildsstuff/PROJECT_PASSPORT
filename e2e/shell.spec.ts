import { test, expect } from '@playwright/test';
import { shot, expectNoSeriousA11y, collectConsoleErrors } from './helpers';

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

    const dialog = page.getByRole('dialog', { name: 'New Project' });
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

  test('11. mobile-360 viewport checks: no horizontal scroll and minimum 44x44px touch targets', async ({
    page,
  }) => {
    await page.goto('/');

    // Check horizontal scroll
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Check touch targets on interactive buttons & links
    const undersizedElements = await page.evaluate(() => {
      const interactive = Array.from(
        document.querySelectorAll<HTMLElement>('button, a[href]')
      );
      const violations: string[] = [];

      for (const el of interactive) {
        if (el.offsetParent === null) continue; // skip hidden
        // Skip screen-reader skip links
        if (el.classList.contains('sr-only')) continue;

        const rect = el.getBoundingClientRect();
        // Allow minor sub-pixel rendering tolerance (43.5px)
        if (rect.width < 43.5 || rect.height < 43.5) {
          violations.push(
            `${el.tagName} "${el.innerText || el.getAttribute('aria-label') || ''}" (${Math.round(rect.width)}x${Math.round(rect.height)}px)`
          );
        }
      }
      return violations;
    });

    expect(undersizedElements).toEqual([]);
  });

  test('12 & 13. Comprehensive axe scans & full screenshot suite', async ({ page }) => {
    // 1. Empty dashboard screenshot & a11y scan
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeVisible();
    await expectNoSeriousA11y(page);
    await shot(page, 'empty-dashboard');

    // 2. Open New Project Dialog screenshot & a11y scan
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New Project' });
    await expect(createDialog).toBeVisible();
    await expectNoSeriousA11y(page);
    await shot(page, 'open-dialog');

    // Create 3 projects
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

    // 3. Project overview screenshot & a11y scan
    await expect(page.getByRole('heading', { level: 1, name: 'Project Gamma: Local LLM Engine' })).toBeVisible();
    await expectNoSeriousA11y(page);
    await shot(page, 'project-overview');

    // 4. Dashboard with 3 projects screenshot & a11y scan
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Project Alpha/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Project Beta/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Project Gamma/ })).toBeVisible();
    await expectNoSeriousA11y(page);
    await shot(page, 'dashboard-3-projects');
  });
});
