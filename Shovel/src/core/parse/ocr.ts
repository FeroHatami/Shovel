// Photos and scanned PDFs: text recognition with Apple Vision (tools/ocr.swift, compiled on first use
// into cache/bin/ocr). Runs locally; nothing leaves the machine. The recognised text lines are
// turned into the same line model the PDF parser uses, so the same item logic applies.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PLine } from './pdf.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const SRC = join(ROOT, 'tools/ocr.swift');
const BIN = join(ROOT, 'cache/bin/ocr');
/** Page pictures of photographed or scanned documents, kept so the interface can draw its marks on the real page. */
export const PAGES_DIR = join(ROOT, 'cache/pages');

interface OcrOut {
  key?: string;
  pages: { w: number; h: number }[];
  lines: { page: number; text: string; x: number; y: number; w: number; h: number; conf: number; angle?: number }[];
}

export function ocrAvailable(): boolean {
  return process.platform === 'darwin' && (existsSync(BIN) || existsSync(SRC));
}

function ensureBinary(): string {
  if (process.platform !== 'darwin') throw new Error('Texterkennung für Fotos ist nur auf macOS verfügbar.');
  if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
    mkdirSync(join(ROOT, 'cache/bin'), { recursive: true });
    execFileSync('swiftc', ['-O', SRC, '-o', BIN], { stdio: 'pipe' });
  }
  return BIN;
}

export function recognise(data: Uint8Array, fileName: string): OcrOut {
  const dir = mkdtempSync(join(tmpdir(), 'shovel-ocr-'));
  try {
    const ext = (/\.([A-Za-z0-9]+)$/.exec(fileName)?.[1] || 'jpg').toLowerCase();
    const file = join(dir, 'input.' + ext);
    writeFileSync(file, data);
    const png = join(dir, 'png');
    mkdirSync(png);
    const out = execFileSync(ensureBinary(), [file, '--png', png], { maxBuffer: 64 * 1024 * 1024 });
    const o = JSON.parse(out.toString('utf8')) as OcrOut;
    // keep a screen-sized JPEG of every page (the flattened photo), named by the content of the file
    try {
      const key = createHash('sha1').update(data).digest('hex').slice(0, 16);
      const dest = join(PAGES_DIR, key);
      mkdirSync(dest, { recursive: true });
      for (const f of readdirSync(png)) {
        const n = /page-(\d+)\.png$/.exec(f)?.[1];
        if (n) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '2000', join(png, f), '--out', join(dest, `page-${n}.jpg`)], { stdio: 'pipe' });
      }
      o.key = key;
    } catch {}
    return o;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Vision returns text pieces; pieces on the same visual line are joined left to right. Coordinates are
// mapped to an A4-like point system (595 pt wide, y up) so the PDF parser's spacing rules still hold.
// Superscripts are misread: m² as "mz", "mг", "m?", m³ as "m=". Only repaired right after a number.
function fixUnits(s: string): string {
  return s
    .replace(/(\d)(\s+)m[zZг?"²](?=\s|$)/g, '$1$2m2')
    .replace(/(\d)(\s+)m[=³](?=\s|$)/g, '$1$2m3');
}

export function toLines(o: OcrOut): PLine[] {
  const lines: PLine[] = [];
  o.pages.forEach((pg, pi) => {
    const page = pi + 1;
    const scale = 595 / pg.w;
    const H = pg.h * scale;
    const raw = o.lines.filter((l) => l.page === page && l.text.trim());
    // A tilted photo puts words of one line at different heights. Undo the median tilt of the longer lines.
    const angles = raw.filter((l) => l.w > 0.15 && l.angle != null).map((l) => l.angle!).sort((a, b) => a - b);
    const tilt = angles.length >= 3 ? (angles[angles.length >> 1] * Math.PI) / 180 : 0;
    const cos = Math.cos(-tilt), sin = Math.sin(-tilt);
    const frags = raw
      .map((l) => {
        const x = l.x * 595, w = l.w * 595, h = l.h * H, yc = (l.y + l.h / 2) * H;
        // rotate the left end of the piece back to horizontal
        return { x: x * cos - yc * sin, w, yc: x * sin + yc * cos, h, s: l.text.trim() };
      })
      .sort((a, b) => b.yc - a.yc || a.x - b.x);
    let cur: typeof frags = [];
    const flush = () => {
      if (!cur.length) return;
      cur.sort((a, b) => a.x - b.x);
      let text = '';
      let end = cur[0].x;
      for (const f of cur) {
        const gap = f.x - end;
        if (text) text += gap > 14 ? '   ' : ' ';
        text += f.s;
        end = f.x + f.w;
      }
      lines.push({ page, x: cur[0].x, y: cur[0].yc, text: fixUnits(text) });
      cur = [];
    };
    for (const f of frags) {
      if (cur.length && Math.abs(cur[0].yc - f.yc) > Math.max(2.5, 0.55 * Math.min(cur[0].h, f.h))) flush();
      cur.push(f);
    }
    flush();
  });
  return lines;
}

export interface OcrPages {
  key?: string;
  pages: { w: number; h: number }[];
  /** recognised text pieces with their place on the page: fractions of the page, origin top-left */
  boxes: { page: number; x: number; y: number; w: number; h: number; text: string }[];
}
export function ocrLines(data: Uint8Array, fileName: string): { lines: PLine[]; confidence: number; paper: OcrPages } {
  const o = recognise(data, fileName);
  const conf = o.lines.length ? o.lines.reduce((a, l) => a + l.conf, 0) / o.lines.length : 0;
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const boxes = o.lines.filter((l) => l.text.trim()).map((l) => ({ page: l.page, x: r4(l.x), y: r4(1 - l.y - l.h), w: r4(l.w), h: r4(l.h), text: l.text.trim() }));
  return { lines: toLines(o), confidence: conf, paper: { key: o.key, pages: o.pages, boxes } };
}
