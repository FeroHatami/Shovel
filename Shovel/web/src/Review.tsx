// Review: the bill of quantities as a document, marked up. Problems are underlined in the text,
// each one has a note in the margin, and every note is settled with one click.
// Photographed or scanned pages are shown as the real page with the marks drawn on it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { eur, num, type Decision, type DocPayload, type DocSummary, type Finding, type State } from './api.ts';
import type { LVItem } from '../../src/core/types.ts';
import { useT } from './i18n.ts';
import { Highlight } from './Findings.tsx';
import { LangSwitch, optionsOf, recOf, type Decisions, type Edits, type Go } from './App.tsx';
import { Badge, kindOf } from './Home.tsx';

interface Props {
  p: DocPayload; summary: DocSummary; state: State;
  decisions: Decisions; setDecisions: (d: Decisions) => void;
  edits: Edits; setEdits: (e: Edits) => void;
  go: Go; say: (m: string) => void; focusReq?: string;
  runAi: () => void; aiBusy: boolean;
}
const needs = (f: Finding) => f.severity >= 2;

/** Long texts are shown as the passages around the marked words; a click on the row shows everything. */
function Excerpt({ text, quotes, full }: { text: string; quotes: string[]; full: boolean }) {
  const { t } = useT();
  if (full || text.length <= 560) return <Highlight text={text} quotes={quotes} />;
  const win: [number, number][] = [];
  for (const q0 of quotes) {
    const q = q0.replace(/^…|…$/g, '').trim();
    if (q.length < 3) continue;
    const m = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i').exec(text);
    if (m) win.push([Math.max(0, m.index - 150), Math.min(text.length, m.index + m[0].length + 150)]);
  }
  if (!win.length) win.push([0, 340]);
  win.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const w of win) { const l = merged[merged.length - 1]; if (l && w[0] <= l[1] + 40) l[1] = Math.max(l[1], w[1]); else merged.push([...w]); }
  // cut at word boundaries
  const cut = merged.map(([a, b]) => [a === 0 ? 0 : text.indexOf(' ', a) + 1 || a, b >= text.length ? text.length : text.lastIndexOf(' ', b) > a ? text.lastIndexOf(' ', b) : b] as [number, number]);
  return (
    <>
      {cut.map(([a, b], i) => <span key={i}>{a > 0 && <i className="gapdots">… </i>}<Highlight text={text.slice(a, b)} quotes={quotes} />{i === cut.length - 1 && b < text.length && <i className="gapdots"> …</i>}{i < cut.length - 1 && ' '}</span>)}
      <span className="fulltext">{t('ganzen Text zeigen', 'show full text')} ▾</span>
    </>
  );
}
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '');

export function Review({ p, summary, state, decisions, setDecisions, edits, setEdits, go, say, focusReq, runAi, aiBusy }: Props) {
  const { t, pl, cat, lang } = useT();
  const { doc, analysis } = p;
  const st = analysis.stats;
  const money = st.coverage >= 0.6;
  const hasPaper = !!doc.ocr?.key && !!doc.ocr.pages?.length;
  const [view, setView] = useState<'paper' | 'text'>(hasPaper ? 'paper' : 'text');
  const [whole, setWhole] = useState(doc.items.length <= 60);
  const [unfold, setUnfold] = useState<Set<number>>(new Set());
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [why, setWhy] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState('');
  const [focus, setFocus] = useState('');
  const [preOpen, setPreOpen] = useState(false);

  const model = useMemo(() => {
    const byId = new Map(doc.items.map((i) => [i.id, i]));
    const byOz = new Map(doc.items.map((i) => [i.oz, i]));
    const primary = (f: Finding) => byId.get(f.itemIds[0]) || (f.oz ? byOz.get(f.oz) : undefined);
    const notes = new Map<string, Finding[]>();
    const quotes = new Map<string, string[]>();
    const general: Finding[] = [];
    for (const f of analysis.findings) {
      const it = primary(f);
      if (!it) general.push(f);
      else (notes.get(it.id) || notes.set(it.id, []).get(it.id)!).push(f);
      for (const e of f.evidence) {
        if (e.where === 'vorbemerkung' || e.where === 'hinweis' || e.where === 'feld') continue;
        const id = e.itemId || it?.id;
        if (id) (quotes.get(id) || quotes.set(id, []).get(id)!).push(e.quote);
      }
    }
    const sev = (a: Finding, b: Finding) => b.severity - a.severity || b.score - a.score;
    for (const l of notes.values()) l.sort(sev);
    general.sort(sev);
    // a document-level note that quotes a remark inside the LV is shown next to that remark
    const remarkNotes = new Map<number, Finding[]>();
    const rsq = doc.remarks.map((r) => squash(r.title + ' ' + r.text));
    const top: Finding[] = [];
    for (const f of general) {
      const q = squash((f.evidence.find((e) => e.where === 'vorbemerkung')?.quote || '').replace(/…/g, '')).slice(0, 60);
      const ri = q.length >= 12 ? rsq.findIndex((x) => x.includes(q)) : -1;
      if (ri >= 0) (remarkNotes.get(ri) || remarkNotes.set(ri, []).get(ri)!).push(f);
      else top.push(f);
    }
    general.length = 0;
    general.push(...top);
    // remarks sit in front of the first item of their section
    const remarkAt = new Map<string, number[]>();
    const loose: number[] = [];
    doc.remarks.forEach((r, ri) => {
      const it = doc.items.find((i) => i.sectionOz === r.sectionOz) || doc.items.find((i) => r.sectionOz && i.sectionOz.startsWith(r.sectionOz));
      if (it) (remarkAt.get(it.id) || remarkAt.set(it.id, []).get(it.id)!).push(ri);
      else loose.push(ri);
    });
    const order = [...general, ...loose.flatMap((ri) => remarkNotes.get(ri) || []), ...doc.items.flatMap((i) => [...(remarkAt.get(i.id) || []).flatMap((ri) => remarkNotes.get(ri) || []), ...(notes.get(i.id) || [])])];
    const number = new Map(order.map((f, i) => [f.id, i + 1]));
    const preQuotes = analysis.findings.flatMap((f) => f.evidence.filter((e) => e.where === 'vorbemerkung').map((e) => e.quote));
    return { byId, primary, notes, quotes, general, order, number, preQuotes, remarkNotes, remarkAt, loose };
  }, [doc, analysis]);

  const todo = model.order.filter(needs);
  const open = todo.filter((f) => !decisions[f.id]);
  const openHigh = open.filter((f) => f.severity === 3).length;
  const atStake = open.reduce((s, f) => s + (f.exposure || 0), 0);
  const nQuestions = analysis.findings.filter((f) => f.question && (decisions[f.id] ? decisions[f.id] === 'bieterfrage' : f.action === 'bieterfrage')).length;

  const focusOn = (id: string, scroll = true) => {
    setFocus(id);
    if (scroll) requestAnimationFrame(() => document.querySelector(`[data-fid="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };
  const next = (dir = 1, from = focus) => {
    if (!open.length) return;
    const pos = model.order.findIndex((f) => f.id === from);
    const list = dir > 0 ? model.order : [...model.order].reverse();
    const start = pos < 0 ? 0 : dir > 0 ? pos + 1 : model.order.length - pos;
    const f = [...list.slice(start), ...list.slice(0, start)].find((x) => needs(x) && !decisions[x.id] && x.id !== from);
    if (f) focusOn(f.id);
  };
  const decide = (f: Finding, d: Decision) => {
    const nd = { ...decisions };
    if (nd[f.id] === d) delete nd[f.id];
    else nd[f.id] = d;
    setDecisions(nd);
    setEditing('');
    if (nd[f.id] && needs(f)) {
      const pos = model.order.findIndex((x) => x.id === f.id);
      const nx = [...model.order.slice(pos + 1), ...model.order.slice(0, pos)].find((x) => needs(x) && !nd[x.id]);
      if (nx) setTimeout(() => focusOn(nx.id), 260);
      else say(t('Alles entschieden. Ihr Angebotspaket ist bereit.', 'All decided. Your bid package is ready.'));
    }
  };

  useEffect(() => {
    if (focusReq && model.order.some((f) => f.id === focusReq)) { setOpenNotes((s) => new Set(s).add(focusReq)); setTimeout(() => focusOn(focusReq), 150); }
    // eslint-disable-next-line
  }, [focusReq]);
  const keyRef = useRef({ focus, decisions, open });
  keyRef.current = { focus, decisions, open };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const f = model.order.find((x) => x.id === keyRef.current.focus);
      const k = e.key.toLowerCase();
      if (k === 'arrowdown' || k === 'j') { e.preventDefault(); next(1); }
      else if (k === 'arrowup' || k === 'k') { e.preventDefault(); next(-1); }
      else if (f) {
        const opts = optionsOf(f);
        const d: Decision | undefined = k === 'enter' ? recOf(f) : k === 'f' ? 'bieterfrage' : k === 'e' ? 'zuschlag' : k === 'n' ? 'chance' : k === 'x' ? 'verworfen' : undefined;
        if (d && opts.includes(d)) { e.preventDefault(); decide(f, d); }
      }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
    // eslint-disable-next-line
  }, [model, decisions]);

  const label = (d: Decision, f: Finding) =>
    d === 'bieterfrage' ? t('Auftraggeber fragen', 'Ask the client')
    : d === 'zuschlag' ? t(`Einpreisen +${f.surchargePct} %`, `Price in +${f.surchargePct} %`)
    : d === 'chance' ? t('Als Nachtragschance merken', 'Keep as change-order chance')
    : d === 'verworfen' ? t('Kein Thema', 'Not an issue')
    : f.action === 'korrektur' ? t('Wird korrigiert', 'Will fix it') : t('Zur Kenntnis', 'Noted');
  const done = (d: Decision, f: Finding) =>
    d === 'bieterfrage' ? t('Frage steht im Brief', 'Question is in the letter')
    : d === 'zuschlag' ? t(`Eingepreist, +${f.surchargePct} %`, `Priced in, +${f.surchargePct} %`)
    : d === 'chance' ? t('Als Nachtragschance gemerkt', 'Kept as change-order chance')
    : d === 'verworfen' ? t('Kein Thema', 'Not an issue')
    : f.action === 'korrektur' ? t('Wird korrigiert', 'Will be fixed') : t('Zur Kenntnis genommen', 'Noted');
  const keyOf: Partial<Record<Decision, string>> = { bieterfrage: 'F', zuschlag: 'E', chance: 'N', verworfen: 'X' };

  const note = (f: Finding, withNo = false) => {
    const d = decisions[f.id];
    const on = focus === f.id;
    const no = withNo ? <i className={'no s' + f.severity}>{model.number.get(f.id)}</i> : null;
    if (d)
      return (
        <div key={f.id} data-fid={f.id} className={'note done' + (on ? ' on' : '') + (d === 'verworfen' ? ' rej' : '')} onClick={() => setFocus(f.id)}>
          {no}<span className="chk">{d === 'verworfen' ? '–' : '✓'}</span>
          <span className="n-t1">{f.title}</span>
          <span className="n-dn">{done(d, f)}</span>
          <button className="link" onClick={(e) => { e.stopPropagation(); decide(f, d); }}>{t('ändern', 'undo')}</button>
        </div>
      );
    if (!needs(f) && !openNotes.has(f.id))
      return (
        <button key={f.id} data-fid={f.id} className={'note minor' + (on ? ' on' : '')} onClick={() => { setOpenNotes(new Set(openNotes).add(f.id)); setFocus(f.id); }}>
          {no}<span className="dot s1" /><span className="n-t1">{f.title}</span>
        </button>
      );
    const its = f.itemIds.map((id) => model.byId.get(id)).filter(Boolean) as LVItem[];
    const rec = recOf(f);
    const extra = f.evidence.filter((e) => e.where === 'vorbemerkung' || e.where === 'hinweis' || (e.itemId && e.itemId !== its[0]?.id)).slice(0, 2);
    const showQ = !!f.question && rec === 'bieterfrage';
    return (
      <div key={f.id} data-fid={f.id} className={`note s${f.severity}` + (on ? ' on' : '')} onClick={() => setFocus(f.id)}>
        <div className="n-h">
          {no}<span className={'dot s' + f.severity} />
          <span className="cat">{cat(f.category)}</span>
          {f.source === 'ki' && <span className="tag" title={t('Von der KI gefunden; das Zitat wurde wörtlich im Dokument geprüft', 'Found by the AI; the quote was verified word for word in the document')}>{t('KI', 'AI')}</span>}
          {f.aiConfirmed && <span className="tag" title={f.aiConfirmed}>{t('KI bestätigt', 'AI agrees')}</span>}
          {money && f.exposure > 0 && <span className="eur" title={t('Geschätzter Betrag, um den es geht', 'Estimated amount at stake')}>≈ {eur(f.exposure)}</span>}
        </div>
        <b className="n-t">{f.title}</b>
        <p className="n-d">{f.detail}</p>
        {its.length > 1 && <p className="n-also">{t('Betrifft auch: ', 'Also affects: ')}{its.slice(1, 7).map((i) => i.oz).join(', ')}{its.length > 7 ? ` +${its.length - 7}` : ''}</p>}
        {extra.map((e, i) => <blockquote key={i} lang="de"><small>{e.where === 'vorbemerkung' ? t('Vorbemerkung', 'Preliminary remarks') : e.where === 'hinweis' ? t('Anderes LV', 'Other document') : t('Pos. ', 'Item ') + (e.oz || '')}</small>{e.quote}</blockquote>)}
        {showQ && (
          <div className="n-q" lang="de" onClick={(e) => e.stopPropagation()}>
            <small>{t('Frage an den Auftraggeber (Entwurf)', 'Question to the client (draft, stays German)')}</small>
            {editing === f.id
              ? <textarea autoFocus defaultValue={edits[f.id] ?? f.question} rows={4} onBlur={(e) => { const v = e.target.value.trim(); const ne = { ...edits }; if (v && v !== f.question) ne[f.id] = v; else delete ne[f.id]; setEdits(ne); setEditing(''); }} />
              : <p onClick={() => setEditing(f.id)} title={t('Klicken zum Bearbeiten', 'Click to edit')}>{edits[f.id] ?? f.question}</p>}
          </div>
        )}
        {why.has(f.id) && (
          <div className="n-why">
            {f.basis && <p><b>{t('Grundlage', 'Basis')}</b> {f.basis}</p>}
            {f.nachtrag && <p><b>{f.nachtrag.direction === 'chance' ? t('Nachtragschance', 'Change-order chance') : t('Nachtragsrisiko', 'Change-order risk')} · {f.nachtrag.basis}</b> {f.nachtrag.note}</p>}
            {f.aiConfirmed && <p><b>{t('KI', 'AI')}</b> {f.aiConfirmed}</p>}
            <p className="muted">{f.source === 'regel' ? t('Feste Regel', 'Fixed rule') : f.source === 'statistik' ? t('Preis- und Mengenvergleich', 'Price and quantity comparison') : t('KI, Zitat geprüft', 'AI, quote verified')} · {t('Sicherheit', 'confidence')} {Math.round(f.confidence * 100)} %</p>
          </div>
        )}
        <div className="n-b">
          {optionsOf(f).map((o) => (
            <button key={o} className={'dbtn' + (o === rec ? ' rec' : '') + (o === 'verworfen' ? ' quiet' : '')} data-decide={o} onClick={(e) => { e.stopPropagation(); decide(f, o); }}>
              {label(o, f)}{on && keyOf[o] && <kbd>{keyOf[o]}</kbd>}
            </button>
          ))}
          <button className="link why" onClick={(e) => { e.stopPropagation(); const s = new Set(why); if (s.has(f.id)) s.delete(f.id); else s.add(f.id); setWhy(s); }}>{why.has(f.id) ? t('weniger', 'less') : t('Warum?', 'Why?')}</button>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------- the typed document
  const rows = useMemo(() => {
    type Row = { k: 'sec'; oz: string; label: string; open: number } | { k: 'item'; it: LVItem } | { k: 'fold'; at: number; n: number; from: string; to: string } | { k: 'remark'; ri: number };
    const out: Row[] = [];
    let last = '';
    let run: LVItem[] = [];
    const flush = () => {
      if (!run.length) return;
      const at = doc.items.indexOf(run[0]);
      if (whole || run.length < 3 || unfold.has(at)) for (const it of run) out.push({ k: 'item', it });
      else out.push({ k: 'fold', at, n: run.length, from: run[0].oz, to: run[run.length - 1].oz });
      run = [];
    };
    for (const ri of model.loose) if (whole || model.remarkNotes.has(ri)) out.push({ k: 'remark', ri });
    for (const it of doc.items) {
      const path = it.sectionPath.join(' › ');
      if (path !== last) {
        flush();
        last = path;
        if (path) out.push({ k: 'sec', oz: it.sectionOz, label: path, open: 0 });
      }
      for (const ri of model.remarkAt.get(it.id) || []) if (whole || model.remarkNotes.has(ri)) { flush(); out.push({ k: 'remark', ri }); }
      if (model.notes.has(it.id)) { flush(); out.push({ k: 'item', it }); }
      else run.push(it);
    }
    flush();
    return out;
  }, [doc, model, whole, unfold]);

  const sections = useMemo(() => {
    const m = new Map<string, { label: string; oz: string; open: number; all: number; first: string }>();
    for (const it of doc.items) {
      const label = it.sectionPath[0] || '';
      if (!label) continue;
      const s = m.get(label) || m.set(label, { label, oz: it.oz.split('.')[0], open: 0, all: 0, first: it.id }).get(label)!;
      for (const f of model.notes.get(it.id) || []) if (needs(f)) { s.all++; if (!decisions[f.id]) s.open++; }
    }
    return [...m.values()];
  }, [doc, model, decisions]);

  const itemRow = (it: LVItem) => {
    const ns = model.notes.get(it.id) || [];
    const hot = ns.some((f) => needs(f) && !decisions[f.id]);
    const sevMax = ns.filter((f) => !decisions[f.id]).reduce((m, f) => Math.max(m, f.severity), 0);
    const showLong = (hot || openItems.has(it.id) || ns.some((f) => f.id === focus)) && it.longText.trim() && it.longText.trim() !== it.shortText.trim();
    const qs = model.quotes.get(it.id) || [];
    const val = p.value[it.id];
    const flags = [it.flags.bedarf && t('Bedarfsposition', 'Contingency item'), it.flags.wahl && t('Wahlposition', 'Alternative item'), it.flags.stundenlohn && t('Stundenlohn', 'Hourly work'), it.flags.zulage && t('Zulage', 'Add-on')].filter(Boolean) as string[];
    const toggle = () => { const s = new Set(openItems); if (s.has(it.id)) s.delete(it.id); else s.add(it.id); setOpenItems(s); };
    return (
      <div className={'it' + (ns.length ? ' marked' : '')} key={it.id} id={'it-' + it.id}>
        <div className={'it-p sev' + sevMax} onClick={toggle}>
          <div className="it-h">
            <span className="oz">{it.oz}</span>
            <span className="st"><Highlight text={it.shortText || t('(ohne Kurztext)', '(no short text)')} quotes={qs} />{flags.map((f) => <em key={f}>{f}</em>)}</span>
            <span className="qty">{it.qty == null ? '–' : num(it.qty)} {it.unitUnread ? '?' : it.unit || ''}</span>
            <span className="val">{it.up != null ? eur(it.up, 2) : ''}{it.up != null && val ? <small>{eur(val)}</small> : it.up == null && val && money ? <small>≈ {eur(val)}</small> : null}</span>
          </div>
          {showLong && <div className="lt" lang="de"><Excerpt text={it.longText} quotes={qs} full={openItems.has(it.id)} /></div>}
        </div>
        <div className="it-m">{ns.map((f) => note(f))}</div>
      </div>
    );
  };

  const remarkRow = (ri: number) => {
    const r = doc.remarks[ri];
    const ns = model.remarkNotes.get(ri) || [];
    const hot = ns.some((f) => !decisions[f.id] && needs(f)) || ns.some((f) => f.id === focus);
    const key = 'r' + ri;
    const openR = hot || openItems.has(key);
    const sevMax = ns.filter((f) => !decisions[f.id]).reduce((m, f) => Math.max(m, f.severity), 0);
    return (
      <div className={'it rem' + (ns.length ? ' marked' : '')} key={key}>
        <div className={'it-p sev' + sevMax} onClick={() => { const s2 = new Set(openItems); if (s2.has(key)) s2.delete(key); else s2.add(key); setOpenItems(s2); }}>
          <div className="it-h"><span className="oz">{t('Hinweis', 'Remark')}</span><span className="st">{r.title || t('Hinweistext', 'Remark text')}</span><span className="qty" /><span className="val" /></div>
          <div className={'lt' + (openR ? '' : ' clamp')} lang="de">{openR ? <Excerpt text={r.text} quotes={ns.flatMap((f) => f.evidence.map((e) => e.quote))} full={openItems.has(key)} /> : r.text.slice(0, 300)}</div>
        </div>
        <div className="it-m">{ns.map((f) => note(f))}</div>
      </div>
    );
  };

  // ---------------------------------------------------------------- the photographed page
  const marks = useMemo(() => {
    if (!hasPaper) return [];
    const boxes = doc.ocr!.boxes || [];
    const starts = doc.items.map((it) => ({ it, b: boxes.find((b) => { const x = b.text.trim(); return x === it.oz || x === it.oz + '.' || x.startsWith(it.oz + ' ') || x.startsWith(it.oz + '. '); }) })).filter((x) => x.b) as { it: LVItem; b: (typeof boxes)[number] }[];
    const out: { f: Finding; page: number; x: number; y: number; w: number; h: number; slot: number }[] = [];
    const used = new Map<string, number>();
    for (const f of model.order) {
      const it = model.primary(f);
      const s = it && starts.find((x) => x.it.id === it.id);
      if (!s) continue;
      const nextY = Math.min(1, ...starts.filter((x) => x.b.page === s.b.page && x.b.y > s.b.y + 0.004).map((x) => x.b.y));
      const band = boxes.filter((b) => b.page === s.b.page && b.y >= s.b.y - 0.004 && b.y < nextY - 0.004);
      let hit: typeof boxes = [];
      for (const e of f.evidence) {
        const q = squash(e.quote);
        if (q.length < 4 || e.where === 'feld') continue;
        for (const b of band) { const nb = squash(b.text); if ((nb.length >= 6 && q.includes(nb)) || (q.length >= 6 && nb.includes(q))) hit.push(b); }
      }
      if (!hit.length) hit = band.filter((b) => Math.abs(b.y - s.b.y) < s.b.h * 0.8);
      const x0 = Math.min(...hit.map((b) => b.x)), y0 = Math.min(...hit.map((b) => b.y)), x1 = Math.max(...hit.map((b) => b.x + b.w)), y1 = Math.max(...hit.map((b) => b.y + b.h));
      const key = s.b.page + ':' + Math.round(y0 * 200);
      const slot = used.get(key) || 0;
      used.set(key, slot + 1);
      out.push({ f, page: s.b.page, x: x0, y: y0, w: x1 - x0, h: y1 - y0, slot });
    }
    return out;
  }, [doc, model, hasPaper]);

  const twins = (summary.twins || []).map((x) => state.docs.find((d) => d.id === x.id)).filter(Boolean) as DocSummary[];
  const older = (a: DocSummary) => (a.addedAt || 0) <= (summary.addedAt || 0);
  const src = { regel: 0, statistik: 0, ki: 0 } as Record<string, number>;
  for (const f of analysis.findings) src[f.source]++;

  return (
    <div className="rv">
      <header className="rv-top">
        <button className="back" onClick={() => go('#/')}>← {t('Dokumente', 'Documents')}</button>
        <div className="rv-title"><Badge name={doc.fileName} /><div><b title={doc.fileName}>{doc.fileName}</b><small>{kindOf(doc, t)} · {pl(doc.items.length, 'Position', 'Positionen', 'item', 'items')}{doc.project.label ? ' · ' + doc.project.label.replace(/\s+/g, ' ') : ''}</small></div></div>
        <div className="rv-prog" title={t('Entschiedene Punkte', 'Points decided')}>
          <div className="pbar"><span style={{ width: (todo.length ? ((todo.length - open.length) / todo.length) * 100 : 100) + '%' }} /></div>
          <span>{todo.length - open.length} / {todo.length} {t('entschieden', 'decided')}</span>
        </div>
        <LangSwitch />
        <button className="btn pri" data-go="package" onClick={() => go(`#/doc/${doc.id}/package`)}>{t('Angebotspaket', 'Bid package')}{nQuestions > 0 && <i className="pill">{nQuestions}</i>} →</button>
      </header>

      <div className="rv-body">
        <aside className="rail">
          {doc.textless ? (
            <div className="verdict"><b className="vb">{t('Nicht prüfbar', 'Cannot be checked')}</b><p>{t('Diese Datei enthält nur Preise. Legen Sie das zugehörige LV dazu, dann prüft Shovel beides zusammen.', 'This file holds prices only. Add the matching tender and Shovel checks both together.')}</p></div>
          ) : open.length ? (
            <div className="verdict">
              <b className="vn">{open.length}</b>
              <b className="vb">{pl(open.length, 'Punkt zu entscheiden', 'Punkte zu entscheiden', 'point to decide', 'points to decide').replace(/^\d+ /, '')}</b>
              <p>{openHigh > 0 && <button className="sevjump" onClick={() => { const f = open.find((x) => x.severity === 3 && x.id !== focus) || open.find((x) => x.severity === 3); if (f) focusOn(f.id); }} title={t('Zum nächsten kritischen Punkt', 'Jump to the next critical point')}><span className="dot s3" /> {pl(openHigh, 'kritisch', 'kritisch', 'critical', 'critical')}</button>}{open.length - openHigh > 0 && <span><span className="dot s2" /> {open.length - openHigh} {t('prüfenswert', 'worth a look')}</span>}</p>
              {money && atStake > 0 && <p className="stake">≈ {eur(atStake)} {t('stehen auf dem Spiel', 'at stake')}</p>}
              <button className="btn pri wide" data-next onClick={() => next(1)}>{focus ? t('Nächster offener Punkt', 'Next open point') : t('Durchgehen starten', 'Start the review')} ↓</button>
            </div>
          ) : (
            <div className="verdict ok">
              <b className="vn">✓</b>
              <b className="vb">{todo.length ? t('Alles entschieden', 'All decided') : t('Nichts Wesentliches gefunden', 'Nothing significant found')}</b>
              <p>{t('Brief, Zuschläge und Angebotsentwurf liegen im Angebotspaket.', 'Letter, surcharges and bid draft are in the bid package.')}</p>
              <button className="btn pri wide" onClick={() => go(`#/doc/${doc.id}/package`)}>{t('Zum Angebotspaket', 'Open the bid package')} →</button>
            </div>
          )}
          {hasPaper && (
            <div className="seg" role="group">
              <button className={view === 'paper' ? 'on' : ''} onClick={() => setView('paper')}>{t('Ihr Foto', 'Your photo')}</button>
              <button className={view === 'text' ? 'on' : ''} onClick={() => setView('text')}>{t('Gelesener Text', 'Text as read')}</button>
            </div>
          )}
          {view === 'text' && doc.items.length > 12 && (
            <div className="seg" role="group">
              <button className={!whole ? 'on' : ''} onClick={() => setWhole(false)}>{t('Nur Markiertes', 'Marked only')}</button>
              <button className={whole ? 'on' : ''} onClick={() => setWhole(true)}>{t('Ganzes LV', 'Whole document')}</button>
            </div>
          )}
          {view === 'text' && sections.length > 1 && (
            <nav className="outline" aria-label={t('Abschnitte', 'Sections')}>
              {sections.map((s) => (
                <button key={s.label} onClick={() => document.getElementById('it-' + s.first)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
                  <span className="oz">{s.oz}</span><span className="ol">{s.label}</span>{s.open > 0 ? <i className="cnt">{s.open}</i> : s.all > 0 ? <i className="cnt ok">✓</i> : null}
                </button>
              ))}
            </nav>
          )}
          <div className="legend">
            <p><span className="dot s3" /> {t('kritisch', 'critical')} <span className="dot s2" /> {t('prüfenswert', 'worth a look')} <span className="dot s1" /> {t('Hinweis', 'minor')}</p>
            <p>{t(`${doc.items.length} Positionen in ${analysis.durationMs} ms geprüft: ${src.regel} Notizen aus festen Regeln, ${src.statistik} aus Preisvergleich, ${src.ki} von der KI.`, `${doc.items.length} items checked in ${analysis.durationMs} ms: ${src.regel} notes from fixed rules, ${src.statistik} from price comparison, ${src.ki} from the AI.`)}</p>
            {p.ai.live && <p><button className="btn sm" onClick={runAi} disabled={aiBusy} title={t('Zweite Prüfung durch ein KI-Modell; es bleiben nur Notizen, die das Dokument wörtlich zitieren', 'Second review by an AI model; only notes that quote the document word for word are kept')}>{aiBusy && <span className="spin" />}{p.ai.state === 'cached' ? t('KI-Prüfung erneuern', 'Re-run AI check') : t('KI-Prüfung starten', 'Run AI check')}</button></p>}
            <p className="keys"><kbd>↓</kbd><kbd>↑</kbd> {t('weiter', 'move')} · <kbd>↵</kbd> {t('Vorschlag annehmen', 'accept suggestion')} · <kbd>X</kbd> {t('kein Thema', 'not an issue')}</p>
          </div>
        </aside>

        <main className="sheet-col">
          {doc.textsFrom && <div className="banner">{t('Preisdatei ohne eigene Texte: Texte stammen aus ', 'Price file without texts of its own: texts were taken from ')}<b>{doc.textsFrom}</b>.</div>}
          {doc.warnings.slice(0, 2).map((w, i) => <div className="banner warn" key={i} lang="de">{w}</div>)}
          {twins.length > 0 && (
            <div className="banner twin">
              <span>↔ {t('Dieses LV liegt auch in anderen Dateien vor. Vergleichen mit:', 'This document also exists in other files. Compare with:')}</span>
              <span className="twinbtns">{twins.slice(0, 4).map((d) => <button key={d.id} className="btn sm" data-compare title={d.fileName} onClick={() => go(older(d) ? `#/compare/${d.id}/${doc.id}` : `#/compare/${doc.id}/${d.id}`)}>{d.fileName.length > 30 ? d.fileName.slice(0, 28) + '…' : d.fileName}</button>)}</span>
            </div>
          )}

          {view === 'paper' && hasPaper ? (
            <div className="photo-grid">
              <div className="pages">
                {doc.ocr!.pages!.map((pg, i) => (
                  <div className="page" key={i} style={{ aspectRatio: `${pg.w} / ${pg.h}` }}>
                    <img src={`/api/doc/${doc.id}/page/${i + 1}`} alt={t(`Seite ${i + 1}`, `Page ${i + 1}`)} loading={i ? 'lazy' : 'eager'} />
                    {marks.filter((m) => m.page === i + 1).map((m) => {
                      const d = decisions[m.f.id];
                      if (d === 'verworfen') return null;
                      const padX = 0.012, padY = 0.006;
                      return (
                        <button key={m.f.id} className={`mk s${m.f.severity}` + (focus === m.f.id ? ' on' : '') + (d ? ' done' : '') + (needs(m.f) ? '' : ' minor')} data-mark={m.f.id}
                          style={{ left: (m.x - padX) * 100 + '%', top: (m.y - padY) * 100 + '%', width: (m.w + 2 * padX) * 100 + '%', height: (m.h + 2 * padY) * 100 + '%' }}
                          onClick={() => { setOpenNotes(new Set(openNotes).add(m.f.id)); focusOn(m.f.id); }} title={m.f.title}>
                          <i style={{ left: `calc(${-26 - m.slot * 24}px)` }}>{model.number.get(m.f.id)}</i>
                        </button>
                      );
                    })}
                  </div>
                ))}
                <p className="muted small">{t(`Texterkennung auf diesem Rechner, Sicherheit ${Math.round((doc.ocr!.confidence || 0) * 100)} %. Die Markierungen sitzen auf Ihrem Foto; Mengen vor der Kalkulation mit dem Original vergleichen.`, `Text recognition on this machine, confidence ${Math.round((doc.ocr!.confidence || 0) * 100)} %. The marks sit on your photo; compare quantities with the original before pricing.`)}</p>
              </div>
              <div className="it-m free">{model.order.map((f) => note(f, true))}{!model.order.length && <p className="muted">{t('Auf dieser Seite wurde nichts markiert.', 'Nothing was marked on this page.')}</p>}</div>
            </div>
          ) : (
            <div className="paper">
              <div className="it head">
                <div className="it-p">
                  <div className="doc-h">
                    <small>{t('Leistungsverzeichnis', 'Bill of quantities')}</small>
                    <h1>{doc.project.name && doc.project.name !== doc.project.label ? doc.project.name : doc.fileName}</h1>
                    <p>{doc.project.label || ''}{doc.tradeLabel ? ' · ' + doc.tradeLabel : ''}{money && st.sumTotal > 0 ? ` · ${st.estimated ? t('geschätzt', 'estimated') + ' ≈ ' : ''}${eur(st.sumTotal)}` : ''}</p>
                  </div>
                  <div className="cols"><span>{t('Pos.-Nr.', 'Item no.')}</span><span>{t('Leistung', 'Work')}</span><span>{t('Menge', 'Quantity')}</span><span>{doc.priced ? t('EP / Gesamt', 'Unit price / total') : t('Wert, geschätzt', 'Value, estimated')}</span></div>
                </div>
                <div className="it-m mhead"><b>{t('Randnotizen', 'Margin notes')}</b><span>{t('ein Klick je Notiz', 'one click per note')}</span></div>
              </div>
              {(model.general.length > 0 || (whole && doc.preamble.trim().length > 40)) && (
                <div className="it marked">
                  <div className="it-p pre" onClick={() => setPreOpen(!preOpen)}>
                    <div className="it-h"><span className="oz">—</span><span className="st">{t('Vorbemerkungen / ganzes Dokument', 'Preliminary remarks / whole document')}</span><span className="qty" /><span className="val">{doc.preamble.trim() ? (preOpen ? '▴' : '▾') : ''}</span></div>
                    {doc.preamble.trim() && (() => { const openP = preOpen || model.general.some((f) => needs(f) && !decisions[f.id]); return <div className={'lt' + (openP ? '' : ' clamp')} lang="de">{openP ? <Excerpt text={doc.preamble} quotes={model.general.flatMap((f) => f.evidence.map((e) => e.quote))} full={preOpen} /> : doc.preamble.slice(0, 300)}</div>; })()}
                  </div>
                  <div className="it-m">{model.general.map((f) => note(f))}</div>
                </div>
              )}
              {rows.map((r, i) =>
                r.k === 'sec' ? <div className="it sec" key={'s' + i}><div className="it-p"><span className="oz">{r.oz}</span>{r.label}</div><div className="it-m" /></div>
                : r.k === 'fold' ? (
                  <div className="it fold" key={'f' + r.at}><div className="it-p"><button onClick={() => setUnfold(new Set(unfold).add(r.at))}>{t(`${r.n} Positionen ohne Anmerkung`, `${r.n} items without remarks`)} <span className="oz">{r.from} – {r.to}</span> ▾</button></div><div className="it-m" /></div>
                ) : r.k === 'remark' ? remarkRow(r.ri) : itemRow(r.it),
              )}
              <div className="it end"><div className="it-p">{t('Ende des Leistungsverzeichnisses', 'End of the bill of quantities')}</div><div className="it-m" /></div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
