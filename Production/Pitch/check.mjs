import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const url = pathToFileURL(process.argv[2]).href;
const browser = await chromium.launch();
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
