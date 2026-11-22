# Pitch and demo script

Brief: "Pitch from an estimator's perspective: how does the prototype change the bidding process?" Target length: 3 minutes talk and demo together. Adjust once the format is announced.

## The story in one breath (new design, 21 Nov night)

"Drop in the LV. Get it back marked up in red pen, like a senior colleague went through it. One click per note. The letter to the client writes itself. And when the client sends a revised LV two days before the deadline, Shovel shows what changed."

Demo order in the app: Home → open `8209.003…X83` → click "2 critical" (DN 125 vs DN 100) → "Ask the client" → "Bid package" → back home, "Take a photo" with `Demo/assets/estrich-page-photo.jpg` → open the `…Nachsendung-1_Demo.X83` and click the compare button. The script below still holds for what to say; the screen names in it are from the older design.

## The story in five lines

1. An LV has thousands of items. The estimator has days. Nobody reads all of it.
2. What slips through becomes a Nachtrag, a dispute or a loss.
3. Shovel reads every item in seconds and puts the expensive problems first.
4. It hands back what the estimator would have written anyway: Bieterfragen, surcharges, and a Nachtrag list for the site manager.
5. Every finding shows its quote. The estimator decides. The prices stay in the house.

## Script (English; say the German terms as they are)

**Opening (20 s).** "The Rechnungshof Baden-Württemberg looked at 48 large public projects. One order for inspection hatches, Revisionsklappen, started at 50,000 euros and ended at almost 600,000 after five change orders. Their finding: gaps in the Leistungsverzeichnis open the door for Nachträge. Every estimator knows this. Nobody has the time to read 3,000 items twice."

**What it is (15 s).** "Shovel digs through the bill of quantities for you. You drop in the LV, GAEB, PDF or Excel, and before you have opened your estimating software you know where the money is at risk."

**Demo, part 1: one real LV (60 s).** Drop `8209.003_Leistungsverzeichnis_leer.X83` from the organisers' dataset.
- Overview: "159 items, checked in well under a second. These are your files, not ours."
- Open Befunde, click "Widerspruch Kurztext / Langtext: Nennweite" (pos. 05.01.4): "Short text: stainless pipe DN 125. Long text: DN 100. Which one do I price? Nobody planted that; it is in the tender." Point at the highlighted quote.
- Press **F**: "That is now a Bieterfrage." Open the Bieterfragen tab: "The letter is written. Word file, one click."
- One sentence on formats: "The same LV is in the dataset as GAEB 90, GAEB XML and inside a 136-page PDF dossier. We read all three and get the same quantities."

**Demo, part 2: the project (40 s).** Click the project "79-222 Ausbildungszentrum und Bürogebäude" (27 LVs).
- "A building is twenty-seven LVs. The screed LV, position 11.3.30, says the insulation is laid by the heating contractor. Shovel looked into the other 26 LVs and did not find it. That is the Revisionsklappen story before it happens." (If asked: LV 16 is missing from the dataset, so the item may be there. The tool says "not found in these LVs", which is exactly what an estimator needs to ask about.)

**Demo, part 3: a real bid (30 s).** Open `Angebot AN24-0305.pdf`.
- "Before a bid leaves the house. This one has 29 unit prices of a few cents, a fence at ten cents a metre, next to a 72,000 euro site setup. That pattern gets a bid excluded, and every extra metre is a loss."

**Fallback demo** if the real files misbehave: the fictional project (`Demo_…` files) has 67 planted defects and AI findings for every LV, e.g. `Demo_18_Estrich.pdf`, filter "KI": 85 m³ of bonded screed at 50 mm would cover 1,700 m².

**How it works (20 s).** "Three layers. Rules, the same every time. Statistics against your own old projects. And AI only for what needs construction sense, and only if it can quote the LV word for word. Findings without a literal quote are discarded before you see them."

**Close (15 s).** "The estimator stays in charge: ask, price in, keep as a Nachtrag chance, or reject. The unit prices never leave the company. One caught error pays for the tool. Shovel: no bid leaves unchecked."

## Lines for the BBIV audience

- Their own guide says what matters is "gute Daten und qualifizierte Teams". This tool makes the estimator faster; it does not replace the estimator.
- Their position paper asks for "Minimierung von Fehlerkosten" and "Datenhoheit". Rules and price history run locally; the AI layer is optional.
- Streitvermeidung (their podcast topic): a question asked before the bid is a dispute that never happens.
- It helps both sides. Better questions before the award mean cleaner contracts for the client as well.

## Questions to expect

| Question | Answer |
|---|---|
| How accurate is it? | Reading: wherever your dataset has the same LV in two formats, we get identical quantities and units, 100 % on all six pairs. Finding: all 67 defects we planted in test files are found, but that is a regression test, not an accuracy claim. Real precision needs an estimator's judgement; the accept/reject decisions made in the tool are the data for that. |
| Does it hallucinate? | The rules cannot. The AI layer can, which is why every AI finding must quote the LV literally and is dropped otherwise. The interface shows how many were dropped. |
| Where do the prices come from? | From similarity search over your own priced LVs, adjusted by year. Without history it falls back to rough orientation values that are labelled as such. The LLM never states a price. |
| Is exploiting LV errors not unfair to the client? | The default action is the Bieterfrage. The tool pushes towards clarifying before the bid. The Nachtrag list is for what stays open after the answers. |
| What about our data? | Everything except the optional AI call runs on your machine. The AI layer can point at an EU-hosted or on-premise model. Nothing is used for training. |
| How is this different from BlackSwanAI or BAU AI? | They summarise documents with an LLM. We check quantities against each other, price against your history, check interfaces across the LVs of a project, and the deterministic layer works with no model at all. |
| Does it fit our software? | It reads GAEB 90 and GAEB XML from any AVA tool and writes X84 back, so it sits in front of iTWO, Nevaris, California or BRZ without an integration project. |
| Is this legal advice? | No. The findings are review notes with the VOB reference as orientation. |

## Facts that are safe to state

See [[01 Research]], section 6. Do not quote case law or time savings; neither is verified.
