# Shovel

LV counter-check for estimators. TUM.ai Construction Hackathon 2026, Challenge A.
Concept, research, plan and pitch are in `../Obsidian/`. Final deliverables are in `../Submission/`.

## Run

```bash
npm install
npm run build
npm start
```

Open http://localhost:8787 and drop in a file (GAEB, PDF, Excel or a photo). The interface: Home → the marked-up document with margin notes → bid package; "What changed?" compares two versions of one LV. Needs Node 23.6 or newer (the server runs the TypeScript sources directly).

For front-end work with hot reload, run `npm start` in one terminal and `npx vite` in another, then open http://localhost:5173.

## Commands

| Command | What it does |
|---|---|
| `npm test` | 37 tests: parsers, round trips, Excel/CSV layouts, rules, price book, AI quote validation, version comparison, text recognition, and the real dataset in `data/` (skipped if absent) |
| `node scripts/make-revision.mjs` | Writes the demo revision of a real tender for "What changed?" into `fixtures/revision/` |
| `node scripts/uishots.mjs <dir>` | Screenshots of every screen (app must run on :8787) |
| `npm run eval` | Runs all demo LVs and reports how many seeded defects are found |
| `npm run eval -- data --verbose` | Same statistics for any folder of real LVs, with every finding listed |
| `npm run fixtures` | Regenerates the demo LVs and `fixtures/ground-truth.json` |
| `node scripts/stress.ts 5000` | Builds a 5,000-item LV and times import and check |
| `node scripts/compare.ts <a> <b> --show` | Parser cross-check: the same LV in two formats must give the same items |
| `node scripts/sample.ts data <RULE-ID> 10` | Random findings of one rule with their quotes, for judging false positives |
| `node scripts/pdflines.ts <pdf> [from] [count]` | The text lines the PDF parser sees, with x/y position |

## AI layer

Set `ANTHROPIC_API_KEY` before `npm start`. The button "Run AI check" in the left rail of a document then calls `claude-opus-5-5` (override with `SHOVEL_MODEL`). Results are cached per file name in `cache/ai/`. Without a key the app shows the cached findings and everything else works offline.

`scripts/ai-offline.ts` prints the exact prompt for a file and imports an answer through the same quote validation. The cached findings for the demo LVs were produced this way.

## Layout

```
src/core/
  types.ts            data model shared by everything
  parse/              gaebxml.ts · gaeb90.ts (reader + writer) · pdf.ts · excel.ts
  knowledge.ts        wording rules, norms, trade templates, typo list (plain data)
  rules.ts            the deterministic checks
  prices.ts           price book: seed values + own priced LVs, similarity search
  refprices.ts        seed orientation prices and cost drivers (rough, not verified)
  engine.ts           pipeline, scoring, ABC, surcharges, folding of repeated findings
  companion.ts        pairs a price-only bid file (D84/X84) with its tender LV by item number
  whatif.ts           scenario maths (also used in the browser)
  export/             gaebxml.ts (X84 writer) · docs.ts (Bieterfragen .docx, report .xlsx)
src/llm/review.ts     prompt, schema, live call, cache, quote validation
server/index.ts       Hono API + static front end
web/src/              React app
fixtures/             generated demo project, price history, ground truth
data/                 put real LVs here; the app shows a "Datensatz laden" button
```

## Extending the checks

Most changes are data, not code. In `src/core/knowledge.ts`:

- `VAGUE`: a regex, a title, the reason, the VOB reference, a severity, a surcharge and what the Bieterfrage asks for.
- `NORMS`: withdrawn standard → current one.
- `TRADES`: per trade, the items an estimator expects to see.
- `REQUIRED`: per item type, the data without which it cannot be priced.
- `RATIOS`: plausible ranges between groups of items.

Run `npm run eval` after every change.
