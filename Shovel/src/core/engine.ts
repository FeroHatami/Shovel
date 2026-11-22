// Analysis pipeline: price suggestions -> item values -> rules -> scoring -> aggregates.
import type { Analysis, Finding, Lang, LVDocument, LVItem, PriceSuggestion, Txt } from './types.ts';
import { PriceBook } from './prices.ts';
import { runRules, detectTrades, type Draft } from './rules.ts';
import { hash } from './text.ts';

export interface AnalyzeOptions {
  priceBook?: PriceBook;
  project?: LVDocument[];
  extra?: Draft[]; // findings from the LLM layer (already validated)
  lang?: Lang; // language of titles, details, basis and Nachtrag notes; default 'de'. Ids and questions do not depend on it.
}

const SEV_W = { 1: 1, 2: 2.6, 3: 5 } as const;

export function itemValue(it: LVItem, prices: Record<string, PriceSuggestion>): number {
  if (it.total != null && it.total > 0) return it.total;
  if (it.qty != null && it.up != null && it.up > 0) return it.qty * it.up;
  const p = prices[it.id];
  if (p && it.qty != null) return it.qty * p.mid;
  return 0;
}

export function analyze(doc: LVDocument, opts: AnalyzeOptions = {}): Analysis {
  const t0 = performance.now();
  const lang: Lang = opts.lang === 'en' ? 'en' : 'de';
  const pick = (x: Txt): string => (typeof x === 'string' ? x : x[lang]);
  const german = (x: Txt): string => (typeof x === 'string' ? x : x.de);
  const book = opts.priceBook || new PriceBook();
  const own = doc.project.label || doc.project.name || doc.fileName;
  const prices: Record<string, PriceSuggestion> = {};
  for (const it of doc.items) {
    const s = book.suggest(it, doc.priced ? own : undefined);
    if (s) prices[it.id] = s;
  }
  const value = (it: LVItem) => itemValue(it, prices);
  const counted = (it: LVItem) => !it.flags.wahl && !(it.flags.bedarf && it.flags.noTotal);
  const sum = doc.items.reduce((a, i) => a + (counted(i) ? value(i) : 0), 0);
  const pricable = doc.items.filter((i) => counted(i) && i.qty);
  const coverage = pricable.length ? pricable.filter((i) => value(i) > 0).length / pricable.length : 0;

  if (!doc.trade) {
    const tr = detectTrades(doc).filter((t) => t.key !== 'baustelle')[0];
    if (tr) {
      doc.trade = tr.key;
      doc.tradeLabel = tr.label;
    }
  }

  const findings: Finding[] = [];
  const add = (d: Draft) => {
    const items = d.items || [];
    const base = items.reduce((a, i) => a + value(i), 0);
    const exposure = d.exposure ?? (d.surchargePct ? (base * d.surchargePct) / 100 : 0);
    const confidence = d.confidence ?? 0.7;
    const score = SEV_W[d.severity] * confidence * (1 + Math.log10(1 + exposure / 500));
    const f: Finding = {
      id: '',
      ruleId: d.ruleId,
      source: d.source || 'regel',
      category: d.category,
      severity: d.severity,
      confidence,
      itemIds: items.map((i) => i.id),
      oz: items[0]?.oz || '',
      title: pick(d.title),
      detail: pick(d.detail),
      evidence: d.evidence || [],
      basis: d.basis == null ? undefined : pick(d.basis),
      action: d.action,
      question: d.question,
      surchargePct: d.surchargePct,
      nachtrag: d.nachtrag ? { basis: d.nachtrag.basis, direction: d.nachtrag.direction, note: pick(d.nachtrag.note) } : undefined,
      exposure,
      score,
      docId: doc.id,
    };
    // The id is always built from the German title, so a finding keeps its id (and the user's decision on it) in every language.
    f.id = hash(doc.id + f.ruleId + f.oz + german(d.title) + (f.evidence[0]?.quote || ''));
    if (!findings.some((x) => x.id === f.id)) findings.push(f);
  };
  runRules({ doc, value, sum, coverage, prices, add, project: opts.project || [] });
  for (const d of opts.extra || []) {
    // An AI finding on the same position and of the same kind as a rule finding is a confirmation, not a second finding.
    const ids = new Set((d.items || []).map((i) => i.id));
    const twin = ids.size ? findings.find((f) => f.source !== 'ki' && f.category === d.category && f.itemIds.some((id) => ids.has(id))) : undefined;
    if (twin) {
      twin.aiConfirmed = pick(d.detail);
      twin.confidence = Math.min(0.98, twin.confidence + 0.15);
      twin.score *= 1.15;
      continue;
    }
    add(d);
  }
  aggregate(findings, doc, lang);
  findings.sort((a, b) => b.score - a.score);

  const itemRisk: Record<string, number> = {};
  for (const f of findings) for (const id of f.itemIds) itemRisk[id] = (itemRisk[id] || 0) + f.score / Math.max(1, Math.sqrt(f.itemIds.length));
  for (const id of Object.keys(itemRisk)) itemRisk[id] = Math.round(100 * (1 - Math.exp(-itemRisk[id] / 9)));

  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = { 1: 0, 2: 0, 3: 0 };
  for (const f of findings) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    bySeverity[f.severity]++;
  }
  const total = findings.reduce((a, f) => a + f.score, 0);
  const riskScore = Math.round(100 * (1 - Math.exp(-total / (14 * Math.sqrt(Math.max(4, doc.items.length))))));

  const sorted = [...doc.items].filter(counted).sort((a, b) => value(b) - value(a));
  const abc = { a: [] as string[], b: [] as string[], c: [] as string[] };
  let cum = 0;
  for (const it of sorted) {
    const share = sum ? cum / sum : 1;
    (share < 0.8 ? abc.a : share < 0.95 ? abc.b : abc.c).push(it.id);
    cum += value(it);
  }

  const sectionRisk = doc.sections
    .filter((s) => s.level === 1 || doc.sections.every((x) => x.level !== 1))
    .map((s) => {
      const its = doc.items.filter((i) => i.sectionOz === s.oz || i.sectionOz.startsWith(s.oz + '.'));
      const ids = new Set(its.map((i) => i.id));
      const fs = findings.filter((f) => f.itemIds.some((id) => ids.has(id)));
      const sc = fs.reduce((a, f) => a + f.score, 0);
      return { oz: s.oz, label: s.label, findings: fs.length, sum: its.reduce((a, i) => a + value(i), 0), score: Math.round(100 * (1 - Math.exp(-sc / (10 * Math.sqrt(Math.max(3, its.length)))))) };
    });

  const surcharge = surchargeTotal(findings, doc, value);
  return {
    docId: doc.id,
    findings,
    stats: {
      items: doc.items.length,
      sections: doc.sections.length,
      sumTotal: sum,
      estimated: !doc.priced,
      riskScore,
      coverage,
      byCategory,
      bySeverity,
      exposure: findings.reduce((a, f) => a + f.exposure, 0),
      surcharge,
      abc,
    },
    prices,
    itemRisk,
    sectionRisk,
    durationMs: Math.round(performance.now() - t0),
  };
}

// Notes that repeat across many items are folded into one finding, so the list stays readable on a
// 3,000-item LV. The individual positions stay reachable through the finding's item list.
// title and detail come in both languages; ask feeds the German Bieterfrage and stays German.
const AGG: Record<string, { min: number; keepTop?: number; title: (n: number) => string; titleEn: (n: number) => string; detail: string; detailEn: string; ask?: string; severity?: 1 | 2 | 3 }> = {
  'U-CIRCA': { min: 1, title: (n) => `${n} Positionen mit ungefähren Maßangaben („ca.“)`, titleEn: (n) => `${n} items with approximate dimensions (“ca.”)`, detail: 'In diesen Positionen sind preisbestimmende Abmessungen nur ungefähr angegeben. Einzeln meist unkritisch; bei den A-Positionen prüfen, ob die Toleranz den Preis beeinflusst.', detailEn: 'In these items, dimensions that determine the price are only given approximately. Individually this is mostly uncritical; for the A items, check whether the tolerance affects the price.', severity: 1 },
  'U-ODER-AEHNLICH': { min: 1, title: (n) => `${n} Positionen mit offener Aufzählung („o. ä.“, „usw.“, „etc.“)`, titleEn: (n) => `${n} items with an open-ended list (“o. ä.”, “usw.”, “etc.”)`, detail: 'Die Aufzählung der geschuldeten Leistung ist in diesen Positionen nicht abschließend. Bei wertrelevanten Positionen den Umfang klären.', detailEn: 'In these items the list of works owed is not exhaustive. Clarify the scope for items of significant value.', severity: 1 },
  'F-TEXT-FEHLT': { min: 4, title: (n) => `${n} Positionen ohne Langtext`, titleEn: (n) => `${n} items without long text`, detail: 'Diese Positionen bestehen nur aus dem Kurztext. Material, Abmessungen und Ausführung sind nicht beschrieben; bei Standardleistungen üblich, bei wertrelevanten Positionen nachfragen.', detailEn: 'These items consist of the short text only. Material, dimensions and execution are not described; this is usual for standard works, but ask for items of significant value.', ask: 'um Beschreibung der geschuldeten Leistung (Material, Abmessungen, Ausführung)', severity: 2 },
  'F-MENGE-FEHLT': { min: 5, title: (n) => `${n} Positionen ohne Mengenansatz (Menge 0 oder leer)`, titleEn: (n) => `${n} items without a quantity (quantity 0 or empty)`, detail: 'Für diese Positionen ist keine Menge angegeben – häufig Preisabfragen oder Listenpositionen ohne Vordersatz. Sie gehen nicht in die Angebotssumme ein, die Einheitspreise binden aber.', detailEn: 'No quantity is stated for these items – often price enquiries or list items without a quantity. They do not enter the bid total, but the unit prices are binding.', ask: 'um Angabe der voraussichtlichen Mengen bzw. um Bestätigung, dass es sich um reine Preisabfragen handelt', severity: 2 },
  'F-EINHEIT-UNBEKANNT': { min: 3, title: (n) => `${n} Positionen mit ungewöhnlicher Einheit`, titleEn: (n) => `${n} items with an unusual unit`, detail: 'Die Einheiten dieser Positionen lassen sich keiner üblichen Abrechnungseinheit zuordnen.', detailEn: 'The units of these items cannot be matched to any customary unit of measurement.', severity: 1 },
  'M-PLATZHALTER': { min: 6, title: (n) => `${n} Positionen mit Menge 1 – vermutlich Platzhaltermengen`, titleEn: (n) => `${n} items with quantity 1 – probably placeholder quantities`, detail: 'Diese Positionen sind mit genau 1 m, m², m³ oder t ausgeschrieben. Die tatsächlichen Mengen sind offen; die Einheitspreise wirken in der Wertung kaum, binden aber für jede ausgeführte Menge.', detailEn: 'These items are tendered with exactly 1 m, m², m³ or t. The actual quantities are open; the unit prices have hardly any effect in the bid evaluation but are binding for whatever quantity is carried out.', ask: 'um Angabe der voraussichtlich auszuführenden Mengen', severity: 2 },
  'F-TIPPFEHLER': { min: 6, title: (n) => `Schreibfehler in ${n} Positionen`, titleEn: (n) => `Spelling errors in ${n} items`, detail: 'Schreibfehler erschweren Textsuche und Stammdatenabgleich.', detailEn: 'Spelling errors make text search and master-data matching harder.', severity: 1 },
  // Wording risks: the three most valuable stay individual findings, the rest is folded.
  'V-BAUSEITS': { min: 6, keepTop: 3, title: (n) => `${n} weitere Positionen mit bauseitigen Leistungen oder Beistellungen`, titleEn: (n) => `${n} further items with works or supplies provided by the client (bauseits)`, detail: 'In diesen Positionen hängt die Leistung von einer bauseitigen Vorleistung oder Beistellung ab. Art, Ort und Zeitpunkt der Übergabe sollten feststehen.', detailEn: 'In these items the works depend on preceding works or supplies provided by the client. The type, place and time of handover should be fixed.', ask: 'um Angabe von Art, Ort und Zeitpunkt der bauseitigen Leistungen bzw. Beistellungen sowie der jeweiligen Leistungsgrenze', severity: 1 },
  'U-ERFORDERNIS': { min: 6, keepTop: 3, title: (n) => `${n} weitere Positionen mit offenem Umfang („nach Erfordernis“, „soweit erforderlich“)`, titleEn: (n) => `${n} further items with open scope (“nach Erfordernis”, “soweit erforderlich” – as required)`, detail: 'Ob und in welchem Umfang die Teilleistung anfällt, bleibt in diesen Positionen offen.', detailEn: 'Whether and to what extent this part of the works will arise is left open in these items.', ask: 'um Angabe, in welchem Umfang die jeweilige Leistung anfällt und der Kalkulation zugrunde zu legen ist', severity: 2 },
  'U-KOMPLETT': { min: 6, keepTop: 3, title: (n) => `${n} weitere Positionen mit Komplettheitsklausel („einschl. aller Nebenarbeiten“, „komplett“)`, titleEn: (n) => `${n} further items with an all-inclusive clause (“einschl. aller Nebenarbeiten”, “komplett”)`, detail: 'Diese Positionen verlagern nicht beschriebene Teilleistungen pauschal in den Einheitspreis. Besondere Leistungen gehören nur zum Vertrag, wenn sie besonders erwähnt sind.', detailEn: 'These items shift undescribed parts of the works wholesale into the unit price. Special works (Besondere Leistungen) only form part of the contract if they are expressly mentioned.', severity: 2 },
  'V-EINRECHNEN': { min: 6, keepTop: 3, title: (n) => `${n} weitere Positionen mit Leistungen, die „in die Einheitspreise einzurechnen“ sind`, titleEn: (n) => `${n} further items with works “to be included in the unit prices”`, detail: 'Aufwand ohne eigene Position und ohne Mengenansatz muss auf andere Positionen umgelegt werden.', detailEn: 'Effort without its own item and without a quantity has to be spread over other items.', severity: 2 },
  'U-ABSTIMMUNG': { min: 6, title: (n) => `${n} Positionen mit Festlegung erst nach Auftragserteilung („in Abstimmung mit …“)`, titleEn: (n) => `${n} items where details are decided only after award (“in Abstimmung mit …”)`, detail: 'Preisrelevante Details werden in diesen Positionen auf die Ausführung verschoben.', detailEn: 'In these items price-relevant details are deferred to the construction stage.', ask: 'um Festlegung der noch offenen Angaben vor Angebotsabgabe', severity: 2 },
};
function aggregate(findings: Finding[], doc: LVDocument, lang: Lang = 'de') {
  const en = lang === 'en';
  for (const [rule, cfg] of Object.entries(AGG)) {
    let group = findings.filter((f) => f.ruleId === rule && f.itemIds.length <= 1);
    if (group.length <= cfg.min) continue;
    if (cfg.keepTop) group = [...group].sort((a, b) => b.score - a.score).slice(cfg.keepTop);
    const itemIds = [...new Set(group.flatMap((f) => f.itemIds))];
    const ozs = itemIds.map((id) => doc.items.find((i) => i.id === id)?.oz).filter(Boolean) as string[];
    const first = group[0];
    const exposure = group.reduce((a, f) => a + f.exposure, 0) * 0.5;
    const severity = cfg.severity ?? first.severity;
    const agg: Finding = {
      ...first,
      id: hash(doc.id + rule + 'agg'),
      severity,
      itemIds,
      oz: ozs[0] || '',
      title: en ? cfg.titleEn(itemIds.length) : cfg.title(itemIds.length),
      detail: `${en ? cfg.detailEn + ' Affected:' : cfg.detail + ' Betroffen:'} ${ozs.slice(0, 40).join(', ')}${ozs.length > 40 ? ' …' : ''}.`,
      evidence: group.slice(0, 6).flatMap((f) => f.evidence.slice(0, 1)),
      question: cfg.ask ? `Zu den Positionen ${ozs.slice(0, 25).join(', ')}${ozs.length > 25 ? ' u. a.' : ''}: Wir bitten ${cfg.ask}.` : undefined,
      action: cfg.ask ? first.action : 'hinweis',
      surchargePct: undefined,
      nachtrag: first.nachtrag,
      exposure,
      score: SEV_W[severity] * first.confidence * (1 + Math.log10(1 + exposure / 500)),
    };
    for (const f of group) findings.splice(findings.indexOf(f), 1);
    findings.push(agg);
  }
}

// Suggested risk surcharge: per item the largest single surcharge plus half of the others, capped at 20 %.
export function surchargeTotal(findings: Finding[], doc: LVDocument, value: (it: LVItem) => number, decided?: (f: Finding) => boolean): number {
  const per = new Map<string, number[]>();
  for (const f of findings) {
    if (!f.surchargePct || f.itemIds.length !== 1) continue;
    if (decided && !decided(f)) continue;
    (per.get(f.itemIds[0]) || per.set(f.itemIds[0], []).get(f.itemIds[0])!).push(f.surchargePct);
  }
  let s = 0;
  for (const it of doc.items) {
    const p = per.get(it.id);
    if (!p) continue;
    p.sort((a, b) => b - a);
    const pct = Math.min(20, p[0] + p.slice(1).reduce((a, x) => a + x * 0.5, 0));
    s += (value(it) * pct) / 100;
  }
  return s;
}

export function itemSurchargePct(findings: Finding[], itemId: string): number {
  const p = findings.filter((f) => f.surchargePct && f.itemIds.length === 1 && f.itemIds[0] === itemId).map((f) => f.surchargePct!);
  if (!p.length) return 0;
  p.sort((a, b) => b - a);
  return Math.min(20, p[0] + p.slice(1).reduce((a, x) => a + x * 0.5, 0));
}
