import fs from 'node:fs';
import path from 'node:path';
import { test, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Options for shot()
 */
export interface ShotOptions {
  fullPage?: boolean;
  reviewName?: string;
  clip?: { x: number; y: number; width: number; height: number };
}

/**
 * Normalizes ANY CSS color via canvas (fillStyle = computed backgroundColor;
 * fillRect 1x1; read alpha byte from getImageData), so rgba(), rgb(/), color(srgb),
 * oklab/oklch all work across browsers.
 * Returns normalized alpha between 0 and 1.
 */
export async function getBackgroundAlpha(locator: Locator): Promise<number> {
  return await locator.evaluate((el: HTMLElement) => {
    const computed = window.getComputedStyle(el);
    const bg = computed.backgroundColor;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 1;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1, 1);
    const imgData = ctx.getImageData(0, 0, 1, 1);
    return (imgData.data[3] ?? 255) / 255;
  });
}

/**
 * Saves a screenshot to e2e-results/screenshots/<project>-<name>.png.
 * When options.reviewName is set, COPIES the file into e2e-results/review/<reviewName>.
 * When { fullPage: true }, temporarily makes sticky and fixed elements static
 * (injects a style tag, then removes it) so they appear at their natural position.
 */
export async function shot(
  pageOrLocator: Page | Locator,
  name: string,
  options?: ShotOptions
): Promise<string> {
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
  const isLocator = 'page' in pageOrLocator && typeof (pageOrLocator as Locator).screenshot === 'function';
  const page = isLocator ? (pageOrLocator as Locator).page() : (pageOrLocator as Page);

  if (isLocator) {
    await (pageOrLocator as Locator).screenshot({ path: filePath });
  } else if (options?.clip) {
    await page.screenshot({ path: filePath, clip: options.clip });
  } else if (options?.fullPage) {
    const styleHandle = await page.addStyleTag({
      content: `
        header,
        [class*="sticky"],
        [class*="fixed"],
        [style*="position: sticky"],
        [style*="position: fixed"] {
          position: static !important;
        }
      `,
    });
    try {
      await page.screenshot({ path: filePath, fullPage: true });
    } finally {
      // Documented cleanup: remove temporary fullpage screenshot style tag
      await styleHandle.evaluate((el) => (el as Element).remove()).catch(() => {});
    }
  } else {
    await page.screenshot({ path: filePath, fullPage: false });
  }

  if (options?.reviewName) {
    const reviewDir = path.resolve('e2e-results/review');
    await fs.promises.mkdir(reviewDir, { recursive: true });
    const reviewPath = path.join(reviewDir, options.reviewName);
    await fs.promises.copyFile(filePath, reviewPath);
  }

  return filePath;
}

/**
 * Viewport screenshot helper that scrolls to the very top first,
 * saves to e2e-results/screenshots/<project>-<name>-viewport-top.png.
 * When options.reviewName is set, copies to e2e-results/review/<reviewName>.
 */
export async function shotViewportTop(
  page: Page,
  name: string,
  options?: ShotOptions
): Promise<string> {
  await page.evaluate(() => window.scrollTo(0, 0));
  return await shot(page, `${name}-viewport-top`, { ...options, fullPage: false });
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
