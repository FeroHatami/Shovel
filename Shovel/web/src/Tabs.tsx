import { useMemo, useState } from 'react';
import { api, eur, type DocPayload, type Finding } from './api.ts';
import { useT } from './i18n.ts';
import type { Decisions, Edits } from './App.tsx';
import { DEFAULT_SCENARIO, driverOf, runScenario, type Scenario } from '../../src/core/whatif.ts';
import { DRIVERS } from '../../src/core/refprices.ts';

export function Questions({ p, decisions, setDecisions, edits, say, openFinding }: { p: DocPayload; decisions: Decisions; setDecisions: (d: Decisions) => void; edits: Edits; say: (m: string) => void; openFinding: (id: string) => void }) {
  const { t } = useT();
  const qs = useMemo(() => {
    const seen = new Set<string>();
    return p.analysis.findings
      .filter((f) => f.question && (decisions[f.id] ? decisions[f.id] === 'bieterfrage' : f.action === 'bieterfrage'))
      .filter((f) => (seen.has(f.question!) ? false : (seen.add(f.question!), true)))
      .sort((a, b) => (a.oz || '~').localeCompare(b.oz || '~', 'de', { numeric: true }));
  }, [p, decisions]);
  const confirmed = qs.filter((f) => decisions[f.id] === 'bieterfrage').length;
  const text = (f: Finding) => edits[f.id] ?? f.question!;
  const copy = () => {
    navigator.clipboard.writeText(qs.map((f, i) => `${i + 1}. ${f.oz ? 'Pos. ' + f.oz : 'Allgemein'}\n${text(f)}`).join('\n\n'));
    say(t('Fragen in die Zwischenablage kopiert', 'Questions copied to the clipboard'));
  };
  return (
     <div className="sheet">
      <div className="row noprint" style={{ marginBottom: 16, flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}><b style={{ fontWeight: 600 }}>{qs.length} {t('Fragen im Schreiben', 'questions in the letter')}</b> <span className="muted">· {t(`${confirmed} von Ihnen bestätigt, ${qs.length - confirmed} vorgeschlagen`, `${confirmed} confirmed by you, ${qs.length - confirmed} suggested`)}</span></div>
        <div className="row right" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <button className="btn ghost" onClick={copy}>{t('Kopieren', 'Copy')}</button>
          <button className="btn" onClick={() => window.print()}>{t('Drucken / PDF', 'Print / PDF')}</button>
          <button className="btn pri" onClick={() => api.exportFile(p.doc.id, 'questions', { decisions, edits }).then((n) => say(t('Gespeichert: ', 'Saved: ') + n))}>{t('Word-Schreiben (.docx)', 'Word letter (.docx)')}</button>
        </div>
      </div>
      <div className="hint noprint" style={{ margin: '0 0 14px' }}>{t('✎ öffnet den Befund, um den Text zu ändern · × streicht die Frage aus dem Schreiben.', '✎ opens the finding to edit the text · × removes the question from the letter. The letter stays German because it goes to the client.')}</div>
      <div className="letter" lang="de">
        <div className="muted">[Firma / Absender]</div>
        <div style={{ marginTop: 18 }}>An die Vergabestelle<br />{p.doc.project.client || '[Auftraggeber]'}</div>
        <div style={{ textAlign: 'right' }}>{new Date().toLocaleDateString('de-DE')}</div>
        <h2>Bieterfragen zum Leistungsverzeichnis</h2>
        <div>Bauvorhaben: {p.doc.project.label || '—'}<br />Leistungsverzeichnis: {p.doc.project.name || p.doc.fileName}</div>
        <p style={{ margin: '16px 0' }}>Sehr geehrte Damen und Herren,<br /><br />bei der Durchsicht der Vergabeunterlagen haben sich die nachstehenden {qs.length} Fragen ergeben. Wir bitten um Beantwortung vor Ablauf der Angebotsfrist, damit wir Ihnen ein vollständiges und zutreffend kalkuliertes Angebot vorlegen können.</p>
        {qs.map((f, i) => (
          <div className="q" key={f.id}>
            <div><b>{i + 1}. {f.oz ? 'Pos. ' + f.oz : 'Allgemein / Vorbemerkungen'}</b>{text(f)}</div>
            <div className="noprint row" style={{ alignItems: 'flex-start', gap: 2, flexWrap: 'nowrap' }}>
              <button className="btn ghost sm" title={t('Befund öffnen und Text bearbeiten', 'Open the finding and edit the text')} onClick={() => openFinding(f.id)}>✎</button>
              <button className="btn ghost sm" title={t('Frage streichen', 'Remove question')} onClick={() => setDecisions({ ...decisions, [f.id]: 'verworfen' })}>×</button>
            </div>
          </div>
        ))}
        {qs.length === 0 && <p className="muted">{t('Keine Fragen ausgewählt. Wählen Sie bei einem Befund „Auftraggeber fragen“.', 'No questions selected. Choose “Ask the client” on a finding.')}</p>}
        <p style={{ marginBottom: 0 }}>Für Rückfragen stehen wir gerne zur Verfügung.<br /><br />Mit freundlichen Grüßen</p>
      </div>
     </div>
  );
}

export function WhatIf({ p, decisions, compact }: { p: DocPayload; decisions: Decisions; compact?: boolean }) {
  const { t, driver } = useT();
  const [sc, setSc] = useState<Scenario>(DEFAULT_SCENARIO);
  const findings = useMemo(() => p.analysis.findings.filter((f) => decisions[f.id] !== 'verworfen'), [p, decisions]);
  // surcharges only for findings the estimator did not reject or turn into a question
  const sur = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const f of findings) {
      if (!f.surchargePct || f.itemIds.length !== 1 || decisions[f.id] === 'bieterfrage' || decisions[f.id] === 'chance') continue;
      (m[f.itemIds[0]] ||= []).push(f.surchargePct);
    }
    const out: Record<string, number> = {};
    for (const [id, arr] of Object.entries(m)) {
      arr.sort((a, b) => b - a);
      out[id] = Math.min(20, arr[0] + arr.slice(1).reduce((a, x) => a + x * 0.5, 0));
    }
    return out;
  }, [findings, decisions]);
  const r = useMemo(() => runScenario(p.doc, p.value, findings, sur, sc), [p, findings, sur, sc]);
  const delta = r.total - r.base;
  const used = useMemo(() => {
    const s = new Set<string>();
    for (const it of p.doc.items) s.add(driverOf(it).key);
    s.add('lohn');
    return DRIVERS.filter((d) => s.has(d.key));
  }, [p]);
  const qtyN = new Set(findings.filter((f) => f.category === 'menge').flatMap((f) => f.itemIds)).size;
  const set = (k: string, v: number) => setSc({ ...sc, drivers: { ...sc.drivers, [k]: v } });
  const maxD = Math.max(1, ...r.byDriver.map((d) => Math.abs(d.delta)));
  const vob = sc.qtyPct !== 0 && qtyN > 0;
  const drivers = r.byDriver.filter((d) => Math.abs(d.delta) > 0.5);
  return (
    <div className={compact ? 'whatif compact' : 'body'}>
      <div className="label">{t('Summe im Szenario', 'Total in this scenario')}</div>
      <div className="result">
        <div className="big">{eur(r.total)}</div>
        <div className={'delta ' + (delta > 0 ? 'up' : delta < 0 ? 'dn' : '')}>{delta >= 0 ? '+' : ''}{eur(delta)} ({r.base ? ((delta / r.base) * 100).toFixed(1) : '0'} %)</div>
      </div>
      <div className="muted" style={{ marginTop: 4 }}>{t('Ausgangswert', 'Baseline')} {eur(r.base)}{sc.applySurcharges ? t(` · darin Risikozuschläge ${eur(r.surcharge)}`, ` · including risk surcharges ${eur(r.surcharge)}`) : ''}</div>

      <div className="row wi-h" style={{ margin: compact ? '18px 0 4px' : '34px 0 6px', maxWidth: 1040 }}>
        <div className="label" style={{ margin: 0 }}>{t('Annahmen: Preisänderung je Kostentreiber', 'Assumptions: price change per cost driver')}</div>
        <button className="btn ghost sm right" onClick={() => setSc(DEFAULT_SCENARIO)}>{t('Zurücksetzen', 'Reset')}</button>
      </div>
      <div className="sliders">
        {used.map((d) => (
          <div className="slider" key={d.key}>
            <span title={driver(d.key, d.label)}>{driver(d.key, d.label)}</span>
            <input type="range" min={-20} max={40} step={1} value={sc.drivers[d.key] || 0} onChange={(e) => set(d.key, Number(e.target.value))} aria-label={driver(d.key, d.label)} />
            <output>{(sc.drivers[d.key] || 0) > 0 ? '+' : ''}{sc.drivers[d.key] || 0} %</output>
          </div>
        ))}
        <div className="slider">
          <span title={t(`Mengen der ${qtyN} auffälligen Positionen – wirkt auf Positionen mit Mengenbefund`, `Quantities of the ${qtyN} flagged items – applies to items with a quantity finding`)}>{t(`Mengen, ${qtyN} auffällige Positionen`, `Quantities, ${qtyN} flagged items`)}</span>
          <input type="range" min={-40} max={60} step={5} value={sc.qtyPct} onChange={(e) => setSc({ ...sc, qtyPct: Number(e.target.value) })} disabled={!qtyN} aria-label={t('Mengen der auffälligen Positionen', 'Quantities of the flagged items')} />
          <output>{sc.qtyPct > 0 ? '+' : ''}{sc.qtyPct} %</output>
        </div>
        <div className="slider">
          <span title={t('Gemeinkostenanteil im EP', 'Overhead share in unit price')}>{t('Gemeinkostenanteil im Einheitspreis', 'Overhead share in unit price')}</span>
          <input type="range" min={5} max={35} step={1} value={sc.overheadPct} onChange={(e) => setSc({ ...sc, overheadPct: Number(e.target.value) })} aria-label={t('Gemeinkostenanteil im EP', 'Overhead share in unit price')} />
          <output>{sc.overheadPct} %</output>
        </div>
      </div>
      <div className="row" style={{ marginTop: 14, gap: '8px 28px' }}>
        <label className="ck"><input type="checkbox" checked={sc.applySurcharges} onChange={(e) => setSc({ ...sc, applySurcharges: e.target.checked })} /> {t('Risikozuschläge einrechnen', 'Include risk surcharges')}</label>
        <label className="ck"><input type="checkbox" checked={sc.includeBedarf} onChange={(e) => setSc({ ...sc, includeBedarf: e.target.checked })} /> {t('Bedarfspositionen kommen zur Ausführung', 'Contingency items are carried out')} ({eur(r.bedarf)})</label>
      </div>
      <div className="hint" style={{ maxWidth: '90ch' }}>{t('Materialanteile je Positionsart sind Näherungen (z. B. Bewehrung 55 % Stahl).', 'Material shares per item type are approximations (e.g. reinforcement 55 % steel).')} {p.analysis.stats.estimated ? t('Basis sind geschätzte Positionswerte aus der Preisbasis.', 'Based on item values estimated from the price base.') : t('Basis sind die Angebotspreise.', 'Based on the bid prices.')}</div>

      {!compact && drivers.length > 0 && (
        <>
          <h3 className="sechead">{t('Wirkung nach Kostentreiber', 'Effect by cost driver')}</h3>
          <div className="drivers">
            {drivers.map((d) => (
              <div key={d.key} className="bar-row">
                <span className="bar-t">{driver(d.key, d.label)}</span>
                <div className="bar"><span style={{ width: (Math.abs(d.delta) / maxD) * 100 + '%', background: d.delta > 0 ? 'var(--hi)' : 'var(--ok)' }} /></div>
                <span className="bar-n">{d.delta > 0 ? '+' : ''}{eur(d.delta)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {!compact && vob && (
        <>
          <h3 className="sechead">{t('Mengenabweichung nach § 2 Abs. 3 VOB/B', 'Quantity deviation under § 2 (3) VOB/B')}</h3>
          <div style={{ maxWidth: '80ch' }}>
            {sc.qtyPct > 10 && <p style={{ margin: 0 }}>{t('Mehrmenge über 110 %:', 'Excess quantity above 110 %:')} <b>{eur(r.newPriceVolume)}</b> {t('Leistungsvolumen, für das auf Verlangen ein', 'of work for which, on request, a')} <b>{t('neuer Preis', 'new price')}</b> {t('zu vereinbaren ist. Bei knapp kalkulierten Einheitspreisen ist das der Hebel – bei Minimalpreisen das Verlustrisiko.', 'must be agreed. With tightly calculated unit prices this is the lever – with minimal prices it is the risk of loss.')}</p>}
            {sc.qtyPct < -10 && <p style={{ margin: 0 }}>{t('Mindermenge unter 90 %: rund', 'Shortfall below 90 %: about')} <b>{eur(r.underRecovery)}</b> {t('ungedeckte Gemeinkosten. Auf Verlangen ist der Einheitspreis zu erhöhen (Ausgleich über andere Positionen wird angerechnet).', 'of unrecovered overheads. On request the unit price must be increased (compensation through other items is offset).')}</p>}
            {Math.abs(sc.qtyPct) <= 10 && <p style={{ margin: 0 }}>{t('Innerhalb ±10 % bleibt der Einheitspreis unverändert. Effekt auf die Abrechnungssumme:', 'Within ±10 % the unit price stays unchanged. Effect on the final account:')} <b>{eur(r.qtyEffect)}</b>.</p>}
          </div>
        </>
      )}
      {!compact && r.rows.length > 0 && (
        <>
          <h3 className="sechead">{t('Am stärksten betroffene Positionen', 'Most affected items')}</h3>
          <table className="t">
            <thead><tr><th title={t('Ordnungszahl', 'Item number')}>{t('Pos.-Nr.', 'Item no.')}</th><th>{t('Kurztext', 'Short text')}</th><th>{t('Kostentreiber', 'Cost driver')}</th><th className="r">{t('Ausgangswert', 'Baseline')}</th><th className="r">{t('Änderung', 'Change')}</th></tr></thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.id}><td className="oz">{x.oz}</td><td>{x.text}</td><td className="muted">{driver(DRIVERS.find((d) => d.label === x.driver)?.key || '', x.driver)}</td><td className="r">{eur(x.base)}</td><td className="r" style={{ color: x.delta > 0 ? 'var(--hi)' : 'var(--ok)' }}>{x.delta > 0 ? '+' : ''}{eur(x.delta)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
