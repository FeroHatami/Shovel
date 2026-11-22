// Text helpers shared by parsers and rules.

export function parseDeNumber(s: string | null | undefined): number | null {
  if (s == null) return null;
  let t = String(s).trim().replace(/\s/g, '').replace(/[€]|EUR/gi, '');
  if (!t || !/\d/.test(t)) return null;
  const hasComma = t.includes(',');
  const hasDot = t.includes('.');
  if (hasComma && hasDot) {
    // the later separator is the decimal one
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (hasComma) {
    t = t.replace(',', '.');
  } else if (hasDot) {
    // "1.250" could be 1250 (thousands) or 1.25. GAEB XML uses dot decimals, so keep as decimal
    // unless there are several dots.
    if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// For printed German documents: dot is always a thousands separator.
export function parsePrintedDeNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function fmtEUR(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' €';
}
export function fmtNum(n: number | null | undefined, digits = 3): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function cleanText(s: string): string {
  return s
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The organisers' anonymiser replaces names (and sometimes ordinary words) with tokens
// such as [FIRMA_071] or [PERSON_125]. They must never be reported as errors.
export const PLACEHOLDER_RE = /\[(?:[A-ZÄÖÜ]+)(?:_\d+)?\]/g;
export function stripPlaceholders(s: string): string {
  return s.replace(PLACEHOLDER_RE, ' ');
}

export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

const STOP = new Set(
  'der die das den dem des ein eine einer eines einem einen und oder mit ohne fuer von vom zu zum zur im in an am auf aus bei bis als wie je nach ueber unter durch ist sind wird werden sowie inkl einschl einschliesslich bzw ca etc usw dgl incl sich nicht auch alle aller allen es'.split(
    ' ',
  ),
);

export function tokens(s: string): string[] {
  return fold(stripPlaceholders(s))
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => (t.length > 1 || /\d/.test(t)) && !STOP.has(t));
}

export function words(s: string): string[] {
  return stripPlaceholders(s).match(/[A-Za-zÄÖÜäöüß]{2,}/g) || [];
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// Damerau-Levenshtein with early exit.
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

export function snippet(text: string, index: number, len: number, pad = 40): string {
  const s = Math.max(0, index - pad);
  const e = Math.min(text.length, index + len + pad);
  return (s > 0 ? '…' : '') + text.slice(s, e).replace(/\s+/g, ' ').trim() + (e < text.length ? '…' : '');
}

export function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
