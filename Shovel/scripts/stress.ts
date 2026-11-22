// Builds a large LV by repeating the demo items and measures parse + analysis time.
import { readFileSync } from 'node:fs';
import { parseFile } from '../src/core/parse/index.ts';
import { writeGaebXml } from '../src/core/export/gaebxml.ts';
import { analyze } from '../src/core/engine.ts';
import { PriceBook } from '../src/core/prices.ts';
const N = Number(process.argv[2] || 5000);
const base = await parseFile(new Uint8Array(readFileSync(new URL('../fixtures/Demo_01_Rohbau_Erdarbeiten.X83', import.meta.url))), 'a.X83');
const big = structuredClone(base);
big.items = [];
big.sections = [];
let n = 0;
for (let k = 0; n < N; k++) {
  big.sections.push({ oz: String(k + 1).padStart(3, '0'), label: 'Bauteil ' + (k + 1), level: 1 });
  for (const s of base.sections) big.sections.push({ ...s, level: 2, oz: String(k + 1).padStart(3, '0') + '.' + s.oz });
  for (const it of base.items) {
    n++;
    big.items.push({ ...structuredClone(it), id: 'i' + n, oz: String(k + 1).padStart(3, '0') + '.' + it.oz, sectionOz: String(k + 1).padStart(3, '0') + '.' + it.sectionOz, qty: it.qty == null ? null : it.qty + (k % 7) });
  }
}
const xml = writeGaebXml(big, 83);
const book = new PriceBook();
for (const f of ['Historie_2024_Rohbau_Gewerbehalle.X86', 'Historie_2025_Ausbau_Verwaltungsgebaeude.X86']) book.learn(await parseFile(new Uint8Array(readFileSync(new URL('../fixtures/history/' + f, import.meta.url))), f));
let t = performance.now();
const doc = await parseFile(new Uint8Array(Buffer.from(xml)), 'big.X83');
const tp = performance.now() - t;
t = performance.now();
const a = analyze(doc, { priceBook: book });
console.log(`${doc.items.length} Positionen, ${(xml.length / 1e6).toFixed(1)} MB XML: Import ${Math.round(tp)} ms, Prüfung ${Math.round(performance.now() - t)} ms, ${a.findings.length} Befunde`);
