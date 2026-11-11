import { test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Options for shot()
 */
export interface ShotOptions {
  fullPage?: boolean;
}

/**
 * Saves a screenshot to e2e-results/screenshots/<project>-<name>.png
 */
export async function shot(page: Page, name: string, options?: ShotOptions): Promise<string> {
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
  await page.screenshot({ path: filePath, fullPage: options?.fullPage ?? false });
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

/**
 * Seeds n projects through the UI, starting from the dashboard.
 * Navigates back to the dashboard when done if n > 0.
 * Returns the names of the created projects.
 */
export async function seedProjects(page: Page, count = 3): Promise<string[]> {
  const projectNames = [
    'Project Alpha: Autonomous Agent',
    'Project Beta: Code Review Harness',
    'Project Gamma: Local LLM Engine',
    'Project Delta: Distributed Cache',
    'Project Epsilon: Mobile Client',
  ];

  const created: string[] = [];

  for (let i = 0; i < count; i++) {
    const name = projectNames[i] || `Project ${i + 1}: Automated Task`;
    await page.goto('/');
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill(name);
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await page.getByRole('heading', { level: 1, name }).waitFor({ state: 'visible' });
    created.push(name);
  }

  await page.goto('/');
  return created;
}

/**
 * Verifies that the page has no horizontal overflow and that every visible
 * button, link, [role=tab], input and textarea satisfies the minimum 44x44px
 * touch target requirement (with 43.5px tolerance for subpixel rendering).
 */
export async function auditPageLayoutAndTouchTargets(
  page: Page,
  contextName = 'page'
): Promise<void> {
  const result = await page.evaluate(() => {
    // 1. Horizontal overflow check
    const scrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;
    const hasHorizontalOverflow = scrollWidth > innerWidth;

    // 2. Visible interactive elements touch target check:
    // button, link (a[href]), [role="tab"], input, textarea
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], [role="tab"], input, textarea'
      )
    );

    const undersized: string[] = [];

    for (const el of elements) {
      // Ignore hidden or non-rendered elements
      if (el.offsetParent === null) continue;
      if (el.classList.contains('sr-only')) continue;
      if (el.getAttribute('type') === 'file' || el.getAttribute('type') === 'hidden') continue;

      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity || '1') === 0
      ) {
        continue;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      // 43.5px tolerance for subpixel rendering
      const width = Math.round(rect.width * 10) / 10;
      const height = Math.round(rect.height * 10) / 10;
      if (rect.width < 43.5 || rect.height < 43.5) {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const effectiveTag = role ? `${tag}[role="${role}"]` : tag;
        const accessibleName =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.getAttribute('placeholder') ||
          (el as HTMLInputElement).value ||
          el.innerText?.trim().slice(0, 30) ||
          el.getAttribute('name') ||
          '';

        undersized.push(
          `<${effectiveTag}> "${accessibleName}" (${width}x${height}px)`
        );
      }
    }

    return {
      hasHorizontalOverflow,
      scrollWidth,
      innerWidth,
      undersized,
    };
  }, contextName);

  if (result.hasHorizontalOverflow) {
    throw new Error(
      `[${contextName}] Horizontal page overflow detected: scrollWidth (${result.scrollWidth}px) > innerWidth (${result.innerWidth}px)`
    );
  }

  if (result.undersized.length > 0) {
    throw new Error(
      `[${contextName}] ${result.undersized.length} interactive element(s) violate minimum 44x44px touch target (43.5px tolerance):\n` +
        result.undersized.map((u) => `  - ${u}`).join('\n')
    );
  }
}
