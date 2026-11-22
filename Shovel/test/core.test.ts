import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFile } from '../src/core/parse/index.ts';
import { parseGaebXml } from '../src/core/parse/gaebxml.ts';
import { parseGaeb90, writeGaeb90, decodeGaeb90 } from '../src/core/parse/gaeb90.ts';
import { parseLvLines } from '../src/core/parse/pdf.ts';
import { writeGaebXml } from '../src/core/export/gaebxml.ts';
import { analyze } from '../src/core/engine.ts';
import { PriceBook } from '../src/core/prices.ts';
import { validateAi } from '../src/llm/review.ts';
import { parseDeNumber, parsePrintedDeNumber } from '../src/core/text.ts';
import { normUnit } from '../src/core/units.ts';

const fx = (f: string) => new Uint8Array(readFileSync(new URL('../fixtures/' + f, import.meta.url)));
const load = (f: string) => parseFile(fx(f), f);

test('numbers and units', () => {
  assert.equal(parseDeNumber('1.240,500'), 1240.5);
  assert.equal(parseDeNumber('1240.500'), 1240.5);
  assert.equal(parsePrintedDeNumber('72.000,00'), 72000);
  assert.equal(parsePrintedDeNumber('11.3.40'), null);
  assert.equal(normUnit('Stk.'), 'St');
  assert.equal(normUnit('m2'), 'm²');
  assert.equal(normUnit('PSCH'), 'psch');
});

test('GAEB XML: structure, flags, bidder fields', async () => {
  const d = await load('Demo_01_Rohbau_Erdarbeiten.X83');
  assert.equal(d.format, 'gaeb-xml');
  assert.equal(d.phase, 83);
  assert.equal(d.items.length, 35);
  assert.equal(d.sections.length, 5);
  const it = d.items.find((i) => i.oz === '04.0020')!;
  assert.equal(it.qty, 462);
  assert.equal(it.unitNorm, 'm³');
  assert.match(it.longText, /C30\/37/);
  assert.ok(d.items.find((i) => i.oz === '04.0150')!.flags.bedarf);
  assert.equal(d.items.find((i) => i.oz === '04.0140')!.flags.bidderFields, 1);
  assert.match(d.preamble, /Vertragsstrafe/);
});

test('GAEB XML dialects: 3.1 namespace, text without <p>, unpadded RNoPart', () => {
  const xml = `<?xml version="1.0"?><GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/200407"><GAEBInfo><Version>3.1</Version></GAEBInfo><PrjInfo><Cur>EURO</Cur></PrjInfo><Award><DP>83</DP><BoQ><BoQInfo><Name>x</Name></BoQInfo><BoQBody><BoQCtgy RNoPart="1"><LblTx><span>Titel A</span></LblTx><BoQBody><Itemlist><Item ID="I1" RNoPart="2"><Qty>28</Qty><QU>Wo</QU><Description><CompleteText><DetailTxt><Text><span>Container warten</span><br/><span>Abrechnung nach Wochen</span></Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt><span>Container</span></TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Item></Itemlist></BoQBody></BoQCtgy></BoQBody></BoQ></Award></GAEB>`;
  const d = parseGaebXml(xml, 't.X83');
  assert.equal(d.items[0].oz, '1.2');
  assert.equal(d.items[0].shortText, 'Container');
  assert.equal(d.items[0].longText, 'Container warten\nAbrechnung nach Wochen');
  assert.equal(d.currency, 'EUR');
  assert.equal(d.sections[0].label, 'Titel A');
});

test('GAEB 90: round trip keeps quantities, prices and umlauts', async () => {
  const d = await load('Demo_Angebot_Wasserleitung.D84');
  assert.equal(d.format, 'gaeb-90');
  assert.equal(d.phase, 84);
  assert.equal(d.items.length, 25);
  const it = d.items.find((i) => i.shortText.startsWith('Rohrgrabenaushub HB 2'))!;
  assert.equal(it.qty, 4850);
  assert.equal(it.up, 28.5);
  assert.equal(it.total, 183225);
  assert.ok(d.items.some((i) => /räumen/.test(i.shortText)));
  const again = parseGaeb90(decodeGaeb90(writeGaeb90(d, 84)), 'x.D84');
  assert.equal(again.items.length, 25);
  assert.deepEqual(again.items.map((i) => [i.qty, i.up]), d.items.map((i) => [i.qty, i.up]));
});

test('GAEB XML writer -> parser round trip (X84 export)', async () => {
  const d = await load('Demo_01_Rohbau_Erdarbeiten.X83');
  const prices: Record<string, number> = {};
  for (const it of d.items) prices[it.id] = 12.5;
  const back = parseGaebXml(writeGaebXml(d, 84, prices), 'out.X84');
  assert.equal(back.phase, 84);
  assert.equal(back.items.length, d.items.length);
  assert.ok(back.items.filter((i) => i.qty != null).every((i) => i.up === 12.5));
});

test('PDF: both print layouts', async () => {
  const a = await load('Demo_18_Estrich.pdf');
  assert.equal(a.items.length, 9);
  assert.deepEqual(a.items.map((i) => i.oz), ['11.2.10', '11.2.20', '11.2.30', '11.2.40', '11.2.50', '11.2.70', '11.2.80', '11.2.90', '11.2.100']);
  assert.equal(a.items[1].qty, 1240);
  assert.ok(a.items.find((i) => i.oz === '11.2.70')!.flags.bedarf);
  assert.match(a.items[1].longText, /Heizungsbauer/);
  const b = await load('Demo_Angebot_Wasserleitung.pdf');
  assert.equal(b.items.length, 25);
  assert.ok(b.priced);
  assert.equal(b.items.find((i) => i.oz === '2.1.70')!.up, 480);
});

test('PDF line parser ignores numbers inside long text', () => {
  const L = (text: string, x = 118, page = 1) => ({ page, x, y: 0, text });
  const d = parseLvLines([L('1. Titel', 50), L('1.10. Estrich', 50), L('Dicke 65 mm, Fläche ca. 1,00-1,50 m2'), L('5,000 m lange Felder'), L('85,000 m2 ......... .........'), L('1.20. Fuge', 50), L('10,000 m 4,50 45,00')], 't.pdf');
  assert.equal(d.items.length, 2);
  assert.equal(d.items[0].qty, 85);
  assert.equal(d.items[1].up, 4.5);
  assert.equal(d.items[1].total, 45);
});

test('Excel import', async () => {
  const d = await load('Demo_20_Bodenbelag.xlsx');
  assert.equal(d.items.length, 8);
  assert.equal(d.items[0].unitNorm, 'm²');
  assert.match(d.project.label || '', /Ausbildungszentrum/);
});

test('rules: key findings on the demo LVs', async () => {
  const d = await load('Demo_01_Rohbau_Erdarbeiten.X83');
  const a = analyze(d);
  const ids = new Set(a.findings.map((f) => f.ruleId));
  for (const r of ['F-OZ-DOPPELT', 'F-MENGE-FEHLT', 'W-KURZ-LANG', 'W-EINHEIT-TEXT', 'U-WIEVOR', 'M-VERHAELTNIS', 'M-PLATZHALTER', 'W-NORM', 'L-FEHLT', 'V-BEDARF', 'B-ANGABEN', 'F-TIPPFEHLER', 'U-FABRIKAT']) assert.ok(ids.has(r), 'missing ' + r);
  // every finding quotes the LV
  assert.ok(a.findings.every((f) => f.evidence.length > 0));
  // deterministic
  assert.deepEqual(analyze(d).findings.map((f) => f.id), a.findings.map((f) => f.id));
});

test('rules: priced bid', async () => {
  const d = await load('Demo_Angebot_Wasserleitung.D84');
  const a = analyze(d);
  const f = a.findings.find((x) => x.ruleId === 'F-RECHNEN')!;
  assert.equal(Math.round(f.exposure), 45000);
  assert.ok(a.findings.some((x) => x.ruleId === 'P-MISCHKALKULATION'));
  assert.ok(a.findings.some((x) => x.ruleId === 'F-SUMME'));
  assert.ok(a.findings.filter((x) => x.ruleId === 'P-SPEKULATIV').length >= 4);
});

test('anonymisation placeholders are not reported', () => {
  const xml = `<GAEB><Award><DP>83</DP><BoQ><BoQBody><BoQCtgy RNoPart="01"><LblTx>A</LblTx><BoQBody><Itemlist><Item ID="a" RNoPart="0010"><Qty>10</Qty><QU>m2</QU><Description><CompleteText><DetailTxt><Text><p>[FIRMA_071] auf Dämmung, Ausführung nach [PERSON_125] AN, Dicke 65 mm. Lieferung durch [FIRMA_102].</p></Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt>[FIRMA_071] 65 mm</TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Item></Itemlist></BoQBody></BoQCtgy></BoQBody></BoQ></Award></GAEB>`;
  const a = analyze(parseGaebXml(xml, 'a.X83'));
  assert.equal(a.findings.filter((f) => f.ruleId === 'F-TIPPFEHLER').length, 0);
});

test('price book: history beats seed and adjusts for year', async () => {
  const book = new PriceBook();
  const h = await parseFile(new Uint8Array(readFileSync(new URL('../fixtures/history/Historie_2024_Rohbau_Gewerbehalle.X86', import.meta.url))), 'h.X86');
  assert.ok(book.learn(h, 2024) > 20);
  const d = await load('Demo_01_Rohbau_Erdarbeiten.X83');
  const s = book.suggest(d.items.find((i) => i.oz === '04.0070')!)!; // Schalung Wände, history 46.50 in 2024
  assert.ok(s.mid > 44 && s.mid < 52, 'mid ' + s.mid);
  assert.ok(s.refs.some((r) => r.project.includes('Gewerbehalle')));
});

test('AI findings without a literal quote are dropped', async () => {
  const d = await load('Demo_18_Estrich.pdf');
  const { drafts, dropped } = validateAi(d, [
    { oz: '11.2.20', category: 'schnittstelle', severity: 2, title: 'ok', detail: 'd', quote: 'wird vom Heizungsbauer verlegt', action: 'bieterfrage', question: 'Zu Pos. 11.2.20: …' },
    { oz: '11.2.20', category: 'unklar', severity: 2, title: 'erfunden', detail: 'd', quote: 'Estrich ist dreilagig mit Stahlfasern auszuführen', action: 'bieterfrage', question: 'q' },
    { oz: '99.9.99', category: 'unklar', severity: 2, title: 'falsche OZ', detail: 'd', quote: 'Zementestrich', action: 'bieterfrage', question: 'q' },
  ]);
  assert.equal(drafts.length, 1);
  assert.equal(dropped, 2);
});

test('PDF parsing leaves the caller\'s buffer intact', async () => {
  const data = fx('Demo_18_Estrich.pdf');
  const n = data.length;
  await parseFile(data, 'Demo_18_Estrich.pdf');
  assert.equal(data.length, n);
});
