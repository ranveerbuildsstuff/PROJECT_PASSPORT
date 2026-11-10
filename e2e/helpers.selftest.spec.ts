import { test, expect } from '@playwright/test';
import { expectNoSeriousA11y, collectConsoleErrors } from './helpers';

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

  test('collectConsoleErrors captures console.error and uncaught error from setTimeout', async ({
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

    await page.evaluate(() => {
      console.error('Deliberate test console error message');
      setTimeout(() => {
        throw new Error('Deliberate setTimeout uncaught error');
      }, 20);
    });

    // Wait for the setTimeout callback and pageerror event to be handled
    await page.waitForTimeout(100);

    expect(consoleErrors.some((e) => e.includes('Deliberate test console error message'))).toBe(true);
    expect(consoleErrors.some((e) => e.includes('Deliberate setTimeout uncaught error'))).toBe(true);
  });
});
