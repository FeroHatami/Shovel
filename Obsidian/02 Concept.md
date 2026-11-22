# Concept: Shovel

**Shovel digs through a Leistungsverzeichnis before you bid on it.** The name was chosen by the project owner on 21 Nov 2026. It appears in the sidebar and logo (`web/src/App.tsx`), the page title and browser icon (`web/index.html`), and `package.json`.

## The one-sentence idea

Take the estimator's own pre-bid review, run the reliable parts as code, add statistics from the company's old projects, let an LLM judge only what needs construction sense, and hand back the three things an estimator actually produces: **Bieterfragen, Risikozuschläge, and a Nachtrag list for the site manager.**

## What we took from each era

| Era | What we kept | Where it lives |
|---|---|---|
| **Past** (the estimator's craft) | Formal checks, arithmetic, ABC ranking, quantity spot checks, Nebenleistung vs. Besondere Leistung, the Bieterfrage as the output | `rules.ts`, `engine.ts`, the Bieterfragen tab |
| **Present** (rules and benchmarks) | Price bands from own priced LVs, outlier statistics, trade detection for "expected but missing" checks | `prices.ts`, `knowledge.ts` |
| **AI-native** | Semantic judgement on wording, contradictions and scope; drafting | `llm/review.ts` |
| **Left out on purpose** | Automatic pricing, LLM-generated prices or quantities, go/no-go scoring, a chat window | — |

## Design rules

1. **Three layers, clearly labelled.** Every finding shows whether it comes from a rule, from statistics or from the AI. Rules and statistics are deterministic: same LV, same result. This is what makes it defensible in front of an estimator.
2. **Every finding quotes the LV.** OZ plus the literal text span, highlighted in the item. AI findings whose quote is not found word for word in the LV are thrown away before the user sees them. The count of discarded findings is shown.
3. **Numbers are computed, never generated.** Prices come from similarity search over reference items; the LLM is told not to state prices.
4. **Everything is weighted by money.** Score = severity × confidence × log(affected value). The list opens with what costs the most, not with typos.
5. **The estimator decides.** Per finding: ask (Bieterfrage), price in (Zuschlag), keep as Nachtrag chance, or reject. Keyboard driven. The exports follow the decisions.
6. **Data stays in the house.** Rules and statistics run locally with no network. The price history is the company's own files. The AI layer is optional and can be switched to any hosted or on-premise model.
7. **No legal advice.** Findings are worded as review notes, with the VOB reference as orientation.

## What it checks (about 40 checks)

| Group | Examples |
|---|---|
| **Errors** | Duplicate OZ, quantity missing or zero, unit missing, quantity × EP ≠ GP, section sum wrong, lump sum with quantity ≠ 1, mixed unit spellings (St/Stk), numbering gaps, identical items, typos (dictionary + rare-word comparison within the LV) |
| **Unclear descriptions** | "nach Wahl des AG", "nach Erfordernis", "ca.", "o. ä.", "in Abstimmung mit", missing price-defining data (concrete class, pipe DN, screed thickness, soil description, disposal class), "wie vor" without a reference, product without "oder gleichwertig" |
| **Contradictions** | Kurztext vs. Langtext (class, thickness, DN), unit vs. "Abrechnung nach …", unit vs. type of work, references to withdrawn standards (Bodenklassen, LAGA, DIN 18195, DIN 1045-1, BSt 500, EnEV …) |
| **Missing items** | Per-trade templates for 13 trades (e.g. excavation without disposal, concrete without formwork, screed without edge strips, flooring without subfloor preparation), flagged as Besondere Leistung where DIN 18299 4.2 applies |
| **Quantities** | Placeholder quantity 1, supply vs. laying mismatch, reinforcement per m³ concrete, disposal vs. excavation, backfill vs. excavation |
| **Contract risk** | Risk-shifting clauses in preambles, "in die Einheitspreise einzurechnen", completeness clauses, penalties, share of Bedarfspositionen, vague lump sums, hourly work |
| **Interfaces** | Statements that rely on another trade ("wird vom Heizungsbauer verlegt"). In project mode the counter-item is searched in the other LVs of the same project |
| **Prices** (priced files) | Zero and negative prices, speculative low prices, outliers against the reference band, Mischkalkulation pattern |
| **Bidder to-dos** | Fields the bidder must fill in, plans and annexes the items refer to |

## What the user gets

- **Übersicht:** risk score, findings by severity, estimated LV sum, affected value, suggested surcharge, top six findings, risk per section, ABC.
- **Befunde:** the workbench. Filter, read the quote in context, decide.
- **Positionen:** all items with price suggestion, value, ABC class, risk bar.
- **Bieterfragen:** the finished letter, editable, as Word file.
- **Nachtragspotenzial:** claim basis and what the site manager must do before execution.
- **Was-wäre-wenn:** material price sliders (steel, concrete, bitumen, diesel, plastics, labour), quantity scenario with the § 2 Abs. 3 VOB/B effect, Bedarfspositionen on or off, surcharges on or off.
- **Projektsicht:** all trade LVs of one building, with the interface list.
- **Exports:** Bieterfragen (.docx), review report (.xlsx, five sheets), bid draft as GAEB X84 with price suggestions and surcharges for import into the estimating software.

## Where we are stronger than what exists

- Quantity plausibility through ratios inside the LV: no vendor advertises this.
- Nachtrag potential tied to a claim basis and a to-do, not a paragraph of prose.
- Cross-trade interface check across the LVs of one project.
- One list that merges rules, statistics and AI, ranked in euros.
- An evaluation with seeded defects that anyone can re-run (`npm run eval`).
- Checks 5,000 items in under a second without any model call.

## Architecture

```
upload ─► parse (GAEB XML · GAEB 90 · PDF · Excel) ─► one data model (LVDocument)
                                                         │
          price book (seed + own priced LVs) ─► price suggestion per item ─► item value
                                                         │
                    rules ─┬─ statistics ─┬─ AI (quote-validated) ─► findings
                                                         │
                         scoring (severity × confidence × value) ─► ranking, risk score, ABC
                                                         │
             workbench (decide) ─► Bieterfragen .docx · report .xlsx · bid draft .X84 · what-if
```

- **Stack:** Node 26 runs the TypeScript directly (no build step for the server). Hono API, React + Vite front end, pdf.js, fast-xml-parser, exceljs, docx.
- **AI layer:** Anthropic SDK, `claude-opus-5-5`, adaptive thinking, structured JSON output, prompt caching on the system prompt, items reviewed in chunks of 60. Results are cached per file in `cache/ai/`.
