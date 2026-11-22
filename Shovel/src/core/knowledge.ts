// Domain knowledge used by the deterministic rules. Everything here is plain data so that an
// estimator (or a company "playbook") can extend it without touching the engine.
import type { Action, Category } from './types.ts';

export const BASIS = {
  eindeutig: 'VOB/A § 7 Abs. 1 Nr. 1 (eindeutige und erschöpfende Beschreibung)',
  umstaende: 'VOB/A § 7 Abs. 1 Nr. 2 (preisbeeinflussende Umstände angeben)',
  wagnis: 'VOB/A § 7 Abs. 1 Nr. 3 (kein ungewöhnliches Wagnis)',
  bedarf: 'VOB/A § 7 Abs. 1 Nr. 4 (Bedarfspositionen / Stundenlohn nur ausnahmsweise)',
  gleichwertig: 'VOB/A § 7 Abs. 2 (Produktvorgaben nur mit „oder gleichwertig“)',
  gleichartig: 'VOB/A § 7b Abs. 4 (nur gleichartige Leistungen in einer Position)',
  pauschal: 'VOB/A § 4 Abs. 1 Nr. 2 (Pauschale nur bei genau bestimmter Leistung)',
  menge: 'VOB/B § 2 Abs. 3 (Mengenabweichung über 10 %)',
  geaendert: 'VOB/B § 2 Abs. 5 (geänderte Leistung)',
  zusatz: 'VOB/B § 2 Abs. 6 (zusätzliche Leistung, vorher ankündigen)',
  nebenleistung: 'VOB/C DIN 18299 Abschn. 4.1 / 4.2 (Nebenleistung vs. Besondere Leistung)',
  abschnitt0: 'VOB/C DIN 18299 Abschn. 0 (Hinweise für die Leistungsbeschreibung)',
  koordination: 'VOB/B § 4 Abs. 1 Nr. 1 (Koordination der Unternehmer durch den AG)',
  misch: 'BGH X ZB 7/04 (Mischkalkulation führt zum Angebotsausschluss)',
};
// English glosses for the same keys. The legal reference itself is never translated.
export const BASIS_EN: Record<keyof typeof BASIS, string> = {
  eindeutig: 'VOB/A § 7 Abs. 1 Nr. 1 (clear and exhaustive description)',
  umstaende: 'VOB/A § 7 Abs. 1 Nr. 2 (state the circumstances that affect the price)',
  wagnis: 'VOB/A § 7 Abs. 1 Nr. 3 (no unusual risk)',
  bedarf: 'VOB/A § 7 Abs. 1 Nr. 4 (contingency items / daywork only by way of exception)',
  gleichwertig: 'VOB/A § 7 Abs. 2 (product specifications only with “or equivalent”)',
  gleichartig: 'VOB/A § 7b Abs. 4 (only works of the same kind in one item)',
  pauschal: 'VOB/A § 4 Abs. 1 Nr. 2 (lump sum only for precisely defined works)',
  menge: 'VOB/B § 2 Abs. 3 (quantity deviation of more than 10 %)',
  geaendert: 'VOB/B § 2 Abs. 5 (varied works)',
  zusatz: 'VOB/B § 2 Abs. 6 (additional works, to be notified in advance)',
  nebenleistung: 'VOB/C DIN 18299 Abschn. 4.1 / 4.2 (ancillary works vs. special works)',
  abschnitt0: 'VOB/C DIN 18299 Abschn. 0 (notes for drafting the specification)',
  koordination: 'VOB/B § 4 Abs. 1 Nr. 1 (coordination of the contractors by the client)',
  misch: 'BGH X ZB 7/04 (mixed pricing leads to exclusion of the bid)',
};

export interface VagueRule {
  id: string;
  re: RegExp;
  title: string;
  titleEn: string;
  why: string;
  whyEn: string;
  basis: string; // German text from BASIS; the English gloss is looked up in BASIS_EN
  severity: 1 | 2 | 3;
  pct: number; // suggested Risikozuschlag in % of the item value
  category: Category;
  action: Action;
  ask: string; // what the Bieterfrage asks for (German only: the question goes to a German client)
  nachtrag?: string;
  nachtragEn?: string;
  scope?: 'item' | 'preamble' | 'both';
}

export const VAGUE: VagueRule[] = [
  {
    id: 'U-WAHL-AG',
    re: /nach\s+(?:Wahl|Angabe[n]?|Anweisung|Vorgabe[n]?|Festlegung|Bemusterung)\s+(?:des|der|durch\s+den|durch\s+die)\s+(?:AG|Auftraggebers?|Bauherrn?|Bauleitung|Architekten|Bauüberwachung|Planers?)/i,
    title: 'Ausführung „nach Wahl/Angabe des AG“ – Leistung nicht kalkulierbar festgelegt',
    titleEn: 'Execution “at the client’s choice / as directed” – works not defined well enough to price',
    why: 'Qualität, Farbe oder Ausführungsart werden erst nach Auftragserteilung bestimmt. Der Preis kann nicht sicher berechnet werden; teurere Wahl des AG geht sonst zu Lasten des Bieters.',
    whyEn: 'Quality, colour or type of execution are only determined after award. The price cannot be calculated reliably; a more expensive choice by the client would otherwise be at the bidder’s expense.',
    basis: BASIS.eindeutig,
    severity: 2,
    pct: 5,
    category: 'unklar',
    action: 'bieterfrage',
    ask: 'um verbindliche Festlegung der Ausführung (Fabrikat/Typ, Farbe, Oberfläche bzw. Preisgruppe), die der Kalkulation zugrunde zu legen ist',
    nachtrag: 'Weicht die spätere Wahl des AG vom kalkulierten Standard ab: geänderte Leistung nach § 2 Abs. 5 VOB/B.',
    nachtragEn: 'If the client’s later choice deviates from the standard priced: varied works under § 2 Abs. 5 VOB/B.',
  },
  {
    id: 'U-ERFORDERNIS',
    re: /\b(?:nach|je\s+nach|bei)\s+(?:Erfordernis|Bedarf|Notwendigkeit|örtlichen?\s+(?:Gegebenheiten|Verhältnissen))\b|\b(?:soweit|sofern|falls|wenn)\s+(?:erforderlich|notwendig|nötig)\b/i,
    title: 'Umfang offen („nach Erfordernis“ / „soweit erforderlich“)',
    titleEn: 'Scope left open (“nach Erfordernis” / “soweit erforderlich” – as required)',
    why: 'Ob und in welchem Umfang die Teilleistung anfällt, bleibt offen. Der Bieter muss den Aufwand schätzen, ohne ihn beeinflussen zu können.',
    whyEn: 'Whether and to what extent this part of the works will arise is left open. The bidder has to estimate the effort without being able to influence it.',
    basis: BASIS.wagnis,
    severity: 2,
    pct: 4,
    category: 'unklar',
    action: 'bieterfrage',
    ask: 'um Angabe, in welchem Umfang die Leistung anfällt und der Kalkulation zugrunde zu legen ist',
    nachtrag: 'Fällt mehr an als bei verständiger Auslegung zu erwarten: Mehrvergütung nach § 2 Abs. 5/6 VOB/B.',
    nachtragEn: 'If more arises than could be expected on a reasonable reading: additional payment under § 2 Abs. 5/6 VOB/B.',
  },
  {
    id: 'U-KOMPLETT',
    re: /\beinschl(?:ießlich|\.)?\s+aller\s+(?:erforderlichen\s+|notwendigen\s+|hierzu\s+)?(?:Neben(?:arbeiten|leistungen)|Arbeiten|Leistungen|Materialien|Zubehör(?:teile)?|Klein(?:teile|material))|\b(?:komplett|kpl\.?)\s+(?:fertig|betriebsfertig|funktionsfähig|herstellen|liefern|einschl)|\bbetriebsfertig\b|\bschlüsselfertig\b|\bfix\s+und\s+fertig\b|\balle[rs]?\s+(?:sonstigen|weiteren)\s+(?:erforderlichen\s+)?(?:Arbeiten|Leistungen)/i,
    title: 'Komplettheitsklausel („einschl. aller Nebenarbeiten“ / „komplett“)',
    titleEn: 'All-inclusive clause (“einschl. aller Nebenarbeiten” / “komplett” – including all ancillary works)',
    why: 'Die Klausel soll nicht beschriebene Teilleistungen pauschal in den Einheitspreis verlagern. Besondere Leistungen gehören nur zum Vertrag, wenn sie besonders erwähnt sind.',
    whyEn: 'The clause is meant to shift undescribed parts of the works wholesale into the unit price. Special works (Besondere Leistungen) only form part of the contract if they are expressly mentioned.',
    basis: BASIS.nebenleistung,
    severity: 2,
    pct: 5,
    category: 'vertrag',
    action: 'zuschlag',
    ask: 'um abschließende Aufzählung der mit dem Einheitspreis abgegoltenen Teilleistungen',
    nachtrag: 'Nicht erwähnte Besondere Leistungen (DIN 18299 Abschn. 4.2) sind zusätzliche Leistungen nach § 2 Abs. 6 VOB/B – vor Ausführung ankündigen.',
    nachtragEn: 'Special works (Besondere Leistungen, DIN 18299 Abschn. 4.2) that are not mentioned are additional works under § 2 Abs. 6 VOB/B – give notice before carrying them out.',
  },
  {
    id: 'U-CIRCA',
    re: /\bca\.?\s*\d|\bcirca\s*\d|\bungefähr\s*\d|\betwa\s+\d|\bi\.\s?M\.\s*\d|\bim\s+Mittel\s+\d/i,
    title: 'Ungefähre Maßangabe („ca.“) in der Leistungsbeschreibung',
    titleEn: 'Approximate dimension (“ca.”) in the specification',
    why: 'Preisbestimmende Abmessungen sind nur ungefähr angegeben. Bei Abweichungen ist strittig, welche Abmessung geschuldet und kalkuliert ist.',
    whyEn: 'Dimensions that determine the price are only given approximately. If they deviate, it is disputed which dimension is owed and priced.',
    basis: BASIS.eindeutig,
    severity: 1,
    pct: 2,
    category: 'unklar',
    action: 'bieterfrage',
    ask: 'um verbindliche Maßangaben bzw. Angabe der zulässigen Toleranz',
    nachtrag: 'Abweichende tatsächliche Abmessungen: geänderte Leistung nach § 2 Abs. 5 VOB/B.',
    nachtragEn: 'Actual dimensions that deviate: varied works under § 2 Abs. 5 VOB/B.',
  },
  {
    id: 'U-ODER-AEHNLICH',
    re: /\bo\.\s?ä\.|\boder\s+ähnlich(?:e[srnm]?)?\b|\bu\.\s?ä\.|\bo\.\s?dgl\.|\boder\s+dergleichen\b|\busw\.|\betc\.?(?=\s|$|[,;)])|\bu\.\s?a\.(?=\s|$|[,;)])|\bund\s+dgl\./i,
    title: 'Offene Aufzählung („o. ä.“, „usw.“, „etc.“)',
    titleEn: 'Open-ended list (“o. ä.”, “usw.”, “etc.”)',
    why: 'Die Aufzählung der geschuldeten Leistung ist nicht abschließend. Der Leistungsumfang ist nach oben offen.',
    whyEn: 'The list of works owed is not exhaustive. The scope of works is open-ended.',
    basis: BASIS.eindeutig,
    severity: 1,
    pct: 2,
    category: 'unklar',
    action: 'bieterfrage',
    ask: 'um abschließende Aufzählung der geschuldeten Leistungen',
  },
  {
    id: 'V-EINRECHNEN',
    re: /(?:nicht|ohne)\s+(?:gesondert|sep[ae]rat|extra|besonders)\s+(?:zu\s+)?(?:vergüte[tn]|vergütung|berechnet|abgerechnet)|in\s+(?:die|den)\s+Einheitspreis(?:e|en)?\s+(?:einzurechnen|einzukalkulieren|enthalten|einzuschließen)|(?:ist|sind)\s+(?:mit\s+)?(?:in\s+die\s+|in\s+den\s+)?(?:Einheitspreise[n]?|Angebotspreise[n]?|Preise[n]?)\s+(?:einzurechnen|einzukalkulieren|abgegolten)|mit\s+den\s+Einheitspreisen\s+abgegolten|wird\s+nicht\s+(?:gesondert\s+)?vergütet/i,
    title: 'Leistung ohne eigene Position „in die Einheitspreise einzurechnen“',
    titleEn: 'Works without an item of their own “to be included in the unit prices”',
    why: 'Aufwand ohne eigene Position und ohne Mengenansatz muss auf andere Positionen umgelegt werden. Bei Mengenänderungen ist er über- oder unterdeckt.',
    whyEn: 'Effort without its own item and without a quantity has to be spread over other items. If quantities change, it is over- or under-recovered.',
    basis: BASIS.wagnis,
    severity: 2,
    pct: 3,
    category: 'vertrag',
    action: 'zuschlag',
    ask: 'um Aufnahme einer eigenen Position mit Mengenansatz für diese Leistung',
    nachtrag: 'Umlage dokumentieren. Bei Mengenminderung > 10 %: Ausgleich der Unterdeckung nach § 2 Abs. 3 Nr. 3 VOB/B.',
    nachtragEn: 'Document the allocation. If quantities fall by more than 10 %: compensation for the under-recovery under § 2 Abs. 3 Nr. 3 VOB/B.',
    scope: 'both',
  },
  {
    id: 'V-BAUSEITS',
    re: /\bbauseits\b|\bbauseitig(?:e[rsnm]?)?\b|\bvom\s+AG\s+(?:gestellt|beigestellt|geliefert|zur\s+Verfügung)|\bdurch\s+(?:den\s+)?AG\s+(?:gestellt|beigestellt|geliefert)|\bwird\s+(?:vom|durch\s+den)\s+(?:AG|Auftraggeber)\b/i,
    title: '„Bauseits“ – Leistungsgrenze zum AG nicht näher bestimmt',
    titleEn: '“Bauseits” (provided by the client) – boundary of works with the client not defined',
    why: 'Für bauseitige Leistungen und Stoffe müssen Art, Ort und Zeit der Übergabe feststehen. Sonst drohen Wartezeiten, Doppelarbeiten und Streit über die Vorleistung.',
    whyEn: 'For works and materials provided by the client, the type, place and time of handover must be fixed. Otherwise there is a risk of waiting time, duplicated work and disputes over the preceding works.',
    basis: BASIS.abschnitt0,
    severity: 1,
    pct: 2,
    category: 'schnittstelle',
    action: 'bieterfrage',
    ask: 'um Angabe von Art, Ort und Zeitpunkt der bauseitigen Leistung bzw. Beistellung sowie der Leistungsgrenze',
    nachtrag: 'Fehlende oder verspätete bauseitige Vorleistung: Behinderungsanzeige nach § 6 Abs. 1 VOB/B.',
    nachtragEn: 'Client-side preceding works missing or late: notice of obstruction (Behinderungsanzeige) under § 6 Abs. 1 VOB/B.',
  },
  {
    id: 'V-ERSCHWERNIS',
    re: /\b(?:sämtliche|alle|jegliche)\s+Erschwernisse\b|\bErschwernisse\s+(?:sind|werden)\s+(?:nicht|einzurechnen|einzukalkulieren)|\bunabhängig\s+von\s+(?:der\s+)?(?:Witterung|Bodenart|Bodenklasse|Tiefe)|\bin\s+allen\s+(?:Bodenarten|Bodenklassen|Tiefen|Höhen)|\bgleich\s+welcher\s+Art\b|\bohne\s+Rücksicht\s+auf\b/i,
    title: 'Pauschale Risikoübertragung („sämtliche Erschwernisse“, „in allen Bodenarten“)',
    titleEn: 'Blanket transfer of risk (“sämtliche Erschwernisse” – all difficulties, “in allen Bodenarten” – in all soil types)',
    why: 'Dem Bieter werden Umstände aufgebürdet, die er weder beeinflussen noch im Voraus schätzen kann.',
    whyEn: 'The bidder is burdened with circumstances it can neither influence nor estimate in advance.',
    basis: BASIS.wagnis,
    severity: 3,
    pct: 8,
    category: 'vertrag',
    action: 'bieterfrage',
    ask: 'um Beschreibung der konkret zu erwartenden Erschwernisse bzw. Verhältnisse (z. B. Homogenbereiche, Grundwasser, Zugänglichkeit)',
    nachtrag: 'Unerwartete Verhältnisse außerhalb der Beschreibung: Mehrvergütung nach § 2 Abs. 5/6 VOB/B; Bedenken nach § 4 Abs. 3 VOB/B anmelden.',
    nachtragEn: 'Unexpected conditions outside the description: additional payment under § 2 Abs. 5/6 VOB/B; raise concerns (Bedenken) under § 4 Abs. 3 VOB/B.',
    scope: 'both',
  },
  {
    id: 'U-PLAN',
    re: /\b(?:gemäß|gem\.|laut|lt\.|nach|siehe|s\.)\s+(?:beiliegende[rnm]?\s+|beigefügte[rnm]?\s+)?(?:Plan|Plänen|Zeichnung(?:en)?|Detail(?:s|plan|zeichnung)?|Statik|Gutachten|Bodengutachten|Anlage|Skizze|Raumbuch|Türliste|Fensterliste)\b/i,
    title: 'Verweis auf Plan / Anlage – Unterlage muss vorliegen',
    titleEn: 'Reference to drawing / annex – the document must be available',
    why: 'Die Position ist nur mit der genannten Unterlage kalkulierbar. Fehlt sie in den Vergabeunterlagen, ist die Beschreibung unvollständig.',
    whyEn: 'The item can only be priced with the document referred to. If it is missing from the tender documents, the description is incomplete.',
    basis: BASIS.umstaende,
    severity: 1,
    pct: 0,
    category: 'bieter',
    action: 'hinweis',
    ask: 'um Übersendung der genannten Unterlage, sofern sie den Vergabeunterlagen nicht beiliegt',
  },
  {
    id: 'U-ABSTIMMUNG',
    re: /\b(?:in|nach)\s+Abstimmung\s+mit\b|\bnach\s+(?:Rücksprache|Absprache)\b|\bwird\s+(?:noch|später|vor\s+Ort)\s+(?:festgelegt|bekannt\s?gegeben|bestimmt|angegeben)|\bnoch\s+(?:nicht\s+)?(?:festgelegt|festzulegen)|\bGenaue[sr]?\s+\w+\s+wird\s+noch/i,
    title: 'Festlegung erst nach Auftragserteilung („in Abstimmung mit …“, „wird noch festgelegt“)',
    titleEn: 'Decision only after award (“in Abstimmung mit …” – in consultation with, “wird noch festgelegt” – to be determined)',
    why: 'Preisrelevante Details werden auf die Ausführung verschoben. Der kalkulierte Aufwand ist nicht gesichert.',
    whyEn: 'Price-relevant details are deferred to the construction stage. The effort priced is not secured.',
    basis: BASIS.eindeutig,
    severity: 2,
    pct: 3,
    category: 'unklar',
    action: 'bieterfrage',
    ask: 'um Festlegung der noch offenen Angaben vor Angebotsabgabe',
    nachtrag: 'Spätere Festlegung über dem kalkulierten Standard: § 2 Abs. 5 VOB/B.',
    nachtragEn: 'Later decision above the standard priced: § 2 Abs. 5 VOB/B.',
  },
  {
    id: 'V-TERMIN',
    re: /\bVertragsstrafe\b|\bPönale\b|\bauch\s+(?:an\s+)?(?:Sonn-?\s?und\s+Feiertagen|Wochenenden|nachts)|\bNacht(?:arbeit|schicht)\b|\bin\s+Abschnitten\s+nach\s+(?:Angabe|Wahl)|\bUnterbrechungen?\s+(?:sind|werden)\s+nicht/i,
    title: 'Termin- und Ablaufrisiko (Vertragsstrafe, Nacht-/Wochenendarbeit, Abschnitte)',
    titleEn: 'Schedule and sequencing risk (contractual penalty, night / weekend work, phases)',
    why: 'Ablaufvorgaben mit Kostenfolgen sind in den Preis einzurechnen oder zu klären.',
    whyEn: 'Sequencing requirements with cost consequences must be priced in or clarified.',
    basis: BASIS.umstaende,
    severity: 2,
    pct: 3,
    category: 'vertrag',
    action: 'zuschlag',
    ask: 'um Angabe von Anzahl und Dauer der Bauabschnitte, Unterbrechungen bzw. Sonderarbeitszeiten',
    scope: 'both',
  },
];

export interface NormRule {
  re: RegExp;
  old: string;
  oldEn: string;
  now: string;
  nowEn: string;
  severity: 1 | 2;
}
// Withdrawn or replaced references. A stale norm in an LV is a contradiction waiting to happen:
// the text demands one thing, the currently recognised rules of technology another.
export const NORMS: NormRule[] = [
  { re: /\bBodenklassen?\s*(?:[1-7]|[IVX]+)(?:\s*(?:-|bis|und|\/|,)\s*(?:[1-7]|[IVX]+))*\b|\bBkl\.?\s*[1-7]/i, old: 'Bodenklassen nach alter DIN 18300', oldEn: 'soil classes (Bodenklassen) under the old DIN 18300', now: 'Homogenbereiche (VOB/C seit 2015; DIN 18300:2015 ff.)', nowEn: 'homogeneous zones (Homogenbereiche; VOB/C since 2015; DIN 18300:2015 et seq.)', severity: 2 },
  { re: /\bLAGA\b[^.\n]{0,40}\bZ\s?[0-5](?:\.[12])?\b|\b(?:Zuordnungsklasse|Einbauklasse)\s+Z\s?[0-5](?:\.[12])?\b|\bZ\s?[012]\.[12]\b/i, old: 'LAGA-Zuordnungswerte (Z 0 – Z 2)', oldEn: 'LAGA classification values (Z 0 – Z 2)', now: 'Materialklassen der Ersatzbaustoffverordnung (seit 01.08.2023)', nowEn: 'material classes of the Ersatzbaustoffverordnung (substitute building materials ordinance, since 01.08.2023)', severity: 2 },
  { re: /\bDIN\s*18\s?195(?!\s*(?:Beiblatt|Bbl))/i, old: 'DIN 18195 (Bauwerksabdichtungen)', oldEn: 'DIN 18195 (waterproofing of buildings)', now: 'DIN 18531 bis 18535 (seit 2017; DIN 18195 nur noch Begriffe)', nowEn: 'DIN 18531 to 18535 (since 2017; DIN 18195 now only covers terminology)', severity: 2 },
  { re: /\bEnEV\b|\bEnergieeinsparverordnung\b/i, old: 'EnEV', oldEn: 'EnEV', now: 'Gebäudeenergiegesetz (GEG, seit 11/2020)', nowEn: 'Gebäudeenergiegesetz (GEG, Buildings Energy Act, since 11/2020)', severity: 1 },
  { re: /\bDIN\s*1045-?1\b/i, old: 'DIN 1045-1', oldEn: 'DIN 1045-1', now: 'DIN EN 1992-1-1 (Eurocode 2) mit NA', nowEn: 'DIN EN 1992-1-1 (Eurocode 2) with National Annex', severity: 1 },
  { re: /\bDIN\s*1055\b/i, old: 'DIN 1055 (Lastannahmen)', oldEn: 'DIN 1055 (design loads)', now: 'DIN EN 1991 (Eurocode 1)', nowEn: 'DIN EN 1991 (Eurocode 1)', severity: 1 },
  { re: /\bDIN\s*1053(?:-1)?\b/i, old: 'DIN 1053 (Mauerwerk)', oldEn: 'DIN 1053 (masonry)', now: 'DIN EN 1996 (Eurocode 6)', nowEn: 'DIN EN 1996 (Eurocode 6)', severity: 1 },
  { re: /\bDIN\s*18\s?800\b/i, old: 'DIN 18800 (Stahlbauten)', oldEn: 'DIN 18800 (steel structures)', now: 'DIN EN 1993 / DIN EN 1090', nowEn: 'DIN EN 1993 / DIN EN 1090', severity: 1 },
  { re: /\bB\s?(?:15|25|35|45|55)\b(?=[^.\n]{0,30}(?:Beton|WU|bewehrt))|\bBeton\s+B\s?(?:15|25|35|45|55)\b/i, old: 'Betonfestigkeitsklasse B 25 / B 35 (alt)', oldEn: 'concrete strength class B 25 / B 35 (old)', now: 'Druckfestigkeitsklassen C…/… nach DIN EN 206 / DIN 1045-2', nowEn: 'compressive strength classes C…/… to DIN EN 206 / DIN 1045-2', severity: 2 },
  { re: /\bBSt\s*(?:420|500)\s*[SM]?\b/i, old: 'Betonstahl BSt 500 S/M', oldEn: 'reinforcing steel BSt 500 S/M', now: 'B500A / B500B nach DIN 488', nowEn: 'B500A / B500B to DIN 488', severity: 1 },
  { re: /\bZTV\s?E-?\s?StB\s*(?:94|97|09)\b/i, old: 'ZTV E-StB 94/09', oldEn: 'ZTV E-StB 94/09', now: 'ZTV E-StB 17', nowEn: 'ZTV E-StB 17', severity: 1 },
  { re: /\bRStO\s*(?:86|01)\b/i, old: 'RStO 01', oldEn: 'RStO 01', now: 'RStO 12 (Ausgabe 2012/2024)', nowEn: 'RStO 12 (2012/2024 edition)', severity: 1 },
  { re: /\bVOB\s*(?:Ausgabe\s*)?(?:2000|2002|2006|2009|2012)\b/i, old: 'ältere VOB-Ausgabe', oldEn: 'older VOB edition', now: 'aktuelle VOB-Ausgabe (Fassung in den Vergabeunterlagen prüfen)', nowEn: 'current VOB edition (check the version in the tender documents)', severity: 1 },
  { re: /\bDIN\s*4109\s*(?::|\s)\s*(?:1989|11\/89)\b/i, old: 'DIN 4109:1989', oldEn: 'DIN 4109:1989', now: 'DIN 4109:2018', nowEn: 'DIN 4109:2018', severity: 1 },
  { re: /\bGefStoffV\b[^.\n]{0,20}\b(?:1993|2005)\b|\bTRGS\s*519\b[^.\n]{0,20}\b(?:2001|2007)\b/i, old: 'veraltete Gefahrstoff-Regel', oldEn: 'outdated hazardous substances rule', now: 'aktuelle GefStoffV / TRGS 519', nowEn: 'current GefStoffV / TRGS 519', severity: 1 },
];

// Frequent misspellings in construction texts (wrong -> right), folded to lower case.
export const TYPOS: Record<string, string> = {
  seperat: 'separat', seperate: 'separate', seperaten: 'separaten', seperater: 'separater',
  beerich: 'Bereich', aufsetzten: 'aufsetzen', fertigeile: 'Fertigteile', stahlbetonfertigeile: 'Stahlbetonfertigteile',
  erdauarbeiten: 'Erdbauarbeiten', standart: 'Standard', standartmäßig: 'standardmäßig', wiederstand: 'Widerstand',
  maschiene: 'Maschine', maschienen: 'Maschinen', bewährung: 'Bewehrung', bewährungsstahl: 'Bewehrungsstahl',
  schallung: 'Schalung', estich: 'Estrich', gefäle: 'Gefälle', dämung: 'Dämmung', wärmedämung: 'Wärmedämmung',
  enstorgung: 'Entsorgung', entsogung: 'Entsorgung', lieferrung: 'Lieferung', verfülung: 'Verfüllung',
  öffung: 'Öffnung', durchmeser: 'Durchmesser', abdichtug: 'Abdichtung', rohrleitug: 'Rohrleitung', asphlat: 'Asphalt',
  trockenabu: 'Trockenbau', fundamet: 'Fundament', aushup: 'Aushub', gerüßt: 'Gerüst', isolirung: 'Isolierung',
  monatge: 'Montage', montge: 'Montage', anschlus: 'Anschluss', beschichtug: 'Beschichtung', vorraussetzung: 'Voraussetzung',
  vorraus: 'voraus', 
  agressiv: 'aggressiv', addresse: 'Adresse', detailiert: 'detailliert', entgültig: 'endgültig',
  ebendfalls: 'ebenfalls', ebenfals: 'ebenfalls',
  vorrichtug: 'Vorrichtung', verdichtug: 'Verdichtung', leistug: 'Leistung', positon: 'Position', postion: 'Position',
  ausfürung: 'Ausführung', ausfühung: 'Ausführung', herstelen: 'herstellen', liefen: 'liefern', verlgen: 'verlegen',
  einbaun: 'einbauen', schachtabdekung: 'Schachtabdeckung', betonn: 'Beton', stahlbetton: 'Stahlbeton', mauerwek: 'Mauerwerk',
  fließenarbeiten: 'Fliesenarbeiten', fließenbelag: 'Fliesenbelag', wandfließen: 'Wandfliesen', bodenfließen: 'Bodenfliesen',
  silikonverfugung: 'Silikonverfugung', dehnungsfugge: 'Dehnungsfuge', randdämstreifen: 'Randdämmstreifen', tragschich: 'Tragschicht',
  frostschutzschich: 'Frostschutzschicht', planumm: 'Planum', böschug: 'Böschung', kontrolschacht: 'Kontrollschacht',
};

// What a position of a given kind must state to be priceable.
export interface RequiredParam {
  id: string;
  when: RegExp; // on short text
  not?: RegExp;
  need: RegExp; // on short + long text
  label: string;
  labelEn: string;
  ask: string;
  units?: string[]; // only for these normalized units
}
export const REQUIRED: RequiredParam[] = [
  { id: 'beton-klasse', when: /^(?:\w+\s)?(?:Ortbeton|Stahlbeton|Beton)(?:wand|wände|decke|stütze|stützen|sohle|bodenplatte|fundament|balken|unterzug)?\b|^(?:Bodenplatte|Fundament|Streifenfundament|Einzelfundament|Sauberkeitsschicht)/i, not: /\b(?:Schalung|Bewehrung|Betonstahl|schneiden|bohren|Kernbohrung|Abbruch|abbrechen|Fertigteil|Pflaster|Betonrohr|Stahlbetonrohr|Betonstein|Beschichtung|Sanierung|Fuge|Aussparung|Zulage|Oberfläche|glätten|Nachbehandlung|Rückbau|Entsorg)/i, need: /\bC\s?\d{1,2}\s?\/\s?\d{1,3}\b|\bLC\s?\d|\bFestigkeitsklasse\b|\bB\s?\d{2}\b/i, label: 'Betonfestigkeitsklasse (C…/…)', labelEn: 'concrete strength class (C…/…)', ask: 'Angabe der Betonfestigkeits- und Expositionsklasse', units: ['m³'] },
  { id: 'aushub-boden', when: /\b(?:Aushub|aushub|ausheben|Bodenaushub|Baugrubenaushub|Rohrgrabenaushub|Boden\s+lösen|Erdaushub)\b/i, not: /\b(?:Zulage|Handschachtung|Suchschlitz|Suchgraben|Verbau|Wasserhaltung)\b/i, need: /\bHomogenbereich|\bHB\s?\d|\bBodenklasse|\bBkl|\bBodenart|\bBodengruppe|\bFels|\bBodengutachten|\bBaugrundgutachten/i, label: 'Homogenbereich / Bodenbeschreibung', labelEn: 'homogeneous zone / soil description', ask: 'Angabe der Homogenbereiche bzw. Verweis auf das Baugrundgutachten', units: ['m³'] },
  { id: 'aushub-tiefe', when: /\b(?:Baugrubenaushub|Rohrgrabenaushub|Grabenaushub|Fundamentaushub)\b/i, not: /\bZulage\b/i, need: /\b(?:Tiefe|tief|Aushubtiefe|Sohle|Grabentiefe|t\s?[=<>≤]|T\s?[=<>≤]|bis\s+\d+[,.]?\d*\s?m)\b/i, label: 'Aushubtiefe', labelEn: 'excavation depth', ask: 'Angabe der Aushubtiefe(n)', units: ['m³'] },
  { id: 'entsorgung-klasse', when: /\b(?:entsorgen|Entsorgung|abfahren|Abfuhr|Deponie|verwerten|Verwertung)\b/i, not: /\b(?:Wasser|Abwasser|Zulage)\b/i, need: /\bZ\s?[0-5]|\bDK\s?[0IV]|\bLAGA|\bBM-|\bBG-|\bRC-|\bErsatzbaustoff|\bAVV|\bAbfallschlüssel|\bunbelastet|\bschadstofffrei|\bMaterialklasse|\bBelastungsklasse|\bnicht\s+gefährlich|\[KENNZEICHEN/i, label: 'Entsorgungs- / Materialklasse', labelEn: 'disposal / material class', ask: 'Angabe der Material- bzw. Belastungsklasse (ErsatzbaustoffV / Deponieklasse) und des Entsorgungswegs', units: ['m³', 't'] },
  { id: 'rohr-dn', when: /\b(?:Rohr|Rohre|Rohrleitung|Leitung|Kanal|Druckrohr|Abwasserrohr|Entwässerungsleitung)\b.*\b(?:liefern|verlegen|herstellen|einbauen)\b|\b(?:liefern|verlegen)\b.*\b(?:Rohr|Rohre|Rohrleitung)\b/i, not: /\b(?:Leerrohr|Kabel|Zulage|Druckprüfung|Kalibrieren|spülen|Kamera)\b/i, need: /\bDN\s?\d|\bda\s?\d|\bd\s?[=a]\s?\d|\b\d{2,4}\s?mm\b|\bNennweite|Ø\s?\d/i, label: 'Nennweite (DN)', labelEn: 'nominal diameter (DN)', ask: 'Angabe von Nennweite, Werkstoff und Druckstufe', units: ['m'] },
  { id: 'estrich-dicke', when: /\b(?:Estrich|Zementestrich|Calciumsulfatestrich|Anhydritestrich|Heizestrich|Fließestrich)\b/i, not: /\b(?:Zulage|Fuge|schleifen|Randdämm|Trennlage|Bewehrung|anarbeiten|Abstellwinkel|Messung|Aufheiz|Sockel|Schiene|Profil)\b/i, need: /\b\d{2,3}\s?mm\b|\b\d[,.]?\d?\s?cm\b|\bDicke|\bNenndicke|\bd\s?=\s?\d/i, label: 'Estrichdicke', labelEn: 'screed thickness', ask: 'Angabe von Estrichart, Nenndicke und Festigkeitsklasse', units: ['m²'] },
  { id: 'daemmung-wlg', when: /\b(?:Wärmedämmung|Dämmung|Dämmplatten|Perimeterdämmung|Trittschalldämmung|Dämmschicht)\b/i, not: /\b(?:Zulage|Randdämm|Rohrdämm|Abbruch|entfernen)\b/i, need: /\b\d{2,3}\s?mm\b|\b\d{1,2}\s?cm\b|\bDicke|\bd\s?=\s?\d/i, label: 'Dämmstoffdicke', labelEn: 'insulation thickness', ask: 'Angabe von Dämmstoff, Dicke und Wärmeleitfähigkeit', units: ['m²'] },
  { id: 'asphalt-dicke', when: /\b(?:Asphalt(?:trag|binder|deck)?schicht|Asphaltdecke|Tragdeckschicht)\b/i, not: /\b(?:Zulage|schneiden|fräsen|Aufbruch|aufbrechen|reinigen)\b/i, need: /\b\d{1,2}[,.]?\d?\s?cm\b|\b\d{2,3}\s?mm\b|\bkg\/m|\bDicke|\bEinbaudicke/i, label: 'Einbaudicke', labelEn: 'laying thickness', ask: 'Angabe von Mischgutart und Einbaudicke bzw. Einbaugewicht', units: ['m²', 't'] },
  { id: 'mauerwerk', when: /^(?:\w+[- ])?Mauerwerk\b|^\w*mauerwerk\b/i, not: /\b(?:Zulage|Abbruch|Öffnung|Schlitz|Sturz|Durchbruch|Anschluss)\b/i, need: /\b\d{2}[,.]?\d?\s?cm\b|\b\d{3}\s?mm\b|\bd\s?=\s?\d|\bDicke|\bWanddicke/i, label: 'Wanddicke', labelEn: 'wall thickness', ask: 'Angabe von Steinart, Festigkeitsklasse und Wanddicke', units: ['m²', 'm³'] },
];

// Parameters that should agree between Kurztext and Langtext.
export const PARAMS: { key: string; label: string; labelEn: string; re: RegExp }[] = [
  { key: 'dn', label: 'Nennweite', labelEn: 'nominal diameter', re: /\bDN\s?(\d{2,4}(?:\s?\/\s?\d{2,4})*)\b/gi },
  { key: 'cklasse', label: 'Betonfestigkeitsklasse', labelEn: 'concrete strength class', re: /\bC\s?(\d{1,2}\s?\/\s?\d{1,3})\b/gi },
  { key: 'dicke_mm', label: 'Dicke', labelEn: 'thickness', re: /\b(?:d|Dicke|Nenndicke|Estrichdicke|Stärke)\s?[=:]?\s?(\d{1,3}(?:[,.]\d)?)\s?(mm|cm)\b/gi },
  { key: 'hoehe', label: 'Höhe', labelEn: 'height', re: /\b(?:h|H|Höhe)\s?[=:]\s?(\d{1,3}(?:[,.]\d{1,2})?)\s?(mm|cm|m)\b/g },
  { key: 'breite', label: 'Breite', labelEn: 'width', re: /\b(?:b|B|Breite)\s?[=:]\s?(\d{1,3}(?:[,.]\d{1,2})?)\s?(mm|cm|m)\b/g },
  { key: 'tiefe', label: 'Tiefe', labelEn: 'depth', re: /\b(?:t|T|Tiefe)\s?[=:]\s?(\d{1,3}(?:[,.]\d{1,2})?)\s?(mm|cm|m)\b/g },
];

export interface TradeDef {
  key: string;
  label: string;
  labelEn: string;
  re: RegExp;
  units?: string[]; // only items in these units count towards detecting the trade
  requires?: RegExp; // the LV must also contain this somewhere (e.g. pipes in the ground need a trench)
  expected: { key: string; label: string; labelEn: string; re: RegExp; why: string; whyEn: string; besondere?: boolean; share?: number; onlyIf?: RegExp }[];
}
// "share" = typical cost share of the trade total (rough, used only to rank the finding).
export const TRADES: TradeDef[] = [
  {
    key: 'baustelle', label: 'Baustelleneinrichtung', labelEn: 'Site setup', re: /baustelleneinrichtung|baustelle\s+(?:einrichten|räumen)/i,
    expected: [
      { key: 'be-einrichten', label: 'Baustelle einrichten', labelEn: 'Setting up the site', re: /baustelle(?:neinrichtung)?\s*(?:einrichten|herstellen|und\s+-?räum)|einrichten\s+(?:und\s+räumen\s+)?der\s+baustelle|baustelleneinrichtung/i, why: 'Bei erheblicher Bedeutung für die Preisbildung ist für das Einrichten und Räumen eine eigene Position vorzusehen (DIN 18299 Abschn. 0.4.1).', whyEn: 'Where it is of considerable importance for pricing, a separate item must be provided for setting up and clearing the site (DIN 18299 Abschn. 0.4.1).', share: 0.04 },
      { key: 'be-raeumen', label: 'Baustelle räumen', labelEn: 'Clearing the site', re: /baustelle\s+räumen|räumen\s+der\s+baustelle|einrichtung\s+und\s+-?\s?räumung|einrichten\s+und\s+räumen|baustellenräumung/i, why: 'Einrichten ist ausgeschrieben, das Räumen nicht – Abgrenzung der Vergütung unklar.', whyEn: 'Setting up is tendered, clearing is not – the boundary of what is paid for is unclear.', share: 0.01 },
      { key: 'be-vorhalten', label: 'Baustelleneinrichtung vorhalten', labelEn: 'Maintaining the site setup', re: /vorhalt/i, why: 'Ohne Vorhalteposition trägt der Bieter das volle Bauzeitrisiko in der Pauschale.', whyEn: 'Without an item for maintaining the site setup, the bidder carries the full construction-time risk in the lump sum.', share: 0.02 },
    ],
  },
  {
    key: 'erdbau', units: ['m³'], label: 'Erdarbeiten', labelEn: 'Earthworks', re: /aushub|baugrube|erdarbeiten|erdbau|oberboden|verfüll|bodenaustausch|rohrgraben|boden\s+(?:lösen|abfahren|entsorgen)/i,
    expected: [
      { key: 'erd-abfuhr', label: 'Abfuhr / Entsorgung Aushubmaterial', labelEn: 'Removal / disposal of excavated material', re: /abfahren|abfuhr|entsorg|verwert|deponie|seitlich\s+lagern|lagern\s+und\s+wieder/i, why: 'Aushub ist ausgeschrieben, der Verbleib des Materials nicht. Entsorgung über die Nebenleistung hinaus ist Besondere Leistung.', whyEn: 'Excavation is tendered, but not what happens to the material. Disposal beyond the ancillary works is a special work (Besondere Leistung).', besondere: true, share: 0.15 },
      { key: 'erd-verfuell', label: 'Verfüllung / Wiedereinbau', labelEn: 'Backfilling / re-use on site', re: /verfüll|hinterfüll|wiedereinbau|einbauen\s+und\s+verdichten|auffüll/i, why: 'Aushub ohne Verfüllposition: Arbeitsräume und Gräben müssen wieder verfüllt werden.', whyEn: 'Excavation without a backfilling item: working spaces and trenches have to be backfilled again.', share: 0.1 },
      { key: 'erd-verdichtung', label: 'Verdichtungsnachweis', labelEn: 'Proof of compaction', re: /verdicht|lastplattendruck|proctor|ev2|e\s?v\s?2/i, why: 'Eigen- und Kontrollprüfungen der Verdichtung sind preisrelevant, wenn sie über das Übliche hinausgehen.', whyEn: 'The contractor’s own tests and control tests of compaction are price-relevant where they go beyond what is usual.', share: 0.01 },
      { key: 'erd-wasser', label: 'Wasserhaltung', labelEn: 'Dewatering', re: /wasserhaltung|grundwasser|schichtenwasser|pumpensumpf|tagwasser/i, why: 'Maßnahmen gegen Grund- und Schichtenwasser sind Besondere Leistungen (DIN 18299 Abschn. 4.2).', whyEn: 'Measures against groundwater and strata water are special works (Besondere Leistungen, DIN 18299 Abschn. 4.2).', besondere: true, share: 0.05, onlyIf: /baugrube|rohrgraben|grabenaushub|schacht/i },
      { key: 'erd-verbau', label: 'Verbau / Böschungssicherung', labelEn: 'Shoring / slope protection', re: /verbau|böschung|spundwand|grabenverbau|trägerbohlwand/i, why: 'Ab 1,25 m Tiefe ist zu verbauen oder zu böschen (DIN 4124). Ohne Position ist die Vergütung strittig.', whyEn: 'From a depth of 1.25 m, excavations must be shored or battered (DIN 4124). Without an item, payment is disputed.', share: 0.08, onlyIf: /rohrgraben|grabenaushub|baugrube/i },
    ],
  },
  {
    key: 'beton', units: ['m³'], label: 'Beton- und Stahlbetonarbeiten', labelEn: 'Concrete and reinforced concrete works', re: /\b(?:ortbeton|stahlbeton|bodenplatte|fundament|sauberkeitsschicht)|^beton\b/i,
    expected: [
      { key: 'bet-schalung', label: 'Schalung', labelEn: 'Formwork', re: /schalung|schalen|einschalen/i, why: 'Beton ist ausgeschrieben, Schalung nicht – es ist zu klären, ob sie in den Betonpreis einzurechnen ist.', whyEn: 'Concrete is tendered, formwork is not – it must be clarified whether it is to be included in the concrete price.', share: 0.25 },
      { key: 'bet-bewehrung', label: 'Bewehrung / Betonstahl', labelEn: 'Reinforcement / reinforcing steel', re: /bewehrung|betonstahl|b500|bst\s?500|mattenstahl|stabstahl/i, why: 'Stahlbeton ohne Bewehrungsposition: Stahlmenge ist nicht kalkulierbar.', whyEn: 'Reinforced concrete without a reinforcement item: the steel quantity cannot be priced.', share: 0.25 },
      { key: 'bet-fugen', label: 'Fugen / Fugenbänder / Fugenbleche', labelEn: 'Joints / waterstops / joint sheets', re: /fuge|fugenband|fugenblech|arbeitsfuge|dehnfuge|quellband/i, why: 'Arbeits- und Dehnfugen sind bei WU- und größeren Bauteilen preisrelevant.', whyEn: 'Construction and expansion joints are price-relevant for watertight and larger components.', share: 0.02 },
      { key: 'bet-einbauteile', label: 'Aussparungen / Einbauteile / Durchführungen', labelEn: 'Recesses / cast-in parts / penetrations', re: /aussparung|einbauteil|durchführung|durchbruch|leerrohr|ankerschiene|futterrohr/i, why: 'Aussparungen und Einbauteile für TGA sind die häufigste Schnittstellenlücke im Rohbau.', whyEn: 'Recesses and cast-in parts for building services are the most common interface gap in the structural works.', share: 0.02 },
      { key: 'bet-nachbehandlung', label: 'Oberflächenbearbeitung / Nachbehandlung', labelEn: 'Surface finishing / curing', re: /nachbehandl|glätten|abziehen|oberfläche|sichtbeton|flügelglätt|besenstrich/i, why: 'Oberflächenanforderungen bestimmen den Aufwand; fehlen sie, ist die Qualität nicht festgelegt.', whyEn: 'Surface requirements determine the effort; if they are missing, the quality is not defined.', share: 0.02 },
    ],
  },
  {
    key: 'estrich', units: ['m²'], label: 'Estricharbeiten', labelEn: 'Screed works', re: /estrich(?!feuchte)/i,
    expected: [
      { key: 'est-rand', label: 'Randdämmstreifen', labelEn: 'Edge insulation strips', re: /randdämm|randstreifen/i, why: 'Bei schwimmenden Estrichen erforderlich; wenn nicht genannt, Abgrenzung zur Nebenleistung unklar.', whyEn: 'Required for floating screeds; if not mentioned, the boundary with ancillary works is unclear.', share: 0.02 },
      { key: 'est-trenn', label: 'Trennlage / Abdeckung der Dämmung', labelEn: 'Separating layer / covering of the insulation', re: /trennlage|trennschicht|pe-?folie|abdeck/i, why: 'Trennlage zwischen Dämmung und Estrich gehört zum Aufbau.', whyEn: 'The separating layer between insulation and screed is part of the build-up.', share: 0.02 },
      { key: 'est-fugen', label: 'Bewegungs- und Scheinfugen', labelEn: 'Movement and contraction joints', re: /fuge|fugenprofil|scheinfuge|bewegungsfuge|trennschiene/i, why: 'Fugenplan und Fugenausbildung sind preis- und haftungsrelevant.', whyEn: 'Joint layout and joint detailing are relevant to price and liability.', share: 0.03 },
      { key: 'est-cm', label: 'CM-Messung / Belegreife', labelEn: 'CM measurement / readiness for covering', re: /cm-?\s?mess|restfeuchte|feuchtemess|estrichfeuchte|feuchte\s?prüf/i, why: 'Wer die Belegreife prüft, ist eine klassische Schnittstelle zwischen Estrich- und Bodenleger.', whyEn: 'Who checks readiness for covering is a classic interface between the screed layer and the floor layer.', share: 0.005 },
      { key: 'est-aufheizen', label: 'Funktions- / Belegreifheizen', labelEn: 'Functional heating / heating to readiness for covering', re: /aufheiz|funktionsheizen|belegreifheizen|heizprotokoll/i, why: 'Bei Heizestrich: Aufheizprotokoll und Zuständigkeit (Estrichleger oder Heizungsbauer) müssen geregelt sein.', whyEn: 'For heated screed: the heating-up record and the responsibility (screed layer or heating contractor) must be settled.', share: 0.01, onlyIf: /heizestrich|fußbodenheizung|fussbodenheizung|bodenheizung/i },
    ],
  },
  {
    key: 'bodenbelag', units: ['m²'], label: 'Bodenbelagarbeiten', labelEn: 'Floor covering works', re: /bodenbelag|teppich|linoleum|pvc-?belag|kautschuk|parkett|vinyl|designbelag/i,
    expected: [
      { key: 'bb-untergrund', label: 'Untergrundvorbereitung (schleifen, grundieren, spachteln)', labelEn: 'Substrate preparation (sanding, priming, levelling)', re: /untergrund|grundier|spachtel|schleifen|vorstrich|ausgleichsmasse|nivellier/i, why: 'Untergrundvorbereitung über das Reinigen hinaus ist Besondere Leistung – häufigster Nachtrag bei Bodenbelägen.', whyEn: 'Substrate preparation beyond cleaning is a special work (Besondere Leistung) – the most common change order (Nachtrag) for floor coverings.', besondere: true, share: 0.12 },
      { key: 'bb-sockel', label: 'Sockelleisten / Wandanschluss', labelEn: 'Skirting boards / wall junction', re: /sockel|wandanschluss|hohlkehl/i, why: 'Belag ohne Sockelausbildung ist unvollständig beschrieben.', whyEn: 'A floor covering without skirting detail is incompletely described.', share: 0.06 },
      { key: 'bb-uebergang', label: 'Übergangs- / Abschlussprofile', labelEn: 'Transition / edge profiles', re: /übergangs|abschlussprofil|trennschiene|profil/i, why: 'Übergänge zu anderen Belägen sind Schnittstellen zum Fliesen-/Estrichgewerk.', whyEn: 'Transitions to other coverings are interfaces with the tiling / screed trade.', share: 0.02 },
      { key: 'bb-reinigung', label: 'Erstpflege / Schutzabdeckung', labelEn: 'Initial care / protective covering', re: /erstpflege|einpflege|schutzabdeck|abdecken|grundreinigung/i, why: 'Schutz des fertigen Belags bis zur Abnahme ist Besondere Leistung.', whyEn: 'Protecting the finished covering until acceptance is a special work (Besondere Leistung).', besondere: true, share: 0.02 },
    ],
  },
  {
    key: 'fliesen', units: ['m²'], label: 'Fliesen- und Plattenarbeiten', labelEn: 'Tiling works', re: /\b(?:fliese|fliesen|feinsteinzeug|plattenbelag|wandbelag\s+keramisch|naturstein)/i,
    expected: [
      { key: 'fl-abdichtung', label: 'Verbundabdichtung', labelEn: 'Bonded waterproofing', re: /abdichtung|dichtband|dichtmanschette|verbundabdicht/i, why: 'In Nassbereichen erforderlich (DIN 18534); ohne Position ist unklar, welches Gewerk abdichtet.', whyEn: 'Required in wet areas (DIN 18534); without an item it is unclear which trade does the waterproofing.', share: 0.08 },
      { key: 'fl-fugen', label: 'Elastische Verfugung / Bewegungsfugen', labelEn: 'Elastic jointing / movement joints', re: /silikon|elastisch|bewegungsfuge|dehnungsfuge|wartungsfuge/i, why: 'Anschluss- und Bewegungsfugen sind gesondert zu beschreiben.', whyEn: 'Connection and movement joints must be described separately.', share: 0.03 },
      { key: 'fl-sockel', label: 'Sockelfliesen', labelEn: 'Skirting tiles', re: /sockel/i, why: 'Bodenbelag ohne Sockel ist unvollständig beschrieben.', whyEn: 'A floor covering without skirting is incompletely described.', share: 0.05 },
      { key: 'fl-untergrund', label: 'Untergrundvorbereitung', labelEn: 'Substrate preparation', re: /untergrund|grundier|ausgleich|spachtel/i, why: 'Untergrundvorbereitung über das Übliche hinaus ist Besondere Leistung.', whyEn: 'Substrate preparation beyond what is usual is a special work (Besondere Leistung).', besondere: true, share: 0.05 },
    ],
  },
  {
    key: 'trockenbau', units: ['m²'], label: 'Trockenbauarbeiten', labelEn: 'Drylining works', re: /trockenbau|gipskarton|\bgk-|metallständer|ständerwand|vorsatzschale|unterdecke|montagewand/i,
    expected: [
      { key: 'tb-oeffnungen', label: 'Öffnungen / Aussparungen für TGA', labelEn: 'Openings / recesses for building services', re: /aussparung|öffnung|ausschnitt|durchführung|durchdringung/i, why: 'Ausschnitte für Elektro/Sanitär sind die typische Schnittstelle Trockenbau–TGA.', whyEn: 'Cut-outs for electrical / plumbing installations are the typical interface between drylining and building services.', share: 0.03 },
      { key: 'tb-revision', label: 'Revisionsöffnungen / -klappen', labelEn: 'Access openings / access panels', re: /revision/i, why: 'Revisionsklappen werden regelmäßig vergessen und nachträglich beauftragt.', whyEn: 'Access panels are regularly forgotten and ordered afterwards.', share: 0.02 },
      { key: 'tb-verstaerkung', label: 'UK-Verstärkungen / Traversen', labelEn: 'Framing reinforcements / cross-members', re: /verstärk|traverse|ua-?profil|tragständer|unterkonstruktion\s+für/i, why: 'Verstärkungen für Sanitärobjekte, Türen und Lasten müssen einem Gewerk zugeordnet sein.', whyEn: 'Reinforcements for sanitary fittings, doors and loads must be assigned to a trade.', share: 0.03 },
      { key: 'tb-brandschutz', label: 'Brandschutzanschlüsse / Abschottung', labelEn: 'Fire protection junctions / fire stopping', re: /brandschutz|abschott|f\s?30|f\s?90|ei\s?30|ei\s?90/i, why: 'Wer Durchdringungen brandschutztechnisch schließt, muss geregelt sein.', whyEn: 'It must be settled who closes penetrations in terms of fire protection.', share: 0.03 },
      { key: 'tb-spachtel', label: 'Oberflächenqualität (Q1–Q4)', labelEn: 'Surface quality (Q1–Q4)', re: /\bq\s?[1-4]\b|qualitätsstufe|verspachtel/i, why: 'Ohne Qualitätsstufe ist die geschuldete Oberfläche nicht bestimmt (Schnittstelle zum Maler).', whyEn: 'Without a quality level, the surface owed is not defined (interface with the painter).', share: 0.04 },
    ],
  },
  {
    key: 'maler', units: ['m²'], label: 'Maler- und Lackierarbeiten', labelEn: 'Painting and coating works', re: /\b(?:maler|anstrich|beschichtung|dispersions|lackier|tapezier)/i,
    expected: [
      { key: 'ma-untergrund', label: 'Untergrundvorbehandlung / Grundierung', labelEn: 'Substrate pre-treatment / priming', re: /untergrund|grundier|spachtel|vorbehand/i, why: 'Untergrundvorbehandlung über das Übliche hinaus ist Besondere Leistung.', whyEn: 'Substrate pre-treatment beyond what is usual is a special work (Besondere Leistung).', besondere: true, share: 0.1 },
      { key: 'ma-abdecken', label: 'Abdecken / Abkleben', labelEn: 'Covering / masking', re: /abdeck|abkleb|schutz/i, why: 'Schutz angrenzender Bauteile über das Übliche hinaus ist Besondere Leistung.', whyEn: 'Protecting adjacent components beyond what is usual is a special work (Besondere Leistung).', besondere: true, share: 0.04 },
      { key: 'ma-geruest', label: 'Gerüst / Arbeitsbühne', labelEn: 'Scaffolding / working platform', re: /gerüst|arbeitsbühne|hubbühne|rollgerüst/i, why: 'Gerüste über 2 m Arbeitshöhe sind Besondere Leistung – oder bauseits zu stellen.', whyEn: 'Scaffolding for working heights above 2 m is a special work (Besondere Leistung) – or to be provided by the client.', besondere: true, share: 0.05 },
    ],
  },
  {
    key: 'dach', units: ['m²'], label: 'Dachabdichtungs- / Abdichtungsarbeiten', labelEn: 'Roof waterproofing / waterproofing works', re: /\b(?:dachabdichtung|abdichtung|dampfsperre|bitumenbahn|dachbahn|flachdach|attika)/i,
    expected: [
      { key: 'da-anschluss', label: 'An- und Abschlüsse (Attika, Wand, Durchdringungen)', labelEn: 'Junctions and terminations (parapet, wall, penetrations)', re: /anschluss|abschluss|attika|durchdringung|aufkantung/i, why: 'Anschlüsse sind der aufwändigste und schadensträchtigste Teil der Abdichtung.', whyEn: 'Junctions are the most labour-intensive and defect-prone part of the waterproofing.', share: 0.15 },
      { key: 'da-entw', label: 'Dachabläufe / Notüberläufe', labelEn: 'Roof outlets / emergency overflows', re: /dachablauf|gully|notüberlauf|notablauf|entwässerung/i, why: 'Einbindung der Abläufe ist Schnittstelle zur Dachentwässerung (Sanitär).', whyEn: 'Integrating the outlets is an interface with roof drainage (plumbing).', share: 0.04 },
      { key: 'da-schutz', label: 'Schutzlage / provisorische Abdichtung', labelEn: 'Protective layer / temporary waterproofing', re: /schutzlage|schutzvlies|schutzbahn|notabdichtung|behelfsabdichtung|provisorische\s+abdichtung/i, why: 'Schutz der Abdichtung gegen Folgegewerke ist Besondere Leistung.', whyEn: 'Protecting the waterproofing against following trades is a special work (Besondere Leistung).', besondere: true, share: 0.03 },
    ],
  },
  {
    key: 'tiefbau', units: ['m'], requires: /rohrgraben|grabenaushub|leitungszone|kanalbau|rohrbettung/i, label: 'Rohrleitungs- / Kanalbau', labelEn: 'Pipeline / sewer construction', re: /rohrleitung|kanal|druckrohr|rohre?\b|schacht|muffe|wasserleitung|hausanschluss/i,
    expected: [
      { key: 'tf-bettung', label: 'Rohrbettung / Leitungszone', labelEn: 'Pipe bedding / pipe zone', re: /bettung|leitungszone|sandbett|umhüllung|auflager/i, why: 'Rohrverlegung ohne Bettungsposition: Material und Einbau der Leitungszone sind nicht geregelt.', whyEn: 'Pipe laying without a bedding item: material and installation of the pipe zone are not settled.', share: 0.08 },
      { key: 'tf-pruefung', label: 'Dichtheits- / Druckprüfung', labelEn: 'Leak-tightness / pressure test', re: /druckprüfung|dichtheitsprüfung|dichtheit|kamerabefahrung|tv-?untersuchung/i, why: 'Prüfungen und Dokumentation sind als eigene Position oder Besondere Leistung zu regeln.', whyEn: 'Tests and documentation must be covered by a separate item or as a special work (Besondere Leistung).', share: 0.02 },
      { key: 'tf-oberflaeche', label: 'Oberflächenwiederherstellung', labelEn: 'Surface reinstatement', re: /wiederherstell|asphalt|pflaster|oberboden\s+andecken|humus|ansaat|rasen/i, why: 'Aufbruch ohne Wiederherstellung der Oberfläche ist unvollständig.', whyEn: 'Breaking up without reinstating the surface is incomplete.', share: 0.1 },
      { key: 'tf-verkehr', label: 'Verkehrssicherung', labelEn: 'Traffic management', re: /verkehrssicherung|verkehrsregelung|verkehrsrechtlich|absperrung|umleitung/i, why: 'Verkehrssicherung über das Übliche hinaus ist Besondere Leistung.', whyEn: 'Traffic management beyond what is usual is a special work (Besondere Leistung).', besondere: true, share: 0.03 },
      { key: 'tf-bestand', label: 'Kreuzende Leitungen / Suchschlitze', labelEn: 'Crossing services / trial holes', re: /suchschlitz|suchgraben|kreuzend|fremdleitung|leitung(?:en)?\s+sichern|sparten|handschachtung/i, why: 'Sichern von Leitungen ist Besondere Leistung; ohne Position volles Bestandsrisiko beim Bieter.', whyEn: 'Protecting existing services is a special work (Besondere Leistung); without an item the bidder carries the full risk of existing services.', besondere: true, share: 0.03 },
    ],
  },
  {
    key: 'elektro', requires: /kabel|nym|mantelleitung|installationsleitung/i, label: 'Elektroinstallation', labelEn: 'Electrical installation', re: /\b(?:elektro|kabel|leitung\s+nym|installationskabel|schalter|steckdose|verteiler|beleuchtung|leuchte)\b/i,
    expected: [
      { key: 'el-durchbruch', label: 'Durchbrüche / Kernbohrungen / Schlitze', labelEn: 'Openings / core drilling / chases', re: /durchbruch|durchbrüche|kernbohr|wandschlitz|deckenschlitz/i, why: 'Wer Durchbrüche herstellt und schließt, ist eine klassische Schnittstelle zum Rohbau.', whyEn: 'Who makes and closes openings is a classic interface with the structural works.', share: 0.03 },
      { key: 'el-schott', label: 'Brandschottungen', labelEn: 'Fire stopping', re: /brandschott|abschottung|brandschutz/i, why: 'Brandschottungen der eigenen Leitungen werden häufig keinem Gewerk zugeordnet.', whyEn: 'Fire stopping of the trade’s own cables is often not assigned to any trade.', share: 0.03 },
      { key: 'el-pruefung', label: 'Messung / Prüfprotokoll / Dokumentation', labelEn: 'Measurement / test report / documentation', re: /prüfprotokoll|messung|dokumentation|revisionsunterlagen|inbetriebnahme|e-?check/i, why: 'Prüfungen und Revisionsunterlagen sind preisrelevant und abnahmerelevant.', whyEn: 'Tests and as-built documents are relevant to price and to acceptance.', share: 0.02 },
      { key: 'el-erdung', label: 'Potentialausgleich / Erdung', labelEn: 'Equipotential bonding / earthing', re: /potentialausgleich|potenzialausgleich|erdung|fundamenterder/i, why: 'Fundamenterder ist Schnittstelle zum Rohbau.', whyEn: 'The foundation earth electrode is an interface with the structural works.', share: 0.02 },
    ],
  },
  {
    key: 'sanitaer', label: 'Sanitär / Heizung', labelEn: 'Plumbing / heating', re: /\b(?:waschtisch|trinkwasser|tw-rohr|abwasserrohr|abwasserleitung|heizkörper|fußbodenheizung|heizrohr|heizkreis|armatur)/i,
    expected: [
      { key: 'sa-durchbruch', label: 'Durchbrüche / Kernbohrungen', labelEn: 'Openings / core drilling', re: /durchbruch|durchbrüche|kernbohr|wandschlitz|deckenschlitz/i, why: 'Herstellen und Schließen von Durchbrüchen muss einem Gewerk zugeordnet sein.', whyEn: 'Making and closing openings must be assigned to a trade.', share: 0.03 },
      { key: 'sa-schott', label: 'Brandschottungen', labelEn: 'Fire stopping', re: /brandschott|abschottung|brandschutz/i, why: 'Brandschottungen der Rohrdurchführungen werden häufig vergessen.', whyEn: 'Fire stopping of pipe penetrations is often forgotten.', share: 0.03 },
      { key: 'sa-daemmung', label: 'Rohrdämmung', labelEn: 'Pipe insulation', re: /dämmung|isolierung|dämmschal/i, why: 'Dämmung nach GEG/DIN 1988 ist preisrelevant; ohne Position Abgrenzung unklar.', whyEn: 'Insulation to GEG / DIN 1988 is price-relevant; without an item the boundary is unclear.', share: 0.06 },
      { key: 'sa-pruefung', label: 'Druckprobe / Spülen / Inbetriebnahme', labelEn: 'Pressure test / flushing / commissioning', re: /druckprobe|druckprüfung|dichtheitsprüfung|spülen|inbetriebnahme|einregul/i, why: 'Prüfungen und Inbetriebnahme sind zu vergüten und zu protokollieren.', whyEn: 'Tests and commissioning must be paid for and recorded.', share: 0.02 },
    ],
  },
  {
    key: 'strasse', units: ['m²', 't'], label: 'Straßen- und Wegebau', labelEn: 'Road and path construction', re: /asphalt|tragschicht|frostschutzschicht|pflaster|bordstein|deckschicht/i,
    expected: [
      { key: 'st-planum', label: 'Planum herstellen / verdichten', labelEn: 'Preparing / compacting the formation', re: /planum/i, why: 'Oberbau ohne Planumsposition: Herstellen und Nachweis der Tragfähigkeit ungeregelt.', whyEn: 'Pavement without a formation item: preparation and proof of bearing capacity are not settled.', share: 0.04 },
      { key: 'st-fugen', label: 'Nähte / Fugen / Anschlüsse', labelEn: 'Seams / joints / junctions', re: /fuge|naht|fugenband|tok|anschluss|schneiden/i, why: 'Anschlüsse an Bestand sind preisrelevant.', whyEn: 'Junctions with existing surfaces are price-relevant.', share: 0.02 },
      { key: 'st-haft', label: 'Haftkleber / Bitumenemulsion', labelEn: 'Tack coat / bitumen emulsion', re: /haftkleber|bitumenemulsion|ansprühen|aufsprühen/i, why: 'Schichtenverbund ist bei mehrlagigem Einbau erforderlich.', whyEn: 'Bonding between layers is required where several layers are laid.', share: 0.01, onlyIf: /asphalt/i },
    ],
  },
];

// Coupled items: if A is in the LV, B is expected and their quantities should be comparable.
export interface CouplingDef {
  id: string;
  label: string;
  a: RegExp;
  b: RegExp;
  unit?: string;
  tol: number; // allowed relative deviation
}
export const COUPLINGS: CouplingDef[] = [
  { id: 'liefern-verlegen', label: 'Liefern ↔ Verlegen', a: /\bliefern\b(?!\s+und\s+(?:verlegen|einbauen|montieren))/i, b: /\b(?:verlegen|einbauen|montieren)\b/i, tol: 0.05 },
];

// Ratio checks between groups of items inside one LV.
export interface RatioDef {
  id: string;
  label: string;
  labelEn: string;
  num: RegExp;
  numUnit: string;
  numNot?: RegExp;
  den: RegExp;
  denUnit: string;
  denNot?: RegExp;
  min: number;
  max: number;
  unitLabel: string;
  unitLabelEn: string;
  note: string;
  noteEn: string;
}
export const RATIOS: RatioDef[] = [
  { id: 'bewehrung-beton', label: 'Bewehrungsgrad', labelEn: 'Reinforcement ratio', num: /bewehrung|betonstahl|betonstabstahl|betonstahlmatten/i, numUnit: 't', den: /ortbeton|stahlbeton|\bbeton\b|bodenplatte|fundament/i, denNot: /sauberkeit|unbewehrt|magerbeton|schalung|bewehrung|fertigteil|kernbohr|schneid|abbruch|pflaster|rohr/i, denUnit: 'm³', min: 0.05, max: 0.25, unitLabel: 't Stahl je m³ Beton', unitLabelEn: 't of steel per m³ of concrete', note: 'Üblich sind etwa 80–200 kg/m³ je nach Bauteil.', noteEn: 'About 80–200 kg/m³ is usual, depending on the component.' },
  { id: 'abfuhr-aushub', label: 'Abfuhr im Verhältnis zum Aushub', labelEn: 'Removal in relation to excavation', num: /abfahren|abfuhr|entsorgen|entsorgung|verwert/i, numNot: /asphalt|beton|abbruch|bauschutt|wurzel|oberboden|humus/i, numUnit: 'm³', den: /aushub|ausheben|boden\s+lösen/i, denNot: /zulage|handschacht|suchschlitz|oberboden|humus/i, denUnit: 'm³', min: 0.05, max: 1.05, unitLabel: 'm³ Abfuhr je m³ Aushub', unitLabelEn: 'm³ removed per m³ excavated', note: 'Mehr Abfuhr als Aushub ist nicht plausibel; deutlich weniger nur bei Wiedereinbau.', noteEn: 'More removal than excavation is not plausible; considerably less only where material is re-used on site.' },
  { id: 'verfuell-aushub', label: 'Verfüllung im Verhältnis zum Aushub', labelEn: 'Backfilling in relation to excavation', num: /verfüll|hinterfüll|wiedereinbau/i, numUnit: 'm³', den: /aushub|ausheben|boden\s+lösen/i, denNot: /zulage|handschacht|suchschlitz|oberboden|humus/i, denUnit: 'm³', min: 0.0, max: 1.0, unitLabel: 'm³ Verfüllung je m³ Aushub', unitLabelEn: 'm³ backfilled per m³ excavated', note: 'Verfüllung über der Aushubmenge deutet auf einen Mengenfehler oder Fremdmaterial hin.', noteEn: 'Backfilling above the excavated quantity points to a quantity error or imported material.' },
];

export const TRADE_WORDS: { key: string; label: string; labelEn: string; re: RegExp; evidence: RegExp }[] = [
  { key: 'heizung', label: 'Heizungsbauer', labelEn: 'the heating contractor', re: /\b(?:vom|durch\s+den|durch|des)\s+Heizungsbauer[s]?\b|\bGewerk\s+Heizung\b|\bbauseits\s+durch\s+Heizung/i, evidence: /fußbodenheizung|fussbodenheizung|heizrohr|heizkreis|rolljet|noppenplatte|systemplatte/i },
  { key: 'elektro', label: 'Elektriker', labelEn: 'the electrician', re: /\b(?:vom|durch\s+den|durch|des)\s+Elektr(?:iker|oinstallateur)[s]?\b|\bGewerk\s+Elektro\b|\bdurch\s+(?:das\s+)?Gewerk\s+ELT\b/i, evidence: /kabel|leerrohr|steckdose|schalter|potentialausgleich|fundamenterder/i },
  { key: 'sanitaer', label: 'Sanitärinstallateur', labelEn: 'the plumber', re: /\b(?:vom|durch\s+den|durch|des)\s+(?:Sanitär\w*|Installateur[s]?)\b|\bGewerk\s+Sanitär\b/i, evidence: /bodeneinlauf|bodenablauf|waschtisch|wc|rohrleitung|abwasser/i },
  { key: 'rohbau', label: 'Rohbauer', labelEn: 'the structural works contractor', re: /\b(?:vom|durch\s+den|durch|des)\s+Rohbau(?:er|unternehmer)[s]?\b|\bGewerk\s+Rohbau\b|\bbauseits\s+(?:vorhandene[rnm]?\s+)?(?:Aussparung|Durchbruch)/i, evidence: /aussparung|durchbruch|kernbohr|schlitz/i },
  { key: 'estrich', label: 'Estrichleger', labelEn: 'the screed layer', re: /\b(?:vom|durch\s+den|durch|des)\s+Estrichleger[s]?\b|\bGewerk\s+Estrich\b/i, evidence: /estrich|randdämm|cm-?mess/i },
  { key: 'bodenbelag', label: 'Bodenleger', labelEn: 'the floor layer', re: /\b(?:vom|durch\s+den|durch|des)\s+(?:Bodenleger[s]?|Oberbodenleger[s]?|Belagsleger[s]?)\b|\bFolgegewerk\b/i, evidence: /bodenbelag|grundier|spachtel|sockelleiste/i },
  { key: 'trockenbau', label: 'Trockenbauer', labelEn: 'the drylining contractor', re: /\b(?:vom|durch\s+den|durch|des)\s+Trockenbauer[s]?\b|\bGewerk\s+Trockenbau\b/i, evidence: /gipskarton|ständerwand|revision|vorsatzschale/i },
  { key: 'maler', label: 'Maler', labelEn: 'the painter', re: /\b(?:vom|durch\s+den|durch|des)\s+Maler[s]?\b|\bGewerk\s+Maler\b/i, evidence: /anstrich|beschichtung|spachtel/i },
  { key: 'geruest', label: 'Gerüstbauer', labelEn: 'the scaffolder', re: /\b(?:vom|durch\s+den|durch|des)\s+Gerüstbauer[s]?\b|\bbauseitige[sn]?\s+Gerüst|\bGerüst\s+(?:wird\s+)?bauseits/i, evidence: /gerüst/i },
  { key: 'andere', label: 'andere Gewerke', labelEn: 'other trades', re: /\bdurch\s+(?:andere|fremde|ein\s+anderes)\s+(?:Gewerke?|Unternehmer|Firmen)\b|\bvon\s+anderen\s+(?:Gewerken|Unternehmern)\b|\bFremdgewerk/i, evidence: /$^/ },
];
