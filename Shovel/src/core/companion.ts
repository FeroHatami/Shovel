// A GAEB bid file (D84 / X84) carries quantities and prices but usually no texts: the texts live in
// the tender LV (D83 / X83 / PDF). To check a bid, both are read together, matched by OZ.
import type { LVDocument } from './types.ts';

const nz = (oz: string) => oz.split('.').map((p) => p.replace(/^0+(?=.)/, '')).join('.');
const hasText = (s: string) => s.replace(/['"„“.\s_…]/g, '').length > 3;

export function isTextless(doc: LVDocument): boolean {
  return doc.items.length > 0 && doc.items.filter((i) => hasText(i.shortText)).length < doc.items.length * 0.3;
}

export function enrichFromCompanion(doc: LVDocument, candidates: LVDocument[]): LVDocument {
  if (!isTextless(doc)) return doc;
  const own = new Set(doc.items.map((i) => nz(i.oz)));
  let best: LVDocument | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (c.id === doc.id || isTextless(c) || !c.items.length) continue;
    const hit = c.items.filter((i) => own.has(nz(i.oz))).length;
    const overlap = hit / Math.max(own.size, c.items.length);
    // prefer the structured source when several fit equally well
    const score = overlap + (c.format === 'gaeb-xml' ? 0.02 : c.format === 'gaeb-90' ? 0.01 : 0) + (c.priced ? 0 : 0.005);
    if (overlap >= 0.9 && score > bestScore) [best, bestScore] = [c, score];
  }
  if (!best) return { ...doc, textless: true };
  const src = new Map(best.items.map((i) => [nz(i.oz), i]));
  const items = doc.items.map((it) => {
    const s = src.get(nz(it.oz));
    if (!s) return it;
    const bidder = hasText(it.longText) ? it.longText : hasText(it.shortText) ? it.shortText : '';
    return {
      ...it,
      shortText: s.shortText,
      longText: s.longText + (bidder ? `\nBieterangabe: ${bidder.replace(/\s+/g, ' ').trim()}` : ''),
      sectionOz: s.sectionOz,
      sectionPath: s.sectionPath,
      unit: it.unit || s.unit,
      unitNorm: it.unitNorm || s.unitNorm,
      qty: it.qty ?? s.qty,
      flags: { ...s.flags, bidderFields: 0 },
      context: s.context,
    };
  });
  return {
    ...doc,
    items,
    sections: doc.sections.length ? doc.sections : best.sections.map((s) => ({ ...s, declaredTotal: undefined })),
    remarks: doc.remarks.length ? doc.remarks : best.remarks,
    preamble: doc.preamble || best.preamble,
    project: { ...best.project, ...Object.fromEntries(Object.entries(doc.project).filter(([, v]) => v)) },
    textsFrom: best.fileName,
  };
}
