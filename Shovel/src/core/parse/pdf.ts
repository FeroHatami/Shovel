// PDF LV parser. Step 1 rebuilds text lines from glyph positions (pdf.js). Step 2 is a layout-
// agnostic state machine over those lines: OZ line -> text lines -> quantity line.
// It was designed against the two print layouts in the organisers' dataset (AVA "Anfrage" print
// with dotted price fields, and a priced contractor bid), but does not hard-code either.
import type { LVDocument, LVItem, LVSection, ItemFlags } from '../types.ts';
import { cleanText, parsePrintedDeNumber, hash } from '../text.ts';
import { normUnit, UNIT_TOKEN_RE } from '../units.ts';

export interface PLine {
  page: number;
  x: number;
  y: number;
  text: string;
}

export async function pdfToLines(data: Uint8Array): Promise<PLine[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: data.slice(), useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const lines: PLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const frags = (tc.items as any[])
      .filter((i) => typeof i.str === 'string' && i.str.trim() !== '')
      .map((i) => ({ x: i.transform[4] as number, y: i.transform[5] as number, w: i.width as number, s: i.str as string }));
    frags.sort((a, b) => b.y - a.y || a.x - b.x);
    let cur: typeof frags = [];
    const flush = () => {
      if (!cur.length) return;
      cur.sort((a, b) => a.x - b.x);
      let text = '';
      let end = cur[0].x;
      for (const f of cur) {
        const gap = f.x - end;
        if (text && gap > 1.2) text += gap > 14 ? '   ' : ' ';
        text += f.s;
        end = f.x + f.w;
      }
      lines.push({ page: p, x: cur[0].x, y: cur[0].y, text: text.replace(/\s+$/, '') });
      cur = [];
    };
    for (const f of frags) {
      if (cur.length && Math.abs(cur[0].y - f.y) > 2.5) flush();
      cur.push(f);
    }
    flush();
  }
  return lines;
}

const OZ_RE = /^\.?(\d{1,4}(?:\.\d{1,4}){0,5})\.?(?:\s+(.*))?$/;
const NUM = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{1,4}`;
const UNIT = String.raw`[A-Za-zäöüÄÖÜ²³%][A-Za-zäöüÄÖÜ²³%0-9./]{0,7}`;
const NUMQ = String.raw`-?\d{1,3}(?:\.\d{3})+(?:,\d{1,4})?|-?\d+(?:,\d{1,4})?`; // quantities may be printed without decimals
const QTY_RE = new RegExp(String.raw`^(${NUMQ})\s+(${UNIT})(?:\s+(.*))?$`);
const QTY_TAIL_RE = new RegExp(String.raw`^(.*?)\s+(${NUM})\s+(${UNIT})((?:\s+(?:${NUM}|[._…]{4,}|Nur\s+Einh\.?-?\s?Pr\.?)){0,2})\s*$`);
const SUM_RE = new RegExp(String.raw`^(?:Summe|Zwischensumme|Gesamtsumme|Gesamtbetrag|Angebotssumme)\b\s*(.*?)\s*(${NUM}|[._…]{4,})\s*(?:EUR|€)?$`, 'i');
const SECTION_WORD_RE = /^(?:Los|Bereich|Abschnitt|Titel|Gewerk|Hauptgruppe|Obergruppe|Untergruppe|LV-Bereich)\s+(\d{1,4}(?:\.\d{1,4}){0,4})\.?\s+(.*)$/i;
const NOISE_RE = /^(?:Übertrag:?|Seite:?\s*\d+|Seite\s+\d+\s+von\s+\d+|Druckdatum.*|Pos-?\.?\s?Nr\.?.*Menge.*|OZ\s+Leistungsbeschreibung.*|in EUR(\s+in EUR)?|Menge\s+ME\s+.*)\s*$/i;

function isRestPrice(rest: string | undefined): { ok: boolean; nums: number[]; noTotal: boolean } {
  if (!rest || !rest.trim()) return { ok: true, nums: [], noTotal: false };
  rest = rest.replace(/\b(?:EP|GP)\s*(?=[._…])/g, ' '); // "EP......... GP ........."

  const parts = rest.trim().split(/\s{1,}/);
  const nums: number[] = [];
  let noTotal = false;
  const joined = rest.trim();
  if (/Nur\s+Einh/i.test(joined)) noTotal = true;
  for (const p of joined.replace(/Nur\s+Einh\.?-?\s?Pr\.?/i, '').trim().split(/\s+/).filter(Boolean)) {
    if (/^[._…]{3,}$/.test(p)) continue;
    const v = parsePrintedDeNumber(p);
    if (v == null) return { ok: false, nums: [], noTotal };
    nums.push(v);
  }
  if (parts.length > 4) return { ok: false, nums: [], noTotal };
  return { ok: true, nums, noTotal };
}

interface Block {
  oz: string;
  title: string;
  text: string[];
  page: number;
  qty: number | null;
  unit: string | null;
  up: number | null;
  total: number | null;
  noTotal: boolean;
  hasQty: boolean;
  weakQty?: boolean; // quantity taken from a line without three decimals (text recognition only)
  unitUnread?: boolean;
  sectionWord: boolean;
}

export function parseLvLines(lines: PLine[], fileName: string, opts: { ocr?: boolean } = {}): LVDocument {
  const warnings: string[] = [];
  const pages = Math.max(1, ...lines.map((l) => l.page));

  // 1. remove headers/footers: lines that repeat on most pages (digits masked)
  const mask = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  const pageSets = new Map<string, Set<number>>();
  const posSets = new Map<string, Set<number>>();
  const posKey = (l: PLine) => mask(l.text) + '@' + Math.round(l.y / 4) + '@' + Math.round(l.x / 4);
  for (const l of lines) {
    const k = mask(l.text);
    if (!pageSets.has(k)) pageSets.set(k, new Set());
    pageSets.get(k)!.add(l.page);
    const pk = posKey(l);
    if (!posSets.has(pk)) posSets.set(pk, new Set());
    posSets.get(pk)!.add(l.page);
  }
  const repeated = new Set<string>();
  if (pages >= 3) for (const [k, s] of pageSets) if (s.size >= Math.max(3, pages * 0.5) && k.length > 2) repeated.add(k);
  // same text at the same place on several pages is page furniture, even in a two-page document
  const repeatedPos = new Set<string>();
  if (pages >= 2) for (const [k, s] of posSets) if (s.size >= Math.max(2, Math.ceil(pages * 0.5))) repeatedPos.add(k);
  const headerInfo: string[] = [];
  const body = lines.filter((l) => {
    const t = l.text.trim();
    if (!t) return false;
    if (NOISE_RE.test(t)) return false;
    // "1,000 St" repeats on most pages too, but it is content: never drop quantity or OZ lines
    const content = QTY_RE.test(t) || /^\.?\d{1,4}(?:\.\d{1,4})+\.?\s/.test(t);
    if (!content && (repeated.has(mask(t)) || repeatedPos.has(posKey(l)))) {
      if (l.page === 1) headerInfo.push(t);
      return false;
    }
    return true;
  });

  // 1b. Tender dossiers wrap the LV in forms and contract terms. The LV proper is the page range
  // that contains quantity lines; everything before it is kept as preamble text only.
  const STRONG_QTY = new RegExp(String.raw`(?:^|\s)\d{1,3}(?:\.\d{3})*,\d{3}\s+${UNIT}(?:\s|$)`);
  const qtyPages = new Set<number>();
  for (const l of body) {
    const m = STRONG_QTY.exec(l.text);
    if (m && normUnit(m[0].trim().split(/\s+/)[1])) qtyPages.add(l.page);
    else if (/^\d[\d.]*\s+\S{1,6}\s+(?:EP\s*)?[._…]{6,}/.test(l.text.trim())) qtyPages.add(l.page);
  }
  // The first item's long text can run over pages: start at the first page near the first quantity
  // that shows the LV column header, otherwise three pages before it.
  let firstLvPage = 1;
  if (qtyPages.size >= 3) {
    const q0 = Math.min(...qtyPages);
    const hdr = lines.filter((l) => l.page >= q0 - 8 && l.page <= q0 && /Leistungsbeschreibung.*Menge|Menge\s*\/?\s*Einh|Pos\.?.*Menge.*(?:Einheitspreis|EP)/i.test(l.text)).map((l) => l.page);
    firstLvPage = Math.max(1, hdr.length ? Math.min(...hdr) : q0 - 3);
  }
  const lastLvPage = qtyPages.size >= 3 ? Math.max(...qtyPages) + 1 : Infinity;

  // 2. find the x position where OZ numbers start (most frequent left edge of OZ candidates)
  const xs = new Map<number, number>();
  for (const l of body) {
    const m = OZ_RE.exec(l.text.trim());
    if (m && m[1].includes('.')) {
      const k = Math.round(l.x / 3);
      xs.set(k, (xs.get(k) || 0) + 1);
    }
  }
  let ozX: number | null = null;
  let best = 0;
  for (const [k, c] of xs) if (c > best || (c === best && ozX != null && k * 3 < ozX)) [best, ozX] = [c, k * 3];
  const atOzX = (l: PLine) => ozX == null || Math.abs(l.x - ozX) <= 6 || l.x < ozX;

  // 3. state machine
  const blocks: Block[] = [];
  const pre: string[] = [];
  const sums: { label: string; value: number }[] = [];
  let cur: Block | null = null;
  let flagNext = '';
  let summaryMode = false;
  let lastOzParts: number[] = [];

  const plausibleNext = (oz: string) => {
    const parts = oz.split('.').map(Number);
    if (!blocks.length) return true;
    if (parts.length === 1) return parts[0] <= (lastOzParts[0] || 0) + 3 && parts[0] >= (lastOzParts[0] || 0);
    // must not go backwards at top level by a lot
    return parts[0] >= (lastOzParts[0] || 0) && parts[0] <= (lastOzParts[0] || 0) + 5;
  };

  for (const l of body) {
    const t = l.text.trim();
    if (l.page < firstLvPage || l.page > lastLvPage) {
      if (l.page < firstLvPage) pre.push(t);
      continue;
    }
    if (/^Zusammenstellung\b/i.test(t)) {
      summaryMode = true;
      cur = null;
      continue;
    }
    const sm = SUM_RE.exec(t);
    if (sm) {
      const v = parsePrintedDeNumber(sm[2]);
      if (v != null) sums.push({ label: sm[1], value: v });
      cur = null; // whatever follows a sum line is not part of the item above
      continue;
    }
    if (/^(?:Summe|Zwischensumme|Gesamtsumme|Zuzüglich\s+der|MWSt\.?|Mehrwertsteuer|in\s+Höhe\s+von\s+\d|\(Ort\)|Das\s+LV\s+besteht\s+aus)/i.test(t)) {
      cur = null; // sum line without a value on the same line, VAT block, signature block
      continue;
    }
    // running page headers of AVA prints: "03.01   Bereich   Pumpen" (repeated on every page of the section)
    const rh = /^(\d{1,4}(?:\.\d{1,4}){0,4})\.?\s+(LV|Titel|Untertitel|Bereich|Abschnitt|Unterabschnitt|Los|Gewerk)\s{2,}(.*)$/.exec(t);
    if (rh) {
      if (rh[2] === 'LV' || blocks.some((b) => b.oz === rh[1] && !b.hasQty)) continue;
      if (!blocks.some((b) => b.hasQty) && blocks.length && /^0*1$/.test(rh[1])) blocks.length = 0; // table of contents before
      cur = { oz: rh[1], title: rh[3].replace(/\s+\d+$/, ''), text: [], page: l.page, qty: null, unit: null, up: null, total: null, noTotal: false, hasQty: false, sectionWord: true };
      blocks.push(cur);
      lastOzParts = rh[1].split('.').map(Number);
      continue;
    }
    const sw = SECTION_WORD_RE.exec(t);
    if (sw && /\d,\d{2}$/.test(t)) {
      // row of a summary table ("Bereich 1. Baustelleneinrichtung 93.387,50"), not a new section
      const v = parsePrintedDeNumber(t.split(/\s+/).pop()!);
      if (v != null) sums.push({ label: sw[1], value: v });
      continue;
    }
    if (sw) {
      summaryMode = false;
      cur = { oz: sw[1], title: sw[2], text: [], page: l.page, qty: null, unit: null, up: null, total: null, noTotal: false, hasQty: false, sectionWord: true };
      blocks.push(cur);
      lastOzParts = sw[1].split('.').map(Number);
      continue;
    }
    if (summaryMode) continue;

    // A quantity line is tested first: "1.300 m2 ......" would otherwise look like an OZ.
    const q1 = QTY_RE.exec(t);
    // with text recognition, a real quantity line ("840,000 mWo") replaces an earlier guess ("28 Wochen")
    const override = !!opts.ocr && !!q1 && !!cur && cur.hasQty && !!cur.weakQty && /,\d{3}$/.test(q1[1]);
    if (q1 && cur && (!cur.hasQty || override) && !cur.sectionWord) {
      const rp = isRestPrice(q1[3]);
      const hasTail = !!(q1[3] && q1[3].trim());
      // Printed quantities carry three decimals ("1,000 St") or are followed by price fields ("70 m ......").
      // Anything else ("0,8 mm", "28 Wochen") is a dimension inside the long text.
      // Text recognition drops the dotted price fields, so there a known unit alone is enough.
      const strong = /,\d{3}$/.test(q1[1]) ? true : !!normUnit(q1[2]) && (hasTail || !!opts.ocr);
      if (rp.ok && strong) {
        cur.qty = parsePrintedDeNumber(q1[1]);
        cur.unit = q1[2];
        cur.hasQty = true;
        cur.up = rp.nums[0] ?? null;
        cur.total = rp.nums[1] ?? null;
        cur.noTotal = rp.noTotal;
        cur.weakQty = !/,\d{3}$/.test(q1[1]) && !hasTail;
        continue;
      }
    }
    // text recognition sometimes drops a short unit ("1,000 St" -> "1,000"): keep the quantity, mark the unit
    if (opts.ocr && cur && !cur.hasQty && !cur.sectionWord && /^\d{1,3}(?:\.\d{3})*,\d{3}$/.test(t)) {
      cur.qty = parsePrintedDeNumber(t);
      cur.unit = null;
      cur.hasQty = true;
      cur.unitUnread = true;
      continue;
    }
    const om = OZ_RE.exec(t);
    if (om && atOzX(l) && !plausibleNext(om[1]) && blocks.length && !blocks.some((b) => b.hasQty) && /^0*1(\.|$)/.test(om[1])) {
      // numbering restarts and nothing so far had a quantity: what came before was a table of contents
      blocks.length = 0;
      lastOzParts = [];
      cur = null;
    }
    if (om && atOzX(l) && plausibleNext(om[1])) {
      let title = (om[2] || '').trim();
      const dotted = om[1].includes('.') || /^\.?\d+\.(\s|$)/.test(t) || t.startsWith('.');
      // a bare number followed by a unit is a quantity line, not an OZ ("4 St ....")
      const looksQty = !dotted && (!title || UNIT_TOKEN_RE.test(title.split(/\s+/)[0]) || /^[a-zäöü]/.test(title));
      if (!looksQty) {
        // An item that runs over a page break is printed again with its OZ and short text: continue it.
        const prevSame = blocks.length ? blocks.findLast((x) => x.oz === om[1]) : undefined;
        if (prevSame && !prevSame.sectionWord && title && prevSame.title === title && l.page > prevSame.page && !prevSame.hasQty) {
          cur = prevSame;
          continue;
        }
        const b: Block = { oz: om[1], title: '', text: [], page: l.page, qty: null, unit: null, up: null, total: null, noTotal: false, hasQty: false, sectionWord: false };
        const flagM = /^\*{2,}\s*(.*)$/.exec(title);
        if (flagM) {
          flagNext = flagM[1];
          title = '';
        }
        // table layout: quantity at the end of the same line
        const qt = QTY_TAIL_RE.exec(title);
        if (qt && normUnit(qt[3]) && (/,\d{3}$/.test(qt[2]) || (qt[4] || '').trim())) {
          title = qt[1];
          const rp = isRestPrice(qt[4]);
          b.qty = parsePrintedDeNumber(qt[2]);
          b.unit = qt[3];
          b.hasQty = true;
          b.up = rp.nums[0] ?? null;
          b.total = rp.nums[1] ?? null;
          b.noTotal = rp.noTotal;
        } else {
          const q0 = QTY_RE.exec(title);
          if (q0 && isRestPrice(q0[3]).ok && (normUnit(q0[2]) || isRestPrice(q0[3]).nums.length)) {
            const rp = isRestPrice(q0[3]);
            title = '';
            b.qty = parsePrintedDeNumber(q0[1]);
            b.unit = q0[2];
            b.hasQty = true;
            b.up = rp.nums[0] ?? null;
            b.total = rp.nums[1] ?? null;
          }
        }
        b.title = title;
        if (flagNext) {
          b.text.push('*** ' + flagNext);
          flagNext = '';
        }
        blocks.push(b);
        cur = b;
        lastOzParts = om[1].split('.').map(Number);
        continue;
      }
    }
    if (cur) {
      if (!cur.title && !cur.text.some((x) => !x.startsWith('***'))) cur.title = t;
      else cur.text.push(t);
    } else if (!blocks.length) pre.push(t);
  }

  // 4. classify blocks into sections / items / remarks
  const itemDepths = new Map<number, number>();
  for (const b of blocks) if (b.hasQty) itemDepths.set(b.oz.split('.').length, (itemDepths.get(b.oz.split('.').length) || 0) + 1);
  let itemDepth = 0;
  let bc = 0;
  for (const [d, c] of itemDepths) if (c > bc) [bc, itemDepth] = [c, d];

  const doc: LVDocument = {
    id: hash(fileName + lines.length + (lines[0]?.text || '') + (lines[lines.length - 1]?.text || '')),
    fileName,
    format: 'pdf',
    phase: null,
    project: {},
    currency: 'EUR',
    preamble: '',
    remarks: [],
    sections: [],
    items: [],
    warnings,
    priced: false,
  };

  const head = [...headerInfo, ...pre].join('\n');
  const pm = /(?:Projekt|Bauvorhaben|Baumaßnahme|Objekt)\s*:\s*(.+)/i.exec(head);
  if (pm) doc.project.label = pm[1].trim();
  const lm = /\bLV\s*:\s*(.+)/i.exec(head);
  if (lm) doc.project.name = lm[1].trim();
  if (/\bAngebot\b/i.test(head)) doc.phase = 84;
  else if (/\b(Anfrage|Ausschreibung|Leistungsverzeichnis)\b/i.test(head)) doc.phase = 83;
  doc.preamble = cleanText(pre.join('\n'));

  const secStack: LVSection[] = [];
  const hasChild = (i: number) => {
    const p = blocks[i].oz + '.';
    for (let j = i + 1; j < Math.min(blocks.length, i + 400); j++) if (blocks[j].oz.startsWith(p)) return true;
    return false;
  };
  let n = 0;
  blocks.forEach((b, i) => {
    const depth = b.oz.split('.').length;
    const isSection = !b.hasQty && (b.sectionWord || hasChild(i));
    while (secStack.length && !(b.oz.startsWith(secStack[secStack.length - 1].oz + '.') )) secStack.pop();
    if (isSection) {
      const sec: LVSection = { oz: b.oz, label: b.title, level: depth };
      doc.sections.push(sec);
      secStack.push(sec);
      if (b.text.length) doc.remarks.push({ sectionOz: b.oz, title: b.title, text: cleanText(b.text.join('\n')) });
      return;
    }
    const parent = secStack[secStack.length - 1];
    if (!b.hasQty && depth !== itemDepth) {
      doc.remarks.push({ sectionOz: parent?.oz || '', title: b.title, text: cleanText(b.text.join('\n')) });
      return;
    }
    if (!b.hasQty && /vorbemerk|hinweis|allgemein|ztv|technische/i.test(b.title)) {
      doc.remarks.push({ sectionOz: parent?.oz || '', title: b.title, text: cleanText(b.text.join('\n')) });
      return;
    }
    n++;
    const flagLines = b.text.filter((x) => x.startsWith('***'));
    const textLines = b.text.filter((x) => !x.startsWith('***'));
    const longText = cleanText(textLines.join('\n'));
    const headTxt = flagLines.join(' ') + ' ' + b.title;
    const flags: ItemFlags = {
      bedarf: /bedarfs|eventual/i.test(headTxt),
      wahl: /wahlpos|alternativ/i.test(headTxt),
      zulage: /^\s*(zulage|mehrpreis|aufpreis)\b/i.test(b.title),
      stundenlohn: /stundenlohn/i.test(b.title),
      pauschal: normUnit(b.unit) === 'psch',
      qtyTBD: false,
      noTotal: b.noTotal || /ohne\s+GB/i.test(headTxt),
      bidderFields: (longText.match(/['"„]\s?\.{6,}\s?['"“]/g) || []).length,
    };
    const item: LVItem = {
      id: `p${n}`,
      oz: b.oz,
      sectionOz: parent?.oz || '',
      sectionPath: secStack.map((s) => s.label),
      shortText: b.title || longText.split('\n')[0] || '',
      longText,
      qty: b.qty,
      unit: b.unit,
      unitNorm: normUnit(b.unit),
      up: b.up,
      total: b.total,
      flags,
      page: b.page,
      unitUnread: b.unitUnread || undefined,
    };
    doc.items.push(item);
  });

  // attach declared section totals
  for (const s of sums) {
    const m = /^(?:Bereich|Abschnitt|Titel|Los)?\s*(\d{1,4}(?:\.\d{1,4})*)\.?/i.exec(s.label);
    if (m) {
      const sec = doc.sections.find((x) => x.oz === m[1]);
      if (sec && sec.declaredTotal == null) sec.declaredTotal = s.value;
    } else if (/gesamt|angebot|netto/i.test(s.label) || !s.label) {
      if (doc.declaredTotal == null) doc.declaredTotal = s.value;
    }
  }
  doc.priced = doc.items.filter((i) => i.up != null && i.up > 0).length > doc.items.length * 0.3;
  if (!doc.items.length) warnings.push('Im PDF wurden keine Positionen erkannt (evtl. gescanntes Dokument ohne Textebene).');
  return doc;
}

export async function parsePdf(data: Uint8Array, fileName: string): Promise<LVDocument> {
  const lines = await pdfToLines(data);
  if (lines.length < 5) {
    // scanned PDF: no text layer, read it with local text recognition
    const { ocrAvailable, ocrLines } = await import('./ocr.ts');
    if (ocrAvailable()) {
      const r = ocrLines(data, fileName);
      const d = parseLvLines(r.lines, fileName, { ocr: true });
      d.ocr = { confidence: r.confidence, ...r.paper };
      const unread = d.items.filter((i) => i.unitUnread).length;
      if (unread) d.warnings.push(`${unread} Einheit(en) waren im Scan nicht lesbar – bitte prüfen.`);
      d.warnings.push('Gescanntes PDF: per Texterkennung gelesen – Mengen und Ordnungszahlen vor der Kalkulation prüfen.');
      return d;
    }
    const d = parseLvLines([], fileName);
    d.warnings.push('PDF enthält keine Textebene – Texterkennung ist auf diesem Rechner nicht verfügbar.');
    return d;
  }
  return parseLvLines(lines, fileName);
}

export async function parseImage(data: Uint8Array, fileName: string): Promise<LVDocument> {
  const { ocrLines } = await import('./ocr.ts');
  const r = ocrLines(data, fileName);
  const d = parseLvLines(r.lines, fileName, { ocr: true });
  d.format = 'image';
  const unread = d.items.filter((i) => i.unitUnread).length;
  if (unread) d.warnings.push(`${unread} Einheit(en) waren auf dem Foto nicht lesbar – bitte prüfen.`);
  d.ocr = { confidence: r.confidence, ...r.paper };
  d.warnings.push(d.items.length
    ? 'Aus einem Foto per Texterkennung gelesen – Mengen und Ordnungszahlen vor der Kalkulation prüfen.'
    : 'Auf dem Foto wurden keine Positionen erkannt. Tipp: Seite gerade und formatfüllend fotografieren, gutes Licht.');
  return d;
}
