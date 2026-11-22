// Excel/CSV LVs come in many home-made layouts. These cover the common ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseFile } from '../src/core/parse/index.ts';
import { analyze } from '../src/core/engine.ts';

async function xlsx(rows: any[][], sheet = 'LV', extraSheet = false): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  if (extraSheet) wb.addWorksheet('Deckblatt').addRow(['Angebotsaufforderung']);
  const ws = wb.addWorksheet(sheet);
  for (const r of rows) ws.addRow(r);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

test('Excel: priced LV with OZ / Bezeichnung / Menge / ME / EP / GP and a cover sheet', async () => {
  const d = await parseFile(
    await xlsx(
      [
        ['Bauvorhaben: Neubau Kita Beispielhausen'],
        [],
        ['OZ', 'Bezeichnung', 'Menge', 'ME', 'EP [€]', 'GP [€]'],
        ['01', 'Erdarbeiten'],
        ['01.0010', 'Oberboden abtragen', 450, 'm2', 2.4, 1080],
        ['01.0020', 'Baugrubenaushub', 1200, 'm3', 11.5, 13800],
        ['', 'Boden lösen, laden und abfahren.'],
        ['', 'Summe 01', null, null, null, 14880],
        ['02', 'Betonarbeiten'],
        ['02.0010', 'Bodenplatte C25/30', 85, 'm3', 180, 15000], // 85 x 180 = 15300
      ],
      'Leistungsverzeichnis',
      true,
    ),
    'kita.xlsx',
  );
  assert.equal(d.items.length, 3);
  assert.equal(d.sections.length, 2);
  assert.ok(d.priced);
  assert.match(d.project.label || '', /Kita/);
  assert.equal(d.items[1].up, 11.5);
  assert.match(d.items[1].longText, /laden und abfahren/);
  assert.equal(d.sections[0].declaredTotal, 14880);
  const a = analyze(d);
  assert.ok(a.findings.some((f) => f.ruleId === 'F-RECHNEN' && f.oz === '02.0010'));
});

test('Excel: German number strings, "Pos." header, units with dots, separate Langtext column', async () => {
  const d = await parseFile(
    await xlsx([
      ['Pos.', 'Kurztext', 'Langtext', 'Menge', 'Einheit', 'Einheitspreis', 'Gesamtpreis'],
      ['1.1', 'Estrich 65 mm', 'Zementestrich CT-C25-F4', '1.240,50', 'm²', '26,40', '32.749,20'],
      ['1.2', 'Randdämmstreifen', '', '960', 'lfm', '1,80', '1.728,00'],
      ['1.3', 'Stundenlohn Facharbeiter', '', '20', 'Std.', '58,00', '1.160,00'],
    ]),
    'estrich.xlsx',
  );
  assert.equal(d.items.length, 3);
  assert.equal(d.items[0].qty, 1240.5);
  assert.equal(d.items[0].up, 26.4);
  assert.equal(d.items[0].total, 32749.2);
  assert.equal(d.items[1].unitNorm, 'm');
  assert.equal(d.items[2].unitNorm, 'h');
});

test('Excel: formulas in the GP column and no OZ column', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tabelle1');
  ws.addRow(['Leistung', 'Anzahl', 'Einh.', 'EP', 'Gesamt']);
  ws.addRow(['Wandfliesen liefern und verlegen', 120, 'm2', 78, { formula: 'B2*D2', result: 9360 }]);
  ws.addRow(['Sockelfliesen', 60, 'm', 18, { formula: 'B3*D3', result: 1080 }]);
  const d = await parseFile(new Uint8Array(await wb.xlsx.writeBuffer()), 'fliesen.xlsx');
  assert.equal(d.items.length, 2);
  assert.equal(d.items[0].total, 9360);
  assert.equal(d.items[1].oz, '2');
});

test('CSV with semicolons and decimal commas', async () => {
  const csv = 'Pos;Bezeichnung;Menge;Einheit;EP;GP\n1.10;Bauzaun aufstellen;240,000;m;11,80;2.832,00\n1.20;"Baustelle räumen";1;psch;3.500,00;3.500,00\n';
  const d = await parseFile(new Uint8Array(Buffer.from(csv, 'utf8')), 'lv.csv');
  assert.equal(d.items.length, 2);
  assert.equal(d.items[0].qty, 240);
  assert.equal(d.items[0].total, 2832);
  assert.equal(d.items[1].unitNorm, 'psch');
});

test('Excel without a recognisable header gives a clear warning instead of garbage', async () => {
  const d = await parseFile(await xlsx([['Notizen'], ['irgendwas', 3]]), 'x.xlsx');
  assert.equal(d.items.length, 0);
  assert.ok(d.warnings.length > 0);
});
