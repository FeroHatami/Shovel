// Shell. Three places, kept in the URL hash so reload and the back button work:
//   #/                      Home: drop a document, list of tenders
//   #/doc/<id>              Review: the document, marked up, with notes in the margin
//   #/doc/<id>/package      Bid package: letter, surcharges, change-order list, what-if, downloads
//   #/compare/<a>/<b>       What changed between two versions
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Decision, type DocPayload, type Finding, type State } from './api.ts';
import { useT } from './i18n.ts';
import { Home } from './Home.tsx';
import { Review } from './Review.tsx';
import { Package } from './Package.tsx';
import { Compare } from './Compare.tsx';

export type Decisions = Record<string, Decision>;
export type Edits = Record<string, string>;
export type Go = (hash: string) => void;

function useStored<T>(key: string, init: T): [T, (v: T) => void] {
  const read = () => {
    try {
      return (JSON.parse(localStorage.getItem(key) || 'null') ?? init) as T;
    } catch {
      return init;
    }
  };
  const [v, setV] = useState<T>(read);
  // eslint-disable-next-line
  useEffect(() => setV(read()), [key]);
  const set = useCallback((nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(key, JSON.stringify(nv));
    } catch {}
  }, [key]);
  return [v, set];
}
export const storedDecisions = (docId: string): Decisions => {
  try {
    return JSON.parse(localStorage.getItem('shovel-dec-' + docId) || 'null') || {};
  } catch {
    return {};
  }
};

// What Shovel recommends for a finding, and the choices offered on its note.
export const recOf = (f: Finding): Decision =>
  f.action === 'bieterfrage' && f.question ? 'bieterfrage' : f.action === 'zuschlag' && f.surchargePct ? 'zuschlag' : f.action === 'chance' && f.nachtrag ? 'chance' : 'ok';
export const optionsOf = (f: Finding): Decision[] => {
  const o: Decision[] = [recOf(f)];
  if (f.question) o.push('bieterfrage');
  if (f.surchargePct) o.push('zuschlag');
  if (f.nachtrag) o.push('chance');
  o.push('verworfen');
  return [...new Set(o)];
};

// Brand mark: a white shovel on the orange square.
export const Logo = () => (
  <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="15" fill="#ff6b1a" />
    <g transform="translate(32 32) rotate(38) scale(.84) translate(-32 -33)">
      <rect x="25" y="4" width="14" height="9.5" rx="4.75" fill="none" stroke="#fff" strokeWidth="4" />
      <path d="M32 13.5v22" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M19.5 36h25v8.5c0 8.5-5.8 13.8-12.5 17.5c-6.7-3.7-12.5-9-12.5-17.5z" fill="#fff" />
    </g>
  </svg>
);
export const LangSwitch = () => {
  const { lang, setLang } = useT();
  return (
    <div className="lang" role="group" aria-label="Sprache / Language">
      <button className={lang === 'de' ? 'on' : ''} onClick={() => setLang('de')}>DE</button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  );
};

type Route = { page: 'home' } | { page: 'doc'; id: string; sub: '' | 'package'; focus?: string } | { page: 'compare'; a: string; b: string };
const parse = (h: string): Route => {
  const [path, q] = h.replace(/^#\/?/, '').split('?');
  const p = path.split('/').filter(Boolean);
  if (p[0] === 'doc' && p[1]) return { page: 'doc', id: p[1], sub: p[2] === 'package' ? 'package' : '', focus: /focus=([\w-]+)/.exec(q || '')?.[1] };
  if (p[0] === 'compare' && p[1] && p[2]) return { page: 'compare', a: p[1], b: p[2] };
  return { page: 'home' };
};
const ACCEPT = '.x81,.x82,.x83,.x84,.x85,.x86,.d81,.d82,.d83,.d84,.d85,.d86,.p83,.p84,.pdf,.xlsx,.csv,.jpg,.jpeg,.png,.heic,.heif,.tif,.tiff,.webp';

export function App() {
  const { t, lang } = useT();
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [state, setState] = useState<State | null>(null);
  const [payload, setPayload] = useState<DocPayload | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const histRef = useRef<HTMLInputElement>(null);
  const docId = route.page === 'doc' ? route.id : '';
  const [decisions, setDecisions] = useStored<Decisions>('shovel-dec-' + (docId || 'none'), {});
  const [edits, setEdits] = useStored<Edits>('shovel-edit-' + (docId || 'none'), {});

  const go: Go = useCallback((h) => {
    if (location.hash === h) setRoute(parse(h));
    else location.hash = h;
  }, []);
  useEffect(() => {
    const on = () => { setRoute(parse(location.hash)); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const say = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((x) => (x === m ? '' : x)), 3800);
  }, []);
  const refresh = useCallback(() => api.state().then(setState).catch((e) => setErr(String(e.message || e))), []);
  useEffect(() => { refresh(); }, [refresh, lang]);
  useEffect(() => {
    if (!docId) { setPayload(null); return; }
    let live = true;
    setPayload((p) => (p && p.doc.id === docId ? p : null));
    api.doc(docId).then((p) => live && setPayload(p)).catch(() => live && (say(t('Dokument nicht gefunden', 'Document not found')), go('#/')));
    return () => { live = false; };
    // eslint-disable-next-line
  }, [docId, lang]);

  const upload = async (files: File[], role: 'lv' | 'history') => {
    if (!files.length) return;
    setBusy(role === 'history' ? 'history' : 'upload');
    try {
      const r = await api.upload(files, role);
      const ok = r.results.filter((x) => x.ok), bad = r.results.filter((x) => !x.ok);
      await refresh();
      if (bad.length) say(t(`${bad.length} Datei(en) nicht lesbar: ${bad[0].error}`, `${bad.length} file(s) could not be read: ${bad[0].error}`));
      else if (role === 'history') say(t(`${ok.length} Altprojekt(e) in die Preisbasis übernommen`, `${ok.length} past project(s) added to the price base`));
      else say(t(`${ok.length} Dokument(e) gelesen und geprüft`, `${ok.length} document(s) read and checked`));
      if (role === 'lv' && ok.length === 1 && ok[0].id) go('#/doc/' + ok[0].id);
    } catch (e) {
      say(t('Import fehlgeschlagen: ', 'Import failed: ') + (e as Error).message);
    }
    setBusy('');
  };
  const run = async (what: 'demo' | 'dataset' | 'reset') => {
    setBusy(what);
    try {
      await api[what]();
      await refresh();
    } catch (e) {
      say(String((e as Error).message));
    }
    setBusy('');
  };
  const runAi = async () => {
    if (!docId) return;
    setBusy('ai');
    try {
      const r = await api.ai(docId);
      setPayload(await api.doc(docId));
      await refresh();
      say(t(`KI-Prüfung fertig: ${r.kept} belegte Notizen, ${r.dropped} ohne wörtliches Zitat verworfen`, `AI check done: ${r.kept} notes with evidence, ${r.dropped} dropped for lack of a literal quote`));
    } catch (e) {
      say(t('KI-Prüfung fehlgeschlagen: ', 'AI check failed: ') + (e as Error).message);
    }
    setBusy('');
  };
  const remove = async (id: string) => {
    await api.remove(id);
    await refresh();
    if (docId === id) go('#/');
  };

  const summary = state?.docs.find((d) => d.id === docId);
  return (
    <div
      className={'app' + (over ? ' dragging' : '')}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); if (!over) setOver(true); } }}
      onDragLeave={(e) => { if (!e.relatedTarget) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files], 'lv'); }}
    >
      {err && <div className="fatal">{t('Server nicht erreichbar: ', 'Server not reachable: ')}{err}</div>}
      {route.page === 'home' && state && (
        <Home state={state} busy={busy} go={go} pickFiles={() => fileRef.current?.click()} pickPhoto={() => photoRef.current?.click()} pickHistory={() => histRef.current?.click()} remove={remove} run={run} />
      )}
      {route.page === 'doc' && (!payload || !summary ? <div className="loading"><span className="spin" /> {t('Dokument wird geprüft …', 'Checking the document …')}</div> : route.sub === 'package' ? (
        <Package p={payload} decisions={decisions} setDecisions={setDecisions} edits={edits} go={go} say={say} />
      ) : (
        <Review key={payload.doc.id} p={payload} summary={summary} state={state!} decisions={decisions} setDecisions={setDecisions} edits={edits} setEdits={setEdits} go={go} say={say} focusReq={route.focus} runAi={runAi} aiBusy={busy === 'ai'} />
      ))}
      {route.page === 'compare' && state && <Compare a={route.a} b={route.b} state={state} go={go} />}
      {over && <div className="dropveil"><div><b>{t('Loslassen zum Prüfen', 'Drop to check')}</b><span>{t('GAEB, PDF, Excel oder Foto', 'GAEB, PDF, Excel or a photo')}</span></div></div>}
      {busy === 'upload' && <div className="dropveil busy"><div><span className="spin big" /><b>{t('Wird gelesen und geprüft …', 'Reading and checking …')}</b></div></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
      <input ref={fileRef} type="file" multiple hidden accept={ACCEPT} onChange={(e) => { upload([...(e.target.files || [])], 'lv'); e.target.value = ''; }} />
      <input ref={photoRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { upload([...(e.target.files || [])], 'lv'); e.target.value = ''; }} />
      <input ref={histRef} type="file" multiple hidden accept={ACCEPT} onChange={(e) => { upload([...(e.target.files || [])], 'history'); e.target.value = ''; }} />
    </div>
  );
}
