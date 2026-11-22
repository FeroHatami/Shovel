import type { Analysis, Finding, LVDocument } from '../../src/core/types.ts';
import type { DocDiff, ItemChange, Tok } from '../../src/core/compare.ts';
export type { DocDiff, ItemChange, Tok };
export interface Diff extends DocDiff { flagged: Record<string, { id: string; title: string; severity: number }[]>; coverage: number }

export interface DocSummary {
  id: string; fileName: string; format: string; phase: number | null; role: 'lv' | 'history'; year: number;
  project: LVDocument['project']; trade?: string; items: number; priced: boolean; warnings: string[];
  stats?: Analysis['stats']; findings?: number; textsFrom?: string; textless?: boolean;
  ai?: { state: 'cached' | 'none'; model?: string; kept: number; dropped: number } | null;
  top?: { title: string; oz: string; severity: number }[];
  interfaces?: { id: string; title: string; oz: string; severity: number; detail: string }[];
  /** One character '0'..'4' per item in document order (0 = no finding, 4 = most at stake). */
  riskLevels?: string;
  /** Set for documents read by text recognition (photos, scans). */
  ocr?: { confidence: number; pages: number };
  /** Other files with the same item numbers: the same LV in another format or version. */
  twins?: { id: string; fileName: string; overlap: number }[];
  addedAt?: number;
  /** Ids of the findings that need a decision: high and medium severity. */
  open?: { high: string[]; mid: string[] };
}
export interface State {
  dataFiles: number;
  docs: DocSummary[];
  history: { refs: number; own: number; seed: number };
  ai: { live: boolean; model: string };
}
export interface DocPayload {
  doc: LVDocument; analysis: Analysis; value: Record<string, number>; surcharge: Record<string, number>;
  ai: { state: 'cached' | 'none'; model?: string; kept: number; dropped: number; createdAt?: string; live: boolean; error?: string };
  project: { id: string; fileName: string }[];
}
export type { Finding };

// Current UI language; set by the i18n layer. The backend may ignore it (then findings stay German).
let apiLang: 'de' | 'en' = 'de';
export const setApiLang = (l: 'de' | 'en') => {
  apiLang = l;
};
const j = async (r: Response) => {
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
};
export const api = {
  state: (): Promise<State> => fetch('/api/state?lang=' + apiLang).then(j),
  demo: () => fetch('/api/demo', { method: 'POST' }).then(j),
  dataset: () => fetch('/api/dataset', { method: 'POST' }).then(j),
  reset: () => fetch('/api/reset', { method: 'POST' }).then(j),
  doc: (id: string): Promise<DocPayload> => fetch('/api/doc/' + id + '?lang=' + apiLang).then(j),
  compare: (a: string, b: string): Promise<Diff> => fetch(`/api/compare?a=${a}&b=${b}&lang=${apiLang}`).then(j),
  remove: (id: string) => fetch('/api/doc/' + id, { method: 'DELETE' }).then(j),
  ai: (id: string) => fetch(`/api/doc/${id}/ai`, { method: 'POST' }).then(j),
  upload: (files: File[], role: 'lv' | 'history') => {
    const fd = new FormData();
    fd.set('role', role);
    for (const f of files) fd.append('files', f);
    return fetch('/api/upload', { method: 'POST', body: fd }).then(j) as Promise<{ results: { ok: boolean; id?: string; fileName: string; error?: string; items?: number }[] }>;
  },
  exportFile: async (id: string, kind: 'questions' | 'report' | 'x84', body: Record<string, unknown>) => {
    const r = await fetch(`/api/doc/${id}/export/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, lang: apiLang }) });
    if (!r.ok) throw new Error(apiLang === 'en' ? 'Export failed' : 'Export fehlgeschlagen');
    const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || 'export';
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
  },
};

export const eur = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €');
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const num = (n: number | null | undefined, d = 3) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: d }));

export const CAT: Record<string, string> = { fehler: 'Fehler', unklar: 'Unklare Beschreibung', widerspruch: 'Widerspruch', luecke: 'Fehlende Leistung', menge: 'Menge', preis: 'Preis', vertrag: 'Vertragsrisiko', schnittstelle: 'Schnittstelle', bieter: 'Bieterangabe' };
export const SEV = ['', 'niedrig', 'mittel', 'hoch'];
export const SRC: Record<string, string> = { regel: 'Regel', statistik: 'Statistik', ki: 'KI' };
export type Decision = 'bieterfrage' | 'zuschlag' | 'chance' | 'ok' | 'verworfen';
export const DEC: Record<Decision, string> = { bieterfrage: 'Bieterfrage', zuschlag: 'Einpreisen', chance: 'Als Nachtragschance merken', ok: 'Zur Kenntnis', verworfen: 'Verwerfen' };
