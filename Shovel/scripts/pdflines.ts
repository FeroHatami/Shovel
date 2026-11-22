// Debug helper: node scripts/pdflines.ts <pdf> [from] [count]  -> reconstructed text lines with x position
import { readFileSync } from 'node:fs';
import { pdfToLines } from '../src/core/parse/pdf.ts';
const [f, from = '0', count = '60'] = process.argv.slice(2);
const lines = await pdfToLines(new Uint8Array(readFileSync(f)));
console.log('lines', lines.length, 'pages', Math.max(...lines.map((l) => l.page)));
for (const l of lines.slice(Number(from), Number(from) + Number(count))) console.log(String(l.page).padStart(3), String(Math.round(l.x)).padStart(4), String(Math.round(l.y)).padStart(4), '|' + l.text);
