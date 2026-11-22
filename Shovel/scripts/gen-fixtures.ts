// Generates the demo project: five LVs of one fictional building in all supported formats,
// with seeded defects and a ground-truth file used by scripts/eval.ts.
// All names, quantities and prices are invented. Layouts follow what real AVA exports look like.
import { mkdirSync, writeFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { LVDocument, LVItem, LVSection } from '../src/core/types.ts';
import { normUnit } from '../src/core/units.ts';
import { writeGaebXml } from '../src/core/export/gaebxml.ts';
import { writeGaeb90 } from '../src/core/parse/gaeb90.ts';

const OUT = new URL('../fixtures/', import.meta.url).pathname;
mkdirSync(OUT + 'history', { recursive: true });

type Opt = { bedarf?: boolean; wahl?: boolean; std?: boolean; up?: number; total?: number; err?: string | string[]; noTotal?: boolean };
type Row = [oz: string, short: string, long: string, qty: number | null, unit: string | null, opt?: Opt];
type Sec = { oz: string; label: string; remark?: [string, string]; rows: Row[]; total?: number };

const truth: { file: string; oz: string; rule: string }[] = [];

function mk(fileName: string, meta: Partial<LVDocument>, secs: Sec[], docErrs: string[] = []): LVDocument {
  const sections: LVSection[] = [];
  const items: LVItem[] = [];
  const remarks: LVDocument['remarks'] = [];
  let n = 0;
  for (const s of secs) {
    const parts = s.oz.split('.');
    for (let i = 1; i < parts.length; i++) {
      const p = parts.slice(0, i).join('.');
      if (!sections.some((x) => x.oz === p)) sections.push({ oz: p, label: (meta as any).parents?.[p] || p, level: i });
    }
    sections.push({ oz: s.oz, label: s.label, level: parts.length, declaredTotal: s.total });
    if (s.remark) remarks.push({ sectionOz: s.oz, title: s.remark[0], text: s.remark[1] });
    for (const [oz, short, long, qty, unit, o = {}] of s.rows) {
      n++;
      const up = o.up ?? null;
      items.push({
        id: `d${n}`, oz: `${s.oz}.${oz}`, sectionOz: s.oz, sectionPath: [s.label], shortText: short, longText: long, qty, unit, unitNorm: normUnit(unit),
        up, total: o.total ?? (up != null && qty != null && !o.noTotal ? Math.round(up * qty * 100) / 100 : null),
        flags: { bedarf: !!o.bedarf, wahl: !!o.wahl, zulage: /^Zulage/.test(short), stundenlohn: !!o.std, pauschal: normUnit(unit) === 'psch', qtyTBD: false, noTotal: !!o.noTotal || (!!o.bedarf && up == null), bidderFields: (long.match(/'\.{6,}'/g) || []).length },
      });
      for (const e of ([] as string[]).concat(o.err || [])) truth.push({ file: fileName, oz: `${s.oz}.${oz}`, rule: e });
    }
  }
  for (const e of docErrs) truth.push({ file: fileName, oz: '', rule: e });
  const { parents, ...m } = meta as any;
  return { id: fileName, fileName, format: 'gaeb-xml', phase: 83, project: {}, currency: 'EUR', preamble: '', remarks, sections, items, warnings: [], priced: false, ...m };
}

const PROJECT = 'Neubau Ausbildungszentrum mit Werkhalle, Musterstadt';

// ---------------------------------------------------------------- 1. Rohbau (GAEB XML X83)
const rohbau = mk(
  'Demo_01_Rohbau_Erdarbeiten.X83',
  {
    project: { name: 'AZ-2026-01', label: PROJECT, client: 'Zweckverband Berufliche Bildung Musterstadt' },
    preamble: [
      'Vorbemerkungen zum Leistungsverzeichnis Erd- und Rohbauarbeiten',
      'Gegenstand der Ausschreibung ist der Neubau eines zweigeschossigen Ausbildungszentrums mit angegliederter Werkhalle. Das Gebäude ist nicht unterkellert.',
      'Der Ausführung liegen die VOB/B und VOB/C sowie DIN 1045-1 zugrunde.',
      'Sämtliche Erschwernisse aus Witterung, beengten Platzverhältnissen und dem laufenden Betrieb der Nachbargebäude sind in die Einheitspreise einzurechnen.',
      'Erforderliche Arbeits- und Schutzgerüste werden nicht gesondert vergütet.',
      'Maßnahmen der offenen Wasserhaltung sind, soweit erforderlich, in die Einheitspreise einzurechnen.',
      'Für die Überschreitung des Fertigstellungstermins wird eine Vertragsstrafe von 0,2 % der Auftragssumme je Werktag vereinbart.',
      'Die Baustelle ist über die Werkstraße anzufahren. Lagerflächen stehen nur eingeschränkt zur Verfügung.',
    ].join('\n'),
  },
  [
    {
      oz: '01', label: 'Baustelleneinrichtung',
      rows: [
        ['0010', 'Baustelle einrichten', 'Baustelle einrichten für sämtliche in der Leistungsbeschreibung aufgeführten Leistungen. An- und Abtransport der erforderlichen Geräte, Unterkünfte und Lagercontainer.', 1, 'psch'],
        ['0020', 'Baustelleneinrichtung vorhalten', 'Vorhalten der Baustelleneinrichtung für die Dauer der Rohbauarbeiten.\nAbrechnung nach Monaten.', 8, 'Mt'],
        ['0030', 'Bauzaun aufstellen und vorhalten', 'Bauzaun aus Stahlrohrrahmen mit Gitterfüllung, Höhe 2,00 m, aufstellen, für die Bauzeit vorhalten und wieder abbauen.', 240, 'm'],
        ['0040', 'Baustrom- und Bauwasseranschluss', 'Baustrom und Bauwasser werden bauseits gestellt. Verteilung auf der Baustelle durch den AN.', 1, 'psch', { err: 'V-BAUSEITS' }],
      ],
    },
    {
      oz: '02', label: 'Erdarbeiten',
      rows: [
        ['0010', 'Oberboden abtragen', 'Oberboden in einer Dicke von i. M. 30 cm abtragen und seitlich auf dem Baugrundstück lagern.', 1850, 'm2'],
        ['0020', 'Baugrubenaushub', 'Boden der Baugrube profilgerecht lösen, laden und fördern. Aushubtiefe bis 1,80 m.\nBodenklasse 3 bis 5 nach DIN 18300.', 2400, 'm3', { err: 'W-NORM' }],
        ['0030', 'Fundamentaushub', 'Boden für Einzel- und Streifenfundamente lösen und seitlich lagern. Aushubtiefe bis 1,20 m unter Baugrubensohle, Homogenbereich B1.', 310, 'm3'],
        ['0040', 'Boden abfahren und entsorgen', 'Überschüssigen Aushubboden laden, abfahren und einer Verwertung zuführen, einschl. aller Nebenarbeiten und Gebühren.', 3900, 'm3', { err: ['M-VERHAELTNIS', 'U-KOMPLETT', 'U-PFLICHTANGABE'] }],
        ['0050', 'Arbeitsräume verfüllen', 'Arbeitsräume mit geeignetem, seitlich gelagertem Boden lagenweise verfüllen und verdichten. Lieferung von Fremdmaterial wird seperat vergütet.', 620, 'm3', { err: 'F-TIPPFEHLER' }],
        ['0060', 'Planum herstellen und verdichten', 'Planum der Baugrubensohle herstellen und verdichten. Verdichtungsgrad und Prüfumfang nach Angabe der Bauleitung.', 1850, 'm2', { err: 'U-WAHL-AG' }],
        ['0070', 'Kiestragschicht 30 cm', 'Kapillarbrechende Tragschicht aus Kies 0/32, Dicke 30 cm, liefern, einbauen und verdichten.', 1850, 'm2'],
        ['0070', 'Sauberkeitsschicht unter Fundamenten', 'Sauberkeitsschicht aus Beton C12/15, Dicke 5 cm, unter Fundamenten herstellen.', 260, 'm2', { err: 'F-OZ-DOPPELT' }],
      ],
    },
    {
      oz: '04', label: 'Beton- und Stahlbetonarbeiten',
      remark: ['Hinweis Sichtbeton', 'Sichtbetonflächen sind in Abstimmung mit dem Architekten zu bemustern. Die Schalungsstöße werden noch festgelegt.'],
      rows: [
        ['0010', 'Sauberkeitsschicht C12/15, d = 5 cm', 'Sauberkeitsschicht aus unbewehrtem Beton C12/15, Dicke 5 cm, unter der Bodenplatte herstellen und abziehen.', 1850, 'm2'],
        ['0020', 'Bodenplatte Stahlbeton C25/30, d = 25 cm', 'Bodenplatte aus Stahlbeton, Festigkeitsklasse C30/37, Expositionsklasse XC2, als WU-Konstruktion.\nDicke: 30 cm.\nOberfläche flügelgeglättet. Abrechnung nach m3.', 462, 'm3', { err: 'W-KURZ-LANG' }],
        ['0030', 'Streifenfundamente Ortbeton', 'Streifenfundamente aus Stahlbeton herstellen, Querschnitt 60 x 80 cm.', 95, 'm3', { err: 'U-PFLICHTANGABE' }],
        ['0040', 'Stahlbetonwände C25/30, d = 24 cm', 'Wände aus Stahlbeton C25/30, XC1, Dicke 24 cm, Höhe bis 3,50 m.', 180, 'm3'],
        ['0050', 'Stahlbetonstützen C30/37', 'Stützen aus Stahlbeton C30/37, Querschnitt 40 x 40 cm, Höhe bis 4,20 m.', 1, 'm3', { err: 'M-PLATZHALTER' }],
        ['0060', 'Stahlbetondecke C25/30, d = 22 cm', 'Decke über Erdgeschoss aus Stahlbeton C25/30, XC1, Dicke 22 cm.', 210, 'm3'],
        ['0070', 'Schalung Wände', 'Schalung für Wände, glatt, Schalungshöhe bis 3,50 m, einschl. Abstützung.', 1500, 'm2'],
        ['0080', 'Schalung Decke', 'Schalung der Decke über Erdgeschoss, Stützhöhe bis 3,50 m.', 955, 'm2'],
        ['0090', 'Schalung Stützen', 'Schalung für Stützen, Sichtbetonklasse SB2, Ausführung nach Wahl des Architekten.', 135, 'm2', { err: 'U-WAHL-AG' }],
        ['0100', 'Betonstabstahl B500B', 'Bewährung aus Betonstabstahl B500B, alle Durchmesser, liefern, schneiden, biegen und verlegen.', 28, 't', { err: ['F-TIPPFEHLER', 'M-VERHAELTNIS'] }],
        ['0110', 'Betonstahlmatten', 'Betonstahlmatten BSt 500 M liefern, schneiden und verlegen.', 12, 't', { err: 'W-NORM' }],
        ['0120', 'Fugenblech Arbeitsfuge', 'Fugenblech, beschichtet, in Arbeitsfugen Bodenplatte/Wand einbauen.', 185, 'm'],
        ['0130', 'Aussparungen herstellen', 'Aussparungen in Wänden und Decken für haustechnische Installationen nach Erfordernis herstellen, Größe bis 0,25 m2.', 40, 'St', { err: 'U-ERFORDERNIS' }],
        ['0140', 'Ankerschienen einbauen', 'Ankerschienen in Wände einbauen.\nFabrikat: Ankertec AT-38\nAngebotenes Fabrikat: \'........\'', 96, 'm', { err: 'U-FABRIKAT' }],
        ['0150', 'Kernbohrungen', 'Bedarfsposition: Kernbohrungen in Stahlbeton, Durchmesser bis 150 mm, Bauteildicke bis 30 cm.', 20, 'St', { bedarf: true }],
        ['0160', 'Oberfläche Bodenplatte', '', 1850, 'm2', { err: 'F-TEXT-FEHLT' }],
      ],
    },
    {
      oz: '05', label: 'Mauerarbeiten',
      rows: [
        ['0010', 'Mauerwerk Kalksandstein, d = 17,5 cm', 'Innenwände aus Kalksandstein KS 12-1,8, Dicke 17,5 cm, im Dünnbettverfahren.', 420, 'm2'],
        ['0020', 'Mauerwerk wie Pos. 05.0090', 'Wie Pos. 05.0090, jedoch Dicke 24 cm.', 160, 'm2', { err: 'U-WIEVOR' }],
        ['0030', 'Mauerwerk Hochlochziegel, d = 36,5 cm', 'Außenwände aus Hochlochziegeln, Dicke 36,5 cm.\nAbrechnung nach m3.', 310, 'm2', { err: 'W-EINHEIT-TEXT' }],
        ['0040', 'Stürze', 'Stahlbeton-Fertigteilstürze über Öffnungen bis 1,26 m liefern und einbauen.', 36, 'St'],
        ['0060', 'Ringanker', 'Ringanker aus Stahlbeton C25/30 in U-Schalen herstellen.', null, 'm', { err: ['F-MENGE-FEHLT', 'F-OZ-LUECKE'] }],
      ],
    },
    {
      oz: '09', label: 'Stundenlohnarbeiten',
      rows: [
        ['0010', 'Stundenlohn Facharbeiter', 'Stundenlohnarbeiten Facharbeiter, auf besondere Anordnung.', 80, 'h', { std: true }],
        ['0020', 'Stundenlohn Helfer', 'Stundenlohnarbeiten Helfer, auf besondere Anordnung.', 40, 'Std', { std: true }],
      ],
    },
  ],
  ['L-FEHLT:Baustelle räumen', 'L-FEHLT:Wasserhaltung', 'V-ERSCHWERNIS-VB', 'V-EINRECHNEN-VB', 'V-TERMIN-VB', 'W-NORM:DIN 1045-1', 'F-EINHEIT-SCHREIBWEISE', 'B-ANGABEN', 'V-BEDARF', 'V-STUNDENLOHN'],
);
writeFileSync(OUT + rohbau.fileName, writeGaebXml(rohbau, 83));

// ---------------------------------------------------------------- 2. Fußbodenheizung (GAEB 90 D83)
const heizung = mk(
  'Demo_14c_Fussbodenheizung.D83',
  { project: { name: 'AZ-2026-14c', label: PROJECT }, parents: { '01': 'Heizungsanlagen' }, preamble: 'Vorbemerkungen Heizung\nDie Estricharbeiten erfolgen durch den Estrichleger. Das Funktionsheizen erfolgt nach Freigabe durch die Bauleitung.' } as any,
  [
    {
      oz: '01.01', label: 'Fussbodenheizung',
      rows: [
        ['0010', 'Systemdämmung Rolljet 30 mm liefern und verlegen', 'Systemdämmung als Rolljet-Verbundplatte, Dicke 30 mm, WLG 040, mit Rasterfolie, auf Rohdecke verlegen. Stösse verkleben.', 1240, 'm2'],
        ['0020', 'Heizrohr PE-RT 17 x 2 mm liefern', 'Heizrohr PE-RT 17 x 2,0 mm, sauerstoffdicht, in Ringen liefern.', 8200, 'm'],
        ['0030', 'Heizrohr PE-RT 17 x 2 mm verlegen', 'Heizrohr im Verlegeabstand 15 cm auf Systemdämmung verlegen und mit Tackernadeln befestigen.', 6900, 'm', { err: 'M-LIEFERN-VERLEGEN' }],
        ['0040', 'Heizkreisverteiler 12-fach', 'Heizkreisverteiler aus Edelstahl mit Durchflussmessern, 12 Heizkreise, im Verteilerschrank montieren.\nFabrikat: Thermoflux HKV-E', 6, 'St', { err: 'U-FABRIKAT' }],
        ['0050', 'Randdämmstreifen 8 mm', 'Randdämmstreifen aus PE-Schaum, 8 x 150 mm, mit Folienlappen, an allen aufgehenden Bauteilen verlegen.', 960, 'm'],
        ['0060', 'Druckprobe', 'Druckprobe der Heizkreise mit Protokoll.', 1, 'psch'],
        ['0070', 'Funktionsheizen', 'Funktionsheizen des Estrichs komplett einschl. aller Nebenarbeiten.', 1, 'psch', { err: 'U-KOMPLETT' }],
        ['0080', 'Stundenlohn Monteur', 'Stundenlohnarbeiten Monteur auf Anordnung.', 20, 'h', { std: true }],
      ],
    },
  ],
);
heizung.format = 'gaeb-90';
writeFileSync(OUT + heizung.fileName, writeGaeb90(heizung, 83));

// ---------------------------------------------------------------- 3. Estrich (PDF, AVA "Anfrage" print)
const estrich = mk(
  'Demo_18_Estrich.pdf',
  { project: { name: '18 Estrich', label: PROJECT } },
  [
    {
      oz: '11.2', label: 'Estricharbeiten',
      remark: ['Vorbemerkung', 'ZTV Estricharbeiten\nFrisch mit Estrich belegte Räume sind vom AN abzusperren und gegen rasches Austrocknen zu schützen.\nAlle Estrichhöhen sind so auszuführen, dass die Anschlüsse der fertigen Oberbodenbeläge ohne Höhendifferenz erfolgen.\nDer Schutz der Estrichflächen bis zur Belagsverlegung wird nicht gesondert vergütet.'],
      rows: [
        ['10', 'Trennlage PE-Folie', 'Trennlage aus PE-Folie 0,2 mm, einlagig, Stöße 10 cm überlappt, auf Systemdämmung verlegen.', 1240, 'm2'],
        ['20', 'Zementestrich als Heizestrich, 65 mm', 'Zementestrich CT-C25-F4 als schwimmender Heizestrich auf Dämmung für Fußbodenheizung.\nDie Systemdämmung (Rolljet) wird vom Heizungsbauer verlegt.\nEstrichdicke: 65 mm\nNutzlast: Flächenlast 5 kN/m2\nEinbauort: EG und OG Schulungsräume', 1240, 'm2', { err: 'S-SCHNITTSTELLE' }],
        ['30', 'Zementestrich im Verbund, Technikraum', 'Zementestrich CT-C30-F5 im Verbund auf Rohbetondecke, Dicke 50 mm, einschl. Haftbrücke.\nEinbauort: Technikräume UG', 85, 'm3', { err: 'W-EINHEIT-ART' }],
        ['40', 'Bodeneinlauf anarbeiten', 'Anarbeiten der Estrichbeläge an Bodeneinläufe. Die Bodeneinläufe werden vom Sanitärinstallateur gesetzt.', 4, 'St', { err: 'S-SCHNITTSTELLE' }],
        ['50', 'Zulage Gefälleausbildung an Bodeneinläufen', 'Zulage Gefälleausbildung im Beerich von Bodeneinläufen.\nVerzugsgröße der Oberfläche: ca. 1,00-1,50 m2\nGefälle ca. 1-2 %', 4, 'Stk', { err: 'F-TIPPFEHLER' }],
        ['70', 'Zulage für Schnellestrich', 'Zulage zu Zementestrichen für ein Zusatzmittel als Schnellestrich mit einer Belegreife nach 10 Tagen.\nAngeb. Fabrikat: \'........................\'', 1240, 'm2', { bedarf: true, err: 'F-OZ-LUECKE' }],
        ['80', 'Bewegungsfuge mit Fugenprofil', 'Bewegungsfugen mit Fugenprofil aus Aluminium ausbilden, Lage nach Angabe der Bauleitung.', 10, 'm', { err: 'U-WAHL-AG' }],
        ['90', 'Abstellwinkel', 'Abstellwinkel zum Einbau in Estrichbelägen, auf Betondecke montiert, Höhe bis 150 mm.', 1, 'm', { err: 'M-PLATZHALTER' }],
        ['100', 'Estrich schleifen', 'Estrichoberfläche schleifen und absaugen, soweit erforderlich.', 300, 'm2', { err: 'U-ERFORDERNIS' }],
      ],
    },
  ],
  ['L-FEHLT:Randdämmstreifen', 'L-FEHLT:CM-Messung', 'L-FEHLT:Funktions- / Belegreifheizen', 'V-EINRECHNEN-VB'],
);

function pdfLayoutA(doc: LVDocument, lvName: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    let y = 0;
    let page = 0;
    const X_OZ = 50, X_TX = 118, X_UP = 380, X_GP = 470;
    const footer = () => {
      pdf.font('Helvetica').fontSize(8);
      pdf.text('Übertrag:', X_UP, 770, { lineBreak: false });
      pdf.text(`Druckdatum: 21.11.2026   Seite: ${page}`, 50, 790, { lineBreak: false });
      pdf.text('Planungsbüro Muster & Partner · Beispielweg 1 · 80000 Musterstadt', 50, 802, { lineBreak: false });
    };
    const header = () => {
      if (page) footer();
      pdf.addPage();
      page++;
      pdf.font('Helvetica-Bold').fontSize(11).text('Anfrage', 50, 40, { lineBreak: false });
      pdf.font('Helvetica').fontSize(9).text(`Projekt: ${doc.project.label}`, 50, 58, { lineBreak: false });
      pdf.text(`LV: ${lvName}`, 50, 71, { lineBreak: false });
      pdf.font('Helvetica-Bold').fontSize(8);
      pdf.text('OZ', X_OZ, 92, { lineBreak: false });
      pdf.text('Leistungsbeschreibung', X_TX, 92, { lineBreak: false });
      pdf.text('Menge', 300, 92, { lineBreak: false });
      pdf.text('ME', 345, 92, { lineBreak: false });
      pdf.text('Einheitspreis', X_UP, 92, { lineBreak: false });
      pdf.text('Gesamtbetrag', X_GP, 92, { lineBreak: false });
      pdf.font('Helvetica').text('in EUR', X_UP, 103, { lineBreak: false });
      pdf.text('in EUR', X_GP, 103, { lineBreak: false });
      y = 125;
    };
    const line = (parts: [number, string][], bold = false, gap = 12) => {
      if (y > 745) header();
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      for (const [x, s] of parts) pdf.text(s, x, y, { lineBreak: false });
      y += gap;
    };
    const wrapText = (s: string, width = 62) => {
      const out: string[] = [];
      for (const para of s.split('\n')) {
        let l = '';
        for (const w of para.split(' ')) {
          if ((l + ' ' + w).trim().length > width) { out.push(l); l = w; } else l = (l + ' ' + w).trim();
        }
        out.push(l);
      }
      return out;
    };
    const de = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    header();
    const top = doc.sections.filter((s) => s.level === 1);
    for (const t of top) line([[X_OZ, `${t.oz}.`], [X_TX, t.label]], true, 16);
    if (!top.length) line([[X_OZ, '11.'], [X_TX, 'Estricharbeiten']], true, 16);
    for (const s of doc.sections.filter((x) => x.level > 1 || !top.length)) {
      const rem = doc.remarks.find((r) => r.sectionOz === s.oz);
      const base = s.oz.split('.')[0];
      if (rem) {
        line([[X_OZ, `${base}.1.`], [X_TX, rem.title]], true, 14);
        for (const l of wrapText(rem.text)) line([[X_TX, l]]);
        y += 8;
      }
      line([[X_OZ, `${s.oz}.`], [X_TX, s.label]], true, 16);
      for (const it of doc.items.filter((i) => i.sectionOz === s.oz)) {
        if (y > 690) header();
        if (it.flags.bedarf) line([[X_OZ, `${it.oz}.`], [X_TX, '*** Bedarfsposition ohne GB']], true);
        else line([[X_OZ, `${it.oz}.`], [X_TX, it.shortText]], true);
        if (it.flags.bedarf) line([[X_TX, it.shortText]], true);
        for (const l of wrapText(it.longText)) line([[X_TX, l]]);
        line([[X_TX, de(it.qty ?? 0)], [X_TX + 70, it.unit || ''], [X_UP, '.........................'], [X_GP, it.flags.bedarf ? 'Nur Einh.-Pr.' : '.........................']], false, 20);
      }
      line([[X_TX, `Summe ${s.oz}. ${s.label}`], [X_GP, '.........................']], true, 20);
    }
    footer();
    pdf.end();
  });
}
writeFileSync(OUT + estrich.fileName, await pdfLayoutA(estrich, '18 Estrich'));

// ---------------------------------------------------------------- 4. Bodenbelag (Excel)
const boden = mk(
  'Demo_20_Bodenbelag.xlsx',
  { project: { name: '20 Bodenbelagsarbeiten', label: PROJECT }, preamble: 'LV 20 Bodenbelagsarbeiten\nDie Belagsarbeiten erfolgen in Abschnitten nach Angabe des AG. Unterbrechungen sind nicht gesondert zu vergüten.' },
  [
    {
      oz: '20', label: 'Bodenbelagsarbeiten',
      rows: [
        ['10', 'Kautschukbelag 2 mm', 'Kautschuk-Bodenbelag in Bahnen, Dicke 2,0 mm, vollflächig verkleben. Farbe nach Wahl des AG.', 860, 'm2', { err: 'U-WAHL-AG' }],
        ['20', 'Teppichboden Schlinge', 'Textiler Bodenbelag, Schlinge, Fliesenformat 50 x 50 cm, verlegen.\nFabrikat: Textura Loop 500', 340, 'm2', { err: 'U-FABRIKAT' }],
        ['30', 'Linoleum 2,5 mm', 'Linoleum-Bodenbelag in Bahnen, Dicke 2,5 mm, verkleben und Nähte verschweißen.', 0, 'm2', { err: 'F-MENGE-FEHLT' }],
        ['40', 'Sockelleiste Kautschuk', 'Sockelleiste aus Kautschuk, Höhe 60 mm, kleben.', 610, 'm'],
        ['50', 'Sockelleiste Kautschuk', 'Sockelleiste aus Kautschuk, Höhe 60 mm, kleben.', 240, 'm', { err: 'F-DOPPELT' }],
        ['60', 'Übergangsprofile', 'Übergangsprofile aus Aluminium an Türdurchgängen, Belagswechseln etc. liefern und montieren.', 48, 'm', { err: 'U-ODER-AEHNLICH' }],
        ['70', 'Erstpflege', 'Erstpflege der Kautschuk- und Linoleumbeläge nach Herstellervorschrift.', 3, 'psch', { err: 'F-PSCH-MENGE' }],
        ['80', 'Treppenstufen belegen', 'Treppenstufen mit Kautschuk-Formtreppe belegen, Stufenbreite bis 1,20 m, gemäß Detail D-07.', 36, 'St'],
      ],
    },
  ],
  ['L-FEHLT:Untergrundvorbereitung', 'V-TERMIN-VB', 'V-EINRECHNEN-VB'],
);
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('LV');
  ws.addRow([`Projekt: ${PROJECT}`]);
  for (const l of boden.preamble.split('\n')) ws.addRow([l]);
  ws.addRow([]);
  ws.addRow(['Pos.', 'Kurztext', 'Langtext', 'Menge', 'Einheit', 'EP', 'GP']);
  ws.addRow(['20', 'Bodenbelagsarbeiten']);
  for (const it of boden.items) ws.addRow([it.oz, it.shortText, it.longText, it.qty, it.unit, null, null]);
  ws.columns.forEach((c, i) => (c.width = [10, 34, 70, 10, 9, 10, 12][i]));
  writeFileSync(OUT + boden.fileName, Buffer.from(await wb.xlsx.writeBuffer()));
}

// ---------------------------------------------------------------- 5. Priced bid: water main (D84 + PDF)
const P = (up: number, o: Opt = {}): Opt => ({ up, ...o });
const angebot = mk(
  'Demo_Angebot_Wasserleitung.D84',
  { phase: 84, priced: true, project: { name: 'AN26-0412', label: 'Erneuerung Wasserleitung DN 250, Ortsnetz Beispielhausen' }, parents: { '1': 'Baustelleneinrichtung', '2': 'Erd- und Oberflächenarbeiten', '3': 'Rohrleitungsbau' } } as any,
  [
    {
      oz: '1.1', label: 'Baustelleneinrichtung', total: 96210.0,
      rows: [
        ['10', 'Baustelleneinrichtung herstellen', 'Baustelle einrichten.', 1, 'psch', P(78000)],
        ['20', 'Baustelleneinrichtung vorhalten', 'Vorhalten der Baustelleneinrichtung.', 6.5, 'Mt', P(850)],
        ['30', 'Baustelle räumen', 'Baustelle räumen.', 1, 'psch', P(6500)],
        ['40', 'Verkehrssicherung Arbeitsstelle', 'Verkehrssicherung nach RSA.', 1, 'psch', P(4200)],
        ['50', 'Schutzzaun ortsfest, h = 2,00 m', 'Schutzzaun aufstellen und vorhalten.', 500, 'm', P(0.1, { err: 'P-SPEKULATIV' })],
        ['60', 'Beweissicherung durchführen', 'Beweissicherung vor Baubeginn.', 1, 'psch', P(980)],
        ['70', 'Spartenpläne einholen', 'Spartenpläne aller Versorger einholen.', 1, 'psch', P(450)],
      ],
    },
    {
      oz: '2.1', label: 'Rohrgraben',
      rows: [
        ['10', 'Oberboden abschieben und andecken', 'Oberboden abschieben, lagern und wieder andecken.', 6800, 'm3', P(0.5, { err: 'P-SPEKULATIV' })],
        ['20', 'Geotextil liefern und verlegen', 'Geotextil GRK 3 liefern und verlegen.', 3600, 'm2', P(0.05, { err: 'P-SPEKULATIV' })],
        ['30', 'Rohrgrabenaushub HB 1', 'Rohrgrabenaushub Homogenbereich 1, Tiefe bis 1,75 m.', 550, 'm3', P(28.5)],
        ['40', 'Rohrgrabenaushub HB 2', 'Rohrgrabenaushub Homogenbereich 2, Tiefe bis 1,75 m.', 4850, 'm3', P(28.5, { total: 183225.0, err: 'F-RECHNEN' })],
        ['50', 'Handschachtung', 'Handschachtung im Bereich kreuzender Leitungen.', 50, 'm3', P(0.68, { err: 'P-SPEKULATIV' })],
        ['60', 'Suchschlitze', 'Suchschlitze herstellen und verfüllen.', 50, 'm3', P(0.24, { err: 'P-SPEKULATIV' })],
        ['70', 'Sandbettung und Umhüllung', 'Leitungszone aus Sand 0/4 herstellen.', 620, 'm3', P(480, { err: 'P-HOCH' })],
        ['80', 'Rohrgraben verfüllen und verdichten', 'Rohrgraben lagenweise verfüllen und verdichten.', 4700, 'm3', P(17.5)],
        ['90', 'Boden abfahren und entsorgen', 'Überschüssigen Boden abfahren, Materialklasse BM-0.', 700, 'm3', P(26)],
      ],
    },
    {
      oz: '2.3', label: 'Asphalt',
      rows: [
        ['10', 'Straßendecke schneiden', 'Asphalt schneiden, Vor- und Nachschnitt.', 420, 'm', P(7.5)],
        ['20', 'Straßenaufbruch bituminöser Oberbau', 'Bituminösen Oberbau aufbrechen und entsorgen.', 95, 'm3', P(88)],
        ['30', 'Frostschutzschicht herstellen', 'Frostschutzschicht 0/45, Dicke 50 cm.', 210, 'm3', P(41)],
        ['40', 'Asphalttragschicht 14 cm herstellen', 'Asphalttragschicht AC 32 T S, 14 cm.', 420, 'm2', P(37)],
        ['50', 'Asphaltdeckschicht 4 cm herstellen', 'Asphaltdeckschicht AC 11 D S, 4 cm.', 420, 'm2', P(0, { err: 'P-NULL' })],
      ],
    },
    {
      oz: '3.1', label: 'Rohrleitungsmaterial DN 250',
      rows: [
        ['10', 'Muffendruckrohre GGG DN 250 liefern', 'Muffendruckrohre aus duktilem Gusseisen DN 250, PN 10, liefern.', 3200, 'm', P(138)],
        ['20', 'Muffendruckrohre GGG DN 250 verlegen', 'Rohre DN 250 im Rohrgraben verlegen.', 2900, 'm', P(31, { err: 'M-LIEFERN-VERLEGEN' })],
        ['30', 'Muffenschutz DN 250', 'Muffenschutz liefern und einbauen.', 540, 'St', P(12.5)],
        ['40', 'Druckprüfung', 'Druckprüfung der Leitung nach DVGW W 400-2.', 3200, 'm', P(2.4)],
      ],
    },
  ],
  ['P-MISCHKALKULATION', 'F-SUMME'],
);
angebot.sections.find((s) => s.oz === '1.1')!.declaredTotal = 96210.0; // real sum 95705 -> seeded sum error
angebot.format = 'gaeb-90';
writeFileSync(OUT + angebot.fileName, writeGaeb90(angebot, 84));

function pdfLayoutB(doc: LVDocument): Promise<Buffer> {
  return new Promise((resolve) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    let y = 0;
    let page = 0;
    let carry = 0;
    const de = (n: number, d = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
    const header = () => {
      pdf.addPage();
      page++;
      pdf.font('Helvetica-Bold').fontSize(12).text('Angebot', 50, 40, { lineBreak: false });
      pdf.font('Helvetica').fontSize(9).text(`Angebot-Nr.: ${doc.project.name}   Datum: 21.11.2026   Seite: ${page}`, 300, 42, { lineBreak: false });
      pdf.text(`Bauvorhaben: ${doc.project.label}`, 50, 60, { lineBreak: false });
      pdf.font('Helvetica-Bold').fontSize(8).text('Pos-Nr.', 50, 84, { lineBreak: false });
      pdf.text('Menge', 300, 84, { lineBreak: false });
      pdf.text('ME', 350, 84, { lineBreak: false });
      pdf.text('EP / EUR', 400, 84, { lineBreak: false });
      pdf.text('GP / EUR', 480, 84, { lineBreak: false });
      y = 104;
      if (page > 1) { pdf.font('Helvetica').fontSize(9).text('Übertrag:', 400, y, { lineBreak: false }); pdf.text(de(carry), 480, y, { lineBreak: false }); y += 16; }
    };
    const line = (parts: [number, string][], bold = false, gap = 12) => {
      if (y > 770) header();
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      for (const [x, s] of parts) pdf.text(s, x, y, { lineBreak: false });
      y += gap;
    };
    header();
    let lastTop = '';
    for (const s of doc.sections.filter((x) => x.level === 2)) {
      const top = s.oz.split('.')[0];
      if (top !== lastTop) { line([[50, `Bereich ${top}. ${doc.sections.find((x) => x.oz === top)?.label}`]], true, 16); lastTop = top; }
      line([[50, `Abschnitt ${s.oz}. ${s.label}`]], true, 16);
      let sum = 0;
      for (const it of doc.items.filter((i) => i.sectionOz === s.oz)) {
        if (y > 730) header();
        line([[50, it.oz]], true);
        line([[110, it.shortText]]);
        line([[300, de(it.qty ?? 0, 3)], [350, it.unit || ''], [400, de(it.up ?? 0)], [480, de(it.total ?? 0)]], false, 18);
        sum += it.total ?? 0;
        carry += it.total ?? 0;
      }
      line([[300, `Summe Abschnitt ${s.oz}.`], [480, de(s.declaredTotal ?? sum)]], true, 22);
    }
    line([[300, 'Angebotssumme netto'], [480, de(carry)]], true);
    pdf.end();
  });
}
writeFileSync(OUT + 'Demo_Angebot_Wasserleitung.pdf', await pdfLayoutB(angebot));

// ---------------------------------------------------------------- 6. History: priced LVs of earlier projects
const hist = mk(
  'Historie_2024_Rohbau_Gewerbehalle.X86',
  { phase: 86, priced: true, project: { name: 'GH-2024', label: 'Neubau Gewerbehalle Beispielhausen (Auftrag 2024)' } },
  [
    { oz: '01', label: 'Baustelleneinrichtung', rows: [
      ['0010', 'Baustelle einrichten', 'Baustelle einrichten.', 1, 'psch', P(18500)],
      ['0020', 'Baustelleneinrichtung vorhalten', 'Vorhalten.', 7, 'Mt', P(1150)],
      ['0030', 'Baustelle räumen', 'Baustelle räumen.', 1, 'psch', P(5200)],
      ['0040', 'Bauzaun aufstellen und vorhalten', 'Bauzaun h = 2,00 m.', 310, 'm', P(11.8)],
    ] },
    { oz: '02', label: 'Erdarbeiten', rows: [
      ['0010', 'Oberboden abtragen', 'Oberboden 30 cm abtragen und lagern.', 2400, 'm2', P(2.35)],
      ['0020', 'Baugrubenaushub', 'Baugrube ausheben, Homogenbereich B1.', 3100, 'm3', P(10.4)],
      ['0030', 'Fundamentaushub', 'Fundamentaushub.', 420, 'm3', P(31.5)],
      ['0040', 'Boden abfahren und entsorgen', 'Boden BM-0 abfahren und verwerten.', 2900, 'm3', P(23.8)],
      ['0050', 'Arbeitsräume verfüllen', 'Arbeitsräume verfüllen und verdichten.', 540, 'm3', P(19.5)],
      ['0060', 'Planum herstellen und verdichten', 'Planum herstellen.', 2400, 'm2', P(1.45)],
      ['0070', 'Kiestragschicht 30 cm', 'Kiestragschicht 0/32, 30 cm.', 2400, 'm2', P(13.2)],
    ] },
    { oz: '04', label: 'Beton- und Stahlbetonarbeiten', rows: [
      ['0010', 'Sauberkeitsschicht C12/15, d = 5 cm', 'Sauberkeitsschicht.', 2400, 'm2', P(10.6)],
      ['0020', 'Bodenplatte Stahlbeton C25/30, d = 25 cm', 'Bodenplatte WU.', 600, 'm3', P(172)],
      ['0030', 'Streifenfundamente Ortbeton C25/30', 'Streifenfundamente.', 130, 'm3', P(181)],
      ['0040', 'Stahlbetonwände C25/30, d = 24 cm', 'Wände.', 150, 'm3', P(198)],
      ['0050', 'Stahlbetonstützen C30/37', 'Stützen.', 22, 'm3', P(265)],
      ['0060', 'Stahlbetondecke C25/30, d = 22 cm', 'Decke.', 160, 'm3', P(186)],
      ['0070', 'Schalung Wände', 'Schalung Wände.', 1250, 'm2', P(46.5)],
      ['0080', 'Schalung Decke', 'Schalung Decke.', 730, 'm2', P(44)],
      ['0090', 'Schalung Stützen', 'Schalung Stützen.', 190, 'm2', P(74)],
      ['0100', 'Betonstabstahl B500B', 'Bewehrung liefern und verlegen.', 96, 't', P(1620)],
      ['0110', 'Betonstahlmatten B500A', 'Matten liefern und verlegen.', 38, 't', P(1560)],
      ['0120', 'Fugenblech Arbeitsfuge', 'Fugenblech.', 220, 'm', P(23.5)],
      ['0130', 'Aussparungen herstellen', 'Aussparungen bis 0,25 m2.', 55, 'St', P(34)],
      ['0140', 'Ankerschienen einbauen', 'Ankerschienen.', 120, 'm', P(38)],
      ['0150', 'Kernbohrungen', 'Kernbohrungen bis 150 mm.', 30, 'St', P(82)],
      ['0160', 'Oberfläche Bodenplatte flügelglätten', 'Flügelglätten.', 2400, 'm2', P(4.2)],
    ] },
    { oz: '05', label: 'Mauerarbeiten', rows: [
      ['0010', 'Mauerwerk Kalksandstein, d = 17,5 cm', 'KS-Mauerwerk.', 380, 'm2', P(84)],
      ['0020', 'Mauerwerk Kalksandstein, d = 24 cm', 'KS-Mauerwerk.', 210, 'm2', P(102)],
      ['0030', 'Mauerwerk Hochlochziegel, d = 36,5 cm', 'Ziegelmauerwerk.', 290, 'm2', P(138)],
      ['0040', 'Stürze', 'Fertigteilstürze.', 28, 'St', P(58)],
      ['0060', 'Ringanker', 'Ringanker in U-Schalen.', 140, 'm', P(42)],
    ] },
    { oz: '09', label: 'Stundenlohnarbeiten', rows: [
      ['0010', 'Stundenlohn Facharbeiter', 'Facharbeiter.', 60, 'h', P(59)],
      ['0020', 'Stundenlohn Helfer', 'Helfer.', 40, 'h', P(47)],
    ] },
  ],
);
writeFileSync(OUT + 'history/' + hist.fileName, writeGaebXml(hist, 86));

const hist2 = mk(
  'Historie_2025_Ausbau_Verwaltungsgebaeude.X86',
  { phase: 86, priced: true, project: { name: 'VG-2025', label: 'Ausbau Verwaltungsgebäude Musterstadt (Auftrag 2025)' } },
  [
    { oz: '01', label: 'Estricharbeiten', rows: [
      ['0010', 'Trennlage PE-Folie', 'Trennlage.', 2100, 'm2', P(1.4)],
      ['0020', 'Zementestrich als Heizestrich, 65 mm', 'Heizestrich CT-C25-F4.', 2100, 'm2', P(28.5)],
      ['0030', 'Zementestrich im Verbund, 50 mm', 'Verbundestrich.', 180, 'm2', P(26)],
      ['0040', 'Randdämmstreifen', 'Randdämmstreifen 8 mm.', 1500, 'm', P(1.7)],
      ['0050', 'Bewegungsfuge mit Fugenprofil', 'Fugenprofil Aluminium.', 60, 'm', P(17.5)],
      ['0060', 'Estrich schleifen', 'Schleifen und absaugen.', 2100, 'm2', P(4.1)],
      ['0070', 'CM-Messung', 'CM-Messung mit Protokoll.', 12, 'St', P(58)],
      ['0080', 'Bodeneinlauf anarbeiten', 'Anarbeiten.', 9, 'St', P(29)],
      ['0090', 'Zulage für Schnellestrich', 'Zulage Schnellestrich.', 300, 'm2', P(8.5)],
    ] },
    { oz: '02', label: 'Bodenbelagsarbeiten', rows: [
      ['0010', 'Untergrund grundieren und spachteln', 'Grundieren, 3 mm spachteln.', 1900, 'm2', P(8.9)],
      ['0020', 'Kautschukbelag 2 mm', 'Kautschukbelag.', 700, 'm2', P(63)],
      ['0030', 'Teppichboden Schlinge', 'Teppichfliesen.', 900, 'm2', P(41)],
      ['0040', 'Linoleum 2,5 mm', 'Linoleum.', 300, 'm2', P(49)],
      ['0050', 'Sockelleiste Kautschuk', 'Sockelleiste.', 1300, 'm', P(9.8)],
      ['0060', 'Übergangsprofile', 'Übergangsprofile Aluminium.', 70, 'm', P(21)],
      ['0070', 'Erstpflege', 'Erstpflege.', 1000, 'm2', P(1.9)],
    ] },
    { oz: '03', label: 'Heizung', rows: [
      ['0010', 'Systemdämmung Rolljet 30 mm liefern und verlegen', 'Systemdämmung.', 2100, 'm2', P(12.4)],
      ['0020', 'Heizrohr PE-RT 17 x 2 mm liefern', 'Heizrohr liefern.', 14000, 'm', P(1.25)],
      ['0030', 'Heizrohr PE-RT 17 x 2 mm verlegen', 'Heizrohr verlegen.', 14000, 'm', P(1.9)],
      ['0040', 'Heizkreisverteiler 12-fach', 'Verteiler Edelstahl.', 10, 'St', P(640)],
      ['0050', 'Druckprobe', 'Druckprobe.', 1, 'psch', P(680)],
      ['0060', 'Funktionsheizen', 'Funktionsheizen mit Protokoll.', 1, 'psch', P(1450)],
    ] },
  ],
);
writeFileSync(OUT + 'history/' + hist2.fileName, writeGaebXml(hist2, 86));

writeFileSync(OUT + 'ground-truth.json', JSON.stringify(truth, null, 1));
console.log('fixtures written:', OUT, '| seeded defects:', truth.length);
