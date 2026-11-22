// "What changed?" between two versions of one LV.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseFile } from '../src/core/parse/index.ts';
import { diffDocs, wordDiff } from '../src/core/compare.ts';

const DATA = new URL('../data/', import.meta.url).pathname;
const load = async (p: string) => parseFile(new Uint8Array(readFileSync(p)), p.split('/').pop()!);

test('word diff marks only the changed words', () => {
  const d = wordDiff('Bestehende Bachverrohrung DN 600 Beton ausbauen', 'Bestehende Bachverrohrung DN 800 Beton ausbauen');
  assert.deepEqual(d.filter((x) => x.t !== '=').map((x) => x.t + x.s), ['-600', '+800']);
});

test('a revised tender: every planted change is found, nothing else', { skip: !existsSync(DATA + 'GAEB-[PROJEKT_004].X83') }, async () => {
  const a = await load(DATA + 'GAEB-[PROJEKT_004].X83');
  const b = await load(new URL('../fixtures/revision/GAEB-[PROJEKT_004]_Nachsendung-1_Demo.X83', import.meta.url).pathname);
  const d = diffDocs(a, b, () => 0);
  assert.equal(d.comparable, true);
  assert.deepEqual([d.added, d.removed, d.qtyChanged, d.textChanged, d.identical], [1, 1, 2, 3, 44]);
  const q = d.changes.find((c) => c.oz === '02.0005')!;
  assert.deepEqual(q.qty, [270, 410]);
  assert.equal(d.changes.find((c) => c.kind === 'removed')!.oz, '02.0015');
  assert.equal(d.changes.find((c) => c.kind === 'added')!.oz, '02.0027');
});

test('the same LV as GAEB 90 and GAEB XML shows no change in quantities', { skip: !existsSync(DATA + '8209.003_Leistungsverzeichnis_leer.D83') }, async () => {
  const a = await load(DATA + '8209.003_Leistungsverzeichnis_leer.D83');
  const b = await load(DATA + '8209.003_Leistungsverzeichnis_leer.X83');
  const d = diffDocs(a, b, () => 0);
  assert.equal(d.matched, 159);
  assert.equal(d.added + d.removed + d.qtyChanged, 0);
});
