import { test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Saves a screenshot to e2e-results/screenshots/<project>-<name>.png
 */
export async function shot(page: Page, name: string): Promise<string> {
  let projectName = 'desktop';
  try {
    const info = test.info();
    if (info?.project?.name) {
      projectName = info.project.name;
    }
  } catch {
    // Called outside an active test context
  }

  const filePath = `e2e-results/screenshots/${projectName}-${name}.png`;
  await page.screenshot({ path: filePath });
  return filePath;
}

/**
 * Runs an Axe accessibility scan and fails if there are any serious or critical violations,
 * formatting rule IDs and element selectors in the error message.
 */
export async function expectNoSeriousA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );

  if (seriousOrCritical.length > 0) {
    const formatted = seriousOrCritical
      .map((v) => {
        const selectorList = v.nodes
          .map((n) => (Array.isArray(n.target) ? n.target.join(' ') : String(n.target)))
          .join(', ');
        return `- [${v.impact?.toUpperCase()}] ${v.id}: ${v.help}\n  Selectors: ${selectorList}\n  URL: ${v.helpUrl}`;
      })
      .join('\n');

    throw new Error(
      `Accessibility scan failed with ${seriousOrCritical.length} serious/critical violation(s):\n${formatted}`
    );
  }
}

/**
 * Subscribes to console errors and uncaught pageerror events, capturing them into an array.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`[console.error] ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message || String(err)}`);
  });

  return errors;
}
