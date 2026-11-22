# Research: how LV checking was, is and will be done

Written in the night of 20–21 Nov 2026. Evidence tags: **[R]** read on the page, **[S]** search snippet only, **[B]** background knowledge. Vendor numbers are marketing claims unless stated.

## 1. The challenge and the sponsor

**Challenge A:** "Beyond the Line Item: AI that finds errors and risks in bills of quantities". Import long BoQs (PDF, GAEB, Excel), find errors (priority), score risk, find change-order potential, optionally suggest prices from history, what-if analysis. Deliverables: a web app with upload and risk report, and a pitch from the estimator's perspective.

**Sponsor: Bayerischer Bauindustrieverband (BBIV)** [R, member magazine ID 01/2026 and 06/2026]
- President Johann Bögl (Max Bögl). Hauptgeschäftsführer Thomas Schmid. Members named in the magazine: Max Bögl, BAUER, Geiger, Josef Hebel, W. Markgraf, Guggenberger, STRABAG, Gebr. Donhauser.
- "Bauindustrie meets Innovators" (13 Nov 2025) brought in TUM.ai, Fraunhofer IBP and Motius. This hackathon is the follow-up.
- Members-only guide "KI-Potenziale der Bauindustrie 2026": more than 130 use cases. Its workshop finding: what matters is "nicht nur Technologien, sondern vor allem gute Daten und qualifizierte Teams".
- "Zukunftswerkstatt Bau" has two focus themes: AI and systemic construction.
- Quote usable in the pitch (young engineer, ID 01/2026): "Künstliche Intelligenz wird weniger das Bauen selbst verändern, aber die gesamte Planung und Verwaltung rund um ein Bauprojekt deutlich vereinfachen können – vorausgesetzt, die Datenbasis stimmt."

**What the industry asks for** [R, HDB position paper "Digitale Transformation", July 2026; BBIV Leitbild Digitalisierung]
- AI to reduce "Fehlerkosten", given "Fachkräftemangel sowie hoher Fehleranfälligkeiten".
- "Wahrung der Datenhoheit und digitalen Souveränität". Contractor data must not train AI systems without consent.
- So the pitch must say: unit prices never leave the company, nothing is used for training, the rules run locally.

**What is already happening among members**
- STRABAG and Uni Oldenburg: "Kalkulation.KI", text mining on offer processing, since 2020 [R].
- STRABAG "DARIA" risk forecasting [S].
- Nothing public for Max Bögl, Züblin or Bauer on LV analysis.
- Not found anywhere: jury, judging criteria, who supplied the data, an earlier TUM.ai × BBIV event.

## 2. Past: how estimators have always done it

| Technique | What it is | Verdict |
|---|---|---|
| Pre-bid review by the estimator [R, bauprofessor.de] | Read for price-relevant stipulations, Nebenleistung vs. Besondere Leistung, interfaces, deadlines. Check completeness, write Bieterfragen, log the answers. | **Keep.** This is the workflow our tool serves. Weakness: days per tender, depends on the person. |
| ABC analysis / Leitpositionen [S] | About 20 % of items carry 80 % of the value. | **Keep.** Every finding is weighted by money. |
| Quantity spot checks on main items | Recalculate the items that decide the bid. | **Keep**, as ratio checks inside the LV. |
| GAEB formal checks [S] | Import log, BVBS GAEB checker, AVA tool check. Schema, structure, arithmetic. | **Keep**, as deterministic code. They are formal only, never semantic. |
| Reference catalogues (STLB-Bau, DBD, BKI, sirAdos) | Coded items and reference prices. | **Keep the idea** (a sanity band). Free-text items do not benefit. |
| Speculating on quantity errors [S] | Price low where quantities shrink, high where they grow. | **Do not automate.** Legally delicate (Mischkalkulation leads to exclusion). We flag it as a risk in a bid instead. |

## 3. Present: rules, benchmarks, classic ML

- **Price suggestion from own history.** GAEB-Online KI-PreisNavigator [S] runs locally on past GAEB bids, with a check log and confidence values. BRZ 365 KI-Kalkulation [R, press PDF] uses past calculations plus semantic comparison of short and long texts. → **Adopt**: similarity search over own priced LVs, with confidence and visible references.
- **Statistical outliers on unit prices** (Z-scores, deviation weighted by share of total) [S]. Built for clients evaluating bids; the maths transfers. → **Adopt.**
- **Item classification** [R, Deza et al., arXiv 2211.07705]: 50k UK item descriptions, F1 above 90 % with a small model. BoQ text is short and technical. → Keyword-based trade detection is enough for a prototype.
- **Change-order prediction** [S, UNLV thesis 2024]: the top bid-document risks are "pay item omission" and "incorrect quantities". → These two get their own checks.

## 4. AI-native (2023–2026)

**German, bidder side**

| Product | What it does | Gap |
|---|---|---|
| **BlackSwanAI "auftragr"** [R] | Closest competitor. PDF, Word, GAEB. Five views: summary, go/no-go, risks, Nachtragspotenziale, open questions. Guardrail layer, "Jeder Befund nennt seine Fundstelle", German cloud. | No accuracy figures, no quantity or price plausibility, no what-if. Nachtrag only as text. |
| **BAU AI** [R] | Agents for tender monitoring, contract review, LV gaps, bid comparison. Claims native GAEB and source-linked statements. | Much is beta; "80 % less review time" unverified. |
| **BauGPT** [R] | Chat assistant that reads and exports GAEB. | No visible checks. |
| KURO, Ausschreibung.AI, Tenderbolt, Vergabepilot [R/S] | Generic RAG bid management or tender search. | Not LV-specific. |

**German, client side (same techniques, opposite user):** Phase0 [R] drafts and checks LVs (raised €2.6M in Sept 2026 [S]). baupruefen.de [R] gives a traffic light per item and a score out of 100, a good UX reference.

**International:** Document Crunch (contract risk with company playbooks, every flag tied to a clause) [R]. Buildcheck (500+ checks, severity levels) [R]. Civils.ai [R, vendor blog]: general LLMs landed 39–43 % under a chartered surveyor on bid value, so **LLMs cannot produce quantities or prices**.

**Academic:** no peer-reviewed LLM work on error detection in German LVs was found.

**Useful vs. hype**
- Useful: parsing messy PDFs, judging vague long texts, cross-checking preambles against items, drafting Bieterfragen.
- Hype: "fully automatic calculation", LLM-invented market prices, "zero hallucination", 80–90 % time savings.

## 5. The contract rules we can cite

All read at the source [R] (vergabevorschriften.de, dejure.org) unless marked.

- **VOB/A § 7 Abs. 1 Nr. 1:** "Die Leistung ist eindeutig und so erschöpfend zu beschreiben, dass alle Unternehmen die Beschreibung im gleichen Sinne verstehen müssen und ihre Preise sicher und ohne umfangreiche Vorarbeiten berechnen können."
- **Nr. 3:** "Dem Auftragnehmer darf kein ungewöhnliches Wagnis aufgebürdet werden …"
- **Nr. 4:** "Bedarfspositionen sind grundsätzlich nicht in die Leistungsbeschreibung aufzunehmen."
- **Abs. 2:** product references need "oder gleichwertig".
- **§ 7b Abs. 4:** only like services in one item. **§ 4 Abs. 1 Nr. 2:** lump sum only if the work is exactly defined.
- **VOB/B § 2 Abs. 3:** quantity deviation above 10 % → new price on request. **Abs. 5:** changed work. **Abs. 6:** additional work, must be announced before execution. **Abs. 7:** lump sum stays. **Abs. 10:** hourly work only if agreed beforehand.
- **VOB/B § 4 Abs. 1 Nr. 1:** the client coordinates the trades. **§ 4 Abs. 3:** concerns in writing. **§ 6 Abs. 1:** obstruction notice.
- **DIN 18299:** section 0 is the checklist for a proper description; 4.1 Nebenleistungen belong to the contract without mention; 4.2 Besondere Leistungen only if specifically mentioned. Anything in 4.2 without an LV item is the classic Nachtrag. *(Read in the 2010 edition; numbering should be checked against the current one.)*
- Case law, from snippets only [S], so do not quote in the pitch without checking: BGH X ZB 7/04 (Mischkalkulation → exclusion), BGH X ZR 100/16 (speculative prices), BGH VII ZR 122/11 (contaminated soil not stated).
- From memory [B], marked "prüfen" in the tool: ErsatzbaustoffV replaced LAGA classes on 1 Aug 2023; Homogenbereiche replaced Bodenklassen in VOB/C 2015 [R for the latter].

## 6. Numbers that are safe to say on stage

- Rechnungshof Baden-Württemberg, Denkschrift 2020, Beitrag 17, 48 large projects [R]: Nachträge averaged **17 % of approved cost for refurbishments and 6 % for new builds**. **9 %** of Nachtrag value came from "Mängel im Leistungsverzeichnis, beispielsweise durch fehlende, unvollständige oder falsche Beschreibungen". "Lücken im Leistungsverzeichnis eröffnen nach der Auftragserteilung Raum für Nachträge."
- Same source, the anecdote: an order for Revisionsklappen of €50,000 grew "durch fünf Nachträge auf knapp 600.000 Euro".
- TU Braunschweig (Gonschorek 2012) [R]: about 95 % of surveyed project participants say Nachträge occur often or always; over 80 % say the amount is often or always disputed.
- **Do not use:** estimator hours per LV, bid preparation cost, hit rates. No reliable source was found.

## 7. What the organisers' dataset really contains

First read in the browser viewer on 20 Nov, then downloaded and parsed on 21 Nov. Measured results are in [[00 Start here]].

- **GAEB XML comes in three dialects:** ORCA AVA (3.2), California (3.1, old namespace, STLB codes), ARCHITEXT Pallas (3.2, text without `<p>`, unpadded item numbers, currency "EURO"). The parser handles all three patterns; this is covered by a unit test built from those observations.
- **The anonymiser damages the text.** It replaces ordinary words, not only names: "nach Wahl AN" became "nach [PERSON_125] AN", "Zementestrich" became "[FIRMA_071]". The tool ignores placeholders so they never show up as typos.
- **`LV-Positionen.docx` is not a list of faulty items.** It groups items that belong together in a pipeline project (supply + surcharge + laying, per diameter). That is the idea behind our supply-versus-laying quantity check.
- **`Angebot AN24-0305.pdf` is a real bid with speculative prices**: fence at €0.10/m, geotextile at €0.05/m², hand excavation at €0.68/m³, next to a €72,000 site setup. A textbook Mischkalkulation pattern, and a ready-made demo for the price checks.
- **The 27 `LV_xx` PDFs** are one building ("Ausbildungszentrum und Bürogebäude"). The Estrich LV says "Die Rolljetdämmung wird vom Heizungsbauer verlegt": real cross-trade interfaces to check against LV 14c.
- **Several files are the same LV in different formats**, which gives ground truth for the parsers: `8209.003` exists as X83, D83, as an award (`[ORT_024] LV24069.D86`) and inside the 136-page dossier `HEM2301-2_Gesamt-LV.pdf`; `[NUMMER_001]_leer.X83` equals `Leistungsverzeichnis_leer.pdf`, `Abgabe LV.pdf` and the award `StBALV23040.D86`; `Angebot AN24-0305` (D84 and PDF) is the bid on `Leistungsverzeichnis.pdf`.
- **The two D84 files carry prices and quantities but almost no text**, as the GAEB bid phase intends. A bid has to be read together with its tender LV.
- **Four PDF print layouts** occur: the AVA "Anfrage" print of the hall project, an ORCA print with integer quantities, an ARCHITEXT Pallas print without price fields, and a contractor's bid print.
- **`[ORT_024] LV24069.D86` has a section of 38 items with quantity 0**: a price list for alternative products. The tool reports it once, not 38 times.

## Sources

bauprofessor.de (Vorarbeiten Angebotskalkulation, ABC-Analyse, Spekulationspreise, Homogenbereich) · blackswanai.de · bauai.eu · baugpt.com · baupruefen.de · documentcrunch.com · buildcheck.ai · civils.ai/blog/can-llms-perform-good-civil-estimates · arxiv.org/abs/2211.07705 · BRZ press release digitalBAU 2026 · bauindustrie-bayern.de (ID 01/2026, ID 06/2026, Leitbild Digitalisierung) · bauindustrie.de (Positionspapier Digitale Transformation) · vergabevorschriften.de/vob-a/7 · dejure.org/gesetze/VOB-B · rechnungshof.baden-wuerttemberg.de (Denkschrift 2020, Beitrag 17) · bvbs.de (Das Freie GAEB Buch) · GAEB XSDs via github.com/Daniel-Jorg-Schuppelius/php-erechnung-toolkit
