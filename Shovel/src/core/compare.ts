// "What changed?" – compares two versions of the same bill of quantities (e.g. the tender and the
// revised tender the client sends before the deadline). Items are matched by their item number;
// reported are added and removed items, changed quantities, units, prices and texts, and the
// effect on the total. Deterministic: no model involved.
import type { LVDocument, LVItem } from './types.ts';

export type Tok = { t: '=' | '+' | '-'; s: string };
export interface ItemChange {
  kind: 'added' | 'removed' | 'changed';
  oz: string;
  section: string;
  shortText: string;
  idA?: string;
  idB?: string;
  qty?: [number | null, number | null];
  unit?: [string | null, string | null];
  up?: [number | null, number | null];
  short?: Tok[];
  long?: Tok[];
  /** only the text differs and the two files have different formats: may come from the print layout */
  soft?: boolean;
  /** effect on the total in EUR (0 when no price is known) */
  valueDelta: number;
}
export interface DocDiff {
  a: { id: string; fileName: string; items: number; format: string };
  b: { id: string; fileName: string; items: number; format: string };
  matched: number;
  identical: number;
  added: number;
  removed: number;
  qtyChanged: number;
  textChanged: number;
  /** text differences between files of different formats (not counted in textChanged) */
  softText: number;
  priceChanged: number;
  valueDelta: number;
  /** false when the two files share too few item numbers to be versions of one LV */
  comparable: boolean;
  sameFormat: boolean;
  changes: ItemChange[];
}

export const normOz = (oz: string) => oz.split('.').map((p) => p.trim().replace(/^0+(?=.)/, '')).join('.').replace(/\.$/, '');
// letters and digits only: line breaks, hyphenation and spacing of a print layout do not count as a change
// The organisers' files are anonymised, and each format writes the placeholders differently
// ("[PERSON_118]", "[PERSON_0118]", "PER000160", "###"): they never count as a change.
const clean = (s: string) => s.replace(/\[[A-ZÄÖÜ_]+_?\d+\]/g, ' ').replace(/\b[A-Z]{1,3}0\d{2,}\b/g, ' ').replace(/#{2,}/g, ' ');
const squash = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9äöüß]+/g, '');
const wkey = (w: string) => w.toLowerCase().replace(/[^a-z0-9äöüß,./]+/g, '');
const words = (s: string) => clean(s).replace(/\s+/g, ' ').trim().split(' ').filter((w) => wkey(w));

/** Word-level diff (longest common subsequence); long texts fall back to a common prefix/suffix cut. */
export function wordDiff(a: string, b: string): Tok[] {
  const A = words(a), B = words(b);
  let p = 0;
  while (p < A.length && p < B.length && wkey(A[p]) === wkey(B[p])) p++;
  let s = 0;
  while (s < A.length - p && s < B.length - p && wkey(A[A.length - 1 - s]) === wkey(B[B.length - 1 - s])) s++;
  const am = A.slice(p, A.length - s), bm = B.slice(p, B.length - s);
  const out: Tok[] = [];
  const push = (t: Tok['t'], w: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += ' ' + w;
    else out.push({ t, s: w });
  };
  for (const w of B.slice(0, p)) push('=', w);
  if (am.length * bm.length > 160000) {
    for (const w of am) push('-', w);
    for (const w of bm) push('+', w);
  } else {
    const n = am.length, m = bm.length;
    const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = wkey(am[i]) === wkey(bm[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (wkey(am[i]) === wkey(bm[j])) { push('=', bm[j]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) push('-', am[i++]);
      else push('+', bm[j++]);
    }
    while (i < n) push('-', am[i++]);
    while (j < m) push('+', bm[j++]);
  }
  for (const w of B.slice(B.length - s)) push('=', w);
  return out;
}

/** Share of item numbers two documents have in common (0..1, relative to the smaller one). */
export function ozOverlap(a: LVDocument, b: LVDocument): number {
  if (!a.items.length || !b.items.length) return 0;
  const sb = new Set(b.items.map((i) => normOz(i.oz)));
  let n = 0;
  for (const i of a.items) if (sb.has(normOz(i.oz))) n++;
  return n / Math.min(a.items.length, b.items.length);
}

const numEq = (x: number | null, y: number | null, eps: number) => x === y || (x != null && y != null && Math.abs(x - y) < eps);
const unitOf = (i: LVItem) => (i.unitNorm || i.unit || '').toLowerCase();

export function diffDocs(a: LVDocument, b: LVDocument, value: (doc: 'a' | 'b', it: LVItem) => number): DocDiff {
  const mb = new Map<string, LVItem>();
  for (const i of b.items) if (!mb.has(normOz(i.oz))) mb.set(normOz(i.oz), i);
  // texts are compared word for word only between two structured files of the same format;
  // prints (PDF, photo) differ in line breaks, page headers and footers
  const sameFormat = a.format === b.format && a.format !== 'pdf' && a.format !== 'image';
  const changes: ItemChange[] = [];
  let matched = 0, identical = 0, qtyChanged = 0, textChanged = 0, priceChanged = 0, softText = 0;
  const sec = (i: LVItem) => i.sectionPath[i.sectionPath.length - 1] || '';
  for (const x of a.items) {
    const y = mb.get(normOz(x.oz));
    if (!y) {
      changes.push({ kind: 'removed', oz: x.oz, section: sec(x), shortText: x.shortText, idA: x.id, qty: [x.qty, null], unit: [x.unit, null], valueDelta: -value('a', x) });
      continue;
    }
    mb.delete(normOz(x.oz));
    matched++;
    const c: ItemChange = { kind: 'changed', oz: y.oz, section: sec(y), shortText: y.shortText, idA: x.id, idB: y.id, valueDelta: 0 };
    let any = false;
    const unreadUnit = !!(x.unitUnread || y.unitUnread);
    if (!numEq(x.qty, y.qty, 0.0006)) { c.qty = [x.qty, y.qty]; c.unit = [x.unit, y.unit]; any = true; qtyChanged++; }
    else if (!unreadUnit && unitOf(x) !== unitOf(y)) { c.unit = [x.unit, y.unit]; c.qty = [x.qty, y.qty]; any = true; qtyChanged++; }
    if (x.up != null && y.up != null && !numEq(x.up, y.up, 0.006)) { c.up = [x.up, y.up]; any = true; priceChanged++; }
    let txt = false;
    if (sameFormat) {
      if (squash(x.shortText) !== squash(y.shortText)) { c.short = wordDiff(x.shortText, y.shortText); txt = true; }
      // a file without long texts (price-only bid) says nothing about a text change
      if (x.longText.trim() && y.longText.trim() && squash(x.longText) !== squash(y.longText)) { c.long = wordDiff(x.longText, y.longText); txt = true; }
    } else if (x.longText.trim() && y.longText.trim()) {
      // different formats split short and long text differently and a print adds page furniture:
      // compare the whole text, and accept one side being contained in the other
      const full = (i: LVItem) => (i.longText.includes(i.shortText.trim()) ? i.longText : i.shortText + ' ' + i.longText);
      const A = squash(full(x)), B = squash(full(y));
      const la = squash(x.longText), lb = squash(y.longText);
      const within = (p: string, q: string) => p.length >= 12 && q.includes(p);
      if (A !== B && !within(A, B) && !within(B, A) && !within(la, B) && !within(lb, A)) { c.long = wordDiff(full(x), full(y)); txt = true; c.soft = true; }
    }
    if (txt) { any = true; if (c.soft) softText++; else textChanged++; }
    if (c.soft && (c.qty || c.up)) c.soft = false;
    if (!any) { identical++; continue; }
    if (c.qty || c.up) c.valueDelta = value('b', y) - value('a', x);
    changes.push(c);
  }
  for (const y of mb.values()) changes.push({ kind: 'added', oz: y.oz, section: sec(y), shortText: y.shortText, idB: y.id, qty: [null, y.qty], unit: [null, y.unit], valueDelta: value('b', y) });
  const order = { added: 0, removed: 1, changed: 2 } as const;
  changes.sort((p, q) => order[p.kind] - order[q.kind] || Math.abs(q.valueDelta) - Math.abs(p.valueDelta) || p.oz.localeCompare(q.oz, 'de', { numeric: true }));
  const info = (d: LVDocument) => ({ id: d.id, fileName: d.fileName, items: d.items.length, format: d.format });
  return {
    a: info(a), b: info(b), matched, identical, qtyChanged, textChanged, softText, priceChanged, sameFormat,
    added: changes.filter((c) => c.kind === 'added').length,
    removed: changes.filter((c) => c.kind === 'removed').length,
    valueDelta: changes.reduce((s, c) => s + c.valueDelta, 0),
    comparable: matched / Math.max(1, Math.min(a.items.length, b.items.length)) >= 0.5,
    changes,
  };
}
