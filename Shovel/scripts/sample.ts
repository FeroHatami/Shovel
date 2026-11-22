// Review helper: node scripts/sample.ts <folder> <RULE-ID> [n]  -> random findings of one rule with their quotes
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from '../src/core/parse/index.ts';
import { analyze } from '../src/core/engine.ts';
const [dir, rule, n = '8'] = process.argv.slice(2);
const all: string[] = [];
for (const f of readdirSync(dir).filter((f) => /\.(x8\d|d8\d|pdf|xlsx)$/i.test(f))) {
  const d = await parseFile(new Uint8Array(readFileSync(join(dir, f))), f);
  for (const x of analyze(d).findings) if (x.ruleId === rule) all.push(`${f.slice(0, 28)} ${x.oz} | ${x.title.slice(0, 90)} || ${x.evidence.map((e) => e.quote.replace(/\s+/g, ' ').slice(0, 130)).join(' ## ')}`);
}
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
console.log(all.length, 'Befunde');
for (const s of all.sort(() => rnd() - 0.5).slice(0, Number(n))) console.log('-', s);
