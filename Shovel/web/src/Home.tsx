// Home: one drop zone and the list of tenders. Each row says in words what is left to do.
import { useMemo, useState } from 'react';
import type { DocSummary, State } from './api.ts';
import { useT } from './i18n.ts';
import { LangSwitch, Logo, storedDecisions, type Go } from './App.tsx';

export const cleanLabel = (s?: string) => (s || '').replace(/\s+/g, ' ').trim();
export const extOf = (name: string) => (/\.([A-Za-z0-9]+)$/.exec(name)?.[1] || '').toUpperCase();
export const kindOf = (d: { format: string; phase: number | null }, t: (de: string, en: string) => string) =>
  d.format === 'image' ? t('Foto', 'Photo') : d.phase === 84 || d.phase === 85 ? t('Angebot', 'Bid') : d.phase === 86 ? t('Auftrag', 'Award') : t('Ausschreibung', 'Tender');

export function Badge({ name }: { name: string }) {
  const e = extOf(name);
  const cls = /^X8/.test(e) ? 'x' : /^[DP]8/.test(e) ? 'd' : e === 'PDF' ? 'pdf' : /XLS|CSV/.test(e) ? 'xls' : 'img';
  return <span className={'badge ' + cls}>{e.slice(0, 4) || '?'}</span>;
}
/** Where the marks sit in the document: one cell per stretch of items, darker = more at stake. */
export function Strip({ levels, cells = 24 }: { levels?: string; cells?: number }) {
  if (!levels) return <span className="strip" />;
  const n = Math.min(cells, levels.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = Math.floor((i * levels.length) / n); k < Math.floor(((i + 1) * levels.length) / n); k++) m = Math.max(m, Number(levels[k]) || 0);
    out.push(m);
  }
  return <span className="strip" aria-hidden="true">{out.map((v, i) => <i key={i} className={'l' + v} />)}</span>;
}

export function openCount(d: DocSummary) {
  const dec = storedDecisions(d.id);
  const high = (d.open?.high || []).filter((id) => !dec[id]).length;
  const mid = (d.open?.mid || []).filter((id) => !dec[id]).length;
  return { high, mid, total: (d.open?.high.length || 0) + (d.open?.mid.length || 0) };
}

interface Props {
  state: State; busy: string; go: Go;
  pickFiles: () => void; pickPhoto: () => void; pickHistory: () => void;
  remove: (id: string) => void; run: (w: 'demo' | 'dataset' | 'reset') => void;
}

export function Home({ state, busy, go, pickFiles, pickPhoto, pickHistory, remove, run }: Props) {
  const { t, pl } = useT();
  const [q, setQ] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const lvs = state.docs.filter((d) => d.role === 'lv');
  const priceFiles = state.docs.filter((d) => d.role === 'history' || (d.priced && d.phase === 86));
  const risk = (d: DocSummary) => (d.textless ? -1 : d.stats?.riskScore ?? 0);

  const { groups, singles } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (d: DocSummary) => !needle || (d.fileName + ' ' + (d.project.label || '') + ' ' + (d.trade || '')).toLowerCase().includes(needle);
    const by = new Map<string, DocSummary[]>();
    for (const d of lvs) {
      const k = cleanLabel(d.project.label);
      (by.get(k) || by.set(k, []).get(k)!).push(d);
    }
    const groups: { label: string; docs: DocSummary[]; all: number }[] = [];
    const singles: DocSummary[] = [];
    for (const [label, docs] of by) {
      const shown = docs.filter(hit).sort((a, b) => risk(b) - risk(a) || a.fileName.localeCompare(b.fileName, 'de', { numeric: true }));
      if (label && docs.length >= 3) { if (shown.length) groups.push({ label, docs: shown, all: docs.length }); }
      else singles.push(...shown);
    }
    groups.sort((a, b) => b.all - a.all);
    singles.sort((a, b) => risk(b) - risk(a) || a.fileName.localeCompare(b.fileName, 'de', { numeric: true }));
    return { groups, singles };
    // eslint-disable-next-line
  }, [state, q]);

  const row = (d: DocSummary) => {
    const o = openCount(d);
    const twin = (d.twins || []).find((x) => { const other = state.docs.find((y) => y.id === x.id); return other && ((other.addedAt || 0) < (d.addedAt || 0) || ((other.addedAt || 0) === (d.addedAt || 0) && other.id < d.id)); });
    const verdict = d.textless
      ? <span className="v none">{t('Nur Preise – ohne LV-Texte nicht prüfbar', 'Prices only – cannot be checked without the tender texts')}</span>
      : !d.findings ? <span className="v ok">{t('Nichts gefunden', 'Nothing found')}</span>
      : o.high + o.mid === 0 ? <span className="v ok">✓ {t('Alles entschieden – Angebotspaket bereit', 'All decided – bid package ready')}</span>
      : <span className="v">{o.high > 0 && <b className="hi">{pl(o.high, 'kritischer Punkt', 'kritische Punkte', 'critical point', 'critical points')}</b>}{o.high > 0 && o.mid > 0 && ' · '}{o.mid > 0 && pl(o.mid, 'weiterer zu prüfen', 'weitere zu prüfen', 'more to check', 'more to check')}</span>;
    return (
      <div className="trow" key={d.id} data-file={d.fileName} role="button" tabIndex={0} onClick={() => go('#/doc/' + d.id)} onKeyDown={(e) => e.key === 'Enter' && go('#/doc/' + d.id)}>
        <Badge name={d.fileName} />
        <div className="tname">
          <b title={d.fileName}>{d.fileName}</b>
          <small>{kindOf(d, t)}{d.trade ? ' · ' + cleanLabel(d.trade) : ''} · {pl(d.items, 'Position', 'Positionen', 'item', 'items')}{d.ocr ? ' · ' + t('per Texterkennung gelesen', 'read by text recognition') : ''}</small>
        </div>
        <div className="tverdict">
          {verdict}
          {twin && <button className="link" onClick={(e) => { e.stopPropagation(); go(`#/compare/${twin.id}/${d.id}`); }} title={twin.fileName}>↔ {t('Vergleichen mit', 'Compare with')} {twin.fileName.length > 34 ? twin.fileName.slice(0, 32) + '…' : twin.fileName}</button>}
        </div>
        <Strip levels={d.riskLevels} />
        <button className="xbtn" title={t('Aus der Liste entfernen', 'Remove from the list')} aria-label={t('Entfernen', 'Remove')} onClick={(e) => { e.stopPropagation(); remove(d.id); }}>×</button>
        <span className="arrow" aria-hidden="true">→</span>
      </div>
    );
  };

  return (
    <div className="home">
      <header className="topbar">
        <div className="brand"><Logo /><b>Shovel</b></div>
        <LangSwitch />
      </header>

      <section className="hero">
        <h1>{t('LV hineinlegen. Mit Rotstift zurückbekommen.', 'Drop in a bill of quantities. Get it back marked up.')}</h1>
        <p>{t('Shovel liest jede Position, markiert Fehler, Unklarheiten und Risiken direkt im Dokument und entwirft die Fragen an den Auftraggeber. Sie entscheiden – Shovel schreibt den Brief.', 'Shovel reads every item, marks errors, unclear wording and risks right in the document, and drafts the questions to the client. You decide – Shovel writes the letter.')}</p>
        <div className="drop" onClick={pickFiles}>
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5l5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div>
            <b>{t('Datei hier ablegen', 'Drop a file here')}</b>
            <span>{t('GAEB (X83, D83, D84 …), PDF, Excel – oder das Foto einer gedruckten Seite', 'GAEB (X83, D83, D84 …), PDF, Excel – or a photo of a printed page')}</span>
          </div>
          <div className="drop-btns">
            <button className="btn" onClick={(e) => { e.stopPropagation(); pickPhoto(); }} disabled={!!busy}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
              {t('Foto aufnehmen', 'Take a photo')}
            </button>
            <button className="btn pri" onClick={(e) => { e.stopPropagation(); pickFiles(); }} disabled={!!busy}>{t('Datei wählen', 'Choose file')}</button>
          </div>
        </div>
        <ol className="steps">
          <li><i>1</i><div><b>{t('Ablegen', 'Drop')}</b><span>{t('Ausschreibung, Angebot oder Foto. In Sekunden gelesen.', 'A tender, a bid or a photo. Read in seconds.')}</span></div></li>
          <li><i>2</i><div><b>{t('Entscheiden', 'Decide')}</b><span>{t('Jede Randnotiz mit einem Klick: fragen, einpreisen, merken.', 'One click per margin note: ask, price in, keep.')}</span></div></li>
          <li><i>3</i><div><b>{t('Absenden', 'Send')}</b><span>{t('Fertiger Brief an den Auftraggeber und Angebotsentwurf.', 'A finished letter to the client and a bid draft.')}</span></div></li>
          <li className="alt"><i>↔</i><div><b>{t('Neue Fassung vom Auftraggeber?', 'Revised version from the client?')}</b><span>{t('Einfach dazulegen – Shovel zeigt, was sich geändert hat.', 'Just drop it in – Shovel shows what changed.')}</span></div></li>
        </ol>
      </section>

      <section className="tenders">
        <div className="thead">
          <h2>{t('Ihre Dokumente', 'Your documents')} <span className="count">{lvs.length}</span></h2>
          {lvs.length > 8 && <input className="search" placeholder={t('Suchen …', 'Search …')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Dokumente suchen', 'Search documents')} />}
        </div>
        {lvs.length === 0 && (
          <div className="empty">
            <p>{t('Noch kein Dokument. Legen Sie eine Datei ab – oder starten Sie mit Beispielen:', 'No document yet. Drop a file – or start with examples:')}</p>
            <div className="rowbtns">
              {state.dataFiles > 0 && <button className="btn pri" disabled={!!busy} onClick={() => run('dataset')}>{busy === 'dataset' && <span className="spin" />}{t(`${state.dataFiles} Dateien der Veranstalter laden`, `Load the organisers' ${state.dataFiles} files`)}</button>}
              <button className="btn" disabled={!!busy} onClick={() => run('demo')}>{busy === 'demo' && <span className="spin" />}{t('Demo-Projekt laden', 'Load demo project')}</button>
            </div>
          </div>
        )}
        {groups.map((g) => {
          const open = openGroups[g.label] ?? !!q;
          const gaps = g.docs.reduce((n, d) => n + (d.interfaces?.length || 0), 0);
          const crit = g.docs.reduce((n, d) => n + openCount(d).high, 0);
          const shown = open ? g.docs : g.docs.slice(0, 4);
          return (
            <div className="group" key={g.label}>
              <div className="ghead">
                <div>
                  <b>{g.label}</b>
                  <small>{pl(g.all, 'Dokument', 'Dokumente', 'document', 'documents')} {t('eines Bauvorhabens', 'of one building project')}{crit ? ' · ' + pl(crit, 'kritischer Punkt', 'kritische Punkte', 'critical point', 'critical points') : ''}</small>
                </div>
                {gaps > 0 && <span className="gap" title={t('Leistungen, die ein Gewerk voraussetzt und die in keinem anderen LV des Bauvorhabens stehen', 'Work that one trade relies on and that no other document of the project contains')}>{pl(gaps, 'offene Schnittstelle', 'offene Schnittstellen', 'open hand-over', 'open hand-overs')} {t('zwischen Gewerken', 'between trades')}</span>}
              </div>
              {shown.map(row)}
              {g.docs.length > 4 && <button className="more" onClick={() => setOpenGroups({ ...openGroups, [g.label]: !open })}>{open ? t('Weniger zeigen', 'Show fewer') : t(`Alle ${g.docs.length} zeigen`, `Show all ${g.docs.length}`)}</button>}
            </div>
          );
        })}
        {singles.length > 0 && <div className="group plain">{singles.map(row)}</div>}
        {lvs.length > 0 && groups.length + singles.length === 0 && <p className="muted">{t('Kein Dokument passt zur Suche.', 'No document matches the search.')}</p>}
      </section>

      <section className="pricebase">
        <div>
          <h3>{t('Preisgedächtnis', 'Price memory')}</h3>
          <p>{t(`Preise werden mit ${state.history.own} Positionen aus Ihren eigenen bepreisten LVs verglichen (dazu ${state.history.seed} mitgelieferte Orientierungswerte). Die Preise bleiben auf diesem Rechner.`, `Prices are compared with ${state.history.own} items from your own priced files (plus ${state.history.seed} built-in benchmark values). The prices stay on this machine.`)}</p>
          {priceFiles.length > 0 && <div className="pfiles">{priceFiles.map((d) => <span key={d.id} className="pfile"><Badge name={d.fileName} />{d.fileName}{d.role === 'history' && <button className="xbtn show" onClick={() => remove(d.id)} aria-label={t('Entfernen', 'Remove')}>×</button>}</span>)}</div>}
        </div>
        <button className="btn" onClick={pickHistory} disabled={!!busy}>{busy === 'history' && <span className="spin" />}{t('Altes bepreistes LV hinzufügen', 'Add a priced past project')}</button>
      </section>
      <footer className="foot">{t('Regeln und Preisvergleich laufen lokal und liefern für dasselbe Dokument immer dasselbe Ergebnis. Kein Rechtsrat.', 'Rules and price comparison run locally and always give the same result for the same document. No legal advice.')} {state.ai.live ? t('KI-Prüfung: verbunden.', 'AI check: connected.') : t('KI-Prüfung: nicht verbunden (gespeicherte KI-Befunde werden gezeigt).', 'AI check: not connected (stored AI findings are shown).')}</footer>
    </div>
  );
}
