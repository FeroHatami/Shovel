// Format detection and dispatch.
import type { LVDocument } from '../types.ts';
import { parseGaebXml } from './gaebxml.ts';
import { parseGaeb90, decodeGaeb90 } from './gaeb90.ts';
import { parsePdf, parseImage } from './pdf.ts';
import { parseExcel } from './excel.ts';

export async function parseFile(data: Uint8Array, fileName: string): Promise<LVDocument> {
  const ext = (/\.([A-Za-z0-9]+)$/.exec(fileName)?.[1] || '').toLowerCase();
  const head = Buffer.from(data.slice(0, 600)).toString('latin1');
  let doc: LVDocument;
  if (head.startsWith('%PDF') || ext === 'pdf') doc = await parsePdf(data, fileName);
  else if (['jpg', 'jpeg', 'png', 'heic', 'heif', 'tif', 'tiff', 'webp'].includes(ext)) doc = await parseImage(data, fileName);
  else if (/^x8[1-6]$/.test(ext) || /<GAEB[\s>]/.test(head) || (head.trimStart().startsWith('<?xml') && /GAEB/i.test(Buffer.from(data.slice(0, 4000)).toString('latin1')))) {
    let xml = Buffer.from(data).toString('utf8');
    const enc = /encoding=["']([^"']+)["']/i.exec(head)?.[1]?.toLowerCase();
    if (enc && /8859|1252|latin/.test(enc)) xml = Buffer.from(data).toString('latin1');
    doc = parseGaebXml(xml.replace(/^﻿/, ''), fileName);
  } else if (/^[dp]8[1-6]$/.test(ext) || /^(T0|00)/.test(head)) {
    if (/^p8/.test(ext)) throw new Error('GAEB 2000 (.P8x) wird noch nicht unterstützt – bitte als GAEB XML (.X8x) oder GAEB 90 (.D8x) exportieren.');
    doc = parseGaeb90(decodeGaeb90(data), fileName);
  } else if (['xlsx', 'xlsm', 'csv'].includes(ext) || head.startsWith('PK')) doc = await parseExcel(data, fileName);
  else throw new Error(`Dateiformat „.${ext}“ wird nicht unterstützt. Unterstützt: GAEB XML (.X81–.X86), GAEB 90 (.D81–.D86), PDF, Excel (.xlsx), CSV, Fotos (.jpg, .png, .heic).`);
  if (doc.phase == null) {
    const m = /\.[xXdDpP]8([1-6])$/.exec(fileName);
    if (m) doc.phase = 80 + Number(m[1]);
  }
  return doc;
}
export { parseGaebXml, parseGaeb90, parsePdf, parseExcel };
