// Shovel API server. Run with: node server/index.ts  (Node >= 23, no build step)
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Analysis, Lang, LVDocument } from '../src/core/types.ts';
import { parseFile } from '../src/core/parse/index.ts';
import { analyze, itemSurchargePct, itemValue } from '../src/core/engine.ts';
import { PriceBook } from '../src/core/prices.ts';
import { TRADES } from '../src/core/knowledge.ts';
import { enrichFromCompanion } from '../src/core/companion.ts';
import { questionsDocx, reportXlsx } from '../src/core/export/docs.ts';
import { writeGaebXml } from '../src/core/export/gaebxml.ts';
import { diffDocs, normOz, ozOverlap } from '../src/core/compare.ts';
import { PAGES_DIR } from '../src/core/parse/ocr.ts';
import { AI_MODEL, aiAvailable, loadAiCache, runAiReview, validateAi } from '../src/llm/review.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8787);
process.chdir(ROOT);

interface Entry {
  doc: LVDocument;
  role: 'lv' | 'history';
  year: number;
  addedAt: number;
}
const store = new Map<string, Entry>();
let book = new PriceBook();
let aiError: Record<string, string> = {};

function rebuildBook() {
  version++;
  book = new PriceBook();
  // price basis: explicit old projects plus every award file (DA 86) in the workspace; bids are not trusted as reference
  for (const e of store.values()) if (e.role === 'history' || (e.doc.priced && e.doc.phase === 86)) book.learn(e.doc, e.year);
}
const projectKey = (d: LVDocument) => (d.project.label || '').trim().toLowerCase();
const projectOf = (d: LVDocument) => [...store.values()].filter((e) => e.role === 'lv' && e.doc.id !== d.id && projectKey(e.doc) && projectKey(e.doc) === projectKey(d)).map((e) => e.doc);

// Analyses are memoised until the workspace changes (upload, delete, new AI result).
let version = 0;
// The memo is kept per document and language: the same findings (same ids) with German or English texts.
const langOf = (v: unknown): Lang => (v === 'en' ? 'en' : 'de');
const memo = new Map<string, { v: number; r: ReturnType<typeof analyseNow> }>();
function analyse(doc: LVDocument, lang: Lang = 'de') {
  const key = doc.id + '|' + lang;
  const m = memo.get(key);
  if (m && m.v === version) return m.r;
  const r = analyseNow(doc, lang);
  memo.set(key, { v: version, r });
  return r;
}
function analyseNow(raw: LVDocument, lang: Lang = 'de'): { doc: LVDocument; analysis: Analysis; ai: { state: 'cached' | 'none'; model?: string; kept: number; dropped: number; createdAt?: string } } {
  // a price-only bid file borrows its texts from the tender LV in the workspace
  const doc = enrichFromCompanion(raw, [...store.values()].filter((e) => e.role === 'lv').map((e) => e.doc));
  const cache = loadAiCache(doc);
  let extra: ReturnType<typeof validateAi>['drafts'] = [];
  let ai: { state: 'cached' | 'none'; model?: string; kept: number; dropped: number; createdAt?: string } = { state: 'none', kept: 0, dropped: 0 };
  if (cache) {
    const v = validateAi(doc, cache.findings);
    extra = v.drafts;
    ai = { state: 'cached', model: cache.model, kept: v.drafts.length, dropped: v.dropped, createdAt: cache.createdAt };
  }
  return { doc, analysis: analyze(doc, { priceBook: book, project: projectOf(doc), extra, lang }), ai };
}

// Uploaded files are kept on disk so a server restart does not lose the workspace.
const UP = join(ROOT, 'cache/uploads');
async function addFile(data: Uint8Array, name: string, role: 'lv' | 'history', persist = true): Promise<Entry> {
  const bytes = data.slice();
  const doc = await parseFile(data, name);
  if (persist) {
    mkdirSync(join(UP, role), { recursive: true });
    writeFileSync(join(UP, role, name.replace(/[\/\\]/g, '_')), bytes);
  }
  const year = Number(/(?:^|[_\-\s])(20[12]\d)(?:[_\-\s.]|$)/.exec(name)?.[1] || 2025);
  const e: Entry = { doc, role, year, addedAt: Date.now() };
  for (const [k, v] of store) if (v.doc.fileName === name) store.delete(k);
  store.set(doc.id, e);
  version++;
  if (role === 'history') rebuildBook();
  return e;
}

// Other files in the workspace that carry the same item numbers: the same LV in another format or version.
let twinsV = -1;
let twinsMap = new Map<string, { id: string; fileName: string; overlap: number }[]>();
function twinsOf(id: string) {
  if (twinsV !== version) {
    twinsV = version;
    twinsMap = new Map();
    const lv = [...store.values()].filter((e) => e.doc.items.length >= 5).map((e) => e.doc);
    for (let i = 0; i < lv.length; i++)
      for (let k = i + 1; k < lv.length; k++) {
        if (Math.min(lv[i].items.length, lv[k].items.length) / Math.max(lv[i].items.length, lv[k].items.length) < 0.6) continue;
        const o = ozOverlap(lv[i], lv[k]);
        if (o < 0.8) continue;
        // item numbers like 1, 2, 3 match by accident: the same item must also carry the same short text
        const mk = new Map(lv[k].items.map((it) => [normOz(it.oz), it]));
        const wordsOf = (t: string) => new Set(t.toLowerCase().match(/[a-zäöüß0-9]{3,}/g) || []);
        let cmp = 0, same = 0;
        for (const x of lv[i].items) {
          const y = mk.get(normOz(x.oz));
          if (!y || !x.shortText.trim() || !y.shortText.trim()) continue;
          const wa = wordsOf(x.shortText), wb = wordsOf(y.shortText);
          if (!wa.size || !wb.size) continue;
          let hit = 0;
          for (const w of wa) if (wb.has(w)) hit++;
          cmp++;
          if (hit / Math.min(wa.size, wb.size) >= 0.7) same++;
        }
        if (cmp >= 5 ? same / cmp < 0.75 : lv[i].items.length < 20) continue;
        (twinsMap.get(lv[i].id) || twinsMap.set(lv[i].id, []).get(lv[i].id)!).push({ id: lv[k].id, fileName: lv[k].fileName, overlap: o });
        (twinsMap.get(lv[k].id) || twinsMap.set(lv[k].id, []).get(lv[k].id)!).push({ id: lv[i].id, fileName: lv[i].fileName, overlap: o });
      }
  }
  return twinsMap.get(id) || [];
}

const summary = (e: Entry, lang: Lang = 'de') => {
  const { analysis, ai, doc: shown } = e.role === 'lv' ? analyse(e.doc, lang) : { analysis: null, ai: null, doc: e.doc };
  const d = shown;
  // doc.tradeLabel stays German; the overview shows the English trade name when asked for
  const tradeLabel = lang === 'en' ? TRADES.find((t) => t.key === d.trade)?.labelEn || d.tradeLabel : d.tradeLabel;
  return {
    textsFrom: d.textsFrom, textless: d.textless, ocr: d.ocr ? { confidence: d.ocr.confidence, pages: d.ocr.pages?.length || 0 } : undefined, twins: twinsOf(d.id), addedAt: e.addedAt,
    open: analysis ? { high: analysis.findings.filter((f) => f.severity === 3).map((f) => f.id), mid: analysis.findings.filter((f) => f.severity === 2).map((f) => f.id) } : undefined,
    // risk per item for the inbox risk map: one character 0..4 per item, in document order
    riskLevels: analysis ? d.items.map((i) => { const r = analysis.itemRisk[i.id] || 0; return r === 0 ? 0 : r < 25 ? 1 : r < 50 ? 2 : r < 75 ? 3 : 4; }).join('') : undefined,
    id: d.id, fileName: d.fileName, format: d.format, phase: d.phase, role: e.role, year: e.year, project: d.project, trade: tradeLabel || d.project.name, items: d.items.length, priced: d.priced, warnings: d.warnings,
    stats: analysis?.stats, findings: analysis?.findings.length, ai,
    top: analysis?.findings.slice(0, 3).map((f) => ({ title: f.title, oz: f.oz, severity: f.severity })),
    interfaces: analysis?.findings.filter((f) => f.ruleId === 'S-SCHNITTSTELLE' || (f.ruleId === 'L-FEHLT' && f.category === 'schnittstelle')).map((f) => ({ id: f.id, title: f.title, oz: f.oz, severity: f.severity, detail: f.detail })),
  };
};

const app = new Hono();

app.get('/api/state', (c) => {
  const lang = langOf(c.req.query('lang'));
  const docs = [...store.values()].sort((a, b) => a.doc.fileName.localeCompare(b.doc.fileName, 'de', { numeric: true })).map((e) => summary(e, lang));
  const own = book.refs.filter((r) => r.project !== 'Orientierungswert').length;
  const dataDir = join(ROOT, 'data');
  const loaded = new Set([...store.values()].map((e) => e.doc.fileName));
  const dataFiles = existsSync(dataDir) ? readdirSync(dataDir).filter((f) => /\.(x8\d|d8\d|pdf|xlsx|csv|jpe?g|png|heic|heif|tiff?|webp)$/i.test(f) && !loaded.has(f)).length : 0;
  return c.json({ dataFiles, docs, history: { refs: book.refs.length, own, seed: book.refs.length - own }, ai: { live: aiAvailable(), model: AI_MODEL } });
});

app.post('/api/upload', async (c) => {
  const form = await c.req.formData();
  const role = (form.get('role') as string) === 'history' ? 'history' : 'lv';
  const out: any[] = [];
  for (const f of form.getAll('files')) {
    if (typeof f === 'string') continue;
    try {
      const e = await addFile(new Uint8Array(await f.arrayBuffer()), f.name, role);
      // a priced award/bid uploaded as history is not analysed; a priced LV uploaded for review still feeds nothing
      out.push({ ok: true, id: e.doc.id, fileName: f.name, items: e.doc.items.length, warnings: e.doc.warnings });
    } catch (err) {
      out.push({ ok: false, fileName: f.name, error: (err as Error).message });
    }
  }
  return c.json({ results: out });
});

async function loadDir(dir: string, role: 'lv' | 'history', persist = true) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (!statSync(p).isFile() || !/\.(x8\d|d8\d|pdf|xlsx|csv|jpe?g|png|heic|heif|tiff?|webp)$/i.test(f)) continue;
    try {
      await addFile(new Uint8Array(readFileSync(p)), f, role, persist);
      n++;
    } catch (e) {
      console.warn('skip', f, (e as Error).message);
    }
  }
  return n;
}

// Adds the fictional demo project to the workspace (does not remove what is already loaded).
app.post('/api/demo', async (c) => {
  const h = await loadDir(join(ROOT, 'fixtures/history'), 'history');
  const n = await loadDir(join(ROOT, 'fixtures'), 'lv');
  rebuildBook();
  return c.json({ loaded: n, history: h });
});
// Loads every file from Shovel/data (the organisers' dataset, once the user has put it there).
app.post('/api/dataset', async (c) => {
  const n = await loadDir(join(ROOT, 'data'), 'lv');
  // priced files double as price history
  rebuildBook();
  return c.json({ loaded: n });
});
app.post('/api/reset', (c) => {
  store.clear();
  version++;
  rmSync(UP, { recursive: true, force: true });
  rebuildBook();
  return c.json({ ok: true });
});
app.delete('/api/doc/:id', (c) => {
  const e = store.get(c.req.param('id'));
  if (e) rmSync(join(UP, e.role, e.doc.fileName), { force: true });
  store.delete(c.req.param('id'));
  version++;
  if (e?.role === 'history') rebuildBook();
  return c.json({ ok: true });
});

app.get('/api/doc/:id', (c) => {
  const e = store.get(c.req.param('id'));
  if (!e) return c.json({ error: 'Dokument nicht gefunden' }, 404);
  const { analysis, ai, doc } = analyse(e.doc, langOf(c.req.query('lang')));
  const value: Record<string, number> = {};
  const surcharge: Record<string, number> = {};
  for (const it of doc.items) {
    value[it.id] = itemValue(it, analysis.prices);
    const s = itemSurchargePct(analysis.findings, it.id);
    if (s) surcharge[it.id] = s;
  }
  return c.json({ doc, analysis, value, surcharge, ai: { ...ai, live: aiAvailable(), error: aiError[e.doc.id] }, project: projectOf(e.doc).map((d) => ({ id: d.id, fileName: d.fileName })) });
});

// The page picture of a photographed or scanned document (for the marks on the real page).
app.get('/api/doc/:id/page/:n', (c) => {
  const e = store.get(c.req.param('id'));
  const key = e?.doc.ocr?.key;
  const file = key ? join(PAGES_DIR, key, `page-${Number(c.req.param('n')) || 1}.jpg`) : '';
  if (!file || !existsSync(file)) return c.json({ error: 'Seite nicht gefunden' }, 404);
  return new Response(readFileSync(file) as any, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'max-age=3600' } });
});

// What changed between two versions of one LV (a = older, b = newer).
app.get('/api/compare', (c) => {
  const ea = store.get(c.req.query('a') || ''), eb = store.get(c.req.query('b') || '');
  if (!ea || !eb) return c.json({ error: 'Dokument nicht gefunden' }, 404);
  const lang = langOf(c.req.query('lang'));
  const A = analyse(ea.doc, lang), B = analyse(eb.doc, lang);
  const d = diffDocs(A.doc, B.doc, (w, it) => itemValue(it, (w === 'a' ? A : B).analysis.prices));
  // findings of the newer version that sit on changed or new items: the review can start there
  const touched = new Set(d.changes.map((x) => x.idB).filter(Boolean) as string[]);
  const flagged: Record<string, { id: string; title: string; severity: number }[]> = {};
  for (const f of B.analysis.findings) for (const id of f.itemIds) if (touched.has(id)) (flagged[id] ||= []).push({ id: f.id, title: f.title, severity: f.severity });
  return c.json({ ...d, flagged, coverage: Math.min(A.analysis.stats.coverage, B.analysis.stats.coverage) });
});

app.post('/api/doc/:id/ai', async (c) => {
  const e = store.get(c.req.param('id'));
  if (!e) return c.json({ error: 'Dokument nicht gefunden' }, 404);
  if (!aiAvailable()) return c.json({ error: 'Keine KI-Zugangsdaten gefunden. ANTHROPIC_API_KEY setzen und Server neu starten.' }, 400);
  try {
    delete aiError[e.doc.id];
    const det = analyze(e.doc, { priceBook: book, project: projectOf(e.doc) }).findings;
    const raw = await runAiReview(analyse(e.doc).doc, { known: det.map((f) => ({ oz: f.oz, title: f.title })), project: projectOf(e.doc) });
    const v = validateAi(e.doc, raw);
    version++;
    return c.json({ ok: true, kept: v.drafts.length, dropped: v.dropped });
  } catch (err) {
    aiError[e.doc.id] = (err as Error).message;
    return c.json({ error: (err as Error).message }, 500);
  }
});

const safeName = (s: string) => s.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
app.post('/api/doc/:id/export/:kind', async (c) => {
  const e = store.get(c.req.param('id'));
  if (!e) return c.json({ error: 'Dokument nicht gefunden' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const decisions: Record<string, string> = body.decisions || {};
  const lang = langOf(body.lang);
  const { analysis, doc } = analyse(e.doc, lang);
  const kind = c.req.param('kind');
  const send = (buf: Uint8Array | Buffer | string, name: string, type: string) =>
    new Response(buf as any, { headers: { 'content-type': type, 'content-disposition': `attachment; filename="${name}"` } });
  if (kind === 'questions') {
    const chosen = analysis.findings.filter((f) => (decisions[f.id] ? decisions[f.id] === 'bieterfrage' : f.action === 'bieterfrage'));
    const edits: Record<string, string> = body.edits || {};
    for (const f of chosen) if (edits[f.id]) f.question = edits[f.id];
    return send(await questionsDocx(doc, chosen, body.sender), `Bieterfragen_${safeName(e.doc.fileName)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }
  if (kind === 'report') return send(await reportXlsx(doc, analysis, decisions, lang), `${lang === 'en' ? 'Review_report' : 'Pruefbericht'}_${safeName(e.doc.fileName)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (kind === 'x84') {
    const prices: Record<string, number> = {};
    for (const it of doc.items) {
      const p = analysis.prices[it.id];
      const base = it.up ?? p?.mid;
      if (base == null) continue;
      const s = decisions['surcharge'] === 'off' ? 0 : itemSurchargePct(analysis.findings.filter((f) => decisions[f.id] !== 'verworfen'), it.id);
      prices[it.id] = Math.round(base * (1 + s / 100) * 100) / 100;
    }
    return send(writeGaebXml(doc, 84, prices), `Angebotsentwurf_${safeName(e.doc.fileName)}.X84`, 'application/xml');
  }
  return c.json({ error: 'Unbekannter Export' }, 400);
});

if (existsSync(join(ROOT, 'dist/index.html'))) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', (c) => c.html(readFileSync(join(ROOT, 'dist/index.html'), 'utf8')));
}

await loadDir(join(UP, 'history'), 'history', false);
await loadDir(join(UP, 'lv'), 'lv', false);
rebuildBook();
serve({ fetch: app.fetch, port: PORT }, () => console.log(`Shovel läuft auf http://localhost:${PORT}  (KI live: ${aiAvailable() ? 'ja, ' + AI_MODEL : 'nein – nur gespeicherte KI-Befunde'})`));
