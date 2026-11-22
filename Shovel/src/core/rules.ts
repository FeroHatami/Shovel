// Deterministic checks. Each rule is a plain function over the parsed LV. Findings always carry
// the OZ and a literal quote from the LV, so the estimator can verify them at a glance.
import type { Action, Category, Evidence, LVDocument, LVItem, PriceSuggestion, Txt } from './types.ts';
import { BASIS, BASIS_EN, COUPLINGS, NORMS, PARAMS, RATIOS, REQUIRED, TRADES, TRADE_WORDS, TYPOS, VAGUE } from './knowledge.ts';
import { editDistance, fmtEUR, fmtNum, jaccard, snippet, stripPlaceholders, tokens, words } from './text.ts';
import { unitDim } from './units.ts';

export interface Draft {
  ruleId: string;
  source?: 'regel' | 'statistik' | 'ki';
  category: Category;
  severity: 1 | 2 | 3;
  confidence?: number;
  items?: LVItem[];
  title: Txt; // rules give both languages; AI findings arrive as plain German strings
  detail: Txt;
  evidence?: Evidence[];
  basis?: Txt;
  action: Action;
  question?: string;
  surchargePct?: number;
  nachtrag?: { basis: string; direction: 'chance' | 'risiko'; note: Txt };
  exposure?: number;
}

export interface Ctx {
  doc: LVDocument;
  value: (it: LVItem) => number;
  sum: number;
  coverage: number; // share of items with a price
  prices: Record<string, PriceSuggestion>;
  add: (d: Draft) => void;
  project: LVDocument[]; // other LVs of the same project
}

const itemText = (it: LVItem) => it.shortText + '\n' + it.longText;
const q = (s: string) => '„' + s.replace(/\s+/g, ' ').trim() + '“';
const pos = (it: LVItem) => `Pos. ${it.oz} ${q(it.shortText.slice(0, 70))}`;
// Every user-visible text is written in German and English; the engine picks the language. The draft
// Bieterfrage ("question") stays German, and evidence quotes are source text.
const t = (de: string, en: string) => ({ de, en });
const qe = (s: string) => '“' + s.replace(/\s+/g, ' ').trim() + '”';
const posEn = (it: LVItem) => `Item ${it.oz} ${qe(it.shortText.slice(0, 70))}`;
const BASIS_KEYS = Object.keys(BASIS) as (keyof typeof BASIS)[];
// basis texts in the knowledge tables are German BASIS values; find the English gloss for the same key
const bt = (de: string, suffix = ''): Txt => {
  const k = BASIS_KEYS.find((x) => BASIS[x] === de);
  return k ? t(de + suffix, BASIS_EN[k] + suffix) : de + suffix;
};
const ev = (it: LVItem, where: Evidence['where'], quote: string): Evidence => ({ itemId: it.id, oz: it.oz, where, quote });
const isBE = (it: LVItem) => /baustelleneinrichtung|baustelle\s+(einrichten|räumen)|einrichten\s+und\s+räumen/i.test(it.shortText);
const isWieVor = (it: LVItem) => /^\s*(wie\s+(vor|zuvor|oben|pos)|dto\.?|desgl)/i.test(it.shortText) || /^\s*wie\s+(vor|zuvor|pos)/i.test(it.longText);

function findMatch(text: string, re: RegExp): { index: number; match: string } | null {
  const m = new RegExp(re.source, re.flags.replace('g', '')).exec(text);
  return m ? { index: m.index, match: m[0] } : null;
}

// ---------- formal / objective errors ----------
function formal(c: Ctx) {
  const { doc } = c;
  const byOz = new Map<string, LVItem[]>();
  for (const it of doc.items) (byOz.get(it.oz) || byOz.set(it.oz, []).get(it.oz)!).push(it);
  for (const [oz, list] of byOz)
    if (list.length > 1)
      c.add({
        ruleId: 'F-OZ-DOPPELT', category: 'fehler', severity: 3, confidence: 1, items: list,
        title: t(`Ordnungszahl ${oz} ist ${list.length}-fach vergeben`, `Item number (OZ) ${oz} is assigned ${list.length} times`),
        detail: t(`Die OZ ${oz} kommt mehrfach vor (${list.map((i) => q(i.shortText.slice(0, 50))).join(', ')}). Preise können nicht eindeutig zugeordnet werden; GAEB-Rückgabe (D84/X84) schlägt fehl.`, `OZ ${oz} occurs more than once (${list.map((i) => qe(i.shortText.slice(0, 50))).join(', ')}). Prices cannot be assigned unambiguously; the GAEB return file (D84/X84) will fail.`),
        evidence: list.map((i) => ev(i, 'feld', `OZ ${i.oz}: ${i.shortText}`)),
        action: 'bieterfrage', question: `Die Ordnungszahl ${oz} ist mehrfach vergeben. Wir bitten um Korrektur der Nummerierung bzw. um Bestätigung, welche Position gilt.`,
      });

  const hasLong = doc.items.filter((i) => i.longText.length > 20).length > doc.items.length * 0.3;
  for (const it of doc.items) {
    if (!it.shortText && it.qty == null) continue; // price-only records
    // a photo shows one page: its last item usually continues beyond the edge of the picture
    const cutOff = doc.format === 'image' && it === doc.items[doc.items.length - 1] && it.qty == null;
    if ((it.qty == null || it.qty === 0) && !it.flags.qtyTBD && !cutOff)
      c.add({
        ruleId: 'F-MENGE-FEHLT', category: 'fehler', severity: 3, confidence: 0.95, items: [it],
        title: it.qty === 0 ? t('Menge ist 0', 'Quantity is 0') : t('Menge fehlt', 'Quantity missing'),
        detail: t(`${pos(it)} hat ${it.qty === 0 ? 'die Menge 0' : 'keinen Mengenansatz'}. Ohne Vordersatz kann kein Gesamtbetrag gebildet werden.`, `${posEn(it)} has ${it.qty === 0 ? 'a quantity of 0' : 'no quantity'}. Without a quantity no total can be calculated.`),
        evidence: [ev(it, 'feld', `Menge: ${it.qty ?? '—'} ${it.unit ?? ''}`)], basis: t('VOB/A § 4 Abs. 1 Nr. 1 (Menge vom AG anzugeben)', 'VOB/A § 4 Abs. 1 Nr. 1 (quantity to be stated by the client)'),
        action: 'bieterfrage', question: `Zu ${pos(it)}: Es ist kein Mengenansatz angegeben. Wir bitten um Angabe der auszuführenden Menge.`,
      });
    if (!it.unit && it.qty && !it.unitUnread)
      c.add({
        ruleId: 'F-EINHEIT-FEHLT', category: 'fehler', severity: 3, confidence: 0.95, items: [it],
        title: t('Abrechnungseinheit fehlt', 'Unit of measurement missing'), detail: t(`${pos(it)} hat keine Einheit. Die Abrechnungsart ist nicht bestimmt.`, `${posEn(it)} has no unit. The method of measurement is not defined.`),
        evidence: [ev(it, 'feld', `Menge: ${it.qty ?? '—'} (ohne Einheit)`)], basis: t('VOB/C DIN 18299 Abschn. 0.5 (Abrechnungseinheiten)', 'VOB/C DIN 18299 Abschn. 0.5 (units of measurement)'),
        action: 'bieterfrage', question: `Zu ${pos(it)}: Die Abrechnungseinheit fehlt. Wir bitten um Angabe.`,
      });
    else if (it.unit && !it.unitNorm && !/^\[/.test(it.unit))
      c.add({
        ruleId: 'F-EINHEIT-UNBEKANNT', category: 'fehler', severity: 1, confidence: 0.5, items: [it],
        title: t(`Ungewöhnliche Einheit „${it.unit}“`, `Unusual unit “${it.unit}”`), detail: t(`${pos(it)} verwendet die Einheit „${it.unit}“, die keiner üblichen Abrechnungseinheit zugeordnet werden kann.`, `${posEn(it)} uses the unit “${it.unit}”, which cannot be matched to any customary unit of measurement.`),
        evidence: [ev(it, 'feld', `${fmtNum(it.qty)} ${it.unit}`)], action: 'hinweis',
      });
    if (hasLong && (it.longText.length < 12 || it.longText.trim() === it.shortText.trim()) && words(it.shortText).length < 4 && !isWieVor(it) && !it.flags.stundenlohn)
      c.add({
        ruleId: 'F-TEXT-FEHLT', category: 'unklar', severity: 2, confidence: 0.7, items: [it],
        title: t('Leistungsbeschreibung fehlt (nur Kurztext)', 'Description of works missing (short text only)'),
        detail: t(`${pos(it)} besteht nur aus dem Kurztext. Material, Abmessungen und Ausführung sind nicht beschrieben.`, `${posEn(it)} consists of the short text only. Material, dimensions and execution are not described.`),
        evidence: [ev(it, 'kurztext', it.shortText || '(leer)')], basis: bt(BASIS.eindeutig), surchargePct: 5,
        action: 'bieterfrage', question: `Zu ${pos(it)}: Die Position enthält keinen Langtext. Wir bitten um Beschreibung der geschuldeten Leistung (Material, Abmessungen, Ausführung).`,
      });
    if (it.unitNorm === 'psch' && it.qty != null && it.qty !== 1 && it.qty !== 0)
      c.add({
        ruleId: 'F-PSCH-MENGE', category: 'fehler', severity: 1, confidence: 0.8, items: [it],
        title: t(`Pauschale mit Menge ${fmtNum(it.qty)}`, `Lump sum with quantity ${fmtNum(it.qty)}`), detail: t(`${pos(it)}: Eine Pauschale hat üblicherweise die Menge 1. Menge ${fmtNum(it.qty)} psch deutet auf eine falsche Einheit hin (z. B. Monate, Stück).`, `${posEn(it)}: A lump sum normally has a quantity of 1. A quantity of ${fmtNum(it.qty)} psch points to a wrong unit (e.g. months, pieces).`),
        evidence: [ev(it, 'feld', `${fmtNum(it.qty)} ${it.unit}`)], action: 'bieterfrage',
        question: `Zu ${pos(it)}: Die Menge ${fmtNum(it.qty)} ist mit der Einheit „${it.unit}“ ausgeschrieben. Wir bitten um Klarstellung der Abrechnungseinheit.`,
      });
    // arithmetic
    if (it.up != null && it.qty != null && it.total != null && !it.flags.noTotal) {
      const calc = Math.round(it.qty * it.up * 100) / 100;
      const diff = Math.abs(calc - it.total);
      if (diff > 0.02 && diff > Math.abs(it.total) * 0.0005)
        c.add({
          ruleId: 'F-RECHNEN', category: 'fehler', severity: 3, confidence: 1, items: [it], exposure: diff,
          title: t(`Rechenfehler: Menge × EP ≠ GP (Differenz ${fmtEUR(diff)})`, `Arithmetic error: quantity × unit price ≠ total (difference ${fmtEUR(diff)})`),
          detail: t(`${pos(it)}: ${fmtNum(it.qty)} ${it.unit ?? ''} × ${fmtEUR(it.up)} = ${fmtEUR(calc)}, ausgewiesen sind ${fmtEUR(it.total)}. Bei Widerspruch gilt nach VOB/A § 16c Abs. 2 der Einheitspreis.`, `${posEn(it)}: ${fmtNum(it.qty)} ${it.unit ?? ''} × ${fmtEUR(it.up)} = ${fmtEUR(calc)}, but ${fmtEUR(it.total)} is stated. Where the two contradict each other, the unit price prevails under VOB/A § 16c Abs. 2.`),
          evidence: [ev(it, 'feld', `${fmtNum(it.qty)} × ${fmtEUR(it.up)} = ${fmtEUR(it.total)}`)], basis: t('VOB/A § 16c Abs. 2 Nr. 1 (Einheitspreis maßgebend)', 'VOB/A § 16c Abs. 2 Nr. 1 (unit price prevails)'),
          action: 'korrektur',
        });
    }
  }

  // section sums
  if (doc.priced) {
    for (const s of doc.sections) {
      if (s.declaredTotal == null) continue;
      const list = doc.items.filter((i) => i.sectionOz === s.oz || i.sectionOz.startsWith(s.oz + '.'));
      if (!list.length) continue;
      const calc = list.reduce((a, i) => a + (i.flags.noTotal || i.flags.wahl ? 0 : i.total ?? (i.qty != null && i.up != null ? i.qty * i.up : 0)), 0);
      const diff = Math.abs(calc - s.declaredTotal);
      if (diff > 0.5 && diff > s.declaredTotal * 0.0005)
        c.add({
          ruleId: 'F-SUMME', category: 'fehler', severity: 3, confidence: 0.85, items: [], exposure: diff,
          title: t(`Summe ${s.oz} ${s.label} stimmt nicht (Differenz ${fmtEUR(diff)})`, `Total of ${s.oz} ${s.label} is incorrect (difference ${fmtEUR(diff)})`),
          detail: t(`Die Positionen des Abschnitts ergeben ${fmtEUR(calc)}, ausgewiesen sind ${fmtEUR(s.declaredTotal)}. Mögliche Ursachen: Additionsfehler, Bedarfs-/Wahlposition mitgerechnet, fehlende Position.`, `The items of the section add up to ${fmtEUR(calc)}, but ${fmtEUR(s.declaredTotal)} is stated. Possible causes: addition error, a contingency or alternative item (Bedarfs-/Wahlposition) included in the total, a missing item.`),
          evidence: [{ where: 'feld', quote: `Summe ${s.oz}: ${fmtEUR(s.declaredTotal)}` }], action: 'korrektur',
        });
    }
  }

  // inconsistent unit spellings
  const variants = new Map<string, Map<string, LVItem>>();
  for (const it of doc.items) {
    if (!it.unit || !it.unitNorm) continue;
    const k = it.unit.replace(/\.$/, '').toLowerCase();
    const m = variants.get(it.unitNorm) || variants.set(it.unitNorm, new Map()).get(it.unitNorm)!;
    if (!m.has(k)) m.set(k, it);
  }
  const mixed = [...variants.entries()].filter(([, m]) => m.size > 1);
  if (mixed.length)
    c.add({
      ruleId: 'F-EINHEIT-SCHREIBWEISE', category: 'fehler', severity: 1, confidence: 0.9, items: mixed.flatMap(([, m]) => [...m.values()]),
      title: t('Einheiten uneinheitlich geschrieben', 'Units written inconsistently'),
      detail: t(
        'Dieselbe Einheit wird unterschiedlich geschrieben: ' + mixed.map(([n, m]) => `${n}: ${[...m.values()].map((i) => `„${i.unit}“`).join(' / ')}`).join('; ') + '. Beim GAEB-Import in die Kalkulation entstehen dadurch getrennte Einheiten.',
        'The same unit is written in different ways: ' + mixed.map(([n, m]) => `${n}: ${[...m.values()].map((i) => `“${i.unit}”`).join(' / ')}`).join('; ') + '. On GAEB import into the estimating software this creates separate units.',
      ),
      evidence: mixed.flatMap(([, m]) => [...m.values()].map((i) => ev(i, 'feld', `${i.oz}: ${i.unit}`))).slice(0, 6), action: 'hinweis',
    });

  // numbering gaps
  const bySec = new Map<string, LVItem[]>();
  for (const it of doc.items) (bySec.get(it.sectionOz) || bySec.set(it.sectionOz, []).get(it.sectionOz)!).push(it);
  const gaps: { a: LVItem; b: LVItem; missing: string }[] = [];
  for (const list of bySec.values()) {
    const nums = list.map((i) => parseInt(i.oz.split('.').pop() || '', 10));
    if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) continue;
    const diffs = nums.slice(1).map((n, i) => n - nums[i]);
    const freq = new Map<number, number>();
    for (const d of diffs) freq.set(d, (freq.get(d) || 0) + 1);
    const [step, cnt] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    if (step < 1 || cnt < diffs.length * 0.6) continue;
    diffs.forEach((d, i) => {
      if (d === step * 2) {
        const prefix = list[i].oz.split('.').slice(0, -1);
        const last = list[i].oz.split('.').pop()!;
        gaps.push({ a: list[i], b: list[i + 1], missing: [...prefix, String(nums[i] + step).padStart(last.length, '0')].join('.') });
      }
    });
  }
  if (gaps.length && gaps.length <= Math.max(3, doc.items.length * 0.04))
    for (const g of gaps)
      c.add({
        ruleId: 'F-OZ-LUECKE', category: 'luecke', severity: 1, confidence: 0.4, items: [g.a, g.b],
        title: t(`Lücke in der Nummerierung: OZ ${g.missing} fehlt`, `Gap in the numbering: OZ ${g.missing} is missing`),
        detail: t(`Zwischen ${g.a.oz} und ${g.b.oz} fehlt in der sonst durchgehenden Nummerierung die OZ ${g.missing}. Möglicherweise wurde eine Position gelöscht – prüfen, ob die Leistung noch benötigt wird.`, `Between ${g.a.oz} and ${g.b.oz}, OZ ${g.missing} is missing from the otherwise continuous numbering. An item may have been deleted – check whether the works are still needed.`),
        evidence: [ev(g.a, 'feld', `${g.a.oz} ${g.a.shortText}`), ev(g.b, 'feld', `${g.b.oz} ${g.b.shortText}`)], action: 'hinweis',
      });

  // identical items
  const sig = new Map<string, LVItem[]>();
  for (const it of doc.items) {
    if (isWieVor(it) || it.shortText.length < 8 || words(it.shortText).length < 2) continue;
    const k = it.sectionOz + '|' + tokens(itemText(it)).join(' ') + '|' + it.unitNorm; // repeats per building part are normal; inside one section they are not
    (sig.get(k) || sig.set(k, []).get(k)!).push(it);
  }
  for (const list of sig.values()) {
    if (list.length < 2) continue;
    const withLong = list[0].longText.length > 30;
    c.add({
      ruleId: 'F-DOPPELT', category: 'widerspruch', severity: 2, confidence: withLong ? 0.7 : 0.4, items: list,
      exposure: Math.min(...list.map((i) => c.value(i))),
      title: t(`Identische Leistung ${list.length}-fach ausgeschrieben`, `Identical works tendered ${list.length} times`),
      detail: t(`Die Positionen ${list.map((i) => i.oz).join(', ')} haben wortgleichen Text und dieselbe Einheit (Mengen: ${list.map((i) => fmtNum(i.qty)).join(' / ')} ${list[0].unit ?? ''}). Entweder Doppelausschreibung oder die Unterscheidung (Einbauort, Abmessung) fehlt im Text.`, `Items ${list.map((i) => i.oz).join(', ')} have identical wording and the same unit (quantities: ${list.map((i) => fmtNum(i.qty)).join(' / ')} ${list[0].unit ?? ''}). Either the works have been tendered twice or the distinction (location, dimension) is missing from the text.`),
      evidence: list.slice(0, 3).map((i) => ev(i, 'kurztext', `${i.oz}: ${i.shortText}`)), basis: bt(BASIS.eindeutig),
      action: 'bieterfrage', question: `Die Positionen ${list.map((i) => i.oz).join(' und ')} sind textgleich. Wir bitten um Klarstellung, worin sich die Leistungen unterscheiden bzw. ob eine Position entfällt.`,
    });
  }
}

// ---------- typos ----------
function typos(c: Ctx) {
  const { doc } = c;
  const freq = new Map<string, number>();
  for (const it of doc.items) for (const w of words(itemText(it))) freq.set(w, (freq.get(w) || 0) + 1);
  const common = [...freq.entries()].filter(([w, n]) => n >= 3 && w.length >= 8);
  const buckets = new Map<string, string[]>();
  for (const [w] of common) {
    const k = w.slice(0, 2).toLowerCase();
    (buckets.get(k) || buckets.set(k, []).get(k)!).push(w);
  }
  for (const it of doc.items) {
    const hits: { wrong: string; right: string; conf: number }[] = [];
    const seen = new Set<string>();
    for (const w of words(itemText(it))) {
      const lw = w.toLowerCase();
      if (seen.has(lw)) continue;
      seen.add(lw);
      const fix = TYPOS[lw];
      if (fix && fix.toLowerCase() !== lw) {
        hits.push({ wrong: w, right: fix, conf: 0.9 });
        continue;
      }
      if (w.length >= 9 && freq.get(w) === 1) {
        for (const cand of buckets.get(lw.slice(0, 2)) || []) {
          if (Math.abs(cand.length - w.length) > 1 || cand.toLowerCase() === lw) continue;
          if (editDistance(lw, cand.toLowerCase(), 1) !== 1) continue;
          // ignore pure inflection differences at the word end
          let p = 0;
          while (p < Math.min(w.length, cand.length) && lw[p] === cand.toLowerCase()[p]) p++;
          if (p >= Math.min(w.length, cand.length) - 2) continue;
          if (/\d/.test(w)) continue;
          // Without a dictionary only two patterns are safe: swapped neighbours ("Bewherung") and a dropped or
          // tripled double letter ("Verfülung"). Substitutions are usually real words ("Leitungen" / "Leistungen").
          const cl = cand.toLowerCase();
          const swapped = lw.length === cl.length && lw[p] === cl[p + 1] && lw[p + 1] === cl[p];
          const longer = lw.length > cl.length ? lw : cl;
          const doubled = lw.length !== cl.length && longer[p] === longer[p - 1];
          if (!swapped && !doubled) continue;
          hits.push({ wrong: w, right: cand, conf: 0.45 });
          break;
        }
      }
    }
    if (hits.length)
      c.add({
        ruleId: 'F-TIPPFEHLER', category: 'fehler', severity: 1, confidence: Math.max(...hits.map((h) => h.conf)), items: [it],
        title: t(`Schreibfehler: ${hits.map((h) => `„${h.wrong}“`).join(', ')}`, `Spelling error: ${hits.map((h) => `“${h.wrong}”`).join(', ')}`),
        detail: t(`${pos(it)}: ${hits.map((h) => `„${h.wrong}“ → vermutlich „${h.right}“`).join('; ')}. Schreibfehler erschweren Textsuche und Stammdatenabgleich; in Maß- und Materialangaben können sie den Leistungsinhalt verändern.`, `${posEn(it)}: ${hits.map((h) => `“${h.wrong}” → probably “${h.right}”`).join('; ')}. Spelling errors make text search and master-data matching harder; in dimensions and material specifications they can change the content of the works.`),
        evidence: hits.map((h) => {
          const txt = itemText(it);
          return ev(it, it.shortText.includes(h.wrong) ? 'kurztext' : 'langtext', snippet(txt, txt.indexOf(h.wrong), h.wrong.length, 30));
        }),
        action: 'hinweis',
      });
  }
}

// ---------- wording / clarity ----------
function wording(c: Ctx) {
  const { doc } = c;
  const planRefs: { it: LVItem; quote: string }[] = [];
  for (const it of doc.items) {
    const text = itemText(it);
    const hits: { r: (typeof VAGUE)[number]; m: { index: number; match: string } }[] = [];
    for (const r of VAGUE) {
      if (r.scope === 'preamble') continue;
      const m = findMatch(text, r.re);
      if (m) hits.push({ r, m });
    }
    hits.sort((a, b) => b.r.severity - a.r.severity || b.r.pct - a.r.pct);
    for (const { r, m } of hits.slice(0, 3)) {
      const quote = snippet(text, m.index, m.match.length, 45);
      if (r.id === 'U-PLAN') {
        planRefs.push({ it, quote });
        continue;
      }
      if (r.id === 'U-CIRCA' && it.flags.zulage) continue;
      c.add({
        ruleId: r.id, category: r.category, severity: r.severity, confidence: 0.75, items: [it],
        title: t(r.title, r.titleEn), detail: t(`${pos(it)}: ${r.why}`, `${posEn(it)}: ${r.whyEn}`),
        evidence: [ev(it, m.index < it.shortText.length ? 'kurztext' : 'langtext', quote)], basis: bt(r.basis),
        action: r.action, surchargePct: r.pct,
        question: `Zu ${pos(it)}: Im Leistungstext heißt es ${q(m.match)}. Wir bitten ${r.ask}.`,
        nachtrag: r.nachtrag ? { basis: r.nachtrag.match(/§ 2 Abs\. [\d/]+ VOB\/B|§ 6 Abs\. 1 VOB\/B/)?.[0] || 'VOB/B § 2', direction: 'chance', note: t(r.nachtrag, r.nachtragEn || r.nachtrag) } : undefined,
      });
    }
  }
  if (planRefs.length) {
    const names = [...new Set(planRefs.map((p) => p.quote.match(/(Plan|Plänen|Zeichnung(?:en)?|Detail\w*|Statik|\w*[Gg]utachten|Anlage|Skizze|Raumbuch|Türliste|Fensterliste)/)?.[0]).filter(Boolean))];
    c.add({
      ruleId: 'U-PLAN', category: 'bieter', severity: 1, confidence: 0.9, items: planRefs.map((p) => p.it),
      title: t(`${planRefs.length} Positionen verweisen auf Pläne / Anlagen`, `${planRefs.length} items refer to drawings / annexes`),
      detail: t(`Diese Positionen sind nur mit den genannten Unterlagen kalkulierbar (${names.slice(0, 8).join(', ')}). Vor der Kalkulation prüfen, ob alle Unterlagen den Vergabeunterlagen beiliegen.`, `These items can only be priced with the documents referred to (${names.slice(0, 8).join(', ')}). Before pricing, check that all of them are included in the tender documents.`),
      evidence: planRefs.slice(0, 5).map((p) => ev(p.it, 'langtext', p.quote)), basis: bt(BASIS.umstaende), action: 'hinweis',
    });
  }

  // preamble and remarks: risk shifting
  const blocks: { title: string; text: string }[] = [];
  if (doc.preamble) blocks.push({ title: 'Vorbemerkungen', text: doc.preamble });
  for (const r of doc.remarks) blocks.push({ title: r.title || 'Hinweistext', text: r.text });
  const seen = new Set<string>();
  for (const b of blocks) {
    for (const r of VAGUE) {
      if (r.scope !== 'both' && r.scope !== 'preamble') continue;
      const m = findMatch(b.text, r.re);
      if (!m) continue;
      const quote = snippet(b.text, m.index, m.match.length, 110);
      if (seen.has(r.id + quote)) continue;
      seen.add(r.id + quote);
      c.add({
        ruleId: r.id + '-VB', category: 'vertrag', severity: r.severity, confidence: 0.8, items: [],
        title: t(`Vorbemerkung: ${r.title}`, `Preliminary remarks: ${r.titleEn}`),
        detail: t(
          `${/^vorbemerkung/i.test(b.title) ? 'In den Vorbemerkungen' : 'Im Hinweistext ' + q(b.title.slice(0, 60))}: ${r.why} Die Regelung gilt für alle Positionen und ist in die Kalkulation einzubeziehen.`,
          `${/^vorbemerkung/i.test(b.title) ? 'In the preliminary remarks (Vorbemerkungen)' : 'In the note text ' + qe(b.title.slice(0, 60))}: ${r.whyEn} The provision applies to all items and must be taken into account in pricing.`,
        ),
        evidence: [{ where: 'vorbemerkung', quote }], basis: bt(r.basis), action: r.action,
        exposure: c.sum * (r.pct / 100) * 0.25,
        question: `Zu den Vorbemerkungen${/^vorbemerkung/i.test(b.title) ? '' : ` („${b.title.slice(0, 60)}“)`}: Dort heißt es ${q(m.match)}. Wir bitten ${r.ask}.`,
        nachtrag: r.nachtrag ? { basis: 'VOB/B § 2', direction: 'risiko', note: t(r.nachtrag, r.nachtragEn || r.nachtrag) } : undefined,
      });
    }
  }

  // "wie vor" without a usable reference
  doc.items.forEach((it, i) => {
    if (!isWieVor(it)) return;
    const prev = doc.items[i - 1];
    const ref = /wie\s+Pos(?:ition)?\.?\s*([\d.]+\d)/i.exec(itemText(it));
    if (ref) {
      if (!doc.items.some((x) => x.oz === ref[1] || x.oz.endsWith('.' + ref[1])))
        c.add({
          ruleId: 'U-WIEVOR', category: 'widerspruch', severity: 3, confidence: 0.85, items: [it],
          title: t(`Verweis auf nicht vorhandene Position ${ref[1]}`, `Reference to non-existent item ${ref[1]}`), detail: t(`${pos(it)} verweist auf Pos. ${ref[1]}, die im LV nicht existiert. Der Leistungsinhalt ist nicht bestimmbar.`, `${posEn(it)} refers to item ${ref[1]}, which does not exist in the bill of quantities. The content of the works cannot be determined.`),
          evidence: [ev(it, 'langtext', ref[0])], basis: bt(BASIS.eindeutig), action: 'bieterfrage', surchargePct: 5,
          question: `Zu ${pos(it)}: Die Position verweist auf Pos. ${ref[1]}, die im LV nicht enthalten ist. Wir bitten um Klarstellung der Bezugsposition.`,
        });
    } else if (!prev || prev.sectionOz !== it.sectionOz)
      c.add({
        ruleId: 'U-WIEVOR', category: 'unklar', severity: 2, confidence: 0.8, items: [it],
        title: t('„Wie vor“ ohne Bezugsposition', '“Wie vor” (as before) without a reference item'), detail: t(`${pos(it)} beginnt mit „wie vor“, ist aber die erste Position des Abschnitts. Worauf sich der Verweis bezieht, ist offen.`, `${posEn(it)} begins with “wie vor” (as before) but is the first item of the section. What the reference relates to is open.`),
        evidence: [ev(it, 'kurztext', it.shortText)], basis: bt(BASIS.eindeutig), action: 'bieterfrage', surchargePct: 5,
        question: `Zu ${pos(it)}: Die Position verweist mit „wie vor“ auf eine Vorposition, steht aber am Abschnittsanfang. Wir bitten um vollständige Beschreibung.`,
      });
    else if (prev.unitNorm && it.unitNorm && unitDim(prev.unit) !== unitDim(it.unit) && !/jedoch/i.test(itemText(it)))
      c.add({
        ruleId: 'U-WIEVOR', category: 'unklar', severity: 1, confidence: 0.5, items: [it, prev],
        title: t('„Wie vor“ mit anderer Abrechnungseinheit', '“Wie vor” (as before) with a different unit of measurement'), detail: t(`${pos(it)} verweist auf ${prev.oz} (${prev.unit}), wird aber in ${it.unit} abgerechnet, ohne die Abweichung zu beschreiben.`, `${posEn(it)} refers to ${prev.oz} (${prev.unit}) but is measured in ${it.unit}, without describing the deviation.`),
        evidence: [ev(it, 'kurztext', it.shortText), ev(prev, 'feld', `${prev.oz}: ${prev.unit}`)], action: 'bieterfrage',
        question: `Zu ${pos(it)}: Die Position verweist auf Pos. ${prev.oz}, hat aber eine andere Abrechnungseinheit. Wir bitten um Klarstellung.`,
      });
  });

  // product without "oder gleichwertig"
  const preEq = /gleichwertig/i.test(doc.preamble + ' ' + doc.remarks.map((r) => r.text).join(' '));
  for (const it of doc.items) {
    const text = itemText(it);
    const m = /\b(?:Leitfabrikat|Fabrikat|Hersteller|Produkt|Erzeugnis)\s*[:=]\s*((?:\[[A-Z]+_\d+\]|[A-ZÄÖÜ][\w\-.]+)(?:[ \t]+[A-Z0-9][\w\-.]+){0,3})/.exec(text);
    if (!m || /^(Nach|Wie|Angeb|Des|Der|Oder|Siehe|Bieter)/i.test(m[1])) continue;
    if (/gleichwertig|oder\s+glw|o\.\s?glw|gleichw\.|o\.\s?ä\.|oder\s+ähnlich|oder\s+vergleichbar/i.test(text)) continue;
    c.add({
      ruleId: 'U-FABRIKAT', category: 'unklar', severity: 2, confidence: preEq ? 0.45 : 0.75, items: [it],
      title: t('Produktvorgabe ohne „oder gleichwertig“', 'Product specified without “oder gleichwertig” (or equivalent)'),
      detail: t(
        `${pos(it)} schreibt ein bestimmtes Fabrikat vor${preEq ? ' (Gleichwertigkeit wird nur allgemein in den Vorbemerkungen erwähnt)' : ''}. Das bindet den Einkauf an einen Lieferanten; ob Alternativen zugelassen sind, ist offen.`,
        `${posEn(it)} prescribes a specific make${preEq ? ' (equivalence is only mentioned in general terms in the preliminary remarks)' : ''}. This ties purchasing to one supplier; whether alternatives are permitted is open.`,
      ),
      evidence: [ev(it, 'langtext', snippet(text, m.index, m[0].length, 30))], basis: bt(BASIS.gleichwertig), surchargePct: 3,
      action: 'bieterfrage', question: `Zu ${pos(it)}: Es ist ${q(m[0])} vorgegeben. Wir bitten um Bestätigung, dass gleichwertige Produkte zugelassen sind, sowie um Angabe der maßgebenden Gleichwertigkeitskriterien.`,
    });
  }

  // bidder fields
  const bf = doc.items.filter((i) => i.flags.bidderFields > 0);
  if (bf.length)
    c.add({
      ruleId: 'B-ANGABEN', category: 'bieter', severity: 2, confidence: 1, items: bf,
      title: t(`${bf.reduce((a, i) => a + i.flags.bidderFields, 0)} Bieterangaben in ${bf.length} Positionen auszufüllen`, `${bf.reduce((a, i) => a + i.flags.bidderFields, 0)} bidder entries (Bieterangaben) to be completed in ${bf.length} items`),
      detail: t('Diese Positionen verlangen Angaben des Bieters (z. B. angebotenes Fabrikat/Typ). Fehlende geforderte Erklärungen können zum Ausschluss des Angebots führen (VOB/A § 16a).', 'These items require information from the bidder (e.g. the make / type offered). If a required declaration is missing, the bid can be excluded (VOB/A § 16a).'),
      evidence: bf.slice(0, 6).map((i) => ev(i, 'langtext', (i.longText.match(/[^\n]*(?:\.{6,}|Fabrikat|Typ)[^\n]*/) || [i.shortText])[0].slice(0, 120))),
      basis: t('VOB/A § 13 Abs. 1 Nr. 4 / § 16a (geforderte Erklärungen)', 'VOB/A § 13 Abs. 1 Nr. 4 / § 16a (required declarations)'), action: 'hinweis',
    });

  // unit vs. "Abrechnung nach ..."
  const B0 = '(?<![A-Za-zäöüÄÖÜß0-9])';
  const B1 = '(?![A-Za-zäöüÄÖÜß0-9])';
  const dimWords: [RegExp, string][] = [[/m²|m2|qm|fläche/i, 'area'], [/m³|m3|cbm|raummaß|volumen/i, 'volume'], [new RegExp(`gewicht|tonne|wiegeschein|${B0}t${B1}|${B0}kg${B1}`, 'i'), 'mass'], [/stück|stk|anzahl/i, 'count'], [new RegExp(`stunde|zeitaufwand|${B0}h${B1}`, 'i'), 'time'], [new RegExp(`länge|lfd|lfm|${B0}m${B1}|meter|höhe`, 'i'), 'length']];
  for (const it of doc.items) {
    const m = /Abrechnung\s+(?:erfolgt\s+)?(?:nach|in|je|pro)\s+([^\s.,;:]+(?:\s+[^\s.,;:]+)?)/i.exec(it.longText);
    const d = unitDim(it.unit);
    if (!m || !d || d === 'lump' || d === 'rate' || d === 'other') continue;
    const after = it.longText.slice(m.index, m.index + m[0].length + 140);
    if (/\sx\s|×|\*/.test(after.slice(0, m[0].length + 25))) continue; // "Stück x Stunden": product units
    if (/\bund\b.{0,50}\b(?:Höhe|Breite|Länge|Tiefe|Dicke)\b/i.test(after)) continue; // "nach Länge ... und der Höhe" describes an area or volume
    const want = dimWords.find(([re]) => re.test(m[1]))?.[1];
    if (want && want !== d && !(want === 'time' && d === 'time'))
      c.add({
        ruleId: 'W-EINHEIT-TEXT', category: 'widerspruch', severity: (want === 'area' && d === 'volume') || (want === 'volume' && d === 'area') ? 3 : 2, confidence: 0.6, items: [it],
        title: t(`Widerspruch: Text sagt ${q(m[0])}, Einheit ist ${it.unit}`, `Contradiction: text says ${qe(m[0])}, unit is ${it.unit}`), detail: t(`${pos(it)}: Der Langtext legt eine andere Abrechnungsart fest als das Einheitenfeld (${fmtNum(it.qty)} ${it.unit}). Menge und Preis passen nicht zusammen.`, `${posEn(it)}: The long text specifies a different method of measurement from the unit field (${fmtNum(it.qty)} ${it.unit}). Quantity and price do not match.`),
        evidence: [ev(it, 'langtext', m[0]), ev(it, 'feld', `${fmtNum(it.qty)} ${it.unit}`)], basis: bt(BASIS.eindeutig), surchargePct: 8,
        action: 'bieterfrage', question: `Zu ${pos(it)}: Der Langtext nennt ${q(m[0])}, die Position ist jedoch in „${it.unit}“ ausgeschrieben. Wir bitten um Klarstellung der Abrechnungseinheit und des Mengenansatzes.`,
      });
  }
  for (const it of doc.items) {
    const d = unitDim(it.unit);
    if ((d === 'volume' || d === 'mass') && /^(?!.*\b(?:Zulage|Entsorg|Abbruch|abbrechen|Rückbau|ausbauen|entfernen|Material|liefern)\b).*(?:estrich|bodenbelag|teppichboden|anstrich|wandfliesen|bodenfliesen|beschichtung|abdichtung|tapete)\b/i.test(it.shortText) && !/^\s*Zulage/i.test(it.shortText))
      c.add({
        ruleId: 'W-EINHEIT-ART', category: 'widerspruch', severity: 2, confidence: 0.55, items: [it],
        title: t(`Einheit ${it.unit} passt nicht zur Leistungsart`, `Unit ${it.unit} does not fit the type of works`), detail: t(`${pos(it)} ist eine Flächenleistung, wird aber in ${it.unit} abgerechnet. Entweder Einheit oder Menge (${fmtNum(it.qty)}) ist vermutlich falsch.`, `${posEn(it)} is work measured by area but is measured in ${it.unit}. Either the unit or the quantity (${fmtNum(it.qty)}) is probably wrong.`),
        evidence: [ev(it, 'feld', `${fmtNum(it.qty)} ${it.unit}`)], basis: 'VOB/C DIN 18299 Abschn. 0.5', surchargePct: 5,
        action: 'bieterfrage', question: `Zu ${pos(it)}: Die Flächenleistung ist in „${it.unit}“ ausgeschrieben. Wir bitten um Bestätigung der Abrechnungseinheit und der Menge.`,
      });
  }

  // required parameters
  const general = doc.preamble + '\n' + doc.remarks.map((r) => r.text).join('\n');
  const hasLongTexts = doc.items.filter((i) => i.longText.length > 20 && i.longText.trim() !== i.shortText.trim()).length > doc.items.length * 0.3;
  for (const it of hasLongTexts ? doc.items : []) {
    if (isWieVor(it) || it.flags.zulage || it.flags.stundenlohn) continue;
    const text = itemText(it) + '\n' + (it.context || '');
    for (const r of REQUIRED) {
      if (!r.when.test(it.shortText) || (r.not && r.not.test(it.shortText))) continue;
      if (r.units && (!it.unitNorm || !r.units.includes(it.unitNorm))) continue;
      if (r.need.test(text)) continue;
      const inGeneral = r.need.test(general);
      if (inGeneral && r.id !== 'aushub-tiefe') continue;
      c.add({
        ruleId: 'U-PFLICHTANGABE', category: 'unklar', severity: 2, confidence: 0.6, items: [it],
        title: t(`Preisbestimmende Angabe fehlt: ${r.label}`, `Price-determining information missing: ${r.labelEn}`), detail: t(`${pos(it)} nennt keine ${r.label}. Ohne diese Angabe ist die Position nicht sicher kalkulierbar.`, `${posEn(it)} does not state the ${r.labelEn}. Without this information the item cannot be priced reliably.`),
        evidence: [ev(it, 'kurztext', it.shortText + (it.longText ? ' – ' + it.longText.slice(0, 120).replace(/\n/g, ' ') : ''))], basis: bt(BASIS.eindeutig), surchargePct: 5,
        action: 'bieterfrage', question: `Zu ${pos(it)}: Wir bitten um ${r.ask}.`,
        nachtrag: { basis: '§ 2 Abs. 5 VOB/B', direction: 'chance', note: t('Wird später eine höherwertige Ausführung verlangt als bei verständiger Auslegung zu erwarten: geänderte Leistung.', 'If a higher-quality execution is later required than could be expected on a reasonable reading: varied works.') },
      });
      break;
    }
  }

  // Kurztext vs. Langtext contradictions (one finding per item, listing every parameter that differs)
  for (const it of doc.items) {
    if (!it.longText || !it.shortText) continue;
    const diffs: { label: string; labelEn: string; a: string; b: string; bi: number }[] = [];
    for (const p of PARAMS) {
      const get = (s: string) => {
        const out = new Set<string>();
        for (const m of s.matchAll(new RegExp(p.re.source, p.re.flags))) {
          let v = parseFloat(m[1].replace(',', '.').replace(/\s/g, ''));
          if (m[2] === 'cm') v *= 10;
          if (m[2] === 'm') v *= 1000;
          if (p.key === 'dn') for (const x of m[1].split('/')) out.add(String(parseFloat(x)));
          else out.add(p.key === 'cklasse' ? m[1].replace(/\s/g, '') : String(v));
        }
        return out;
      };
      const a = get(it.shortText);
      const b = get(it.longText);
      if (!a.size || !b.size) continue;
      // several values in the long text usually describe several components: not a contradiction
      if (p.key !== 'dn' && p.key !== 'cklasse' && (b.size > 1 || a.size > 1)) continue;
      if (p.key === 'cklasse' && b.size > 2) continue;
      if ([...a].some((v) => b.has(v))) continue;
      const fa = findMatch(it.shortText, p.re)!;
      const fb = findMatch(it.longText, p.re)!;
      diffs.push({ label: p.label, labelEn: p.labelEn, a: fa.match, b: fb.match, bi: fb.index });
    }
    if (!diffs.length) continue;
    const d0 = diffs[0];
    c.add({
      ruleId: 'W-KURZ-LANG', category: 'widerspruch', severity: 3, confidence: 0.75, items: [it],
      title: t(`Widerspruch Kurztext / Langtext: ${diffs.map((d) => d.label).join(' und ')}`, `Contradiction between short text and long text: ${diffs.map((d) => d.labelEn).join(' and ')}`),
      detail: t(`${pos(it)}: ${diffs.map((d) => `Der Kurztext nennt ${q(d.a)}, der Langtext ${q(d.b)}`).join('; ')}. Welche Ausführung geschuldet ist, ist offen.`, `${posEn(it)}: ${diffs.map((d) => `The short text states ${qe(d.a)}, the long text ${qe(d.b)}`).join('; ')}. It is open which execution is owed.`),
      evidence: [ev(it, 'kurztext', it.shortText), ...diffs.map((d) => ev(it, 'langtext', snippet(it.longText, d.bi, d.b.length, 40)))], basis: bt(BASIS.eindeutig), surchargePct: 6,
      action: 'bieterfrage', question: `Zu ${pos(it)}: Kurztext (${diffs.map((d) => q(d.a)).join(', ')}) und Langtext (${diffs.map((d) => q(d.b)).join(', ')}) widersprechen sich. Wir bitten um Klarstellung, welche Angabe gilt.`,
      nachtrag: { basis: '§ 2 Abs. 5 VOB/B', direction: 'chance', note: t('Bei Anordnung der aufwändigeren Variante: Mehrvergütung, sofern die günstigere kalkuliert und der Widerspruch nicht erkennbar zu Lasten des Bieters auszulegen war. Erkannte Widersprüche vor Angebotsabgabe aufklären.', 'If the more elaborate variant is instructed: additional payment, provided the cheaper one was priced and the contradiction did not obviously have to be read against the bidder. Clear up any contradictions you have spotted before submitting the bid.') },
    });
    void d0;
  }

  // outdated norms
  for (const n of NORMS) {
    const hitItems: { it?: LVItem; quote: string }[] = [];
    for (const it of doc.items) {
      const t = itemText(it);
      const m = findMatch(t, n.re);
      if (m) hitItems.push({ it, quote: snippet(t, m.index, m.match.length, 40) });
    }
    for (const b of blocks) {
      const m = findMatch(b.text, n.re);
      if (m) hitItems.push({ quote: snippet(b.text, m.index, m.match.length, 60) });
    }
    if (!hitItems.length) continue;
    const its = hitItems.map((h) => h.it).filter(Boolean) as LVItem[];
    c.add({
      ruleId: 'W-NORM', category: 'widerspruch', severity: n.severity, confidence: 0.8, items: its,
      title: t(`Überholte Regelwerksangabe: ${n.old}`, `Outdated reference to standards: ${n.oldEn}`),
      detail: t(`${hitItems.length} Fundstelle(n) verweisen auf ${n.old}. Maßgebend ist heute: ${n.now}. Die Anforderung im LV und die anerkannten Regeln der Technik fallen auseinander – klären, was geschuldet ist.`, `${hitItems.length} passage(s) refer to ${n.oldEn}. What applies today: ${n.nowEn}. The requirement in the bill of quantities and the generally accepted rules of technology diverge – clarify what is owed.`),
      evidence: hitItems.slice(0, 4).map((h) => (h.it ? ev(h.it, 'langtext', h.quote) : { where: 'vorbemerkung' as const, quote: h.quote })),
      basis: bt(BASIS.eindeutig), action: 'bieterfrage', surchargePct: n.severity === 2 ? 3 : 0,
      question: `Im LV wird auf ${n.old} Bezug genommen${its.length ? ` (u. a. Pos. ${its.slice(0, 4).map((i) => i.oz).join(', ')})` : ''}. Maßgebend ist inzwischen ${n.now}. Wir bitten um Angabe der Anforderungen nach aktuellem Regelwerk.`,
    });
  }
}

// ---------- item types, quantities ----------
function typesAndQuantities(c: Ctx) {
  const { doc } = c;
  const bedarf = doc.items.filter((i) => i.flags.bedarf);
  if (bedarf.length) {
    const v = bedarf.reduce((a, i) => a + c.value(i), 0);
    const base = c.sum + bedarf.filter((i) => i.flags.noTotal).reduce((a, i) => a + c.value(i), 0); // LV sum including the optional items
    const share = base ? v / base : 0;
    c.add({
      ruleId: 'V-BEDARF', category: 'vertrag', severity: (share > 0.1 && c.coverage >= 0.6) || bedarf.length > 8 ? 3 : 2, confidence: 0.7, items: bedarf, exposure: v * 0.5,
      title: t(`${bedarf.length} Bedarfspositionen${v > 0 && base && c.coverage >= 0.6 ? ` (≈ ${(share * 100).toFixed(1)} % des LV-Werts)` : ''}`, `${bedarf.length} contingency items (Bedarfspositionen)${v > 0 && base && c.coverage >= 0.6 ? ` (≈ ${(share * 100).toFixed(1)} % of the value of the bill of quantities)` : ''}`),
      detail: t('Bedarfspositionen sind grundsätzlich nicht aufzunehmen. Ob sie ausgeführt werden, entscheidet der AG erst später: Gemeinkosten, die hier eingerechnet sind, bleiben bei Nichtabruf ungedeckt; die Preise binden trotzdem.', 'As a rule, contingency items (Bedarfspositionen) should not be included in a tender. The client decides only later whether they are carried out: overheads priced into them are not recovered if they are not called off, yet the prices remain binding.'),
      evidence: bedarf.slice(0, 5).map((i) => ev(i, 'kurztext', `${i.oz}: ${i.shortText}`)), basis: bt(BASIS.bedarf), action: 'zuschlag',
      question: `Das LV enthält ${bedarf.length} Bedarfspositionen (${bedarf.slice(0, 6).map((i) => i.oz).join(', ')}${bedarf.length > 6 ? ' …' : ''}). Wir bitten um Angabe, mit welcher Wahrscheinlichkeit und in welchem Umfang diese zur Ausführung kommen, und ob sie in die Wertung eingehen.`,
      nachtrag: { basis: '§ 2 Abs. 3 VOB/B', direction: 'risiko', note: t('Keine Gemeinkosten in Bedarfspositionen einrechnen; Abruf schriftlich anordnen lassen.', 'Do not price overheads into contingency items (Bedarfspositionen); have any call-off instructed in writing.') },
    });
  }
  const wahl = doc.items.filter((i) => i.flags.wahl);
  if (wahl.length)
    c.add({
      ruleId: 'V-WAHL', category: 'vertrag', severity: 1, confidence: 1, items: wahl,
      title: t(`${wahl.length} Wahl-/Alternativpositionen`, `${wahl.length} alternative items (Wahl-/Alternativpositionen)`), detail: t('Der AG behält sich die Auswahl zwischen Ausführungsvarianten vor. Für jede Variante muss ein auskömmlicher Preis stehen; Material kann erst nach der Entscheidung disponiert werden.', 'The client reserves the right to choose between execution variants. Each variant needs a price that covers its costs; material can only be ordered once the decision has been made.'),
      evidence: wahl.slice(0, 5).map((i) => ev(i, 'kurztext', `${i.oz}: ${i.shortText}`)), basis: bt(BASIS.eindeutig), action: 'hinweis',
    });
  const std = doc.items.filter((i) => i.flags.stundenlohn || (unitDim(i.unit) === 'time' && /stundenlohn|facharbeiter|helfer|polier|vorarbeiter|regie/i.test(i.shortText)));
  if (std.length) {
    const hours = std.reduce((a, i) => a + (i.unitNorm === 'h' ? i.qty || 0 : 0), 0);
    c.add({
      ruleId: 'V-STUNDENLOHN', category: 'vertrag', severity: 1, confidence: 0.9, items: std,
      title: t(`Angehängte Stundenlohnarbeiten (${std.length} Pos.${hours ? `, ${fmtNum(hours)} h` : ''})`, `Appended daywork (Stundenlohnarbeiten; ${std.length} items${hours ? `, ${fmtNum(hours)} h` : ''})`),
      detail: t('Stundenlohnarbeiten dürfen nur im unbedingt erforderlichen Umfang ausgeschrieben werden. Sie werden nur vergütet, wenn sie vor Beginn ausdrücklich vereinbart sind – Stundenzettel zeitnah vorlegen.', 'Daywork may only be tendered to the extent strictly necessary. It is only paid for if it has been expressly agreed before the work starts – submit daywork sheets promptly.'),
      evidence: std.slice(0, 4).map((i) => ev(i, 'feld', `${i.oz}: ${fmtNum(i.qty)} ${i.unit} ${i.shortText}`)), basis: bt(BASIS.bedarf, '; VOB/B § 2 Abs. 10'), action: 'hinweis',
    });
  }
  for (const it of doc.items) {
    if (it.unitNorm !== 'psch' || isBE(it) || it.flags.bedarf) continue;
    const share = c.sum ? c.value(it) / c.sum : 0;
    const vague = VAGUE.some((r) => ['U-KOMPLETT', 'U-ERFORDERNIS', 'V-ERSCHWERNIS'].includes(r.id) && r.re.test(itemText(it)));
    const noScope = it.longText.length < 60;
    if (!(share > 0.03 || vague)) continue;
    c.add({
      ruleId: 'V-PAUSCHAL', category: 'vertrag', severity: share > 0.03 || vague ? 2 : 1, confidence: 0.6, items: [it],
      title: t('Pauschalposition mit nicht genau bestimmtem Umfang', 'Lump-sum item with a scope that is not precisely defined'),
      detail: t(
        `${pos(it)} wird pauschal vergütet${noScope ? ', der Leistungsumfang ist aber kaum beschrieben' : ''}${vague ? ' und enthält offene Formulierungen' : ''}. Bei Pauschalen trägt der Bieter das Mengenrisiko; die Vergütung bleibt auch bei Mehraufwand unverändert.`,
        `${posEn(it)} is paid as a lump sum${noScope ? ', but the scope of works is barely described' : ''}${vague ? ' and contains open-ended wording' : ''}. With lump sums the bidder carries the quantity risk; payment stays the same even if more effort is needed.`,
      ),
      evidence: [ev(it, 'langtext', (it.longText || it.shortText).slice(0, 160).replace(/\n/g, ' '))], basis: bt(BASIS.pauschal, '; VOB/B § 2 Abs. 7'), surchargePct: 8,
      action: 'bieterfrage', question: `Zu ${pos(it)}: Die Leistung ist pauschal ausgeschrieben. Wir bitten um Angabe der Mengen bzw. des Leistungsumfangs, der mit der Pauschale abgegolten sein soll.`,
    });
  }
  for (const it of doc.items) {
    const d = unitDim(it.unit);
    if (it.qty !== 1 || !d || !['length', 'area', 'volume', 'mass'].includes(d) || it.flags.bedarf) continue;
    c.add({
      ruleId: 'M-PLATZHALTER', category: 'menge', severity: 2, confidence: 0.6, items: [it],
      title: t(`Menge 1 ${it.unit} – vermutlich Platzhaltermenge`, `Quantity 1 ${it.unit} – probably a placeholder quantity`),
      detail: t(`${pos(it)} ist mit genau 1 ${it.unit} ausgeschrieben. Die tatsächliche Menge ist offen; der Einheitspreis wirkt in der Wertung kaum, bindet aber für jede ausgeführte Menge.`, `${posEn(it)} is tendered with exactly 1 ${it.unit}. The actual quantity is open; the unit price has hardly any effect in the bid evaluation but is binding for whatever quantity is carried out.`),
      evidence: [ev(it, 'feld', `${fmtNum(it.qty)} ${it.unit}`)], basis: bt(BASIS.menge), action: 'bieterfrage',
      question: `Zu ${pos(it)}: Die Menge ist mit 1 ${it.unit} angegeben. Wir bitten um Angabe der voraussichtlich auszuführenden Menge.`,
      nachtrag: { basis: '§ 2 Abs. 3 VOB/B', direction: 'chance', note: t('Über 110 % der LV-Menge kann ein neuer Preis verlangt werden; den EP deshalb auskömmlich und ohne Mengenrabatt kalkulieren.', 'Above 110 % of the tendered quantity a new price can be demanded; so set the unit price to cover costs and without a volume discount.') },
    });
  }

  // liefern <-> verlegen
  for (const cp of COUPLINGS) {
    const strip = (it: LVItem) => tokens(it.shortText).filter((t) => !/^(liefern|verlegen|einbauen|montieren|lieferung|verlegung|herstellen|zulage)$/.test(t));
    const A = doc.items.filter((i) => cp.a.test(i.shortText) && !i.flags.zulage);
    const B = doc.items.filter((i) => cp.b.test(i.shortText) && !/\bliefern\b/i.test(i.shortText) && !i.flags.zulage);
    for (const a of A) {
      const ta = strip(a);
      if (ta.length < 1) continue;
      let best: LVItem | null = null;
      let bs = 0;
      for (const b of B) {
        if (b.unitNorm !== a.unitNorm) continue;
        const s = jaccard(ta, strip(b));
        if (s > bs) [bs, best] = [s, b];
      }
      if (best && bs >= 0.5 && a.qty && best.qty) {
        const dev = Math.abs(a.qty - best.qty) / Math.max(a.qty, best.qty);
        if (dev > cp.tol)
          c.add({
            ruleId: 'M-LIEFERN-VERLEGEN', category: 'menge', severity: dev > 0.2 ? 3 : 2, confidence: Math.min(0.85, 0.4 + bs * 0.5), items: [a, best],
            exposure: Math.abs(a.qty - best.qty) * (c.value(a) / a.qty + c.value(best) / best.qty) * 0.5,
            title: t(`Mengen passen nicht zusammen: liefern ${fmtNum(a.qty)} ${a.unit} ↔ verlegen ${fmtNum(best.qty)} ${best.unit}`, `Quantities do not match: supply ${fmtNum(a.qty)} ${a.unit} ↔ install ${fmtNum(best.qty)} ${best.unit}`),
            detail: t(`${pos(a)} und ${pos(best)} gehören zusammen, die Mengen weichen aber um ${(dev * 100).toFixed(0)} % ab. Eine der beiden Mengen ist vermutlich falsch.`, `${posEn(a)} and ${posEn(best)} belong together, but the quantities differ by ${(dev * 100).toFixed(0)} %. One of the two quantities is probably wrong.`),
            evidence: [ev(a, 'feld', `${a.oz}: ${fmtNum(a.qty)} ${a.unit} ${a.shortText}`), ev(best, 'feld', `${best.oz}: ${fmtNum(best.qty)} ${best.unit} ${best.shortText}`)],
            basis: bt(BASIS.menge), action: 'bieterfrage',
            question: `Die Liefermenge in Pos. ${a.oz} (${fmtNum(a.qty)} ${a.unit}) und die Verlegemenge in Pos. ${best.oz} (${fmtNum(best.qty)} ${best.unit}) weichen voneinander ab. Wir bitten um Prüfung und Mitteilung der zutreffenden Mengen.`,
            nachtrag: { basis: '§ 2 Abs. 3 VOB/B', direction: 'chance', note: t('Die zu niedrig angesetzte Menge wird sich in der Ausführung erhöhen: Preis für die Mehrmenge über 110 % neu vereinbaren.', 'The quantity that was set too low will increase during construction: agree a new price for the excess quantity above 110 %.') },
          });
      }
    }
  }

  // ratios
  for (const r of RATIOS) {
    const pick = (re: RegExp, not: RegExp | undefined, unit: string) =>
      doc.items.filter((i) => re.test(i.shortText) && !(not && not.test(i.shortText)) && !i.flags.bedarf && !i.flags.wahl && !i.flags.zulage && (i.unitNorm === unit || (unit === 't' && i.unitNorm === 'kg')) && i.qty);
    let N = pick(r.num, r.numNot, r.numUnit);
    let D = pick(r.den, r.denNot, r.denUnit);
    // STLB-style short texts ("lösen laden fördern verfüllen") match both sides: such items say nothing about the ratio
    const both = new Set(N.filter((i) => D.includes(i)).map((i) => i.id));
    N = N.filter((i) => !both.has(i.id));
    D = D.filter((i) => !both.has(i.id));
    if (!N.length || D.length < 2 || D.reduce((a, i) => a + i.qty!, 0) < 100) continue;
    const n = N.reduce((a, i) => a + (i.unitNorm === 'kg' ? i.qty! / 1000 : i.qty!), 0);
    const d = D.reduce((a, i) => a + i.qty!, 0);
    const ratio = n / d;
    if (ratio >= r.min && ratio <= r.max) continue;
    c.add({
      ruleId: 'M-VERHAELTNIS', source: 'statistik', category: 'menge', severity: 2, confidence: 0.5, items: [...N, ...D].slice(0, 12),
      exposure: N.reduce((a, i) => a + c.value(i), 0) * 0.15,
      title: t(`${r.label} unplausibel: ${fmtNum(ratio, 2)} ${r.unitLabel}`, `${r.labelEn} implausible: ${fmtNum(ratio, 2)} ${r.unitLabelEn}`),
      detail: t(
        `Summe ${fmtNum(n, 1)} ${r.numUnit} (Pos. ${N.slice(0, 4).map((i) => i.oz).join(', ')}) gegenüber ${fmtNum(d, 1)} ${r.denUnit} (Pos. ${D.slice(0, 4).map((i) => i.oz).join(', ')}). Erwartet wird ${fmtNum(r.min, 2)}–${fmtNum(r.max, 2)}. ${r.note}`,
        `Total ${fmtNum(n, 1)} ${r.numUnit} (items ${N.slice(0, 4).map((i) => i.oz).join(', ')}) compared with ${fmtNum(d, 1)} ${r.denUnit} (items ${D.slice(0, 4).map((i) => i.oz).join(', ')}). The expected range is ${fmtNum(r.min, 2)}–${fmtNum(r.max, 2)}. ${r.noteEn}`,
      ),
      evidence: [...N.slice(0, 2), ...D.slice(0, 2)].map((i) => ev(i, 'feld', `${i.oz}: ${fmtNum(i.qty)} ${i.unit} ${i.shortText}`)), basis: bt(BASIS.menge),
      action: 'bieterfrage', question: `Das Verhältnis der Mengen (${r.label}: ${fmtNum(ratio, 2)} ${r.unitLabel}) erscheint nicht plausibel. Wir bitten um Überprüfung der Mengenansätze in Pos. ${[...N, ...D].slice(0, 6).map((i) => i.oz).join(', ')}.`,
      nachtrag: { basis: '§ 2 Abs. 3 VOB/B', direction: 'chance', note: t('Mengenmehrung über 10 % führt auf Verlangen zu einem neuen Preis.', 'A quantity increase of more than 10 % leads to a new price on request.') },
    });
  }
}

// ---------- completeness ----------
export function detectTrades(doc: LVDocument): { key: string; label: string; items: LVItem[] }[] {
  const out: { key: string; label: string; items: LVItem[] }[] = [];
  const allShort = doc.items.map((i) => i.shortText).join('\n');
  for (const t of TRADES) {
    if (t.requires && !t.requires.test(allShort)) continue;
    const items = doc.items.filter((i) => t.re.test(i.shortText) && (!t.units || (i.unitNorm != null && t.units.includes(i.unitNorm))));
    // a trade must make up a real share of the LV; a few stray keywords in another trade's LV do not count
    const need = t.key === 'baustelle' ? (doc.items.length >= 15 ? 1 : 99) : Math.max(doc.items.length < 20 ? 2 : 3, Math.ceil(doc.items.length * 0.08));
    if (items.length >= need) out.push({ key: t.key, label: t.label, items });
  }
  return out.sort((a, b) => b.items.length - a.items.length);
}

function completeness(c: Ctx) {
  const { doc } = c;
  const all = doc.items.map(itemText).join('\n');
  const general = doc.preamble + '\n' + doc.remarks.map((r) => r.text).join('\n');
  const reported = new Set<string>();
  for (const tr of detectTrades(doc)) {
    const def = TRADES.find((t) => t.key === tr.key)!;
    const tradeSum = tr.items.reduce((a, i) => a + c.value(i), 0);
    for (const e of def.expected) {
      if (e.onlyIf && !e.onlyIf.test(all)) continue;
      if (e.re.test(all) || reported.has(e.label)) continue;
      const mentioned = findMatch(general, e.re);
      if (mentioned && !/nicht\s+(?:gesondert|separat|seperat)|einzurechnen|einzukalkulieren/i.test(snippet(general, mentioned.index, mentioned.match.length, 160))) continue;
      reported.add(e.label);
      const inPrice = !!mentioned;
      let elsewhere: { d: LVDocument; i: LVItem } | null = null;
      for (const d of c.project) {
        if (d.id === doc.id) continue;
        const i = d.items.find((x) => e.re.test(x.shortText));
        if (i) { elsewhere = { d, i }; break; }
      }
      if (elsewhere) {
        c.add({
          ruleId: 'L-FEHLT', category: 'schnittstelle', severity: 1, confidence: 0.6, items: tr.items.slice(0, 1),
          title: t(`${def.label}: „${e.label}“ ist im LV ${elsewhere.d.project.name || elsewhere.d.fileName} ausgeschrieben`, `${def.labelEn}: “${e.labelEn}” is tendered in the bill of quantities ${elsewhere.d.project.name || elsewhere.d.fileName}`),
          detail: t(
            `Dieses LV enthält keine Position für ${e.label}. Im Projekt-LV ${elsewhere.d.fileName} steht Pos. ${elsewhere.i.oz} ${q(elsewhere.i.shortText.slice(0, 60))} (${fmtNum(elsewhere.i.qty)} ${elsewhere.i.unit ?? ''}). Die Leistung ist damit einem anderen Gewerk zugeordnet – Leistungsgrenze und Ausführungszeitpunkt abstimmen.`,
            `This bill of quantities contains no item for “${e.labelEn}”. The project bill of quantities ${elsewhere.d.fileName} has item ${elsewhere.i.oz} ${qe(elsewhere.i.shortText.slice(0, 60))} (${fmtNum(elsewhere.i.qty)} ${elsewhere.i.unit ?? ''}). The works are therefore assigned to another trade – coordinate the boundary of works and the time of execution.`,
          ),
          evidence: [{ where: 'hinweis', oz: elsewhere.i.oz, quote: `${elsewhere.d.fileName} · ${elsewhere.i.oz}: ${elsewhere.i.shortText}` }], basis: bt(BASIS.koordination), action: 'hinweis',
        });
        continue;
      }
      c.add({
        ruleId: 'L-FEHLT', category: 'luecke', severity: inPrice || e.besondere ? 2 : 2, confidence: inPrice ? 0.75 : 0.5, items: tr.items.slice(0, 3),
        exposure: tradeSum * (e.share ?? 0.03),
        title: t(`${def.label}: keine Position für „${e.label}“`, `${def.labelEn}: no item for “${e.labelEn}”`),
        detail: t(
          `Im LV gibt es ${tr.items.length} Positionen zu ${def.label}, aber keine für ${e.label}. ${e.why}${inPrice ? ' Laut Vorbemerkung ist die Leistung in die Einheitspreise einzurechnen – Aufwand ohne Mengenansatz.' : ''}`,
          `The bill of quantities has ${tr.items.length} items for ${def.labelEn}, but none for “${e.labelEn}”. ${e.whyEn}${inPrice ? ' According to the preliminary remarks, the works are to be included in the unit prices – effort without a quantity.' : ''}`,
        ),
        evidence: inPrice ? [{ where: 'vorbemerkung', quote: snippet(general, mentioned!.index, mentioned!.match.length, 100) }] : tr.items.slice(0, 2).map((i) => ev(i, 'kurztext', `${i.oz}: ${i.shortText}`)),
        basis: bt(e.besondere ? BASIS.nebenleistung : BASIS.eindeutig), action: 'bieterfrage',
        question: `Für ${def.label} enthält das LV keine Position für „${e.label}“. Wir bitten um Mitteilung, ob diese Leistung Vertragsbestandteil ist, und ggf. um Ergänzung einer Position mit Mengenansatz.`,
        nachtrag: { basis: '§ 2 Abs. 6 VOB/B', direction: 'chance', note: e.besondere ? t('Besondere Leistung (DIN 18299 Abschn. 4.2) ohne LV-Position: zusätzliche Leistung – Vergütungsanspruch vor Ausführung ankündigen.', 'Special work (Besondere Leistung, DIN 18299 Abschn. 4.2) without an item in the bill of quantities: additional works – give notice of the claim for payment before carrying them out.') : t('Im Vertrag nicht vorgesehene Leistung: Anspruch auf besondere Vergütung, vor Ausführung ankündigen.', 'Works not provided for in the contract: entitlement to separate payment, give notice before carrying them out.') },
      });
    }
  }

  // interfaces to other trades
  const others = c.project.filter((d) => d.id !== doc.id);
  const check = (text: string, it: LVItem | undefined, where: Evidence['where'], title: { de: string; en: string }) => {
    for (const tw of TRADE_WORDS) {
      const m = findMatch(text, tw.re);
      if (!m) continue;
      const quote = snippet(text, m.index, m.match.length, 90);
      const topicToks = tokens(quote).filter((t) => t.length > 5);
      let found: { d: LVDocument; i: LVItem } | null = null;
      for (const d of others) {
        for (const i of d.items) {
          const tt = new Set(tokens(itemText(i)));
          const overlap = topicToks.filter((t) => tt.has(t)).length;
          if (overlap >= 2 && (tw.key === 'andere' || tw.evidence.test(itemText(i)))) { found = { d, i }; break; }
        }
        if (found) break;
      }
      c.add({
        ruleId: 'S-SCHNITTSTELLE', category: 'schnittstelle', severity: others.length ? (found ? 1 : 3) : 2, confidence: found ? 0.5 : 0.65, items: it ? [it] : [],
        title: found
          ? t(`Schnittstelle zu ${tw.label} – Gegenposition gefunden`, `Interface with ${tw.labelEn} – matching item found`)
          : others.length
            ? t(`Schnittstelle zu ${tw.label} – in keinem der ${others.length} anderen Projekt-LVs gefunden`, `Interface with ${tw.labelEn} – not found in any of the ${others.length} other bills of quantities of the project`)
            : t(`Vorleistung durch ${tw.label} – Leistungsgrenze klären`, `Preceding works by ${tw.labelEn} – clarify the boundary of works`),
        detail: t(
          `${it ? pos(it) : title.de}: Die Leistung setzt eine Vor- oder Mitwirkungsleistung von ${tw.label} voraus.` + (found ? ` Passende Position: ${found.d.fileName} Pos. ${found.i.oz} ${q(found.i.shortText.slice(0, 60))}.` : others.length ? ' In den übrigen LVs des Projekts wurde keine entsprechende Position gefunden – die Leistung droht zwischen den Gewerken zu fehlen.' : ' Ob diese Leistung beim anderen Gewerk ausgeschrieben ist, lässt sich aus diesem LV allein nicht prüfen (Projektmodus: alle LVs gemeinsam hochladen).'),
          `${it ? posEn(it) : title.en}: The works depend on preceding or cooperating works by ${tw.labelEn}.` + (found ? ` Matching item: ${found.d.fileName} item ${found.i.oz} ${qe(found.i.shortText.slice(0, 60))}.` : others.length ? ' No corresponding item was found in the other bills of quantities of the project – the works are at risk of falling between the trades.' : ' Whether these works are tendered with the other trade cannot be checked from this bill of quantities alone (project mode: upload all bills of quantities together).'),
        ),
        evidence: [it ? ev(it, where, quote) : { where, quote }], basis: bt(BASIS.koordination), action: found ? 'hinweis' : 'bieterfrage', surchargePct: found ? 0 : 2,
        question: `${it ? 'Zu ' + pos(it) : 'Zu den Vorbemerkungen'}: Dort heißt es ${q(m.match)}. Wir bitten um Bestätigung, dass diese Leistung durch ${tw.label} erbracht wird, sowie um Angabe der Leistungsgrenze und des Übergabezustands.`,
        nachtrag: { basis: '§ 6 Abs. 1 VOB/B', direction: 'risiko', note: t('Fehlt die Vorleistung bei Ausführungsbeginn: Behinderung unverzüglich schriftlich anzeigen; Bedenken gegen Vorleistungen nach § 4 Abs. 3 VOB/B.', 'If the preceding works are missing when work is due to start: give written notice of obstruction without delay; raise concerns about preceding works under § 4 Abs. 3 VOB/B.') },
      });
      break;
    }
  };
  for (const it of doc.items) check(itemText(it), it, 'langtext', t('', ''));
  for (const r of doc.remarks.slice(0, 60)) check(r.text, undefined, 'vorbemerkung', t(`Hinweistext ${q(r.title.slice(0, 50))}`, `Note text ${qe(r.title.slice(0, 50))}`));
}

// ---------- prices ----------
function prices(c: Ctx) {
  const { doc } = c;
  if (!doc.priced) return;
  const low: LVItem[] = [];
  for (const it of doc.items) {
    if (it.up == null) continue;
    const ref = c.prices[it.id];
    if (it.up < 0) {
      c.add({ ruleId: 'P-NEGATIV', category: 'preis', severity: 3, confidence: 1, items: [it], title: t('Negativer Einheitspreis', 'Negative unit price'), detail: t(`${pos(it)}: EP ${fmtEUR(it.up)}. Negative Preise sind nur bei ausdrücklicher Zulassung wertbar.`, `${posEn(it)}: unit price ${fmtEUR(it.up)}. Negative prices can only be evaluated where they are expressly permitted.`), evidence: [ev(it, 'feld', `EP ${fmtEUR(it.up)}`)], action: 'korrektur' });
      continue;
    }
    if (it.up === 0 && !it.flags.noTotal) {
      c.add({ ruleId: 'P-NULL', category: 'preis', severity: 3, confidence: 0.9, items: [it], exposure: ref ? ref.low * (it.qty || 0) : 0, title: t('Einheitspreis 0,00 €', 'Unit price 0,00 €'), detail: t(`${pos(it)} ist mit 0,00 € bepreist. Fehlende oder Null-Preise ohne Erläuterung gelten als unvollständige Preisangabe und können zum Ausschluss führen.`, `${posEn(it)} is priced at 0,00 €. Missing or zero prices without explanation count as incomplete pricing and can lead to exclusion.`), evidence: [ev(it, 'feld', `${fmtNum(it.qty)} ${it.unit} × 0,00 €`)], basis: 'VOB/A § 13 Abs. 1 Nr. 3 / § 16a Abs. 2', action: 'korrektur' });
      low.push(it);
      continue;
    }
    // a low absolute price is only suspicious if the reference does not say it is normal for this item
    const refSaysNormal = !!ref && ref.confidence >= 0.4 && it.up >= ref.low * 0.5;
    const veryLow = refSaysNormal ? false : (ref && ref.confidence >= 0.4 && it.up < ref.low * 0.25) || (ref && ref.confidence >= 0.25 && it.up < ref.low * 0.05) || (it.up <= 0.1 && (it.qty || 0) >= 10 && unitDim(it.unit) !== 'other' && unitDim(it.unit) !== 'rate' && unitDim(it.unit) != null) || (it.up < 1 && (it.qty || 0) >= 5 && ['m³', 't', 'St', 'h', 'psch', 'Mt'].includes(it.unitNorm || ''));
    if (veryLow) {
      low.push(it);
      c.add({
        ruleId: 'P-SPEKULATIV', source: 'statistik', category: 'preis', severity: 3, confidence: ref ? Math.min(0.9, 0.5 + ref.confidence * 0.5) : 0.6, items: [it],
        exposure: ref ? Math.max(0, ref.low - it.up) * (it.qty || 0) : 0,
        title: t(`Auffällig niedriger EP: ${fmtEUR(it.up)}${ref ? ` (Referenz ${fmtEUR(ref.low)} – ${fmtEUR(ref.high)})` : ''}`, `Conspicuously low unit price: ${fmtEUR(it.up)}${ref ? ` (reference ${fmtEUR(ref.low)} – ${fmtEUR(ref.high)})` : ''}`),
        detail: t(
          `${pos(it)}: ${fmtNum(it.qty)} ${it.unit} × ${fmtEUR(it.up)}. Der Preis deckt die Leistung offensichtlich nicht. Entweder Eingabefehler oder Kostenverlagerung in andere Positionen (Mischkalkulation) – letzteres führt zum Ausschluss. Steigt die Menge, wächst der Verlust mit jeder Einheit.`,
          `${posEn(it)}: ${fmtNum(it.qty)} ${it.unit} × ${fmtEUR(it.up)}. The price obviously does not cover the works. Either an input error or costs shifted into other items (mixed pricing, Mischkalkulation) – the latter leads to exclusion. If the quantity rises, the loss grows with every unit.`,
        ),
        evidence: [ev(it, 'feld', `${fmtNum(it.qty)} ${it.unit} × ${fmtEUR(it.up)} = ${fmtEUR(it.total)}`)], basis: bt(BASIS.misch), action: 'korrektur',
      });
      continue;
    }
    if (!ref || ref.confidence < 0.45) continue;
    if (it.up > ref.high * 2.5 || it.up < ref.low * 0.5) {
      const hi = it.up > ref.high;
      c.add({
        ruleId: hi ? 'P-HOCH' : 'P-NIEDRIG', source: 'statistik', category: 'preis', severity: 2, confidence: ref.confidence * 0.8, items: [it],
        exposure: Math.abs(it.up - ref.mid) * (it.qty || 0) * (hi ? 0.3 : 1),
        title: t(`EP ${hi ? 'deutlich über' : 'deutlich unter'} Referenz: ${fmtEUR(it.up)} statt ${fmtEUR(ref.low)} – ${fmtEUR(ref.high)}`, `Unit price ${hi ? 'well above' : 'well below'} reference: ${fmtEUR(it.up)} instead of ${fmtEUR(ref.low)} – ${fmtEUR(ref.high)}`),
        detail: t(
          `${pos(it)}: Vergleich mit ${ref.n} ähnlichen Positionen (${ref.refs.slice(0, 2).map((r) => `${q(r.text.slice(0, 40))} ${fmtEUR(r.up)}`).join('; ')}). ${hi ? 'Mögliche Ursachen: Kommafehler, falsche Einheit, Sonderanforderung im Langtext.' : 'Mögliche Ursachen: Leistungsteile übersehen, Kommafehler, bewusst knapp kalkuliert.'}`,
          `${posEn(it)}: comparison with ${ref.n} similar items (${ref.refs.slice(0, 2).map((r) => `${qe(r.text.slice(0, 40))} ${fmtEUR(r.up)}`).join('; ')}). ${hi ? 'Possible causes: decimal-point error, wrong unit, special requirement in the long text.' : 'Possible causes: parts of the works overlooked, decimal-point error, deliberately tight pricing.'}`,
        ),
        evidence: [ev(it, 'feld', `${fmtNum(it.qty)} ${it.unit} × ${fmtEUR(it.up)}`)], action: 'korrektur',
      });
    }
  }
  const be = doc.items.filter(isBE);
  const beSum = be.reduce((a, i) => a + c.value(i), 0);
  // the pattern covers every minimal price at once, so its exposure is their uncovered amount together
  const uncovered = low.reduce((a, i) => { const r = c.prices[i.id]; return a + (r ? Math.max(0, r.low - (i.up || 0)) * (i.qty || 0) : 0); }, 0);
  if (low.length >= 3 && c.sum && beSum / c.sum > 0.06)
    c.add({
      ruleId: 'P-MISCHKALKULATION', source: 'statistik', category: 'preis', severity: 3, confidence: 0.7, items: [...be, ...low].slice(0, 15), exposure: uncovered,
      title: t(`Hinweis auf Mischkalkulation: ${low.length} Minimalpreise bei ${((beSum / c.sum) * 100).toFixed(1)} % Baustelleneinrichtung`, `Indication of mixed pricing (Mischkalkulation): ${low.length} minimal prices with ${((beSum / c.sum) * 100).toFixed(1)} % site setup`),
      detail: t(
        `${low.length} Positionen sind mit nicht auskömmlichen Einheitspreisen angeboten, während die Baustelleneinrichtung ${fmtEUR(beSum)} (${((beSum / c.sum) * 100).toFixed(1)} % der Angebotssumme) trägt. Werden Kosten in andere Positionen verlagert, enthält das Angebot nicht die geforderten Preise und ist auszuschließen. Zudem: Mengenmehrungen in den Minimalpreis-Positionen sind ungedeckt.`,
        `${low.length} items are offered at unit prices that do not cover costs, while site setup carries ${fmtEUR(beSum)} (${((beSum / c.sum) * 100).toFixed(1)} % of the bid total). If costs are shifted into other items, the bid does not contain the prices requested and must be excluded. In addition, quantity increases in the minimal-price items are not covered.`,
      ),
      evidence: [...be.slice(0, 2), ...low.slice(0, 4)].map((i) => ev(i, 'feld', `${i.oz}: ${fmtNum(i.qty)} ${i.unit} × ${fmtEUR(i.up)} ${i.shortText.slice(0, 40)}`)), basis: bt(BASIS.misch), action: 'korrektur',
    });
}

export function runRules(c: Ctx) {
  formal(c);
  typos(c);
  wording(c);
  typesAndQuantities(c);
  completeness(c);
  prices(c);
}
export { stripPlaceholders };
