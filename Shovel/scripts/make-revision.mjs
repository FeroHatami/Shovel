// Writes a second version of a real tender from the dataset, the way a client sends a revised LV
// ("Nachsendung") before the deadline: two quantities changed, three texts changed, one item
// removed, one item added. Used to demonstrate "What changed?". The changes are ours, not the
// organisers'; the file name says so.
//   node scripts/make-revision.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = new URL('../data/GAEB-[PROJEKT_004].X83', import.meta.url);
const out = new URL('../fixtures/revision/GAEB-[PROJEKT_004]_Nachsendung-1_Demo.X83', import.meta.url);
let s = readFileSync(src, 'utf8');
const sec = s.indexOf('RNoPart="02"');
if (sec < 0) throw new Error('section 02 not found');
const block = (no) => {
  const a = s.indexOf(`<Item ID="`, s.indexOf(`RNoPart="${no}"`, sec) - 30);
  const b = s.indexOf('</Item>', a) + 7;
  return [a, b];
};
const edit = (no, fn) => {
  const [a, b] = block(no);
  const before = s.slice(a, b), after = fn(before);
  if (after === before) throw new Error('no change in ' + no);
  s = s.slice(0, a) + after + s.slice(b);
};
edit('0005', (x) => x.replace('<Qty>270.000</Qty>', '<Qty>410.000</Qty>'));
edit('0009', (x) => x.replace('<Qty>230.000</Qty>', '<Qty>180.000</Qty>'));
edit('0017', (x) => x.replaceAll('DN 600', 'DN 800'));
edit('0007', (x) => x.replaceAll('Z0', 'Z 1.1'));
edit('0021', (x) => x.replaceAll('52 cm', '60 cm'));
edit('0015', () => '');
{
  const [, b] = block('0026');
  const span = (t) => `<span style="font-size:10pt;font-family:Arial;">${t}</span>`;
  const p = (t) => `<p style="margin-top:0pt;margin-bottom:0pt;width:284pt;">${t}</p>`;
  const short = 'Rohrgrabenverbau, Tiefe über 2 m';
  const long = [short, '', 'Verbau des Rohrgrabens nach Erfordernis und nach Wahl des AN,', 'einschl. aller Nebenarbeiten. Vorhalten, Umsetzen und Rückbau', 'sind in den Einheitspreis einzurechnen.', 'Abrechnung nach verbauter Fläche.'].map(span).join('<br/>');
  const item = `<Item ID="idRev1" RNoPart="0027"><Qty>85.000</Qty><QU>m2</QU><Description><CompleteText><DetailTxt><Text>${p(long)}</Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt><p style="width:595pt;margin-top:0pt;margin-bottom:0pt;">${span(short)}</p></TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Item>`;
  s = s.slice(0, b) + item + s.slice(b);
}
writeFileSync(out, s);
console.log('written', decodeURIComponent(out.pathname));
