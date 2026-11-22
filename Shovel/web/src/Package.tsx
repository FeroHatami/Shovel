// Bid package: what the estimator takes away from the review. The letter to the client, the risk
// surcharges, the change-order list for the site manager, a what-if calculation, and the files.
import { useMemo, useState } from 'react';
import { api, eur, type DocPayload, type Finding } from './api.ts';
import { useT } from './i18n.ts';
import { Questions, WhatIf } from './Tabs.tsx';
import { LangSwitch, type Decisions, type Edits, type Go } from './App.tsx';
import { Badge } from './Home.tsx';

interface Props { p: DocPayload; decisions: Decisions; setDecisions: (d: Decisions) => void; edits: Edits; go: Go; say: (m: string) => void }

export function Package({ p, decisions, setDecisions, edits, go, say }: Props) {
  const { t, pl } = useT();
  const { doc, analysis } = p;
  const [tab, setTab] = useState<'letter' | 'prices' | 'changes' | 'whatif'>('letter');
  const [busy, setBusy] = useState('');
  const money = analysis.stats.coverage >= 0.6;
  const byId = useMemo(() => new Map(doc.items.map((i) => [i.id, i])), [doc]);
  const live = useMemo(() => analysis.findings.filter((f) => decisions[f.id] !== 'verworfen'), [analysis, decisions]);
  const nQ = useMemo(() => new Set(analysis.findings.filter((f) => f.question && (decisions[f.id] ? decisions[f.id] === 'bieterfrage' : f.action === 'bieterfrage')).map((f) => f.question)).size, [analysis, decisions]);

  // surcharge per item: the largest one counts in full, further ones by half, capped at 20 %
  const sur = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of live) {
      if (!f.surchargePct || f.itemIds.length !== 1 || decisions[f.id] === 'bieterfrage' || decisions[f.id] === 'chance') continue;
      (m.get(f.itemIds[0]) || m.set(f.itemIds[0], []).get(f.itemIds[0])!).push(f);
    }
    return [...m].map(([id, fs]) => {
      fs.sort((a, b) => b.surchargePct! - a.surchargePct!);
      const pct = Math.min(20, fs[0].surchargePct! + fs.slice(1).reduce((a, x) => a + x.surchargePct! * 0.5, 0));
      const it = byId.get(id)!;
      return { it, pct, amount: ((p.value[id] || 0) * pct) / 100, why: fs[0].title, confirmed: fs.some((f) => decisions[f.id] === 'zuschlag'), fid: fs[0].id };
    }).filter((r) => r.it).sort((a, b) => b.amount - a.amount || b.pct - a.pct);
  }, [live, decisions, byId, p]);
  const surTotal = sur.reduce((s, r) => s + r.amount, 0);
  const changes = useMemo(() => live.filter((f) => f.nachtrag && decisions[f.id] !== 'bieterfrage').sort((a, b) => Number(decisions[b.id] === 'chance') - Number(decisions[a.id] === 'chance') || b.score - a.score), [live, decisions]);

  const dl = async (kind: 'questions' | 'report' | 'x84') => {
    setBusy(kind);
    try {
      say(t('Gespeichert: ', 'Saved: ') + (await api.exportFile(doc.id, kind, { decisions, edits })));
    } catch (e) {
      say(String((e as Error).message));
    }
    setBusy('');
  };
  const openFinding = (id: string) => go(`#/doc/${doc.id}?focus=${id}`);
  const tabs: [typeof tab, string, string][] = [
    ['letter', t('Brief an den Auftraggeber', 'Letter to the client'), pl(nQ, 'Frage', 'Fragen', 'question', 'questions')],
    ['prices', t('Risikozuschläge', 'Risk surcharges'), money && surTotal > 0 ? '+ ' + eur(surTotal) : pl(sur.length, 'Position', 'Positionen', 'item', 'items')],
    ['changes', t('Nachtragsliste', 'Change-order list'), pl(changes.length, 'Eintrag', 'Einträge', 'entry', 'entries')],
    ['whatif', t('Was wäre, wenn', 'What if'), t('Preise und Mengen', 'prices and quantities')],
  ];
  return (
    <div className="pkg">
      <header className="rv-top">
        <button className="back" onClick={() => go('#/doc/' + doc.id)}>← {t('Zurück zum Dokument', 'Back to the document')}</button>
        <div className="rv-title"><Badge name={doc.fileName} /><div><b>{t('Angebotspaket', 'Bid package')}</b><small>{doc.fileName}</small></div></div>
        <span className="grow" />
        <LangSwitch />
      </header>
      <div className="pkg-body">
        <aside className="pkg-nav">
          {tabs.map(([k, title, sub]) => (
            <button key={k} className={tab === k ? 'on' : ''} data-tab={k} onClick={() => setTab(k)}><b>{title}</b><small>{sub}</small></button>
          ))}
          <div className="files">
            <h3>{t('Dateien', 'Files')}</h3>
            <button className="file" data-export="questions" onClick={() => dl('questions')} disabled={!!busy}><i>DOCX</i><span><b>{t('Brief mit Fragen', 'Letter with questions')}</b><small>{t('an den Auftraggeber, vor Fristende', 'to the client, before the deadline')}</small></span></button>
            <button className="file" data-export="x84" onClick={() => dl('x84')} disabled={!!busy}><i>X84</i><span><b>{t('Angebotsentwurf', 'Bid draft')}</b><small>{t('Preise + Zuschläge für Ihre Kalkulationssoftware', 'prices + surcharges for your estimating software')}</small></span></button>
            <button className="file" data-export="report" onClick={() => dl('report')} disabled={!!busy}><i>XLSX</i><span><b>{t('Prüfbericht', 'Review report')}</b><small>{t('alle Notizen mit Ihrer Entscheidung', 'every note with your decision')}</small></span></button>
          </div>
        </aside>
        <main className="pkg-main">
          {tab === 'letter' && <Questions p={p} decisions={decisions} setDecisions={setDecisions} edits={edits} say={say} openFinding={openFinding} />}
          {tab === 'prices' && (
            <div className="card">
              <h2>{t('Risikozuschläge je Position', 'Risk surcharges per item')}</h2>
              <p className="lead">{t('Was unklar bleibt, wird eingepreist. Die Zuschläge stehen im Angebotsentwurf (X84) auf dem Einheitspreis. Fragen Sie stattdessen den Auftraggeber, entfällt der Zuschlag.', 'What stays unclear is priced in. The surcharges are applied to the unit prices in the bid draft (X84). If you ask the client instead, the surcharge is dropped.')}</p>
              {sur.length === 0 ? <p className="muted">{t('Keine Zuschläge vorgeschlagen.', 'No surcharges suggested.')}</p> : (
                <table className="t">
                  <thead><tr><th>{t('Pos.-Nr.', 'Item no.')}</th><th>{t('Leistung', 'Work')}</th><th>{t('Grund', 'Reason')}</th><th className="r">{t('Zuschlag', 'Surcharge')}</th>{money && <th className="r">{t('Betrag', 'Amount')}</th>}</tr></thead>
                  <tbody>
                    {sur.map((r) => (
                      <tr key={r.it.id} onClick={() => openFinding(r.fid)} className="click">
                        <td className="oz">{r.it.oz}</td><td>{r.it.shortText}</td><td className="muted">{r.why}{r.confirmed && <span className="okmark"> ✓ {t('bestätigt', 'confirmed')}</span>}</td><td className="r">+{r.pct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</td>{money && <td className="r">{r.amount ? eur(r.amount) : '–'}</td>}
                      </tr>
                    ))}
                  </tbody>
                  {money && <tfoot><tr><td colSpan={4}>{t('Summe der Zuschläge', 'Total surcharges')}</td><td className="r">{eur(surTotal)}</td></tr></tfoot>}
                </table>
              )}
            </div>
          )}
          {tab === 'changes' && (
            <div className="card">
              <h2>{t('Nachtragsliste für die Bauleitung', 'Change-order list for the site manager')}</h2>
              <p className="lead">{t('Was nach dem Zuschlag wichtig wird: wo ein Nachtrag möglich ist, wo einer droht, und was vor der Ausführung zu tun ist. Steht auch im Prüfbericht (Excel).', 'What matters after the award: where a change order is possible, where one threatens, and what to do before execution. Also in the review report (Excel).')}</p>
              {changes.length === 0 ? <p className="muted">{t('Keine Einträge.', 'No entries.')}</p> : changes.map((f) => (
                <div className="chg" key={f.id} onClick={() => openFinding(f.id)}>
                  <div><span className={'chip ' + f.nachtrag!.direction}>{f.nachtrag!.direction === 'chance' ? t('Chance', 'Chance') : t('Risiko', 'Risk')}</span>{decisions[f.id] === 'chance' && <span className="okmark">✓ {t('gemerkt', 'kept')}</span>}<span className="oz">{f.oz || t('allgemein', 'general')}</span><b>{f.title}</b></div>
                  <p><b>{f.nachtrag!.basis}</b> · {f.nachtrag!.note}</p>
                </div>
              ))}
            </div>
          )}
          {tab === 'whatif' && (
            <div className="card">
              <h2>{t('Was wäre, wenn …', 'What if …')}</h2>
              <p className="lead">{t('Materialpreise und Mengen verschieben und sehen, was das für die Angebotssumme bedeutet.', 'Move material prices and quantities and see what it does to the bid total.')}</p>
              {money ? <WhatIf p={p} decisions={decisions} /> : <p className="muted">{t('Für dieses Dokument gibt es zu wenige Vergleichspreise für eine belastbare Summe. Legen Sie ein bepreistes Altprojekt in das Preisgedächtnis.', 'There are too few reference prices for a reliable total for this document. Add a priced past project to the price memory.')}</p>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
