// What changed? Two versions of one bill of quantities side by side: added and removed items,
// changed quantities and texts, the effect on the total, and the new risks that came with the changes.
import { useEffect, useState } from 'react';
import { api, eur, num, type Diff, type ItemChange, type State, type Tok } from './api.ts';
import { useT } from './i18n.ts';
import { LangSwitch, type Go } from './App.tsx';
import { Badge } from './Home.tsx';

// keeps the changed words and a little context; long unchanged stretches become "…"
function DiffText({ toks }: { toks: Tok[] }) {
  return (
    <>
      {toks.map((k, i) => {
        if (k.t === '+') return <ins key={i}>{k.s} </ins>;
        if (k.t === '-') return <del key={i}>{k.s} </del>;
        const w = k.s.split(' ');
        if (w.length <= 14) return <span key={i}>{k.s} </span>;
        const head = i === 0 ? '' : w.slice(0, 6).join(' ') + ' ';
        const tail = i === toks.length - 1 ? '' : ' ' + w.slice(-6).join(' ');
        return <span key={i}>{head}<i className="gapdots">…</i>{tail} </span>;
      })}
    </>
  );
}

export function Compare({ a, b, state, go }: { a: string; b: string; state: State; go: Go }) {
  const { t, pl, lang } = useT();
  const [d, setD] = useState<Diff | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    setErr('');
    api.compare(a, b).then(setD).catch((e) => setErr(String(e.message || e)));
  }, [a, b, lang]);
  const money = !!d && d.coverage >= 0.6;
  const group = (k: ItemChange['kind'], pred: (c: ItemChange) => boolean = () => true) => (d ? d.changes.filter((c) => c.kind === k && pred(c)) : []);
  const qtyOf = (c: ItemChange) => !!c.qty || !!c.up;
  const hard = d ? d.changes.filter((c) => !c.soft).length : 0;
  const pct = (x: number | null, y: number | null) => (x && y != null ? ((y - x) / x) * 100 : null);

  const card = (c: ItemChange) => {
    const flagged = (c.idB && d!.flagged[c.idB]) || [];
    const dp = c.qty ? pct(c.qty[0], c.qty[1]) : null;
    return (
      <div className={'chgcard ' + c.kind} key={c.kind + c.oz}>
        <div className="cc-h">
          <span className="oz">{c.oz}</span>
          <b>{c.short ? <DiffText toks={c.short} /> : c.shortText}</b>
          {Math.abs(c.valueDelta) >= 1 && <span className={'delta ' + (c.valueDelta > 0 ? 'up' : 'dn')} title={t('Geschätzt aus dem Preisgedächtnis', 'Estimated from the price memory')}>≈ {c.valueDelta > 0 ? '+' : '−'} {eur(Math.abs(c.valueDelta))}</span>}
        </div>
        {c.kind === 'changed' && c.qty && (
          <p className="cc-q"><span>{t('Menge', 'Quantity')}</span><del>{num(c.qty[0])} {c.unit?.[0] || ''}</del> → <ins>{num(c.qty[1])} {c.unit?.[1] || ''}</ins>{dp != null && Math.abs(dp) >= 0.5 && <em className={dp > 0 ? 'up' : 'dn'}>{dp > 0 ? '+' : ''}{dp.toFixed(0)} %</em>}{dp != null && Math.abs(dp) > 10 && <small>{t('über ±10 %: neuer Einheitspreis möglich (§ 2 Abs. 3 VOB/B)', 'beyond ±10 %: a new unit price can be claimed (§ 2 (3) VOB/B)')}</small>}</p>
        )}
        {c.kind === 'changed' && c.up && <p className="cc-q"><span>{t('Einheitspreis', 'Unit price')}</span><del>{eur(c.up[0], 2)}</del> → <ins>{eur(c.up[1], 2)}</ins></p>}
        {c.kind !== 'changed' && <p className="cc-q"><span>{t('Menge', 'Quantity')}</span>{num(c.kind === 'added' ? c.qty?.[1] : c.qty?.[0])} {(c.kind === 'added' ? c.unit?.[1] : c.unit?.[0]) || ''}</p>}
        {c.long && <p className="cc-l" lang="de"><DiffText toks={c.long} /></p>}
        {flagged.length > 0 && (
          <div className="cc-f">
            {flagged.slice(0, 3).map((f) => (
              <button key={f.id} onClick={() => go(`#/doc/${d!.b.id}?focus=${f.id}`)}><span className={'dot s' + f.severity} /> {f.title} <span className="arrow">→</span></button>
            ))}
          </div>
        )}
      </div>
    );
  };
  const sec = (title: string, list: ItemChange[]) => list.length > 0 && (
    <section className="cmp-sec"><h2>{title} <span className="count">{list.length}</span></h2>{list.map(card)}</section>
  );
  const name = (id: string) => state.docs.find((x) => x.id === id)?.fileName || '';

  return (
    <div className="cmp">
      <header className="rv-top">
        <button className="back" onClick={() => history.length > 1 ? history.back() : go('#/')}>← {t('Zurück', 'Back')}</button>
        <div className="rv-title"><div><b>{t('Was hat sich geändert?', 'What changed?')}</b><small>{t('Zwei Fassungen eines LVs im Vergleich', 'Two versions of one bill of quantities compared')}</small></div></div>
        <span className="grow" />
        <LangSwitch />
      </header>
      <div className="cmp-body">
        <div className="cmp-files">
          <div><small>{t('Vorher', 'Before')}</small><span><Badge name={name(a)} /><b>{name(a)}</b></span></div>
          <button className="swap" onClick={() => go(`#/compare/${b}/${a}`)} title={t('Reihenfolge tauschen', 'Swap order')}>⇄</button>
          <div><small>{t('Nachher', 'After')}</small><span><Badge name={name(b)} /><b>{name(b)}</b></span></div>
        </div>
        {err && <p className="banner warn">{err}</p>}
        {!d && !err && <div className="loading"><span className="spin" /> {t('Wird verglichen …', 'Comparing …')}</div>}
        {d && !d.comparable && <p className="banner warn">{t('Diese beiden Dateien haben kaum gemeinsame Positionsnummern – vermutlich sind es keine Fassungen desselben LVs.', 'These two files share few item numbers – they are probably not versions of the same document.')}</p>}
        {d && d.comparable && (
          <>
            <div className="tiles">
              <div className={'tile' + (hard ? '' : ' ok')}><b>{hard || '✓'}</b><span>{hard ? pl(hard, 'Position geändert', 'Positionen geändert', 'item changed', 'items changed').replace(/^\d+ /, '') : t('Keine Änderung', 'No change')}</span><small>{hard ? t(`${d.identical} von ${d.matched} gemeinsamen Positionen sind identisch`, `${d.identical} of ${d.matched} shared items are identical`) : t(`${d.matched} Positionen verglichen`, `${d.matched} items compared`)}</small></div>
              <div className="tile"><b>{d.qtyChanged}</b><span>{t('Mengen geändert', 'quantities changed')}</span></div>
              <div className="tile"><b>{d.textChanged}</b><span>{t('Texte geändert', 'texts changed')}</span>{d.softText > 0 && <small>{t(`${d.softText} mögliche Layout-Unterschiede, unten`, `${d.softText} possible layout differences, below`)}</small>}</div>
              <div className="tile"><b>{d.added} / {d.removed}</b><span>{t('neu / entfallen', 'added / removed')}</span></div>
              {Math.abs(d.valueDelta) >= 1 && <div className={'tile ' + (d.valueDelta > 0 ? 'up' : 'dn')}><b>{d.valueDelta >= 0 ? '+' : '−'} {eur(Math.abs(d.valueDelta))}</b><span>{t('Wirkung auf die Summe', 'effect on the total')}</span><small>{money ? t('geschätzt aus dem Preisgedächtnis', 'estimated from the price memory') : t('geschätzt; nur Positionen mit Vergleichspreis', 'estimated; only items with a reference price')}</small></div>}
            </div>
            {hard === 0 && <p className="allsame">✓ {d.softText ? t(`Beide Dateien enthalten dieselben ${d.matched} Positionen mit denselben Mengen und Einheiten.`, `Both files contain the same ${d.matched} items with the same quantities and units.`) : t(`Beide Dateien enthalten dieselben ${d.matched} Positionen mit denselben Mengen, Einheiten und Texten.`, `Both files contain the same ${d.matched} items with the same quantities, units and texts.`)}</p>}
            {sec(t('Neue Positionen', 'New items'), group('added'))}
            {sec(t('Entfallene Positionen', 'Removed items'), group('removed'))}
            {sec(t('Geänderte Mengen und Preise', 'Changed quantities and prices'), group('changed', qtyOf))}
            {sec(t('Geänderte Texte', 'Changed texts'), group('changed', (c) => !qtyOf(c) && !c.soft))}
            {d.softText > 0 && (
              <details className="soft">
                <summary>{t(`${d.softText} Textunterschiede, die vom Drucklayout stammen können`, `${d.softText} text differences that may come from the print layout`)}</summary>
                <p className="muted small">{t('Eine der Dateien ist ein Ausdruck (PDF) oder hat ein anderes Format. Zeilenumbrüche, Kopf- und Fußzeilen erzeugen Unterschiede, die keine inhaltliche Änderung sind. Mengen und Einheiten sind exakt verglichen.', 'One of the files is a print (PDF) or has a different format. Line breaks, page headers and footers create differences that are not changes in content. Quantities and units are compared exactly.')}</p>
                {group('changed', (c) => !!c.soft).slice(0, 40).map(card)}
              </details>
            )}
            {hard > 0 && <div className="cmp-cta"><button className="btn pri" onClick={() => go('#/doc/' + d.b.id)}>{t('Neue Fassung durchgehen', 'Review the new version')} →</button></div>}
          </>
        )}
      </div>
    </div>
  );
}
