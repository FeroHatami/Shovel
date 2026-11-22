// Layout audit + screenshots of every slide. Uses the Playwright copy in ../Pitch.  node check.mjs shovel.html
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(new URL('../Pitch/', import.meta.url).pathname);
const { chromium } = require('playwright');
const url = pathToFileURL(resolve(process.argv[2])).href;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
let total = 0;
for (const [w, h] of [[1920, 1080], [1280, 720], [1440, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url);
  await page.waitForTimeout(800);
  const issues = await page.evaluate(() => window.runAudit());
  total += issues.length;
  console.log(`${w}x${h}:`, issues.length ? JSON.stringify(issues, null, 2) : 'clean');
  const n = await page.evaluate(() => document.querySelectorAll('.slide').length);
  for (let i = 0; i < n; i++) {
    await page.evaluate(k => window.go(k), i);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `shots/${w}-${String(i + 1).padStart(2, '0')}.png` });
  }
  await page.close();
}
await browser.close();
process.exit(total ? 1 : 0);
