// Seed reference prices (net, EUR, price level 2025, Southern Germany).
// IMPORTANT: these are rough orientation values written for the prototype, NOT a verified
// price database. In production this table is replaced by the company's own priced LVs
// (every priced file that is uploaded is added to the history automatically, see prices.ts).
// Format: text | unit | low | mid | high
const RAW = `
Baustelleneinrichtung herstellen einrichten|psch|3000|12000|60000
Baustelleneinrichtung vorhalten|Mt|400|900|2500
Baustelle räumen|psch|800|3500|15000
Tagesunterkünfte Baucontainer Belegschaft|psch|800|1800|4500
Chemo-Toilette Baustellen-WC|psch|300|750|1500
Bauzaun Schutzzaun ortsfest h 2,00 m aufstellen vorhalten|m|6|12|22
Verkehrssicherung Arbeitsstelle|psch|1200|3800|9000
Verkehrsrechtliche Anordnung einholen|psch|150|300|600
Beweissicherung durchführen|psch|400|900|2500
Spartenpläne einholen Leitungsauskunft|psch|200|450|900
Bäume fällen Durchmesser 10 20 cm|St|25|45|90
Bäume fällen Durchmesser 21 30 cm|St|45|80|160
Bäume fällen Durchmesser 31 50 cm|St|90|160|320
Wurzelstöcke ausbauen laden abfahren entsorgen|St|45|90|180
Buschwerk entfernen roden entsorgen|m²|2|4.5|9
Oberboden Humus abschieben abtragen lagern|m³|3.5|6.5|11
Oberboden Humus andecken auftragen|m³|5|9|15
Oberboden abtragen|m²|1.2|2.5|4.5
Geotextil Vlies liefern verlegen|m²|1.2|2.2|3.8
Baugrubenaushub Boden lösen laden|m³|6|11|22
Rohrgrabenaushub Grabenaushub|m³|12|24|42
Fundamentaushub|m³|18|32|55
Handschachtung Handaushub|m³|65|110|180
Suchschlitze Suchgraben herstellen|m³|70|120|200
Boden abfahren entsorgen unbelastet|m³|14|24|42
Boden entsorgen belastet Deponie|t|28|55|120
Verfüllung Arbeitsraum Boden einbauen verdichten|m³|12|21|36
Rohrgraben verfüllen verdichten|m³|10|18|30
Sandbettung Leitungszone Umhüllung|m³|32|48|75
Kiestragschicht Frostschutzschicht herstellen|m³|28|42|62
Schottertragschicht herstellen|m²|9|15|24
Planum herstellen verdichten|m²|0.8|1.6|3
Lastplattendruckversuch|St|140|220|340
Wasserhaltung offene betreiben|psch|1500|6000|25000
Grabenverbau Verbau herstellen vorhalten|m²|9|18|34
Asphalt schneiden Straßendecke|m|4|8|14
Straßenaufbruch bituminöser Oberbau aufbrechen entsorgen|m³|45|85|150
Asphalttragschicht herstellen 14 cm|m²|24|36|52
Asphaltdeckschicht herstellen 4 cm|m²|11|17|26
Bitumenemulsion aufsprühen Haftkleber|m²|0.4|0.8|1.5
Unterlage reinigen|m²|0.3|0.7|1.4
Fugenband TOK-Band herstellen|m|4|7.5|13
Pflasterdecke Betonpflaster herstellen|m²|32|48|72
Bordstein Hochbord setzen|m|26|40|60
Muffendruckrohre duktiles Gusseisen GGG DN 250 liefern|m|95|140|200
Rohre GGG DN 250 verlegen|m|18|32|55
Druckrohr PE-HD DN 100 liefern verlegen|m|28|46|75
Stahlbetonrohre DN 800 liefern verlegen|m|260|380|560
PVC-U KG Rohr DN 150 liefern verlegen|m|24|38|60
Kabelschutzrohr PE-HD Leerrohr da 50 liefern|m|1.8|3.2|5.5
Kabelschutzrohr Leerrohr verlegen|m|2|4|7.5
Steuerkabel liefern|m|3|6|12
Steuerkabel verlegen|m|1.5|3|6
Schacht Stahlbetonfertigteile DN 1000 liefern einbauen|St|1400|2300|3800
Kabelschacht liefern einbauen|St|700|1300|2400
Schachtabdeckung Klasse D 400 liefern aufsetzen|St|260|420|650
Druckprüfung Rohrleitung|m|1.2|2.6|5
Dichtheitsprüfung Kanal|m|3|5.5|10
Kalibrieren Rohrstrecke|m|0.5|1.2|2.5
Sauberkeitsschicht Beton C12/15 5 cm|m²|7|11|17
Ortbeton Bodenplatte C25/30|m³|135|175|230
Ortbeton Fundamente Streifenfundament C25/30|m³|140|185|245
Ortbeton Wand C25/30|m³|150|195|260
Ortbeton Decke C25/30|m³|145|190|250
Ortbeton Stütze C30/37|m³|190|260|360
Schalung Fundamente|m²|28|42|62
Schalung Wand|m²|32|48|72
Schalung Decke|m²|30|46|68
Schalung Stütze|m²|48|72|110
Randschalung Bodenplatte|m|14|24|38
Betonstahl Bewehrung B500B Stabstahl liefern verlegen|t|1250|1650|2200
Betonstahlmatten B500A liefern verlegen|t|1200|1600|2100
Fugenblech Arbeitsfuge|m|14|24|38
Fugenband Dehnfuge|m|26|44|70
Kernbohrung Stahlbeton Durchmesser 100 mm|St|45|80|140
Aussparung herstellen|St|18|35|70
Mauerwerk Kalksandstein 17,5 cm|m²|62|86|118
Mauerwerk Hochlochziegel 24 cm|m²|78|105|145
Stahlbeton-Fertigteilstütze liefern montieren|St|900|1600|2900
Stahlbeton-Fertigteilbinder liefern montieren|St|2800|5200|9500
Fertigteiltreppe Stahlbeton liefern versetzen|St|1800|3200|5600
Porenbeton Wandplatten liefern montieren|m²|62|88|125
Porenbeton Dachplatten liefern verlegen|m²|58|82|115
Zementestrich schwimmend CT C25 F4 65 mm|m²|19|26|36
Zementestrich als Heizestrich 65 mm|m²|21|29|40
Zementestrich im Verbund 50 mm|m²|18|25|35
Calciumsulfat-Fließestrich 50 mm|m²|17|24|33
Randdämmstreifen liefern einbauen|m|1|1.8|3.2
Trennlage PE-Folie verlegen|m²|0.8|1.5|2.6
Trittschalldämmung 30 mm verlegen|m²|6|9.5|14
Wärmedämmung EPS 100 mm Boden|m²|11|17|25
Bewegungsfuge Estrich Fugenprofil|m|9|16|28
Scheinfuge schneiden|m|3|5.5|9
Zulage Schnellestrich Zusatzmittel|m²|5|9|15
Bodeneinlauf anarbeiten Estrich|St|14|28|50
Zulage Gefälleestrich Gefälleausbildung|m²|6|11|19
CM-Messung Restfeuchte|St|35|60|95
Estrich schleifen|m²|2.5|4.5|8
PVC-Bodenbelag Bahnen liefern verlegen|m²|26|38|55
Kautschukbelag liefern verlegen|m²|42|62|88
Linoleum liefern verlegen|m²|34|48|68
Teppichboden Textilbelag liefern verlegen|m²|28|42|64
Untergrund grundieren spachteln 3 mm|m²|5|8.5|13
Sockelleiste liefern montieren|m|6|10|17
Übergangsprofil Abschlussprofil liefern montieren|m|12|22|38
Erstpflege Bodenbelag|m²|1|2|3.5
Bodenfliesen Feinsteinzeug 30x60 liefern verlegen|m²|58|82|118
Wandfliesen Steingut liefern verlegen|m²|55|78|110
Sockelfliesen liefern verlegen|m|11|18|28
Verbundabdichtung Dichtschlämme zweilagig|m²|16|26|40
Dichtband Dichtmanschette einbauen|m|5|9|15
Silikonfuge elastische Verfugung|m|4|6.5|10
Natursteinbelag Granit liefern verlegen|m²|120|180|270
Metallständerwand GK einfach beplankt 100 mm|m²|42|58|80
Metallständerwand GK doppelt beplankt 125 mm|m²|54|74|100
Vorsatzschale GK freistehend|m²|36|50|70
Unterdecke GK abgehängt|m²|44|62|88
Mineralfaser Rasterdecke abgehängt|m²|34|48|68
Revisionsklappe 30x30 einbauen|St|38|65|110
Türöffnung in Ständerwand herstellen|St|38|65|105
UA-Profil Verstärkung Traverse Sanitär|St|45|80|135
Brandschutz Abschottung Durchführung|St|28|55|110
Dispersionsanstrich Wand innen zweifach|m²|4.2|6.5|9.5
Dispersionsanstrich Decke zweifach|m²|4.8|7.2|10.5
Grundierung Tiefgrund|m²|0.9|1.6|2.6
Spachtelung Q3 Wand|m²|5|8|12.5
Lackierung Stahlzarge|St|28|46|72
Bodenbeschichtung Epoxidharz|m²|18|30|48
Abdecken Bodenflächen Folie|m²|0.7|1.4|2.4
Dampfsperre Bitumenbahn verlegen|m²|7|11|17
Dachabdichtung Bitumenbahn zweilagig|m²|26|38|55
Dachabdichtung Kunststoffbahn FPO mechanisch befestigt|m²|22|32|46
Gefälledämmung Flachdach EPS im Mittel 160 mm|m²|28|42|60
Attikaanschluss Wandanschluss Abdichtung|m|28|46|72
Dachablauf Flachdachgully DN 100 liefern einbauen|St|140|230|360
Notüberlauf Attika liefern einbauen|St|120|210|340
Lichtkuppel liefern einbauen|St|700|1200|2000
Abdichtung erdberührte Wand PMBC Bitumendickbeschichtung|m²|18|28|42
Perimeterdämmung XPS 100 mm|m²|22|32|46
Noppenbahn Schutzlage|m²|5|8|12.5
Installationskabel NYM-J 3x1,5 liefern verlegen|m|2|3.4|5.4
Installationskabel NYM-J 5x2,5 liefern verlegen|m|3.2|5.2|8
Steckdose Schutzkontakt liefern montieren|St|14|22|34
Schalter Aus/Wechsel liefern montieren|St|15|24|36
LED-Leuchte Rasterleuchte liefern montieren|St|95|160|260
Kabelrinne 200 mm liefern montieren|m|22|36|56
Unterverteilung liefern montieren|St|900|1900|3800
Fundamenterder Bandstahl verlegen|m|6|10|16
Waschtisch Keramik liefern montieren|St|190|300|460
WC wandhängend mit Vorwandelement liefern montieren|St|420|640|920
Abwasserleitung HT DN 100 liefern verlegen|m|22|34|52
Trinkwasserleitung Edelstahl DN 20 liefern verlegen|m|24|36|54
Rohrdämmung Mineralwolle alukaschiert|m|8|13|21
Fußbodenheizung Systemplatte Heizrohr verlegen|m²|28|40|58
Heizkreisverteiler liefern montieren|St|380|620|980
Sektionaltor 4x4,5 m liefern montieren|St|4200|6200|9000
Stahltür T30 einflügelig liefern montieren|St|780|1150|1700
Innentür Holz mit Stahlzarge liefern montieren|St|420|640|950
WC-Trennwand Kabine liefern montieren|St|420|640|940
Gerüst Fassadengerüst aufbauen abbauen Grundvorhaltung|m²|7.5|11|16
Gerüst Gebrauchsüberlassung Vorhaltung je Woche|m²Wo|0.15|0.28|0.5
Stundenlohn Facharbeiter|h|48|58|72
Stundenlohn Helfer|h|38|46|58
Stundenlohn Polier Vorarbeiter|h|58|68|84
Bagger mit Fahrer Stundensatz|h|85|110|145
LKW mit Fahrer Stundensatz|h|68|85|110
`;

export interface SeedPrice {
  text: string;
  unit: string;
  low: number;
  mid: number;
  high: number;
}
export const SEED_PRICES: SeedPrice[] = RAW.trim()
  .split('\n')
  .map((l) => {
    const [text, unit, low, mid, high] = l.split('|');
    return { text, unit, low: Number(low), mid: Number(mid), high: Number(high) };
  });

// Material sensitivity for what-if analysis: which cost driver moves which kind of item,
// and what share of the unit price it roughly represents.
export const DRIVERS: { key: string; label: string; re: RegExp; share: number }[] = [
  { key: 'stahl', label: 'Stahl / Bewehrung', re: /bewehrung|betonstahl|stahl(?!beton)|stahlbetonfertigteil|profilstahl|stahltür|zarge|gusseisen|ggg|sektionaltor|blech/i, share: 0.55 },
  { key: 'beton', label: 'Beton / Zement / Steine', re: /beton|mauerwerk|ziegel|kalksandstein|estrich|zement|fertigteil|mörtel|pflaster|bordstein|schacht|porenbeton/i, share: 0.45 },
  { key: 'bitumen', label: 'Asphalt / Bitumen', re: /asphalt|bitumen|dachabdichtung|schweißbahn|dickbeschichtung|pmbc/i, share: 0.55 },
  { key: 'diesel', label: 'Diesel / Transport', re: /aushub|abfahren|abfuhr|entsorg|transport|verfüll|tragschicht|frostschutz|oberboden|humus|bagger|lkw|planum/i, share: 0.25 },
  { key: 'kunststoff', label: 'Kunststoffe / Dämmstoffe', re: /pvc|pe-hd|kunststoff|dämmung|eps|xps|folie|kautschuk|linoleum|teppich|kabel|leerrohr|rohrdämm/i, share: 0.45 },
  { key: 'lohn', label: 'Lohn', re: /./, share: 0.4 },
];
