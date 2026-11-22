// Deliverables an estimator actually sends or files: Bieterfragen letter (Word) and risk report (Excel).
import { Document, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import ExcelJS from 'exceljs';
import type { Analysis, Finding, Lang, LVDocument } from '../types.ts';

export const CAT_LABEL: Record<string, string> = { fehler: 'Fehler', unklar: 'Unklare Beschreibung', widerspruch: 'Widerspruch', luecke: 'Fehlende Leistung', menge: 'Menge', preis: 'Preis', vertrag: 'Vertragsrisiko', schnittstelle: 'Schnittstelle', bieter: 'Bieterangabe' };
export const ACT_LABEL: Record<string, string> = { bieterfrage: 'Bieterfrage', zuschlag: 'Risikozuschlag', chance: 'Nachtragschance', korrektur: 'Korrektur', hinweis: 'Hinweis' };
export const CAT_LABEL_EN: Record<string, string> = { fehler: 'Error', unklar: 'Unclear description', widerspruch: 'Contradiction', luecke: 'Missing works', menge: 'Quantity', preis: 'Price', vertrag: 'Contract risk', schnittstelle: 'Interface', bieter: 'Bidder entry' };
export const ACT_LABEL_EN: Record<string, string> = { bieterfrage: 'Bidder question', zuschlag: 'Risk surcharge', chance: 'Change order opportunity', korrektur: 'Correction', hinweis: 'Note' };
// Decisions are stored as keys; the German report prints them as they are, the English one translates them.
const DECISION_EN: Record<string, string> = { ...ACT_LABEL_EN, offen: 'open', verworfen: 'dismissed', erledigt: 'done' };

export function questionList(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings
    .filter((f) => f.question)
    .filter((f) => (seen.has(f.question!) ? false : (seen.add(f.question!), true)))
    .sort((a, b) => (a.oz || '~').localeCompare(b.oz || '~', 'de', { numeric: true }));
}

export async function questionsDocx(doc: LVDocument, findings: Finding[], sender = ''): Promise<Buffer> {
  const qs = questionList(findings);
  const p = (text: string, opts: { bold?: boolean; after?: number; size?: number } = {}) => new Paragraph({ spacing: { after: opts.after ?? 160 }, children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, font: 'Arial' })] });
  const d = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [{
      children: [
        p(sender || '[Firma / Absender]', { after: 400 }),
        p('An die Vergabestelle', { after: 80 }),
        p(doc.project.client || '[Auftraggeber]', { after: 400 }),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 300 }, children: [new TextRun({ text: new Date().toLocaleDateString('de-DE'), size: 22, font: 'Arial' })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { after: 200 }, children: [new TextRun({ text: `Bieterfragen zum Leistungsverzeichnis`, bold: true, size: 26, font: 'Arial', color: '000000' })] }),
        p(`Bauvorhaben: ${doc.project.label || '—'}`, { after: 60 }),
        p(`Leistungsverzeichnis: ${doc.project.name || doc.fileName}`, { after: 300 }),
        p('Sehr geehrte Damen und Herren,'),
        p(`bei der Durchsicht der Vergabeunterlagen haben sich die nachstehenden ${qs.length} Fragen ergeben. Wir bitten um Beantwortung vor Ablauf der Angebotsfrist, damit wir Ihnen ein vollständiges und zutreffend kalkuliertes Angebot vorlegen können.`, { after: 300 }),
        ...qs.flatMap((f, i) => [p(`${i + 1}. ${f.oz ? 'Pos. ' + f.oz : 'Allgemein / Vorbemerkungen'}`, { bold: true, after: 60 }), p(f.question!, { after: 240 })]),
        p('Für Rückfragen stehen wir gerne zur Verfügung.', { after: 300 }),
        p('Mit freundlichen Grüßen'),
      ],
    }],
  });
  return Packer.toBuffer(d);
}

// The report follows the language of the analysis it is given (lang must match the lang passed to analyze).
// The draft bidder questions on the third sheet are always German: they are sent to a German client.
export async function reportXlsx(doc: LVDocument, a: Analysis, decisions: Record<string, string> = {}, lang: Lang = 'de'): Promise<Buffer> {
  const en = lang === 'en';
  const L = (de: string, e: string) => (en ? e : de);
  const cat = en ? CAT_LABEL_EN : CAT_LABEL;
  const act = en ? ACT_LABEL_EN : ACT_LABEL;
  const sev = en ? ['', 'low', 'medium', 'high'] : ['', 'niedrig', 'mittel', 'hoch'];
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shovel';
  const head = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const s0 = wb.addWorksheet(L('Übersicht', 'Overview'));
  s0.columns = [{ width: 34 }, { width: 60 }];
  s0.addRows([
    [L('Prüfbericht Leistungsverzeichnis', 'Review report – bill of quantities'), ''],
    [L('Datei', 'File'), doc.fileName],
    [L('Projekt', 'Project'), doc.project.label || ''],
    ['Format', `${doc.format}${doc.phase ? ' / DA' + doc.phase : ''}`],
    [L('Positionen', 'Items'), a.stats.items],
    [a.stats.estimated ? L('LV-Summe (geschätzt aus Referenzpreisen)', 'Total of the bill of quantities (estimated from reference prices)') : L('Angebotssumme', 'Bid total'), Math.round(a.stats.sumTotal * 100) / 100],
    [L('Risiko-Score (0–100)', 'Risk score (0–100)'), a.stats.riskScore],
    [L('Befunde gesamt', 'Findings in total'), a.findings.length],
    [L('davon hoch', 'of which high'), a.stats.bySeverity[3]],
    [L('Betroffener Wert (Schätzung)', 'Value at stake (estimate)'), Math.round(a.stats.exposure)],
    [L('Vorgeschlagener Risikozuschlag', 'Suggested risk surcharge'), Math.round(a.stats.surcharge)],
    [L('Erstellt', 'Created'), new Date().toLocaleString(en ? 'en-GB' : 'de-DE')],
    [L('Hinweis', 'Note'), L('Prüfhinweise für die Kalkulation – keine Rechtsberatung. Jeder Befund ist vom Kalkulator zu bestätigen.', 'Review notes for estimating – not legal advice. Every finding must be confirmed by the estimator.')],
  ]);
  s0.getRow(1).font = { bold: true, size: 14 };
  const s1 = wb.addWorksheet(L('Befunde', 'Findings'));
  s1.columns = [
    { header: L('Nr.', 'No.'), width: 5 }, { header: 'OZ', width: 12 }, { header: L('Schwere', 'Severity'), width: 9 }, { header: L('Kategorie', 'Category'), width: 20 }, { header: L('Befund', 'Finding'), width: 50 }, { header: L('Erläuterung', 'Explanation'), width: 80 },
    { header: L('Zitat aus dem LV', 'Quote from the bill of quantities'), width: 60 }, { header: L('Grundlage', 'Basis'), width: 40 }, { header: L('Empfehlung', 'Recommendation'), width: 16 }, { header: L('Entscheidung', 'Decision'), width: 16 }, { header: L('Betroffener Wert €', 'Value at stake €'), width: 16 }, { header: L('Zuschlag %', 'Surcharge %'), width: 10 }, { header: L('Quelle', 'Source'), width: 10 }, { header: L('Nachtrag', 'Change order (Nachtrag)'), width: 60 },
  ];
  const decision = (id: string) => (en ? DECISION_EN[decisions[id] || 'offen'] || decisions[id] : decisions[id] || 'offen');
  a.findings.forEach((f, i) => {
    const r = s1.addRow([i + 1, f.oz, sev[f.severity], cat[f.category] || f.category, f.title, f.detail, f.evidence.map((e) => e.quote).join(' | '), f.basis || '', act[f.action], decision(f.id), Math.round(f.exposure), f.surchargePct || '', f.source === 'ki' ? L('KI', 'AI') : f.source === 'statistik' ? L('Statistik', 'Statistics') : L('Regel', 'Rule'), f.nachtrag ? `${f.nachtrag.basis}: ${f.nachtrag.note}` : '']);
    r.alignment = { wrapText: true, vertical: 'top' };
    r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ['', 'FFE5E7EB', 'FFFDE68A', 'FFFCA5A5'][f.severity] } };
  });
  head(s1);
  const s2 = wb.addWorksheet(L('Bieterfragen', 'Bidder questions'));
  s2.columns = [{ header: L('Nr.', 'No.'), width: 5 }, { header: 'OZ', width: 12 }, { header: L('Frage', 'Question (German, as sent)'), width: 120 }];
  questionList(a.findings.filter((f) => (decisions[f.id] ? decisions[f.id] === 'bieterfrage' : f.action === 'bieterfrage'))).forEach((f, i) => (s2.addRow([i + 1, f.oz, f.question]).alignment = { wrapText: true, vertical: 'top' }));
  head(s2);
  const s3 = wb.addWorksheet(L('Nachtragspotenzial', 'Change order potential'));
  s3.columns = [{ header: 'OZ', width: 12 }, { header: L('Befund', 'Finding'), width: 50 }, { header: L('Anspruchsgrundlage', 'Basis of claim'), width: 22 }, { header: L('Was zu tun ist', 'What to do'), width: 90 }, { header: L('Betroffener Wert €', 'Value at stake €'), width: 16 }];
  a.findings.filter((f) => f.nachtrag).forEach((f) => (s3.addRow([f.oz, f.title, f.nachtrag!.basis, f.nachtrag!.note, Math.round(f.exposure)]).alignment = { wrapText: true, vertical: 'top' }));
  head(s3);
  const s4 = wb.addWorksheet(L('Positionen', 'Items'));
  s4.columns = [{ header: 'OZ', width: 12 }, { header: L('Kurztext', 'Short text'), width: 50 }, { header: L('Menge', 'Quantity'), width: 12 }, { header: L('Einheit', 'Unit'), width: 8 }, { header: L('EP', 'Unit price'), width: 12 }, { header: L('GP', 'Total'), width: 14 }, { header: L('Referenz von', 'Reference from'), width: 12 }, { header: L('Referenz Mitte', 'Reference mid'), width: 13 }, { header: L('Referenz bis', 'Reference to'), width: 12 }, { header: L('Risiko 0–100', 'Risk 0–100'), width: 12 }, { header: L('Befunde', 'Findings'), width: 9 }];
  for (const it of doc.items) {
    const p = a.prices[it.id];
    s4.addRow([it.oz, it.shortText, it.qty, it.unit, it.up, it.total, p ? +p.low.toFixed(2) : '', p ? +p.mid.toFixed(2) : '', p ? +p.high.toFixed(2) : '', a.itemRisk[it.id] || 0, a.findings.filter((f) => f.itemIds.includes(it.id)).length]);
  }
  head(s4);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
