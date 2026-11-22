// GAEB 90 (D81..D86): fixed-width 80-column records. Layout per "Das Freie GAEB Buch" (BVBS)
// and cross-checked against open-source parsers:
//   cols 1-2 Satzart, 3-74 payload, 75-80 record number
//   00: 11-12 phase, 63-71 OZ mask          11/31: group start/end (OZ 3-11)   12: group label
//   21: OZ 3-11, flags 12-14, Menge 24-34 (8,3), Einheit 35-38
//   22/23: OZ 3-11, EP 13-23 (11 digits, 3 decimals), GB 25-36 (10,2)
//   25: Kurztext 3-72   26: Langtext 3-74   20: Hinweistext start   T1: Vorbemerkung
//   32: group total 13-24   99: net total 3-14
import iconv from 'iconv-lite';
import type { LVDocument, LVItem, LVSection } from '../types.ts';
import { cleanText, hash } from '../text.ts';
import { normUnit } from '../units.ts';

export function decodeGaeb90(data: Uint8Array): string {
  // UTF-8 if valid and contains multi-byte umlauts, otherwise CP850 (DOS) unless typical CP1252 bytes dominate.
  const buf = Buffer.from(data);
  const utf = buf.toString('utf8');
  if (!utf.includes('�') && /[äöüÄÖÜß]/.test(utf)) return utf;
  let dos = 0;
  let win = 0;
  for (const b of buf) {
    if (b === 0x84 || b === 0x94 || b === 0x81 || b === 0x8e || b === 0x99 || b === 0x9a || b === 0xe1) dos++;
    if (b === 0xe4 || b === 0xf6 || b === 0xfc || b === 0xc4 || b === 0xd6 || b === 0xdc || b === 0xdf) win++;
  }
  return iconv.decode(buf, win > dos ? 'win1252' : 'cp850');
}

const fixed = (s: string, digits: number, decimals: number): number | null => {
  const t = s.replace(/\s/g, '');
  if (!t || !/^-?\d+$/.test(t)) return null;
  return Number(t) / 10 ** decimals;
};

function splitOz(raw: string, mask: string): string[] {
  // mask like "1122PPPPI": runs of equal chars form the parts
  const parts: string[] = [];
  let i = 0;
  const m = mask.padEnd(9, ' ');
  while (i < 9) {
    const c = m[i];
    let j = i;
    while (j < 9 && m[j] === c) j++;
    if (c !== ' ' && c !== '0') {
      const seg = raw.slice(i, j).trim();
      if (c === 'I') {
        if (seg) parts[parts.length - 1] += seg;
      } else if (seg) parts.push(seg);
    }
    i = j;
  }
  return parts;
}

export function parseGaeb90(text: string, fileName: string): LVDocument {
  const lines = text.replace(/\x1a/g, '').split(/\r?\n/).filter((l) => l.length >= 2);
  const warnings: string[] = [];
  const doc: LVDocument = {
    id: hash(fileName + text.length + text.slice(0, 2000)),
    fileName,
    format: 'gaeb-90',
    phase: null,
    version: '90',
    project: {},
    currency: 'EUR',
    preamble: '',
    remarks: [],
    sections: [],
    items: [],
    warnings,
    priced: false,
  };
  let mask = '1122PPPPI';
  const pre: string[] = [];
  const secStack: LVSection[] = [];
  const byOz = new Map<string, LVItem>();
  let cur: LVItem | null = null;
  let hint: { text: string[] } | null = null;
  let pendingHint = '';
  let groupLabelFor: LVSection | null = null;
  let n = 0;
  const longBuf = new Map<LVItem, string[]>();
  const shortBuf = new Map<LVItem, string[]>();

  const closeHint = () => {
    if (hint && hint.text.length) {
      const t = cleanText(hint.text.join('\n'));
      doc.remarks.push({ sectionOz: secStack[secStack.length - 1]?.oz || '', title: t.split('\n')[0].slice(0, 80), text: t });
      pendingHint = t;
    }
    hint = null;
  };

  for (const raw of lines) {
    const line = raw.padEnd(80, ' ');
    const sa = line.slice(0, 2);
    const payload = line.slice(2, 74);
    switch (sa) {
      case '00': {
        const dp = parseInt(line.slice(10, 12), 10);
        if (dp >= 81 && dp <= 86) doc.phase = dp;
        const m = line.slice(62, 71);
        if (/[1-4P]/.test(m)) mask = m;
        break;
      }
      case '01':
        doc.project.name = line.slice(2, 42).trim() || undefined;
        break;
      case '02':
        doc.project.label = [doc.project.label, payload.trim()].filter(Boolean).join(' ');
        break;
      case '03':
        doc.project.client = [doc.project.client, payload.trim()].filter(Boolean).join(' ');
        break;
      case '08': {
        const c = line.slice(2, 8).trim();
        if (c) doc.currency = /^eur/i.test(c) ? 'EUR' : c;
        break;
      }
      case 'T1':
        pre.push(payload.replace(/\s+$/, ''));
        break;
      case '11': {
        closeHint();
        cur = null;
        const parts = splitOz(line.slice(2, 11), mask);
        const oz = parts.join('.');
        while (secStack.length && !oz.startsWith(secStack[secStack.length - 1].oz + '.')) secStack.pop();
        const sec: LVSection = { oz, label: '', level: parts.length };
        doc.sections.push(sec);
        secStack.push(sec);
        groupLabelFor = sec;
        break;
      }
      case '12':
        if (groupLabelFor) groupLabelFor.label = (groupLabelFor.label + ' ' + payload.trim()).trim();
        break;
      case '20':
        closeHint();
        cur = null;
        hint = { text: [] };
        break;
      case '21': {
        closeHint();
        groupLabelFor = null;
        n++;
        const parts = splitOz(line.slice(2, 11), mask);
        const oz = parts.join('.') || String(n);
        const a1 = line[11];
        const a2 = line[12];
        const unit = line.slice(34, 38).trim() || null;
        const qty = fixed(line.slice(23, 34), 11, 3);
        const item: LVItem = {
          id: `g${n}`,
          oz,
          sectionOz: secStack[secStack.length - 1]?.oz || '',
          sectionPath: secStack.map((s) => s.label),
          shortText: '',
          longText: '',
          qty,
          unit,
          unitNorm: normUnit(unit),
          up: null,
          total: null,
          flags: {
            bedarf: a2 === 'E' || a2 === 'M',
            wahl: a1 === 'A',
            zulage: false,
            stundenlohn: a1 === 'S',
            pauschal: normUnit(unit) === 'psch',
            qtyTBD: line.slice(23, 34).trim() === '',
            noTotal: a2 === 'E',
            bidderFields: 0,
          },
          context: pendingHint || undefined,
        };
        pendingHint = '';
        doc.items.push(item);
        byOz.set(line.slice(2, 11), item);
        cur = item;
        break;
      }
      case '22':
      case '23': {
        const target = byOz.get(line.slice(2, 11)) || cur;
        const up = fixed(line.slice(12, 23).replace(/ $/, '0'), 11, 3);
        const gb = fixed(line.slice(24, 36), 12, 2);
        if (target) {
          if (up != null) target.up = up;
          if (gb != null) target.total = gb;
        } else if (up != null) {
          // price-only bid file (D84 without 21 records)
          n++;
          const parts = splitOz(line.slice(2, 11), mask);
          const item: LVItem = {
            id: `g${n}`, oz: parts.join('.'), sectionOz: '', sectionPath: [], shortText: '', longText: '', qty: null, unit: null, unitNorm: null,
            up, total: gb, flags: { bedarf: false, wahl: false, zulage: false, stundenlohn: false, pauschal: false, qtyTBD: false, noTotal: false, bidderFields: 0 },
          };
          doc.items.push(item);
          byOz.set(line.slice(2, 11), item);
        }
        break;
      }
      case '25':
        if (hint) hint.text.push(payload.trimEnd());
        else if (cur) (shortBuf.get(cur) || shortBuf.set(cur, []).get(cur)!).push(line.slice(2, 72).trim());
        break;
      case '26':
        // cols 3-5 are a text marker (blank, or e.g. "31A" for bidder text complements); text starts at col 6
        if (hint) hint.text.push(line.slice(5, 74).trimEnd());
        else if (cur) (longBuf.get(cur) || longBuf.set(cur, []).get(cur)!).push(line.slice(5, 74).trimEnd());
        break;
      case '31':
        closeHint();
        cur = null;
        if (secStack.length) secStack.pop();
        break;
      case '32': {
        const parts = splitOz(line.slice(2, 11), mask);
        const sec = doc.sections.find((s) => s.oz === parts.join('.'));
        const v = fixed(line.slice(12, 24), 12, 2);
        if (sec && v != null) sec.declaredTotal = v;
        break;
      }
      case '99': {
        const v = fixed(line.slice(2, 14), 12, 2);
        if (v != null && v > 0) doc.declaredTotal = v;
        break;
      }
      default:
        break;
    }
  }
  closeHint();
  for (const it of doc.items) {
    const s = shortBuf.get(it) || [];
    const l = longBuf.get(it) || [];
    it.shortText = s.join(' ').replace(/\s+/g, ' ').trim();
    // Langtext lines are hard-wrapped at 55 chars; rejoin words split with a trailing hyphen is risky, keep line breaks.
    it.longText = cleanText(l.join('\n'));
    if (!it.shortText) it.shortText = it.longText.split('\n')[0]?.slice(0, 90) || '';
    const head = it.shortText + ' ' + it.longText.slice(0, 160);
    if (/\b(bedarfs|eventual)position/i.test(head)) it.flags.bedarf = true;
    if (/\b(wahl|alternativ)position/i.test(head)) it.flags.wahl = true;
    if (/^\s*(zulage|mehrpreis|aufpreis)\b/i.test(it.shortText)) it.flags.zulage = true;
    if (/stundenlohn/i.test(it.shortText)) it.flags.stundenlohn = true;
    it.flags.bidderFields = (it.longText.match(/['"„]\s?\.{6,}\s?['"“]/g) || []).length;
  }
  doc.preamble = cleanText(pre.join('\n'));
  doc.priced = doc.items.filter((i) => i.up != null && i.up > 0).length > doc.items.length * 0.3;
  if (!doc.items.length) warnings.push('Keine Positionssätze (Satzart 21) gefunden.');
  return doc;
}

// ---- writer (used for fixtures and for exporting a priced bid as D84) ----
function num(v: number | null | undefined, digits: number, decimals: number): string {
  if (v == null) return ' '.repeat(digits);
  return String(Math.round(v * 10 ** decimals)).padStart(digits, '0').slice(-digits);
}
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      if (!w) continue;
      if ((line + ' ' + w).trim().length > width) {
        if (line) out.push(line);
        line = w.slice(0, width);
      } else line = (line + ' ' + w).trim();
    }
    out.push(line);
  }
  return out;
}

export function writeGaeb90(doc: LVDocument, phase = doc.phase || 83): Uint8Array {
  // Mask: two levels of 2 digits + 4-digit item + index.
  const mask = '1122PPPPI';
  const recs: string[] = [];
  const rec = (sa: string, payload: string) => recs.push((sa + payload).padEnd(74, ' ').slice(0, 74));
  const ozRaw = (oz: string, isItem: boolean): string => {
    const m = /^(.*?)([A-Za-z]?)$/.exec(oz)!;
    const p = m[1].split('.').filter(Boolean);
    const idx = m[2] || ' ';
    if (isItem) {
      const it = p.pop() || '0';
      const l1 = (p[0] || '').padStart(2, '0').slice(-2);
      const l2 = p[1] != null ? p[1].padStart(2, '0').slice(-2) : '  ';
      return (p.length ? l1 : '  ') + l2 + it.padStart(4, '0').slice(-4) + idx;
    }
    const l1 = (p[0] || '').padStart(2, '0').slice(-2);
    const l2 = p[1] != null ? p[1].padStart(2, '0').slice(-2) : '  ';
    return (l1 + l2).padEnd(9, ' ');
  };
  if (doc.preamble) {
    rec('T0', '');
    for (const l of wrap(doc.preamble, 72)) rec('T1', l);
    rec('T9', '');
  }
  rec('00', ' '.repeat(8) + String(phase) + 'L' + ' '.repeat(49) + mask + '90');
  rec('01', (doc.project.name || doc.fileName).slice(0, 40).padEnd(40, ' ') + '20.11.26');
  if (doc.project.label) rec('02', doc.project.label.slice(0, 72));
  if (doc.project.client) rec('03', doc.project.client.slice(0, 72));
  rec('08', 'EUR   Euro');
  const open: string[] = [];
  const closeTo = (oz: string) => {
    while (open.length && !(oz + '.').startsWith(open[open.length - 1] + '.')) {
      const o = open.pop()!;
      rec('31', ozRaw(o, false));
      const dt = doc.sections.find((s) => s.oz === o)?.declaredTotal;
      if (phase >= 84 && dt != null) rec('32', ozRaw(o, false) + ' ' + num(dt, 12, 2));
    }
  };
  const emitted = new Set<string>();
  const remarksBySec = new Map<string, string[]>();
  for (const r of doc.remarks) (remarksBySec.get(r.sectionOz) || remarksBySec.set(r.sectionOz, []).get(r.sectionOz)!).push(r.text);
  const openSection = (oz: string) => {
    const parts = oz.split('.');
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('.');
      if (emitted.has(p)) continue;
      closeTo(p);
      emitted.add(p);
      open.push(p);
      rec('11', ozRaw(p, false) + 'N');
      rec('12', (doc.sections.find((s) => s.oz === p)?.label || '').slice(0, 72));
      for (const t of remarksBySec.get(p) || []) {
        rec('20', '');
        for (const l of wrap(t, 55)) rec('26', '   ' + l);
      }
    }
  };
  for (const it of doc.items) {
    if (it.sectionOz) openSection(it.sectionOz);
    const flags = (it.flags.wahl ? 'A' : 'N') + (it.flags.bedarf ? (it.flags.noTotal ? 'E' : 'M') : 'N') + 'N';
    rec('21', ozRaw(it.oz, true) + flags + ' '.repeat(9) + num(it.qty, 11, 3) + (it.unit || '').padEnd(4, ' ').slice(0, 4));
    if (phase >= 84 && it.up != null) rec('23', ozRaw(it.oz, true) + ' ' + num(it.up, 11, 3) + ' ' + num(it.total ?? (it.qty ?? 0) * it.up, 12, 2));
    for (const l of wrap(it.shortText, 70)) rec('25', l);
    for (const l of wrap(it.longText, 55)) rec('26', '   ' + l);
  }
  closeTo('~');
  const total = doc.items.reduce((s, i) => s + (i.total ?? (i.up != null && i.qty != null ? i.up * i.qty : 0)), 0);
  rec('99', (phase >= 84 ? num(total, 12, 2) : ' '.repeat(12)) + ' '.repeat(55) + String(doc.items.length).padStart(5, '0'));
  const text = recs.map((r, i) => r + String(i + 1).padStart(6, '0')).join('\r\n') + '\r\n';
  return new Uint8Array(iconv.encode(text, 'cp850'));
}
