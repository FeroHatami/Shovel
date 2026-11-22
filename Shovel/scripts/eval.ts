// Evaluation: (1) recall on seeded defects in the demo fixtures, (2) batch statistics for any
// folder of real LVs:  node scripts/eval.ts [folder] [--verbose]
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from '../src/core/parse/index.ts';
import { analyze } from '../src/core/engine.ts';
import { PriceBook } from '../src/core/prices.ts';
import type { LVDocument } from '../src/core/types.ts';

const root = new URL('../', import.meta.url).pathname;
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const dir = args.find((a) => !a.startsWith('--')) || join(root, 'fixtures');
const isFixtures = existsSync(join(dir, 'ground-truth.json'));

const book = new PriceBook();
const histDir = join(root, 'fixtures/history');
for (const f of readdirSync(histDir)) book.learn(await parseFile(new Uint8Array(readFileSync(join(histDir, f))), f), Number(/_(20\d\d)_/.exec(f)?.[1] || 2025));

const files = readdirSync(dir).filter((f) => /\.(x8\d|d8\d|pdf|xlsx|csv)$/i.test(f) && statSync(join(dir, f)).isFile()).sort();
const docs: LVDocument[] = [];
for (const f of files) {
  try {
    const t0 = performance.now();
    const d = await parseFile(new Uint8Array(readFileSync(join(dir, f))), f);
    (d as any)._ms = Math.round(performance.now() - t0);
    docs.push(d);
  } catch (e) {
    console.log(`✗ ${f}: ${(e as Error).message}`);
  }
}
const truth: { file: string; oz: string; rule: string }[] = isFixtures ? JSON.parse(readFileSync(join(dir, 'ground-truth.json'), 'utf8')) : [];
const nz = (oz: string) => oz.split('.').map((p) => p.replace(/^0+(?=.)/, '')).join('.');
let hit = 0;
const missed: string[] = [];
console.log('Datei'.padEnd(46), 'Format'.padEnd(9), 'Pos'.padStart(5), 'Abschn'.padStart(6), 'Befunde'.padStart(8), 'hoch'.padStart(5), 'Risiko'.padStart(7), 'ms'.padStart(6));
for (const d of docs) {
  const project = isFixtures ? docs.filter((x) => x !== d && /^Demo_\d/.test(x.fileName) && /^Demo_\d/.test(d.fileName)) : docs.filter((x) => x !== d && x.project.label && x.project.label === d.project.label);
  const a = analyze(d, { priceBook: book, project });
  console.log(d.fileName.slice(0, 45).padEnd(46), d.format.padEnd(9), String(d.items.length).padStart(5), String(d.sections.length).padStart(6), String(a.findings.length).padStart(8), String(a.stats.bySeverity[3]).padStart(5), String(a.stats.riskScore).padStart(7), String((d as any)._ms + a.durationMs).padStart(6), d.warnings.length ? ' ⚠ ' + d.warnings[0] : '');
  if (verbose) for (const f of a.findings) console.log(`    [${f.severity}] ${f.ruleId.padEnd(22)} ${f.oz.padEnd(10)} ${f.title.slice(0, 90)}`);
  for (const t of truth.filter((t) => t.file === d.fileName)) {
    const [rule, sub] = t.rule.split(':');
    const ok = a.findings.some((f) => f.ruleId === rule && (t.oz ? f.itemIds.some((id) => nz(d.items.find((i) => i.id === id)?.oz || '') === nz(t.oz)) : true) && (!sub || f.title.includes(sub) || f.detail.includes(sub)));
    if (ok) hit++;
    else missed.push(`${t.file} ${t.oz} ${t.rule}`);
  }
}
if (isFixtures) {
  console.log(`\nSeeded defects found: ${hit}/${truth.length} (${((hit / truth.length) * 100).toFixed(0)} %)`);
  for (const m of missed) console.log('  missed:', m);
}
