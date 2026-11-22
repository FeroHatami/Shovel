// GAEB DA XML (X81..X86) parser. Tolerant: works across 3.1 / 3.2 / 3.3 and the dialects of
// ORCA, California, ARCHITEXT Pallas etc. (texts with or without <p>, padded or unpadded RNoPart).
import { XMLParser } from 'fast-xml-parser';
import type { LVDocument, LVItem, LVSection, ItemFlags } from '../types.ts';
import { cleanText, parseDeNumber, hash } from '../text.ts';
import { normUnit } from '../units.ts';

type Node = Record<string, any>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  removeNSPrefix: true,
  processEntities: true,
  htmlEntities: true,
});

function tag(n: Node): string {
  for (const k of Object.keys(n)) if (k !== ':@') return k;
  return '';
}
function kids(n: Node): Node[] {
  const t = tag(n);
  return t === '#text' ? [] : (n[t] as Node[]) || [];
}
function attr(n: Node, name: string): string | undefined {
  return n[':@']?.[name];
}
function child(n: Node | undefined, name: string): Node | undefined {
  if (!n) return undefined;
  return kids(n).find((k) => tag(k) === name);
}
function children(n: Node | undefined, name: string): Node[] {
  if (!n) return [];
  return kids(n).filter((k) => tag(k) === name);
}
function path(n: Node | undefined, ...names: string[]): Node | undefined {
  let cur = n;
  for (const nm of names) cur = child(cur, nm);
  return cur;
}
function find(n: Node | undefined, name: string): Node | undefined {
  if (!n) return undefined;
  for (const k of kids(n)) {
    if (tag(k) === name) return k;
    const r = find(k, name);
    if (r) return r;
  }
  return undefined;
}

const BLOCK = new Set(['p', 'div', 'li', 'tr', 'Text', 'ComplCaption', 'table', 'ul', 'ol']);

// Rich text to plain text. Counts bidder fill-in fields (TextComplement).
function richText(n: Node | undefined, counter?: { bidder: number }): string {
  if (!n) return '';
  let out = '';
  const walk = (x: Node) => {
    const t = tag(x);
    if (t === '#text') {
      out += String(x['#text']).replace(/\s+/g, ' ');
      return;
    }
    if (t === 'br') {
      out += '\n';
      return;
    }
    if (t === 'TextComplement') {
      if (counter) counter.bidder++;
      const cap = richTextInline(child(x, 'ComplCaption'));
      const body = richTextInline(child(x, 'ComplBody'));
      const tail = richTextInline(child(x, 'ComplTail'));
      out += `${cap} '${body.trim() || '........'}' ${tail}`;
      return;
    }
    if (t === 'li') out += '\n- ';
    for (const k of kids(x)) walk(k);
    if (BLOCK.has(t)) out += '\n';
    if (t === 'td') out += ' ';
  };
  walk(n);
  return cleanText(out);
}
function richTextInline(n: Node | undefined): string {
  return richText(n).replace(/\n/g, ' ');
}
function txt(n: Node | undefined): string {
  return richTextInline(n).trim();
}
const yes = (n: Node | undefined) => /^(yes|ja|true|1)$/i.test(txt(n));

export function parseGaebXml(xml: string, fileName: string): LVDocument {
  const tree = parser.parse(xml) as Node[];
  const gaeb = tree.find((n) => tag(n) === 'GAEB');
  if (!gaeb) throw new Error('Kein <GAEB>-Wurzelelement gefunden – keine gültige GAEB-XML-Datei.');
  const warnings: string[] = [];
  const info = child(gaeb, 'GAEBInfo');
  const prj = child(gaeb, 'PrjInfo');
  const award = child(gaeb, 'Award');
  const dp = parseInt(txt(child(award, 'DP')), 10);
  const extPhase = /\.[xXdDpP]8([1-6])$/.exec(fileName);
  const phase = Number.isFinite(dp) ? dp : extPhase ? 80 + Number(extPhase[1]) : null;

  const preambleParts: string[] = [];
  for (const add of children(award, 'AddText')) {
    const title = txt(child(add, 'OutlineAddText'));
    const body = richText(child(add, 'DetailAddText'));
    preambleParts.push([title, body].filter(Boolean).join('\n'));
  }

  const own = child(award, 'OWN');
  const client = txt(path(own, 'Address', 'Name1')) || undefined;
  const cur = txt(child(prj, 'Cur')) || txt(path(award, 'AwardInfo', 'Cur')) || 'EUR';

  const doc: LVDocument = {
    id: hash(fileName + xml.length + xml.slice(0, 2000)),
    fileName,
    format: 'gaeb-xml',
    phase,
    version: txt(child(info, 'Version')) || undefined,
    program: txt(child(info, 'ProgName')) || txt(child(info, 'ProgSystem')) || undefined,
    project: {
      name: txt(child(prj, 'NamePrj')) || undefined,
      label: txt(child(prj, 'LblPrj')) || undefined,
      description: txt(child(prj, 'Descrip')) || undefined,
      client,
    },
    currency: /^eur/i.test(cur) ? 'EUR' : cur,
    preamble: '',
    remarks: [],
    sections: [],
    items: [],
    warnings,
    priced: false,
  };

  const boqs = children(award, 'BoQ');
  if (!boqs.length) warnings.push('Datei enthält kein <BoQ>-Element.');
  let n = 0;

  const walkBody = (body: Node | undefined, ozParts: string[], labels: string[], level: number) => {
    if (!body) return;
    for (const el of kids(body)) {
      const t = tag(el);
      if (t === 'BoQCtgy') {
        const part = (attr(el, 'RNoPart') || '').trim();
        const label = txt(child(el, 'LblTx'));
        const oz = [...ozParts, part].filter(Boolean).join('.');
        const sec: LVSection = { oz, label, level };
        const tot = parseDeNumber(txt(path(el, 'Totals', 'Total')));
        if (tot != null) sec.declaredTotal = tot;
        doc.sections.push(sec);
        walkBody(child(el, 'BoQBody'), [...ozParts, part].filter(Boolean), [...labels, label], level + 1);
      } else if (t === 'Itemlist') {
        let pendingRemark = '';
        const sectionOz = ozParts.join('.');
        for (const it of kids(el)) {
          const it_t = tag(it);
          if (it_t === 'Remark' || it_t === 'PerfDescr') {
            const ct = path(it, 'Description', 'CompleteText') || find(it, 'CompleteText');
            const text = richText(path(ct, 'DetailTxt')) || richText(find(it, 'Text'));
            const title = txt(path(ct, 'OutlineText', 'OutlTxt')) || text.split('\n')[0].slice(0, 80);
            if (text) {
              doc.remarks.push({ sectionOz, title, text });
              pendingRemark = text;
            }
          } else if (it_t === 'Item') {
            n++;
            const part = (attr(it, 'RNoPart') || '').trim();
            const idx = (attr(it, 'RNoIndex') || '').trim();
            const oz = [...ozParts, part].filter(Boolean).join('.') + (idx ? idx : '');
            const counter = { bidder: 0 };
            const desc = child(it, 'Description');
            const ct = child(desc, 'CompleteText') || find(it, 'CompleteText');
            let longText = richText(child(ct, 'DetailTxt'), counter);
            const outl = child(ct, 'OutlineText') || child(desc, 'OutlineText');
            let shortText = children(outl, 'OutlTxt').map((o) => txt(o)).join(' ').trim() || txt(outl);
            if (!ct) {
              // STLB-Bau only descriptions
              const stl = find(it, 'STLBBau');
              if (stl) longText = richText(stl, counter);
            }
            if (!shortText) shortText = longText.split('\n')[0].slice(0, 90);
            const qty = parseDeNumber(txt(child(it, 'Qty')));
            const unit = txt(child(it, 'QU')) || null;
            const up = parseDeNumber(txt(child(it, 'UP')));
            const total = parseDeNumber(txt(child(it, 'IT')));
            const provis = txt(child(it, 'Provis'));
            const alnSer = txt(child(it, 'ALNSerNo'));
            const head = shortText + ' ' + longText.slice(0, 160);
            const flags: ItemFlags = {
              bedarf: !!provis || /\b(bedarfs|eventual)position/i.test(head),
              wahl: (!!txt(child(it, 'ALNGroupNo')) && alnSer !== '' && alnSer !== '0') || /\b(wahl|alternativ)position/i.test(head),
              zulage: /^\s*(zulage|mehrpreis|aufpreis|zuschlag)\b/i.test(shortText),
              stundenlohn: yes(child(it, 'HourIt')) || /stundenlohn/i.test(shortText),
              pauschal: yes(child(it, 'LumpSumItem')),
              qtyTBD: yes(child(it, 'QtyTBD')),
              noTotal: /withouttotal/i.test(provis) || yes(child(it, 'NotAppl')),
              bidderFields: counter.bidder + (longText.match(/['"„]?\.{6,}['"“]?/g) || []).length * (counter.bidder ? 0 : 1),
            };
            const item: LVItem = {
              id: attr(it, 'ID') || `i${n}`,
              oz: oz || String(n),
              sectionOz,
              sectionPath: labels,
              shortText,
              longText,
              qty,
              unit,
              unitNorm: normUnit(unit),
              up,
              total,
              flags,
              stlb: txt(find(it, 'StLNo')) || undefined,
              context: pendingRemark || undefined,
            };
            if (item.unitNorm === 'psch') item.flags.pauschal = true;
            doc.items.push(item);
            pendingRemark = '';
          }
        }
      }
    }
  };

  for (const boq of boqs) {
    const lbl = txt(path(boq, 'BoQInfo', 'LblBoQ'));
    if (lbl && !doc.project.label) doc.project.label = lbl;
    const tot = parseDeNumber(txt(path(boq, 'BoQInfo', 'Totals', 'Total')));
    if (tot != null) doc.declaredTotal = tot;
    // BoQ level remarks
    for (const add of children(child(boq, 'BoQInfo'), 'AddText')) {
      preambleParts.push(richText(add));
    }
    walkBody(child(boq, 'BoQBody'), [], [], 1);
  }

  doc.preamble = cleanText(preambleParts.filter(Boolean).join('\n\n'));
  doc.priced = doc.items.filter((i) => i.up != null && i.up > 0).length > doc.items.length * 0.3;
  // make ids unique
  const seen = new Set<string>();
  for (const it of doc.items) {
    while (seen.has(it.id)) it.id += '_';
    seen.add(it.id);
  }
  return doc;
}
