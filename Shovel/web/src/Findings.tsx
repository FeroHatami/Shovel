import { eur, num } from './api.ts';
import { useT } from './i18n.ts';
import type { LVItem, PriceSuggestion } from '../../src/core/types.ts';

export function Highlight({ text, quotes }: { text: string; quotes: string[] }) {
  const ranges: [number, number][] = [];
  for (const q0 of quotes) {
    const q = q0.replace(/^…|…$/g, '').trim();
    if (q.length < 3) continue;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i');
    const m = re.exec(text);
    if (m) ranges.push([m.index, m.index + m[0].length]);
  }
  if (!ranges.length) return <>{text}</>;
  ranges.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], i) => {
    if (s < pos) return;
    out.push(text.slice(pos, s));
    out.push(<mark key={i}>{text.slice(s, e)}</mark>);
    pos = e;
  });
  out.push(text.slice(pos));
  return <>{out}</>;
}

export function PriceBand({ p, up, unit }: { p: PriceSuggestion; up: number | null; unit: string | null }) {
  const { t } = useT();
  const lo = Math.min(p.low, up ?? p.low) * 0.85;
  const hi = Math.max(p.high, up ?? p.high) * 1.1;
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return (
    <div>
      <div className="pband">
        <div className="track" />
        <div className="rng" style={{ left: x(p.low) + '%', width: x(p.high) - x(p.low) + '%' }} />
        <div className="mk" style={{ left: x(p.mid) + '%' }} />
        <div className="lb" style={{ left: x(p.mid) + '%' }}>{eur(p.mid, 2)}</div>
        {up != null && <><div className="mk own" style={{ left: `min(calc(${x(up)}% - 1px), calc(100% - 2px))` }} /><div className="lb own" style={{ left: x(up) + '%' }}>{t('Einheitspreis', 'Unit price')} {eur(up, 2)}</div></>}
      </div>
      <div className="hint">
        {t(`Referenzspanne ${eur(p.low, 2)} – ${eur(p.high, 2)} je ${unit} aus ${p.n} ähnlichen Positionen · Sicherheit ${Math.round(p.confidence * 100)} %`, `Reference range ${eur(p.low, 2)} – ${eur(p.high, 2)} per ${unit} from ${p.n} similar items · confidence ${Math.round(p.confidence * 100)} %`)}
      </div>
      <table className="t small">
        <tbody>
          {p.refs.map((r, i) => (
            <tr key={i}><td>{r.text}</td><td className="muted">{r.project === 'Orientierungswert' ? t('Orientierungswert', 'Benchmark value') : r.project}{r.project !== 'Orientierungswert' ? ' · ' + r.year : ''}</td><td className="r">{eur(r.up, 2)}</td><td className="r muted">{Math.round(r.sim * 100)} %</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ItemBox({ it, quotes, value }: { it: LVItem; quotes: string[]; value?: number }) {
  const { t } = useT();
  const flags = [it.flags.bedarf && t('Bedarfsposition', 'Contingency item'), it.flags.wahl && t('Wahlposition', 'Alternative item'), it.flags.stundenlohn && t('Stundenlohn', 'Hourly work'), it.flags.zulage && t('Zulage', 'Surcharge item'), it.flags.pauschal && t('Pauschal', 'Lump sum')].filter(Boolean) as string[];
  return (
    <div className="lvtext">
      <div className="hd">
        <span className="oz">{it.oz}</span>
        <b><Highlight text={it.shortText || t('(ohne Kurztext)', '(no short text)')} quotes={quotes} /></b>
        {flags.map((f) => <span key={f} className="flag">{f}</span>)}
        <span className="qty">{num(it.qty)} {(it as LVItem & { unitUnread?: boolean }).unitUnread ? '?' : it.unit || ''}{it.up != null ? ` × ${eur(it.up, 2)}` : ''}{value ? ` = ${eur(value)}` : ''}</span>
      </div>
      {it.longText && it.longText.trim() !== it.shortText.trim() ? <Highlight text={it.longText} quotes={quotes} /> : <span className="muted">{t('(kein Langtext)', '(no long text)')}</span>}
    </div>
  );
}

export const WHERE: Record<string, string> = { kurztext: 'Kurztext', langtext: 'Langtext', vorbemerkung: 'Vorbemerkung', feld: 'Datenfeld', hinweis: 'Anderes LV' };
export const WHERE_EN: Record<string, string> = { kurztext: 'Short text', langtext: 'Long text', vorbemerkung: 'Preliminary remarks', feld: 'Data field', hinweis: 'Other document' };
