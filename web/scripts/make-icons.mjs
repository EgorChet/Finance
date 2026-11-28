// Renders the Ч-Банк app icons from the mark (same paths as AppLogo.vue and index.html):
//   node scripts/make-icons.mjs        (needs Playwright; writes public/favicon.svg, apple-touch-icon.png, icon-512.png)
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const GLYPH = `<g transform="translate(17 14)" stroke="#111114" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3V14Q3 19 8 19H23"/><path d="M23 3V29"/></g>`;
const svg = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect width="60" height="60" rx="${rx}" fill="#FFCF3F"/>${GLYPH}</svg>`;

writeFileSync(new URL("../public/favicon.svg", import.meta.url), svg(14));

const browser = await chromium.launch();
for (const [file, size] of [["apple-touch-icon.png", 180], ["icon-512.png", 512]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // iOS rounds the corners itself, so the PNGs are full-bleed squares.
  await page.setContent(`<body style="margin:0">${svg(0).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
