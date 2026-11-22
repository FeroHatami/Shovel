// Export the deck to a 16:9 PDF, one slide per page.  node pdf.mjs
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(new URL('../Pitch/', import.meta.url).pathname);
const { chromium } = require('playwright');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL(resolve('shovel.html')).href);
await p.waitForTimeout(800);
await p.pdf({ path: 'Shovel-Slides.pdf', width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
await b.close();
