// Core data model. Everything downstream (rules, scoring, UI, exports) works on these types,
// regardless of whether the LV came from GAEB XML, GAEB 90, PDF or Excel.

export type LVFormat = 'gaeb-xml' | 'gaeb-90' | 'pdf' | 'excel' | 'image';

// Output language of the analysis. Rules write every text in both languages (Txt); the engine picks one
// when it builds a Finding, so Finding itself only carries plain strings.
export type Lang = 'de' | 'en';
export type Txt = string | { de: string; en: string };

export interface ItemFlags {
  bedarf: boolean; // Bedarfs-/Eventualposition
  wahl: boolean; // Wahl-/Alternativposition
  zulage: boolean; // Zulageposition
  stundenlohn: boolean;
  pauschal: boolean;
  qtyTBD: boolean; // Menge durch Bieter einzutragen
  noTotal: boolean; // "ohne GB" / nur Einheitspreis
  bidderFields: number; // Anzahl Bieterangaben ("Angeb. Fabrikat: ....")
}

export interface LVItem {
  id: string;
  oz: string; // Ordnungszahl as printed, e.g. "01.02.0030"
  sectionOz: string; // oz of the innermost section
  sectionPath: string[]; // labels from top to innermost section
  shortText: string;
  longText: string;
  qty: number | null;
  unit: string | null; // as written
  unitNorm: string | null; // canonical unit, see units.ts
  up: number | null; // Einheitspreis
  total: number | null; // Gesamtbetrag
  flags: ItemFlags;
  stlb?: string;
  page?: number;
  context?: string; // remark / Hinweistext directly preceding the item
  unitUnread?: boolean; // text recognition read the quantity but not the unit
}

export interface LVSection {
  oz: string;
  label: string;
  level: number;
  declaredTotal?: number | null;
}

export interface LVRemark {
  sectionOz: string;
  title: string;
  text: string;
}

export interface LVDocument {
  id: string;
  fileName: string;
  format: LVFormat;
  phase: number | null; // 81..86
  version?: string;
  program?: string;
  project: { name?: string; label?: string; description?: string; client?: string };
  currency: string;
  trade?: string; // detected Gewerk key
  tradeLabel?: string;
  preamble: string; // Vorbemerkungen (document level)
  remarks: LVRemark[];
  sections: LVSection[];
  items: LVItem[];
  declaredTotal?: number | null;
  warnings: string[]; // parser notes
  textsFrom?: string; // price-only bid file: texts were taken from this companion LV
  textless?: boolean; // price-only file and no companion LV in the workspace
  // read from a photo or scanned PDF by text recognition; `key` names the stored page pictures,
  // `boxes` are the recognised text pieces (fractions of the page, origin top-left)
  ocr?: { confidence: number; key?: string; pages?: { w: number; h: number }[]; boxes?: { page: number; x: number; y: number; w: number; h: number; text: string }[] };
  priced: boolean;
}

export type Category =
  | 'fehler' // objective error: arithmetic, duplicates, missing fields
  | 'unklar' // unclear / incomplete description
  | 'widerspruch' // contradiction
  | 'luecke' // missing item / completeness
  | 'menge' // quantity plausibility
  | 'preis' // price plausibility
  | 'vertrag' // risk shifting, contract clause
  | 'schnittstelle' // interface between trades
  | 'bieter'; // to-do for the bidder (Bieterangaben, formal)

export type Action = 'bieterfrage' | 'zuschlag' | 'chance' | 'korrektur' | 'hinweis';

export interface Evidence {
  itemId?: string;
  oz?: string;
  where: 'kurztext' | 'langtext' | 'vorbemerkung' | 'feld' | 'hinweis';
  quote: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  source: 'regel' | 'statistik' | 'ki';
  category: Category;
  severity: 1 | 2 | 3; // 3 = hoch
  confidence: number; // 0..1
  itemIds: string[];
  oz: string; // primary OZ ('' for document level)
  title: string;
  detail: string;
  evidence: Evidence[];
  basis?: string; // e.g. "VOB/A § 7 Abs. 1 Nr. 1"
  action: Action;
  question?: string; // draft Bieterfrage
  surchargePct?: number; // suggested Risikozuschlag on the item's GP
  nachtrag?: { basis: string; direction: 'chance' | 'risiko'; note: string };
  exposure: number; // EUR at stake (estimated), 0 if unknown
  score: number; // priority score, see score.ts
  docId?: string;
  aiConfirmed?: string; // an AI finding reached the same conclusion; its explanation is kept here
}

export interface PriceSuggestion {
  itemId: string;
  low: number;
  mid: number;
  high: number;
  n: number;
  confidence: number;
  refs: { text: string; unit: string; up: number; project: string; year: number; sim: number }[];
}

export interface Analysis {
  docId: string;
  findings: Finding[];
  stats: {
    items: number;
    sections: number;
    sumTotal: number; // sum of GP (real or estimated)
    estimated: boolean; // true when GP comes from price suggestions
    riskScore: number; // 0..100
    coverage: number; // share of items that have a price (own or suggested); below ~0.6 the sums are not meaningful
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    exposure: number;
    surcharge: number;
    abc: { a: string[]; b: string[]; c: string[] };
  };
  prices: Record<string, PriceSuggestion>;
  itemRisk: Record<string, number>;
  sectionRisk: { oz: string; label: string; score: number; findings: number; sum: number }[];
  durationMs: number;
}
