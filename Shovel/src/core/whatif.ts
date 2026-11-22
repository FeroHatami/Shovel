// What-if analysis. Pure functions, shared by server and browser.
import type { Finding, LVDocument, LVItem } from './types.ts';
import { DRIVERS } from './refprices.ts';

export interface Scenario {
  drivers: Record<string, number>; // key -> change in %
  includeBedarf: boolean;
  applySurcharges: boolean;
  qtyPct: number; // quantity change on items with quantity findings, in %
  overheadPct: number; // share of BGK/AGK/W+G in the unit prices
}
export const DEFAULT_SCENARIO: Scenario = { drivers: {}, includeBedarf: false, applySurcharges: true, qtyPct: 0, overheadPct: 18 };

export function driverOf(it: LVItem): (typeof DRIVERS)[number] {
  const t = it.shortText + ' ' + it.longText.slice(0, 120);
  return DRIVERS.find((d) => d.key !== 'lohn' && d.re.test(t)) || DRIVERS[DRIVERS.length - 1];
}

export interface ScenarioResult {
  base: number;
  total: number;
  byDriver: { key: string; label: string; base: number; delta: number; items: number }[];
  surcharge: number;
  bedarf: number;
  qtyEffect: number;
  underRecovery: number; // uncovered overhead when quantities fall below 90 %
  newPriceVolume: number; // volume above 110 % that is open for a new price (§ 2 Abs. 3 Nr. 2 VOB/B)
  rows: { id: string; oz: string; text: string; base: number; delta: number; driver: string }[];
}

export function runScenario(doc: LVDocument, value: Record<string, number>, findings: Finding[], surchargePct: Record<string, number>, sc: Scenario): ScenarioResult {
  const by = new Map<string, { key: string; label: string; base: number; delta: number; items: number }>();
  for (const d of DRIVERS) by.set(d.key, { key: d.key, label: d.label, base: 0, delta: 0, items: 0 });
  const qtyItems = new Set(findings.filter((f) => f.category === 'menge').flatMap((f) => f.itemIds));
  let base = 0, total = 0, surcharge = 0, bedarf = 0, qtyEffect = 0, underRecovery = 0, newPriceVolume = 0;
  const rows: ScenarioResult['rows'] = [];
  for (const it of doc.items) {
    const v = value[it.id] || 0;
    if (it.flags.wahl) continue;
    if (it.flags.bedarf) {
      bedarf += v;
      if (!sc.includeBedarf) continue;
    }
    const d = driverOf(it);
    const lohn = DRIVERS[DRIVERS.length - 1];
    const matPct = (sc.drivers[d.key] || 0) / 100;
    const lohnPct = (sc.drivers[lohn.key] || 0) / 100;
    let delta = d.key === 'lohn' ? v * lohn.share * lohnPct : v * d.share * matPct + v * lohn.share * lohnPct;
    const b = by.get(d.key)!;
    b.base += v;
    b.items++;
    b.delta += d.key === 'lohn' ? delta : v * d.share * matPct;
    if (d.key !== 'lohn') by.get('lohn')!.delta += v * lohn.share * lohnPct;
    let q = 0;
    if (sc.qtyPct && qtyItems.has(it.id)) {
      q = v * (sc.qtyPct / 100);
      qtyEffect += q;
      if (sc.qtyPct > 10) newPriceVolume += v * ((sc.qtyPct - 10) / 100);
      if (sc.qtyPct < -10) underRecovery += v * ((-sc.qtyPct - 10) / 100) * (sc.overheadPct / 100);
    }
    const s = sc.applySurcharges ? (v * (surchargePct[it.id] || 0)) / 100 : 0;
    surcharge += s;
    base += v;
    total += v + delta + q + s;
    if (Math.abs(delta + q + s) > 0.5) rows.push({ id: it.id, oz: it.oz, text: it.shortText, base: v, delta: delta + q + s, driver: d.label });
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { base, total, byDriver: [...by.values()].filter((x) => x.items > 0 || x.delta !== 0), surcharge, bedarf, qtyEffect, underRecovery, newPriceVolume, rows: rows.slice(0, 12) };
}
