// Review screenshots of every screen. Needs the app on :8787 and the Playwright copy in ../Production/Pitch.
//   node scripts/uishots.mjs <outDir>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(new URL('../../Production/Pitch/', import.meta.url).pathname);
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
mkdirSync(out, { recursive: true });
const URL_ = 'http://localhost:8787';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
p.on('pageerror', (e) => errors.push(String(e)));
const wait = (ms) => p.waitForTimeout(ms);
const shot = (n, full = false) => p.screenshot({ path: `${out}/${n}.png`, fullPage: full });
const state = await (await fetch(URL_ + '/api/state?lang=en')).json();
const id = (f) => state.docs.find((d) => d.fileName === f)?.id;
const open = async (f, sub = '') => { await p.goto(`${URL_}/#/doc/${id(f)}${sub}`); await p.waitForSelector(sub ? '.pkg-main' : '.rail'); await wait(500); };
const lang = async (l) => { await p.evaluate((l) => [...document.querySelectorAll('.lang button')].find((x) => x.textContent === l)?.click(), l); await wait(900); };

await p.goto(URL_ + '/#/'); await p.waitForSelector('.trow'); await lang('EN'); await shot('01-home');
await p.mouse.wheel(0, 620); await wait(300); await shot('02-home-list');
await open('8209.003_Leistungsverzeichnis_leer.X83'); await shot('10-review');
await p.click('[data-next]'); await wait(900); await shot('11-review-focus');
await p.click('.note.on [data-decide]'); await wait(900); await shot('12-review-decided');
await open('GAEB-[PROJEKT_004].X83'); await shot('13-review-whole');
await open('LV_18_Estrich.pdf'); await shot('14-review-estrich');
await open('Angebot AN24-0305.pdf'); await shot('15-review-bid');
if (id('estrich-page-photo.jpg')) { await open('estrich-page-photo.jpg'); await wait(800); await shot('20-photo'); await p.click('.mk'); await wait(700); await shot('21-photo-focus'); }
await open('8209.003_Leistungsverzeichnis_leer.X83', '/package'); await shot('30-package-letter');
for (const k of ['prices', 'changes', 'whatif']) { await p.click(`[data-tab="${k}"]`); await wait(300); await shot('31-package-' + k); }
const a = id('GAEB-[PROJEKT_004].X83'), r = id('GAEB-[PROJEKT_004]_Nachsendung-1_Demo.X83');
if (a && r) { await p.goto(`${URL_}/#/compare/${a}/${r}`); await p.waitForSelector('.tiles'); await wait(300); await shot('40-compare', true); }
await p.goto(`${URL_}/#/compare/${id('8209.003_Leistungsverzeichnis_leer.D83')}/${id('8209.003_Leistungsverzeichnis_leer.X83')}`); await p.waitForSelector('.tiles'); await wait(300); await shot('41-compare-same');
await p.goto(URL_ + '/#/'); await p.waitForSelector('.trow'); await lang('DE'); await shot('50-home-de');
await open('8209.003_Leistungsverzeichnis_leer.X83'); await shot('51-review-de'); await lang('EN');
await p.setViewportSize({ width: 1180, height: 800 }); await open('8209.003_Leistungsverzeichnis_leer.X83'); await shot('60-narrow');
console.log('horizontal scroll at 1180:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
console.log('console errors:', errors.length ? errors : 'none');
await b.close();
