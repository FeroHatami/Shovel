// Excel / CSV LV import. Finds the header row by column names, then reads rows.
import ExcelJS from 'exceljs';
import type { LVDocument, LVItem, LVSection } from '../types.ts';
import { cleanText, parseDeNumber, hash } from '../text.ts';
import { normUnit } from '../units.ts';

const COLS: Record<string, RegExp> = {
  oz: /^(oz|pos\.?|pos\.?-?\s?nr\.?|position|ordnungszahl|nr\.?|lfd\.?\s?nr\.?)$/i,
  short: /^(kurztext|bezeichnung|leistung|leistungsbeschreibung|text|beschreibung|titel)$/i,
  long: /^(langtext|beschreibung lang|detailtext)$/i,
  qty: /^(menge|anzahl|lv-?menge)$/i,
  unit: /^(einheit|me|eh|einh\.?)$/i,
  up: /^(ep|einheitspreis|e\.?p\.?(\s.*)?|einheitspreis.*)$/i,
  total: /^(gp|gesamtpreis|gesamtbetrag|gesamt|g\.?p\.?(\s.*)?|gesamt.*)$/i,
  kind: /^(art|positionsart|pos\.?-?art|typ)$/i,
};

function cellText(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r: any) => r.text).join('');
    if (v.result != null) return String(v.result);
    if (v.text != null) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v);
}
function cellNum(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && typeof v.result === 'number') return v.result;
  return parseDeNumber(cellText(v));
}

export function rowsToDoc(rows: any[][], fileName: string): LVDocument {
  const doc: LVDocument = {
    id: hash(fileName + rows.length + JSON.stringify(rows.slice(0, 5))),
    fileName,
    format: 'excel',
    phase: null,
    project: {},
    currency: 'EUR',
    preamble: '',
    remarks: [],
    sections: [],
    items: [],
    warnings: [],
    priced: false,
  };
  let headerIdx = -1;
  let map: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const m: Record<string, number> = {};
    rows[i].forEach((c, j) => {
      const t = cellText(c).trim();
      for (const [k, re] of Object.entries(COLS)) if (m[k] == null && re.test(t)) m[k] = j;
    });
    if (m.qty != null && (m.short != null || m.oz != null) && Object.keys(m).length >= 3) {
      headerIdx = i;
      map = m;
      break;
    }
  }
  if (headerIdx < 0) {
    doc.warnings.push('Keine Kopfzeile mit Spalten wie "Pos / Kurztext / Menge / Einheit" gefunden.');
    return doc;
  }
  doc.preamble = cleanText(
    rows
      .slice(0, headerIdx)
      .map((r) => r.map(cellText).filter(Boolean).join(' '))
      .filter(Boolean)
      .join('\n'),
  );
  const pm = /(?:Projekt|Bauvorhaben|Baumaßnahme)\s*:\s*(.+)/i.exec(doc.preamble);
  if (pm) doc.project.label = pm[1].trim();
  const lm = /^\s*LV\s*:?\s*(\d.*)$/im.exec(doc.preamble);
  if (lm) doc.project.name = lm[1].trim();
  doc.preamble = doc.preamble.replace(/^(?:Projekt|Bauvorhaben)\s*:.*\n?/im, '').trim();
  const stack: LVSection[] = [];
  let n = 0;
  let last: LVItem | null = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (k: string) => (map[k] != null ? r[map[k]] : null);
    const oz = cellText(get('oz')).trim().replace(/\.$/, '');
    const short = cleanText(cellText(get('short')));
    const long = cleanText(cellText(get('long')));
    const qty = cellNum(get('qty'));
    const unit = cellText(get('unit')).trim() || null;
    if (!oz && !short && qty == null) continue;
    if (/^(summe|zwischensumme|gesamt)/i.test(short) || /^(summe|gesamt)/i.test(oz)) {
      const v = cellNum(get('total'));
      if (v != null) {
        if (stack.length && !/gesamt/i.test(short + oz)) stack[stack.length - 1].declaredTotal = v;
        else doc.declaredTotal = v;
      }
      continue;
    }
    if (!oz && short && qty == null && last) {
      last.longText = cleanText(last.longText + '\n' + short);
      continue;
    }
    if (oz && qty == null && !unit) {
      while (stack.length && !oz.startsWith(stack[stack.length - 1].oz + '.')) stack.pop();
      const sec: LVSection = { oz, label: short, level: oz.split('.').length };
      doc.sections.push(sec);
      stack.push(sec);
      last = null;
      continue;
    }
    while (stack.length && oz && !oz.startsWith(stack[stack.length - 1].oz + '.')) stack.pop();
    n++;
    const kind = cellText(get('kind'));
    const head = kind + ' ' + short;
    const item: LVItem = {
      id: `x${n}`,
      oz: oz || String(n),
      sectionOz: stack[stack.length - 1]?.oz || '',
      sectionPath: stack.map((s) => s.label),
      shortText: short.split('\n')[0],
      longText: [short.split('\n').slice(1).join('\n'), long].filter(Boolean).join('\n'),
      qty,
      unit,
      unitNorm: normUnit(unit),
      up: cellNum(get('up')),
      total: cellNum(get('total')),
      flags: {
        bedarf: /bedarf|eventual/i.test(head),
        wahl: /wahl|alternativ/i.test(head),
        zulage: /^\s*zulage/i.test(short),
        stundenlohn: /stundenlohn/i.test(head),
        pauschal: normUnit(unit) === 'psch',
        qtyTBD: false,
        noTotal: false,
        bidderFields: (long.match(/\.{6,}/g) || []).length,
      },
    };
    doc.items.push(item);
    last = item;
  }
  doc.priced = doc.items.filter((i) => i.up != null && i.up > 0).length > doc.items.length * 0.3;
  return doc;
}

export async function parseExcel(data: Uint8Array, fileName: string): Promise<LVDocument> {
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder('utf-8').decode(data);
    const sep = (text.split('\n')[0].match(/;/g) || []).length >= 2 ? ';' : ',';
    const rows = text.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '')));
    return rowsToDoc(rows, fileName);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  let best: LVDocument | null = null;
  for (const ws of wb.worksheets) {
    const rows: any[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values as any[];
      rows.push(vals.slice(1));
    });
    const d = rowsToDoc(rows, fileName);
    if (!best || d.items.length > best.items.length) best = d;
  }
  return best || rowsToDoc([], fileName);
}
