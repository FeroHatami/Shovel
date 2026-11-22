// Parser cross-check: the same LV in two formats must give the same items.
//   node scripts/compare.ts <fileA> <fileB> [--show]
import { readFileSync } from 'node:fs';
import { parseFile } from '../src/core/parse/index.ts';
const [fa, fb] = process.argv.slice(2);
const show = process.argv.includes('--show');
const nz = (oz: string) => oz.split('.').map((p) => p.replace(/^0+(?=.)/, '')).join('.').replace(/\.$/, '');
const A = await parseFile(new Uint8Array(readFileSync(fa)), fa.split('/').pop()!);
const B = await parseFile(new Uint8Array(readFileSync(fb)), fb.split('/').pop()!);
const mb = new Map(B.items.map((i) => [nz(i.oz), i]));
let matched = 0, qtyOk = 0, unitOk = 0, textOk = 0, upOk = 0, upN = 0;
const diffs: string[] = [];
const tk = (s: string) => new Set(s.toLowerCase().replace(/\[[^\]]*\]/g, ' ').match(/[a-zäöüß]{4,}/g) || []);
for (const a of A.items) {
  const b = mb.get(nz(a.oz));
  if (!b) { diffs.push(`nur in A: ${a.oz} ${a.shortText.slice(0, 50)}`); continue; }
  matched++;
  mb.delete(nz(a.oz));
  const q = a.qty === b.qty || (a.qty != null && b.qty != null && Math.abs(a.qty - b.qty) < 0.0006);
  if (q) qtyOk++; else diffs.push(`Menge ${a.oz}: ${a.qty} ${a.unit} | ${b.qty} ${b.unit}`);
  if ((a.unitNorm || a.unit || '').toLowerCase() === (b.unitNorm || b.unit || '').toLowerCase()) unitOk++; else if (q) diffs.push(`Einheit ${a.oz}: ${a.unit} | ${b.unit}`);
  if (a.up != null && b.up != null) { upN++; if (Math.abs(a.up - b.up) < 0.006) upOk++; else diffs.push(`EP ${a.oz}: ${a.up} | ${b.up}`); }
  const ta = tk(a.shortText + ' ' + a.longText), tb = tk(b.shortText + ' ' + b.longText);
  if (ta.size && tb.size) { let i = 0; for (const t of ta) if (tb.has(t)) i++; if (i / Math.min(ta.size, tb.size) > 0.7) textOk++; else diffs.push(`Text ${a.oz}: "${a.shortText.slice(0, 40)}" | "${b.shortText.slice(0, 40)}"`); }
}
for (const b of mb.values()) diffs.push(`nur in B: ${b.oz} ${b.shortText.slice(0, 50)}`);
const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) + ' %' : '–');
console.log(`${A.fileName} (${A.items.length}) ↔ ${B.fileName} (${B.items.length}): OZ ${matched} gemeinsam | Menge ${pct(qtyOk, matched)} | Einheit ${pct(unitOk, matched)} | Text ${pct(textOk, matched)}${upN ? ' | EP ' + pct(upOk, upN) : ''} | Abschnitte ${A.sections.length}/${B.sections.length}`);
if (show) console.log(diffs.slice(0, 40).join('\n'));
