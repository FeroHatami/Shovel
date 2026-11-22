// Regression tests on the organisers' dataset (Shovel/data). Skipped when the files are not there.
// The same LV exists in several formats; every parser must return the same items.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseFile } from '../src/core/parse/index.ts';
import { analyze } from '../src/core/engine.ts';

const dir = new URL('../data/', import.meta.url).pathname;
const have = existsSync(dir + 'GAEB-[PROJEKT_004].X83');
const load = (f: string) => parseFile(new Uint8Array(readFileSync(dir + f)), f);
const nz = (oz: string) => oz.split('.').map((p) => p.replace(/^0+(?=.)/, '')).join('.');
const key = (d: Awaited<ReturnType<typeof load>>) => d.items.map((i) => `${nz(i.oz)}|${i.qty}|${i.unitNorm || (i.unit || '').toLowerCase()}`).sort();

const PAIRS: [string, string, number, number?][] = [
  ['8209.003_Leistungsverzeichnis_leer.X83', '8209.003_Leistungsverzeichnis_leer.D83', 159],
  ['GAEB-[PROJEKT_004].X83', 'LV-Ausdruck-[PROJEKT_004].pdf', 50],
  ['[NUMMER_001]_leer.X83', 'Leistungsverzeichnis_leer.pdf', 248],
  ['[NUMMER_001]_leer.X83', 'Abgabe LV.pdf', 248],
  ['Angebot AN24-0305.D84', 'Angebot AN24-0305.pdf', 274],
  ['Angebot AN24-0305.pdf', 'Leistungsverzeichnis.pdf', 274],
  ['8209.003_Leistungsverzeichnis_leer.X83', 'HEM2301-2_Gesamt-LV.pdf', 159], // LV inside a 136-page tender dossier
];
for (const [a, b, n, tolerate = 0] of PAIRS)
  test(`same items from ${a} and ${b}`, { skip: !have }, async () => {
    const A = await load(a);
    const B = await load(b);
    assert.equal(A.items.length, n);
    const kb = new Set(key(B));
    const missing = key(A).filter((k) => !kb.has(k));
    assert.ok(missing.length <= tolerate, `${missing.length} items differ: ${missing.slice(0, 5).join(' ; ')}`);
  });

test('bid: prices identical in GAEB 90 and PDF', { skip: !have }, async () => {
  const A = await load('Angebot AN24-0305.D84');
  const B = await load('Angebot AN24-0305.pdf');
  const pb = new Map(B.items.map((i) => [nz(i.oz), i.up]));
  for (const i of A.items) assert.equal(pb.get(nz(i.oz)), i.up, i.oz);
});

test('every file of the dataset parses and no finding lacks evidence', { skip: !have }, async () => {
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(dir).filter((f) => /\.(x8\d|d8\d|pdf)$/i.test(f))) {
    const d = await load(f);
    assert.ok(d.items.length > 0, f);
    const a = analyze(d);
    assert.ok(a.findings.every((x) => x.evidence.length > 0 && x.title), f);
  }
});

test('known real defects are found', { skip: !have }, async () => {
  const a = analyze(await load('8209.003_Leistungsverzeichnis_leer.X83'));
  assert.ok(a.findings.some((f) => f.ruleId === 'W-KURZ-LANG' && f.oz === '05.01.46'), 'Losflansch DN 125 / DN 100');
  const b = analyze(await load('Angebot AN24-0305.pdf'));
  assert.ok(b.findings.some((f) => f.ruleId === 'P-MISCHKALKULATION'));
  assert.ok(b.findings.filter((f) => f.ruleId === 'P-SPEKULATIV').length >= 10);
});

test('price-only bid file borrows texts from its tender LV', { skip: !have }, async () => {
  const { enrichFromCompanion, isTextless } = await import('../src/core/companion.ts');
  const bid = await load('StBALV23040.D84');
  assert.ok(isTextless(bid));
  const alone = enrichFromCompanion(bid, []);
  assert.equal(alone.textless, true);
  const lv = await load('[NUMMER_001]_leer.X83');
  const other = await load('GAEB-[PROJEKT_004].X83');
  const e = enrichFromCompanion(bid, [other, lv]);
  assert.equal(e.textsFrom, '[NUMMER_001]_leer.X83');
  assert.ok(e.items.filter((i) => i.shortText.length > 5).length >= 240);
  assert.ok(e.sections.length > 20);
  // quantities and prices stay the bid's own
  assert.deepEqual(e.items.map((i) => i.up), bid.items.map((i) => i.up));
  const a = analyze(e);
  assert.ok(a.findings.length > 5);
});

// Photos and scanned PDFs: local text recognition (macOS only).
const canOcr = process.platform === 'darwin' && have;
test('scanned print read by text recognition gives the same items as the GAEB file', { skip: !canOcr }, async () => {
  const { recognise, toLines } = await import('../src/core/parse/ocr.ts');
  const { parseLvLines } = await import('../src/core/parse/pdf.ts');
  const f = 'LV-Ausdruck-[PROJEKT_004].pdf';
  const d = parseLvLines(toLines(recognise(new Uint8Array(readFileSync(dir + f)), f)), f, { ocr: true });
  const ref = await load('GAEB-[PROJEKT_004].X83');
  assert.equal(d.items.length, 50);
  const kr = new Set(key(ref));
  assert.ok(key(d).filter((k) => !kr.has(k)).length <= 2);
});

test('a tilted photo of a printed page is read', { skip: !canOcr }, async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { recognise } = await import('../src/core/parse/ocr.ts');
  const tmp = mkdtempSync(tmpdir() + '/shovel-photo-');
  recognise(new Uint8Array(readFileSync(dir + 'LV_18_Estrich.pdf')), 'x.pdf'); // makes sure the tool is built
  execFileSync(new URL('../cache/bin/ocr', import.meta.url).pathname, [dir + 'LV_18_Estrich.pdf', '--png', tmp]);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '65', '--rotate', '2', tmp + '/page-3.png', '--out', tmp + '/photo.jpg']);
  const d = await parseFile(new Uint8Array(readFileSync(tmp + '/photo.jpg')), 'photo.jpg');
  assert.equal(d.format, 'image');
  const got = d.items.filter((i) => i.qty != null).map((i) => `${i.oz}|${i.qty}|${i.unitNorm}`);
  for (const k of ['11.3.40|4|St', '11.3.50|4|St', '11.3.70|85|m²', '11.3.80|10|m']) assert.ok(got.includes(k), `missing ${k} in ${got.join(', ')}`);
});
