// Captures app screenshots for the deck draft from the running app (http://localhost:8787).
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:8787');
await p.waitForSelector('button.nav');
const wait = (ms) => p.waitForTimeout(ms);
const nav = async (k) => { await p.click(`button.nav[data-nav="${k}"]`); await wait(700); };
const open = async (file) => { await nav('documents'); await p.click(`.lv[title="${file}"]`); await wait(1200); };
// 1. a real contradiction in the organisers' data
await open('8209.003_Leistungsverzeichnis_leer.X83');
await nav('findings');
await p.evaluate(() => [...document.querySelectorAll('.frow')].find((e) => /nominal diameter|Nennweite/i.test(e.textContent))?.click());
await wait(500);
await p.screenshot({ path: 'media/finding.png' });
// 2. the letter to the client
await nav('questions');
await p.screenshot({ path: 'media/letter.png' });
// 3. the building project with its interfaces between trades
await open('LV_18_Estrich.pdf');
await nav('project');
await p.evaluate(() => [...document.querySelectorAll('h2, h3')].find((h) => /Interfaces|Schnittstellen/i.test(h.textContent))?.scrollIntoView({ block: 'start' }));
await wait(300);
await p.screenshot({ path: 'media/project.png' });
// 4. a real bid
await open('Angebot AN24-0305.pdf');
await nav('overview');
await p.screenshot({ path: 'media/bid.png' });
await b.close();
console.log('ok');
