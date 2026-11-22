// Unit normalisation. LVs write the same unit in many ways (St, Stk, Stck, Stück).

export type Dim = 'count' | 'length' | 'area' | 'volume' | 'mass' | 'time' | 'lump' | 'rate' | 'other';

interface UnitDef {
  norm: string;
  dim: Dim;
  aliases: string[];
}

const DEFS: UnitDef[] = [
  { norm: 'psch', dim: 'lump', aliases: ['psch', 'pau', 'pausch', 'pauschal', 'ps', 'psh', 'pa', 'lp', 'pschl'] },
  { norm: 'St', dim: 'count', aliases: ['st', 'stk', 'stck', 'stück', 'stueck', 'stc', 'stch', 'pcs', 'satz', 'paar', 'set', 'stg'] },
  { norm: 'm', dim: 'length', aliases: ['m', 'lfm', 'lfdm', 'lm', 'ldm', 'mtr', 'meter'] },
  { norm: 'm²', dim: 'area', aliases: ['m2', 'm²', 'qm', 'm^2'] },
  { norm: 'm³', dim: 'volume', aliases: ['m3', 'm³', 'cbm', 'm^3'] },
  { norm: 't', dim: 'mass', aliases: ['t', 'to', 'tonne', 'tonnen'] },
  { norm: 'kg', dim: 'mass', aliases: ['kg'] },
  { norm: 'h', dim: 'time', aliases: ['h', 'std', 'stunde', 'stunden', 'stdn', 'stde'] },
  { norm: 'd', dim: 'time', aliases: ['d', 'tag', 'tage', 'tg', 'kt', 'at', 'wt'] },
  { norm: 'Wo', dim: 'time', aliases: ['wo', 'woche', 'wochen', 'wch'] },
  { norm: 'Mt', dim: 'time', aliases: ['mt', 'mon', 'monat', 'monate', 'mo'] },
  { norm: 'l', dim: 'volume', aliases: ['l', 'ltr', 'liter'] },
  { norm: 'cm', dim: 'length', aliases: ['cm'] },
  { norm: 'mm', dim: 'length', aliases: ['mm'] },
  { norm: 'km', dim: 'length', aliases: ['km'] },
  { norm: 'ha', dim: 'area', aliases: ['ha'] },
  { norm: '%', dim: 'other', aliases: ['%', 'vh', 'v.h'] },
  { norm: 'mWo', dim: 'rate', aliases: ['mwo', 'mwoche'] },
  { norm: 'StWo', dim: 'rate', aliases: ['stwo', 'stwoche', 'stkwo'] },
  { norm: 'm²Wo', dim: 'rate', aliases: ['m2wo', 'm²wo', 'qmwo'] },
  { norm: 'StMt', dim: 'rate', aliases: ['stmt', 'stmon'] },
  { norm: 'm²Mt', dim: 'rate', aliases: ['m2mt', 'm²mt'] },
  { norm: 'StTag', dim: 'rate', aliases: ['stt', 'sttag', 'sttg'] },
  { norm: 'm²d', dim: 'rate', aliases: ['m2d', 'm²d', 'm2tag', 'm2t'] },
  { norm: 'md', dim: 'rate', aliases: ['md', 'mtag', 'mt.'] },
  { norm: 'm³d', dim: 'rate', aliases: ['m3d', 'm³d'] },
  { norm: 'mMt', dim: 'rate', aliases: ['mmt', 'mmon'] },
  { norm: 'm³Wo', dim: 'rate', aliases: ['m3wo', 'm³wo'] },
  { norm: 'a', dim: 'time', aliases: ['jahr', 'jahre', 'a'] },
  { norm: 'kWh', dim: 'other', aliases: ['kwh'] },
  { norm: 'kW', dim: 'other', aliases: ['kw'] },
];

const MAP = new Map<string, UnitDef>();
for (const d of DEFS) for (const a of d.aliases) MAP.set(a, d);

function key(u: string): string {
  return u.trim().toLowerCase().replace(/\.+$/, '').replace(/\s+/g, '').replace(/[\/*x·]/g, '');
}

export function normUnit(u: string | null | undefined): string | null {
  if (!u) return null;
  const d = MAP.get(key(u));
  return d ? d.norm : null;
}
export function unitDim(u: string | null | undefined): Dim | null {
  if (!u) return null;
  const d = MAP.get(key(u));
  return d ? d.dim : null;
}
export function isKnownUnit(u: string): boolean {
  return MAP.has(key(u));
}
export const UNIT_TOKEN_RE =
  /^(psch|pau|pausch|pauschal|st|stk|stck|stück|m|lfm|lfdm|m2|m²|qm|m3|m³|cbm|t|to|kg|h|std|tag|tage|d|wo|mt|mon|monat|l|cm|mm|km|ha|%|mwo|stwo|m2wo|stmt|kwh|kw|satz|paar)\.?$/i;
