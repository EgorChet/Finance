// Renders the app icons from the mark (same paths as AppLogo.vue and index.html):
//   node scripts/make-icons.mjs        (needs Playwright; writes public/favicon.svg, apple-touch-icon.png, icon-512.png)
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b6cff"/><stop offset="0.55" stop-color="#a35cff"/><stop offset="1" stop-color="#e255c8"/></linearGradient></defs>`;
const GLYPH = `<g stroke="#fff" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 34V14H22a6 6 0 0 1 6 6V28"/><path d="M34 14V34H26a6 6 0 0 1-6-6V20"/></g><circle cx="39" cy="9.5" r="2.6" fill="#4fc3ff"/>`;
const svg = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${GRAD}<rect width="48" height="48" rx="${rx}" fill="url(#g)"/>${GLYPH}</svg>`;

writeFileSync(new URL("../public/favicon.svg", import.meta.url), svg(11));

const browser = await chromium.launch();
for (const [file, size] of [["apple-touch-icon.png", 180], ["icon-512.png", 512]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // iOS rounds the corners itself, so the PNGs are full-bleed squares.
  await page.setContent(`<body style="margin:0">${svg(0).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
