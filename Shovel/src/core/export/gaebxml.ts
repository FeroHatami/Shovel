// GAEB DA XML 3.2 writer: used to hand the priced bid back (X84) and to build demo fixtures.
import type { LVDocument, LVItem } from '../types.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const paras = (s: string) =>
  s
    .split('\n')
    .map((l) => `<p><span>${esc(l) || ' '}</span></p>`)
    .join('');

function longTextXml(text: string): string {
  // "Angeb. Fabrikat: '........'" becomes a bidder TextComplement
  const parts = text.split(/((?:Angeb(?:otenes|\.)?\s+)?(?:Fabrikat|Typ|Hersteller)[^:\n]*:\s*'\.{4,}')/);
  let out = '';
  let n = 0;
  for (const p of parts) {
    if (!p) continue;
    const m = /^(.*?:)\s*'\.{4,}'$/.exec(p);
    if (m) {
      n++;
      out += `<TextComplement Kind="Bidder" MarkLbl="${n}"><ComplCaption><p><span>${esc(m[1])}</span></p></ComplCaption><ComplBody><p><span></span></p></ComplBody></TextComplement>`;
    } else out += `<Text>${paras(p.replace(/^\n+|\n+$/g, ''))}</Text>`;
  }
  return out;
}

export function writeGaebXml(doc: LVDocument, phase = doc.phase || 83, prices?: Record<string, number>): string {
  const priced = phase >= 84;
  const levels = Math.max(1, ...doc.sections.map((s) => s.oz.split('.').length));
  const itemLen = Math.max(4, ...doc.items.map((i) => (i.oz.split('.').pop() || '').replace(/[A-Za-z]$/, '').length));
  const bk = [
    ...Array.from({ length: levels }, (_, i) => `<BoQBkdn><Type>BoQLevel</Type><LblBoQBkdn>${i === 0 ? 'Titel' : 'Untertitel'}</LblBoQBkdn><Length>2</Length><Num>Yes</Num></BoQBkdn>`),
    `<BoQBkdn><Type>Item</Type><Length>${itemLen}</Length><Num>Yes</Num></BoQBkdn>`,
    `<BoQBkdn><Type>Index</Type><Length>1</Length><Num>No</Num></BoQBkdn>`,
  ].join('');

  const itemXml = (it: LVItem): string => {
    const m = /^(.*?)([A-Za-z]?)$/.exec(it.oz.split('.').pop() || '')!;
    const up = prices?.[it.id] ?? it.up;
    const total = up != null && it.qty != null ? Math.round(up * it.qty * 100) / 100 : it.total;
    return (
      `<Item ID="${esc(it.id)}" RNoPart="${esc(m[1])}"${m[2] ? ` RNoIndex="${m[2]}"` : ''}>` +
      (it.flags.wahl ? `<ALNGroupNo>1</ALNGroupNo><ALNSerNo>1</ALNSerNo>` : '') +
      (it.flags.bedarf ? `<Provis>${it.flags.noTotal ? 'WithoutTotal' : 'WithTotal'}</Provis>` : '') +
      (it.flags.pauschal ? `<LumpSumItem>Yes</LumpSumItem>` : '') +
      (it.flags.stundenlohn ? `<HourIt>Yes</HourIt>` : '') +
      (it.qty != null ? `<Qty>${it.qty.toFixed(3)}</Qty>` : it.flags.qtyTBD ? `<QtyTBD>Yes</QtyTBD>` : '') +
      (it.unit ? `<QU>${esc(it.unit)}</QU>` : '') +
      (priced && up != null ? `<UP>${up.toFixed(2)}</UP>` : '') +
      (priced && total != null && !it.flags.noTotal ? `<IT>${(it.total != null && !prices ? it.total : total).toFixed(2)}</IT>` : '') +
      `<Description><CompleteText><DetailTxt>${longTextXml(it.longText || it.shortText)}</DetailTxt>` +
      `<OutlineText><OutlTxt><TextOutlTxt><p><span>${esc(it.shortText)}</span></p></TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Item>`
    );
  };

  const body = (parentOz: string, level: number): string => {
    const secs = doc.sections.filter((s) => s.oz.split('.').length === level && (parentOz === '' || s.oz.startsWith(parentOz + '.')));
    let out = '';
    for (const s of secs) {
      const inner = body(s.oz, level + 1);
      const its = doc.items.filter((i) => i.sectionOz === s.oz);
      const rem = doc.remarks.filter((r) => r.sectionOz === s.oz);
      const list =
        its.length || rem.length
          ? `<Itemlist>${rem.map((r, i) => `<Remark ID="R${s.oz}_${i}"><Description><CompleteText><DetailTxt><Text>${paras(r.text)}</Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt><p><span>${esc(r.title)}</span></p></TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Remark>`).join('')}${its.map(itemXml).join('')}</Itemlist>`
          : '';
      const tot = priced && s.declaredTotal != null ? `<Totals><Total>${s.declaredTotal.toFixed(2)}</Total></Totals>` : '';
      out += `<BoQCtgy ID="C${s.oz}" RNoPart="${esc(s.oz.split('.').pop()!)}"><LblTx><p><span>${esc(s.label)}</span></p></LblTx><BoQBody>${inner}${list}</BoQBody>${tot}</BoQCtgy>`;
    }
    return out;
  };

  const top = doc.sections.length ? body('', 1) : `<Itemlist>${doc.items.map(itemXml).join('')}</Itemlist>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA${phase}/3.2">` +
    `<GAEBInfo><Version>3.2</Version><VersDate>2013-10</VersDate><Date>2026-11-21</Date><ProgSystem>Shovel</ProgSystem><ProgName>Shovel 0.1</ProgName></GAEBInfo>` +
    `<PrjInfo><NamePrj>${esc(doc.project.name || '')}</NamePrj><LblPrj>${esc(doc.project.label || '')}</LblPrj><Cur>EUR</Cur><CurLbl>Euro</CurLbl></PrjInfo>` +
    `<Award><DP>${phase}</DP><AwardInfo><Cur>EUR</Cur><CurLbl>Euro</CurLbl></AwardInfo>` +
    (doc.project.client ? `<OWN><Address><Name1>${esc(doc.project.client)}</Name1></Address></OWN>` : '') +
    (doc.preamble ? `<AddText><OutlineAddText><span>Vorbemerkungen</span></OutlineAddText><DetailAddText>${paras(doc.preamble)}</DetailAddText></AddText>` : '') +
    `<BoQ ID="B1"><BoQInfo><Name>${esc((doc.project.name || '01').slice(0, 20))}</Name><LblBoQ>${esc(doc.project.label || '')}</LblBoQ>${bk}` +
    (priced && doc.declaredTotal != null ? `<Totals><Total>${doc.declaredTotal.toFixed(2)}</Total></Totals>` : '') +
    `</BoQInfo><BoQBody>${top}</BoQBody></BoQ></Award></GAEB>\n`
  );
}
