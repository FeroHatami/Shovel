import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFile } from '../src/core/parse/index.ts';
import { analyze } from '../src/core/engine.ts';
import type { Finding } from '../src/core/types.ts';

const fx = (f: string) => new Uint8Array(readFileSync(new URL('../fixtures/' + f, import.meta.url)));
const load = (f: string) => parseFile(fx(f), f);

// Words that only occur in the German templates. An English title may quote the LV, but must not be built from these.
const GERMAN_ONLY = ['Widerspruch', 'fehlt', 'Menge ', 'Positionen', 'Vorbemerkung', 'Schreibfehler', 'Einheit ', 'Schnittstelle', 'keine Position'];
const strip = (f: Finding) => ({ ...f, title: '', detail: '', basis: '', nachtrag: f.nachtrag ? { ...f.nachtrag, note: '' } : undefined });

for (const file of ['Demo_01_Rohbau_Erdarbeiten.X83', 'Demo_Angebot_Wasserleitung.D84']) {
  test(`languages: ${file} gives the same findings in German and English`, async () => {
    // analyze() fills in doc.trade on first use, so every run gets its own freshly parsed document
    const plain = analyze(await load(file)).findings;
    const de = analyze(await load(file), { lang: 'de' }).findings;
    const en = analyze(await load(file), { lang: 'en' }).findings;
    assert.ok(plain.length > 5);

    // German is the default and is unchanged by the lang option
    assert.deepEqual(de, plain);

    // same findings, same order, same ids in both languages
    assert.deepEqual(en.map((f) => f.id), de.map((f) => f.id));

    // everything except the translated texts is identical: evidence quotes, questions, scores, items
    assert.deepEqual(en.map(strip), de.map(strip));
    for (let i = 0; i < de.length; i++) {
      assert.deepEqual(en[i].evidence, de[i].evidence, `evidence of ${de[i].ruleId}`);
      assert.equal(en[i].question, de[i].question, `question of ${de[i].ruleId}`);
      assert.equal(en[i].nachtrag?.basis, de[i].nachtrag?.basis);
    }

    // titles and details are really translated
    for (let i = 0; i < en.length; i++) {
      const f = en[i];
      for (const w of GERMAN_ONLY) assert.ok(!f.title.includes(w), `English title of ${f.ruleId} contains "${w}": ${f.title}`);
      assert.notEqual(f.title, de[i].title, `title of ${f.ruleId} is not translated: ${f.title}`);
      assert.notEqual(f.detail, de[i].detail, `detail of ${f.ruleId} is not translated`);
      assert.ok(!f.detail.startsWith('Pos. '), `English detail of ${f.ruleId} starts in German: ${f.detail.slice(0, 80)}`);
      if (f.nachtrag) assert.notEqual(f.nachtrag.note, de[i].nachtrag!.note, `Nachtrag note of ${f.ruleId} is not translated`);
    }
  });
}
