// Renders the Ч-Банк app icons from the mark (same paths as AppLogo.vue and index.html):
//   node scripts/make-icons.mjs        (needs Playwright; writes public/favicon.svg, apple-touch-icon.png, icon-512.png)
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const GLYPH = `<path transform="translate(22 23)" fill="#111114" d="M0 0H9V12.5Q9 18 15.5 18H31V0H40V36H31V27H13Q0 27 0 15Z"/>`;
const svg = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84"><rect width="84" height="84" rx="${rx}" fill="#FFCF3F"/>${GLYPH}</svg>`;

writeFileSync(new URL("../public/favicon.svg", import.meta.url), svg(20));

const browser = await chromium.launch();
for (const [file, size] of [["apple-touch-icon.png", 180], ["icon-512.png", 512]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // iOS rounds the corners itself, so the PNGs are full-bleed squares.
  await page.setContent(`<body style="margin:0">${svg(0).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
