import { test, expect } from '@playwright/test';
import {
  expectNoSeriousA11y,
  collectConsoleErrors,
  getBackgroundAlpha,
  collectExternalRequests,
} from './helpers';

test.describe('E2E Helpers Selftest', () => {
  test('expectNoSeriousA11y rejects on inaccessible page and mentions image-alt and color-contrast', async ({
    page,
  }) => {
    // Bad page: missing image alt and low contrast (#777 on #888)
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Accessibility Violations Test</title></head>
        <body style="background-color: #888888;">
          <main>
            <h1 style="color: #777777;">Low Contrast Heading</h1>
            <p style="color: #777777;">Low contrast body text</p>
            <img src="x.png">
          </main>
        </body>
      </html>
    `);

    let caughtError: Error | null = null;
    try {
      await expectNoSeriousA11y(page);
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toContain('image-alt');
    expect(caughtError?.message).toContain('color-contrast');
  });

  test('expectNoSeriousA11y passes on a clean accessible page', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Clean Accessible Page</title></head>
        <body style="background-color: #ffffff; color: #000000;">
          <main>
            <h1>Clean Accessible Heading</h1>
            <p>This is clean text with plenty of contrast and proper HTML landmarks.</p>
          </main>
        </body>
      </html>
    `);

    await expectNoSeriousA11y(page);
  });

  test('collectConsoleErrors captures console.error and uncaught page errors', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Console Error Test</title></head>
        <body><main><h1>Console Test</h1></main></body>
      </html>
    `);

    const pageErrorPromise = page.waitForEvent('pageerror');

    await page.evaluate(() => {
      console.error('Deliberate test console error message');
      window.queueMicrotask(() => {
        throw new Error('Deliberate uncaught error');
      });
    });

    await pageErrorPromise;

    expect(consoleErrors.some((e) => e.includes('Deliberate test console error message'))).toBe(true);
    expect(consoleErrors.some((e) => e.includes('Deliberate uncaught error'))).toBe(true);
  });

  test('getBackgroundAlpha normalizer correctly detects transparency and fails assertion for rgba(0,0,0,.5)', async ({
    page,
  }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="target" style="background-color: rgba(0, 0, 0, 0.5); width: 50px; height: 50px;"></div>
        </body>
      </html>
    `);

    const alpha = await getBackgroundAlpha(page.locator('#target'));
    expect(alpha).toBeCloseTo(0.5, 2);

    let threw = false;
    try {
      expect(alpha).toBe(1);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('getBackgroundAlpha normalizer detects transparency and fails assertion for color-mix(in srgb,#000 50%,transparent)', async ({
    page,
  }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="target" style="background-color: color-mix(in srgb, #000 50%, transparent); width: 50px; height: 50px;"></div>
        </body>
      </html>
    `);

    const alpha = await getBackgroundAlpha(page.locator('#target'));
    expect(alpha).toBeCloseTo(0.5, 2);

    let threw = false;
    try {
      expect(alpha).toBe(1);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('backdrop-filter check fails assertion when element has backdrop-filter: blur(4px)', async ({
    page,
  }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="target" style="backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); width: 50px; height: 50px;"></div>
        </body>
      </html>
    `);

    const backdropFilter = await page.locator('#target').evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return (
        computed.backdropFilter ||
        (computed as unknown as Record<string, string>)['webkitBackdropFilter'] ||
        'none'
      );
    });

    expect(backdropFilter).not.toBe('none');

    let threw = false;
    try {
      expect(backdropFilter).toBe('none');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('getBackgroundAlpha passes alpha === 1, opacity === "1", and backdrop-filter === "none" for an opaque colour', async ({
    page,
  }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="target" style="background-color: #161b22; opacity: 1; backdrop-filter: none; -webkit-backdrop-filter: none; width: 50px; height: 50px;"></div>
        </body>
      </html>
    `);

    const target = page.locator('#target');
    const alpha = await getBackgroundAlpha(target);
    const { opacity, backdropFilter } = await target.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        opacity: computed.opacity,
        backdropFilter:
          computed.backdropFilter ||
          (computed as unknown as Record<string, string>)['webkitBackdropFilter'] ||
          'none',
      };
    });

    expect(alpha).toBe(1);
    expect(opacity).toBe('1');
    expect(backdropFilter).toBe('none');
  });

  test('getBackgroundAlpha fails closed and throws "Unparseable colour: not-a-colour" for invalid colour input', async ({
    page,
  }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="target" data-color="not-a-colour" style="width: 50px; height: 50px;"></div>
        </body>
      </html>
    `);

    const target = page.locator('#target');
    await expect(getBackgroundAlpha(target)).rejects.toThrow('Unparseable colour: not-a-colour');
    await expect(getBackgroundAlpha(target, 'not-a-colour')).rejects.toThrow('Unparseable colour: not-a-colour');
  });

  test('collectExternalRequests detects an outbound external network request', async ({
    page,
  }) => {
    const getExternalRequests = collectExternalRequests(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body><h1>External Request Selftest</h1></body>
      </html>
    `);

    // Route external test request to abort immediately without network latency
    await page.route('https://example.com/api/test', (route) => route.abort());

    // Trigger an external request and await it
    await page.evaluate(async () => {
      try {
        await fetch('https://example.com/api/test');
      } catch {
        // aborted request error expected
      }
    });

    const requests = getExternalRequests();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.some((r) => r.url() === 'https://example.com/api/test')).toBe(true);
  });
});

