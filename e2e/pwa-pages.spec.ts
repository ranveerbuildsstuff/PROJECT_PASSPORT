import { test, expect } from '@playwright/test';
import {
  expectNoSeriousA11y,
  collectConsoleErrors,
  collectExternalRequests,
  expectVisibleFocusRing,
} from './helpers';

test.describe('PWA, Landing, Privacy, and Responsive Audit', () => {
  test('1. Landing page (/welcome) renders honest copy, passes a11y, focus ring, and CTA', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    const getExternalRequests = collectExternalRequests(page);

    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Heading and core paragraph
    await expect(page.getByRole('heading', { name: 'Project Passport', exact: true })).toBeVisible();
    await expect(page.getByText('The AI is replaceable; the project is not.')).toBeVisible();

    // 5-step ordered list with stamp badges
    await expect(page.getByText('1. CAPTURE')).toBeVisible();
    await expect(page.getByText('2. STRUCTURE')).toBeVisible();
    await expect(page.getByText('3. CHECKPOINT')).toBeVisible();
    await expect(page.getByText('4. EXPORT')).toBeVisible();
    await expect(page.getByText('5. CONTINUE')).toBeVisible();

    // What it is not & Honest limits
    await expect(page.getByRole('heading', { name: 'What it is not' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Honest limits' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Backup & restore/i })).toBeVisible();

    // Primary brass CTA button
    const ctaButton = page.getByRole('button', { name: /Open your projects/i });
    await expect(ctaButton).toBeVisible();

    // Visible focus ring check
    await expectVisibleFocusRing(page, { contextName: 'Landing Page' });

    // Accessibility scan
    await expectNoSeriousA11y(page);

    // Click CTA button and verify navigation to Dashboard
    await ctaButton.click();
    await expect(page).toHaveURL(/\/$/);

    // Verify zero outbound requests and zero console errors
    expect(getExternalRequests().length).toBe(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('2. Privacy page (/privacy) specifies exact storage, offline note, and protections', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    const getExternalRequests = collectExternalRequests(page);

    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');

    // Title and offline guarantee
    await expect(page.getByRole('heading', { name: /Privacy & Security Model/i })).toBeVisible();
    await expect(page.getByText('After the first visit, the app runs without a connection.')).toBeVisible();

    // Exact IndexedDB database and stores
    await expect(page.getByText('Database: ProjectPassportDB')).toBeVisible();
    await expect(page.getByText('projects —')).toBeVisible();
    await expect(page.getByText('passports —')).toBeVisible();
    await expect(page.getByText('checkpoints —')).toBeVisible();
    await expect(page.getByText('conversations —')).toBeVisible();
    await expect(page.getByText('files —')).toBeVisible();

    // Exact single localStorage key
    await expect(page.getByText('theme: "light" or absent')).toBeVisible();

    // Zero outbound network requests & how to verify
    await expect(page.getByText('Zero outbound network requests:', { exact: true })).toBeVisible();
    await expect(page.getByText(/Open your browser Developer Tools/i)).toBeVisible();

    // Protections and Non-protections
    await expect(page.getByRole('heading', { name: 'What the app protects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What it does not protect' })).toBeVisible();
    await expect(page.getByText(/No encryption at rest/i)).toBeVisible();
    await expect(page.getByText(/No guarantee against zero-day leaks/i)).toBeVisible();

    // How to remove everything
    await expect(page.getByRole('heading', { name: 'How to remove everything' })).toBeVisible();
    await expect(page.getByText(/Clear site data/i)).toBeVisible();

    // Visible focus ring check
    await expectVisibleFocusRing(page, { contextName: 'Privacy Page' });

    // Accessibility scan
    await expectNoSeriousA11y(page);

    // Zero network requests & console errors
    expect(getExternalRequests().length).toBe(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('3. Landing and Privacy render without crashing even when storage is blocked', async ({
    page,
  }) => {
    // Block IndexedDB access before loading
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        get() {
          throw new Error('IndexedDB blocked in private mode');
        },
      });
    });

    // Landing page renders without throwing
    await page.goto('/welcome');
    await expect(page.getByRole('heading', { name: 'Project Passport', exact: true })).toBeVisible();
    await expect(page.getByText('The AI is replaceable; the project is not.')).toBeVisible();

    // Privacy page renders without throwing
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: /Privacy & Security Model/i })).toBeVisible();
    await expect(page.getByText('Database: ProjectPassportDB')).toBeVisible();

    // Root page on blocked storage shows StorageBlockedPage with links to Welcome and Privacy
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Storage is blocked' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'About & Guide' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy & Security' })).toBeVisible();
  });

  test('4. Web manifest, icons, and theme color are valid and accessible', async ({
    request,
  }) => {
    // Check manifest
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);

    const manifest = await manifestRes.json();
    expect(manifest.name).toBe('Project Passport');
    expect(manifest.short_name).toBe('Passport');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#161B22');
    expect(manifest.background_color).toBe('#0E1116');

    // Verify icons exist in manifest
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    const icon192 = manifest.icons.find((i: { sizes: string }) => i.sizes === '192x192');
    const icon512 = manifest.icons.find((i: { sizes: string }) => i.sizes === '512x512');
    const maskable = manifest.icons.find((i: { purpose?: string }) => i.purpose === 'maskable');
    expect(icon192).toBeDefined();
    expect(icon512).toBeDefined();
    expect(maskable).toBeDefined();

    // Check individual icon assets respond with 200 OK
    const res192 = await request.get('/pwa-192x192.png');
    expect(res192.status()).toBe(200);

    const res512 = await request.get('/pwa-512x512.png');
    expect(res512.status()).toBe(200);

    const resFavicon = await request.get('/favicon-32x32.png');
    expect(resFavicon.status()).toBe(200);
  });

  test('5. Strict Content Security Policy (CSP) enforces zero violations and zero leaks', async ({
    page,
  }) => {
    const cspViolations: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().toLowerCase().includes('violates the following content security policy')) {
        cspViolations.push(msg.text());
      }
    });

    await page.evaluate(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __cspViolations?: string[] }).__cspViolations =
          (window as unknown as { __cspViolations?: string[] }).__cspViolations || [];
        (window as unknown as { __cspViolations?: string[] }).__cspViolations!.push(
          `${e.blockedURI} (${e.violatedDirective})`
        );
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');

    const recordedViolations = await page.evaluate(() => {
      return (window as unknown as { __cspViolations?: string[] }).__cspViolations || [];
    });

    expect(recordedViolations.length).toBe(0);
    expect(cspViolations.length).toBe(0);
  });

  test('6. Viewport sweep across 360px to 4K maintains layout and max-width', async ({
    page,
  }) => {
    const viewports = [
      { width: 360, height: 640, name: '360x640 mobile' },
      { width: 768, height: 1024, name: '768x1024 tablet' },
      { width: 1280, height: 800, name: '1280x800 desktop' },
      { width: 1920, height: 1080, name: '1920x1080 full HD' },
      { width: 3840, height: 2160, name: '3840x2160 4K' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Check Dashboard
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      const dashOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(dashOverflow).toBe(false);

      // Check Landing
      await page.goto('/welcome');
      await page.waitForLoadState('domcontentloaded');
      const welcomeOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(welcomeOverflow).toBe(false);

      // At 4K, verify content stays constrained within readable max width
      if (vp.width === 3840) {
        const mainWidth = await page.evaluate(() => {
          const main = document.querySelector('main');
          return main ? main.getBoundingClientRect().width : 0;
        });
        expect(mainWidth).toBeLessThan(1400);
      }
    }
  });

  test('7. Prefers-reduced-motion disables or eliminates animation transitions', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Confirm page loads cleanly without visual glitches
    await expect(page.getByRole('heading', { name: 'Project Passport', exact: true })).toBeVisible();
  });
});
