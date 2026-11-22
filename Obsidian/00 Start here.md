# Start here (21 Nov 2026)

The prototype for Challenge A is built, runs, and has now been run against the organisers' real dataset. The platform is called **Shovel**.

## Run it

```bash
cd Shovel && npm run build && npm start
```

Open http://localhost:8787. The workspace holds the organisers' 43 real files plus the demo revision; it survives restarts. The fictional demo project can be added back with `curl -X POST localhost:8787/api/demo`.

**Demo video:** `Submission/Shovel-Demo.mp4` (made in `Production/Demo/`) – 72 seconds, male Kokoro neural voice, narrated, with subtitles, recorded on the new design.

## How it looks now (night of 21 Nov)

The whole interface was rebuilt around one idea: **the document is the interface.** No dashboard, no agents.

- **Home:** one drop zone and your documents. Each row says in words what is left to do.
- **The document, marked up:** the LV appears as the paper an estimator knows. Problems are underlined in red in the text; each has a note in the margin; one click per note (ask the client, price in, keep as change-order chance, not an issue). A counter shows how many points are left.
- **Red pen on the real paper:** photograph a printed page and the marks are drawn on your photo.
- **Bid package:** the finished letter to the client, the risk surcharges, the change-order list for the site manager, what-if, and the three files.
- **What changed? (the extra):** drop in a revised LV from the client and Shovel shows every changed quantity and text, new and removed items, the money effect, and the new risks that came with the changes. It also notices by itself when two files are the same LV.

For the comparison demo the workspace holds `GAEB-[PROJEKT_004]_Nachsendung-1_Demo.X83`: a copy of a real tender that **we** changed in seven places. Say that when you show it.

## What exists

| | |
|---|---|
| **Platform** | `Shovel/` — marked-up document with margin notes, marks on photographed pages, bid package (letter, surcharges, change-order list, what-if, three exports), version comparison |
| **Notes** | [[01 Research]] · [[02 Concept]] · [[03 Plan]] · [[04 Pitch]] |
| **Real data** | `Shovel/data/` — the 44 files from the organisers' Drive folder (downloaded 21 Nov with your go-ahead) |
| **Demo data** | `Shovel/fixtures/` — six fictional LV files in all four formats, two priced old projects, 67 planted defects |

## Results on the real dataset

All 43 LV files parse (the 44th is a Word list of item groups, not an LV): 3,243 items in total.

**Parser accuracy, measured where the same LV exists in two formats** (`scripts/compare.ts`):

| Pair | Items | Quantity and unit identical |
|---|---|---|
| `8209.003` GAEB XML ↔ GAEB 90 | 159 / 159 | 100 % |
| `PROJEKT_004` GAEB XML ↔ PDF (ORCA print) | 50 / 50 | 100 % |
| `NUMMER_001` GAEB XML ↔ `Leistungsverzeichnis_leer.pdf` (78 pages) | 248 / 248 | 100 % |
| `NUMMER_001` GAEB XML ↔ `Abgabe LV.pdf` | 248 / 248 | 100 % |
| `AN24-0305` bid GAEB 90 ↔ PDF | 274 / 274 | 100 %, unit prices too |
| `8209.003` GAEB XML ↔ `HEM2301-2` (136-page tender dossier) | 159 / 159 | 100 % |

The 28 trade PDFs of the hall project have no second format to compare against. Of their 1,105 items, 3 came out without a quantity.

**Getting there took ten parser fixes** that only the real files could reveal: integer quantities, tables of contents, quantity lines mistaken for page furniture, running section headers, dot-prefixed item numbers, "EP…/GP…" price fields, page-break continuations, LVs wrapped in tender forms (start found via the column header), and a GAEB 90 text marker.

**Findings:** 623 across the 43 files (164 high). Before tuning it was 1,521; the cut came from folding repeated notes into one finding and from tightening rules that misfired.

**Bid files are read together with their tender.** The two GAEB bid files (D84) carry prices but no texts. The app now finds the matching tender LV in the workspace by item number and borrows its texts, so `StBALV23040.D84` and `Angebot AN24-0305.D84` get the full check instead of showing "no findings". A bid without a matching LV is marked as not assessable rather than low-risk.

**Sums are only shown when they mean something.** Where fewer than 60 % of the items have a reference price (most hall trade LVs), the app shows no LV sum, no ABC analysis and no euro exposure, and ranks findings by severity and confidence instead.

**Real defects it finds** (worth showing):
- `8209.003`, pos. 05.01.4 and 05.01.46: short text says DN 125, long text says DN 100.
- `NUMMER_001`, pos. 3.3.4: kerb foundation C20/25 in the short text, C25/30 in the long text.
- `Angebot AN24-0305`: 29 unit prices of a few cents next to a €72,000 site setup (8.5 % of the bid) — the Mischkalkulation pattern.
- Hall project, `LV_18_Estrich` pos. 11.3.30: "Rolljetdämmung wird vom Heizungsbauer verlegt", and no such item exists in any of the other 26 LVs. Caveat: LV 16 is missing from the dataset, so the item may live there.
- Several LVs still cite Bodenklassen, LAGA Z-values, DIN 18195 and BSt 500.

## English mode

The app has a DE | EN switch at the top right of every screen. In English, the whole interface, every finding (title, explanation, legal basis, change-order note) and the Excel report are in English. Three things stay German in both modes, labelled as such: the questions to the client and the letter built from them, the quoted tender text, and the cached AI findings. Decisions made in one language carry over to the other. Known rough edge: some English counts read "1 items".

## AI findings on real LVs

Four real LVs have AI-layer findings, produced offline (31 delivered, 31 passed the quote check): `LV_18_Estrich.pdf`, `LV_12_Dachabdichtung.pdf`, `LV_14c_Industriebodenheizung.pdf`, `GAEB-[PROJEKT_004].X83`. The five fictional demo LVs have them too. They carry an "AI" tag on their margin note. Examples worth showing, none of which a rule could find:

- `LV_14c` pos. 1: pipe spacing given as 15 **mm**; pos. 10: test pressure at least 10 bar, but the manifold is rated to 6 bar.
- `LV_12` pos. 6.2.50: PVC-P membrane required, but one of the named reference products is an FPO membrane; pos. 6.1.30 refers to a position 6.1.80 that does not exist.
- `LV_18` pos. 11.4.10: insulation 80 mm in the short text, 120 mm in the long text.
- `PROJEKT_004` pos. 02.0005: 270 m³ of backfill cannot fit a 500 m³ trench that also takes 230 m³ of bedding and the pipe.

I have not checked these against the PDFs line by line; the quote check only proves the cited words are in the LV, not that the conclusion is right. Verify the ones you want to show.

## Tests

| Check | Result |
|---|---|
| `npm test` | 37 of 37 pass (incl. 2 OCR tests and 3 version-comparison tests), including 11 on the real dataset (skipped automatically if `data/` is absent) and 5 on Excel/CSV layouts |
| `npm run eval` | 67 of 67 planted defects found. I planted them and wrote the checks, so this is a regression test, **not** an accuracy figure |
| `node scripts/stress.ts 5000` | 5,005 items: import 0.16 s, check 0.55 s |
| Exports | Word letter, Excel report and X84 open and re-parse |
| Browser | Demo project and real files clicked through; no console errors |

## What is still not verified

1. **Precision.** I tuned the rules by sampling real findings and removing what was plainly wrong, but nobody who estimates for a living has judged the list. The wording rules ("soweit erforderlich", "bauseits", "einschl. aller Nebenarbeiten") now keep the three most valuable hits per LV and fold the rest into one finding.
2. **The live AI call has never run.** No `ANTHROPIC_API_KEY` on this Mac and the `claude` CLI login has expired. The AI findings shown were produced offline: a Claude subagent answered the production prompt and the answers passed the production quote check. Nine files have them (list under "AI findings on real LVs").
3. **Reference prices.** With the two real award files (D86) loaded, 446 real priced items now back the price suggestions. The 166 seed values in `refprices.ts` are rough orientation values from general knowledge.
4. **Legal references.** VOB/A and VOB/B paragraphs were read at the source. BGH case citations come from search snippets, and two dates (ErsatzbaustoffV 2023, DIN 18195 replacement 2017) from memory.
5. **Quantity-ratio and missing-item checks are thin on real data** (2 and 7 hits). They work on the demo files but real LVs phrase things too variably for hand-written patterns; this is where learning from an LV archive would pay off.

## Your decisions

- **API key** for the live AI layer: `export ANTHROPIC_API_KEY=…` before `npm start`.
- **Name.** Shovel is a placeholder for product and team (three files, see [[02 Concept]]).
- **Solo or team, pitch language, judging criteria:** ask at the venue.
- **Show an estimator.** One mentor from a member company looking at three real LVs is worth more than another day of tuning.

## Housekeeping

- The dataset sits in `Shovel/data/` and a copy in `Shovel/cache/uploads/` (the app's workspace). Both are git-ignored.
- Research subagents saved a few public files (GAEB schemas, sample files) in the session's temp folder.
- No git repository was created; nothing was committed or pushed.
- `Production/Pitch/` holds an unfinished slide-deck draft and four app screenshots from before you said to drop the pitch. Nothing depends on it; delete it if you do not want it. `Shovel/scripts/uishots.mjs` uses the Playwright copy installed there to take review screenshots.
