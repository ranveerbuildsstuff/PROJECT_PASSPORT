import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('public');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Brass: #C9A227, Dark Background: #0E1116, Dark Surface: #161B22
// Crisp passport book mark with line styling: clean rectangle outline, spine line, stamp badge box, and horizontal rules
function getSvg(size, isMaskable = false) {
  const padding = isMaskable ? size * 0.15 : size * 0.08;
  const innerSize = size - padding * 2;
  const stroke = Math.max(2, Math.round(size / 32));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#0E1116"/>
    <g transform="translate(${padding}, ${padding})">
      <!-- Passport booklet outline -->
      <rect x="${innerSize * 0.1}" y="${innerSize * 0.05}" width="${innerSize * 0.8}" height="${innerSize * 0.9}" rx="${innerSize * 0.08}" fill="#161B22" stroke="#C9A227" stroke-width="${stroke}"/>
      <!-- Spine crease -->
      <line x1="${innerSize * 0.22}" y1="${innerSize * 0.05}" x2="${innerSize * 0.22}" y2="${innerSize * 0.95}" stroke="#C9A227" stroke-width="${stroke * 0.8}" stroke-dasharray="${stroke * 2}, ${stroke}"/>
      <!-- Emblemed passport stamp box -->
      <rect x="${innerSize * 0.38}" y="${innerSize * 0.28}" width="${innerSize * 0.38}" height="${innerSize * 0.28}" rx="${innerSize * 0.04}" fill="none" stroke="#C9A227" stroke-width="${stroke * 0.8}"/>
      <!-- Stamp internal cross / star mark -->
      <path d="M ${innerSize * 0.57} ${innerSize * 0.34} L ${innerSize * 0.57} ${innerSize * 0.50} M ${innerSize * 0.47} ${innerSize * 0.42} L ${innerSize * 0.67} ${innerSize * 0.42}" stroke="#C9A227" stroke-width="${stroke * 0.8}"/>
      <!-- Text lines below stamp -->
      <line x1="${innerSize * 0.38}" y1="${innerSize * 0.66}" x2="${innerSize * 0.76}" y2="${innerSize * 0.66}" stroke="#C9A227" stroke-width="${stroke * 0.7}" stroke-linecap="round"/>
      <line x1="${innerSize * 0.38}" y1="${innerSize * 0.76}" x2="${innerSize * 0.64}" y2="${innerSize * 0.76}" stroke="#C9A227" stroke-width="${stroke * 0.7}" stroke-linecap="round"/>
    </g>
  </svg>`;
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const targets = [
    { name: 'pwa-192x192.png', size: 192, maskable: false },
    { name: 'pwa-512x512.png', size: 512, maskable: false },
    { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
    { name: 'apple-touch-icon.png', size: 180, maskable: false },
    { name: 'favicon-32x32.png', size: 32, maskable: false },
  ];

  for (const t of targets) {
    const svg = getSvg(t.size, t.maskable);
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(
      `<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:#0E1116;">${svg}</body></html>`
    );
    const filePath = path.join(outDir, t.name);
    await page.screenshot({ path: filePath, omitBackground: false });
    console.log(`Generated ${t.name}`);
  }

  // Also generate favicon.svg
  fs.writeFileSync(path.join(outDir, 'favicon.svg'), getSvg(64, false));
  console.log('Generated favicon.svg');

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
