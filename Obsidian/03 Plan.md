# Plan, phase by phase

Status as of the morning of 21 Nov 2026. The hackathon ends Sun 22 Nov, 16:00.

## Done overnight

| Phase | Goal | Result |
|---|---|---|
| 0 Research | Know the field, the sponsor, the rules, the data | [[01 Research]] |
| 1 Concept | Best combination of past, present and AI-native | [[02 Concept]] |
| 2 Import | GAEB XML, GAEB 90, PDF, Excel into one data model | Four parsers. Verified on the organisers' files: every LV that exists in two formats gives identical quantities and units (see [[00 Start here]]). |
| 3 Checks | Error detection and plausibility | About 45 checks in `src/core/rules.ts`, knowledge as data in `knowledge.ts` |
| 4 Risk | Scoring, ABC, Nachtrag potential | `engine.ts`; each finding carries claim basis and to-do |
| 5 History | Price suggestions from old projects | `prices.ts`: similarity search, year index, confidence, visible references |
| 6 What-if | Material prices, quantities, Bedarf, surcharges | `whatif.ts` and the Was-wäre-wenn tab |
| 7 AI layer | Semantic review with hallucination control | `llm/review.ts`. Live call written but **not run** (no API key on this Mac). Demo findings produced offline through the same prompt and validator. |
| 8 App | Upload, workbench, exports | React app, six tabs, project view, three exports |
| 9 Quality | Tests and evaluation | 30 tests (11 on the real dataset), seeded-defect evaluation, cross-format comparison, stress test |

## Saturday 21 Nov: make it real

**Done in the morning:** the organisers' 44 files were downloaded and all 43 LVs run through the parsers. Ten parser fixes later, every format pair agrees on quantities and units (table in [[00 Start here]]). Rules were tuned on samples of real findings: 1,521 findings became 623. Ten regression tests now pin the real-data behaviour.

Still to do, in this order. Stop when the time runs out; each step leaves a working demo.

1. **Talk to an estimator (as early as possible).** Ask a mentor from a member company to look at three real LVs in the tool: which findings would you act on, which are noise, what is missing? Then tighten or drop rules. A short, correct list beats a long one.
2. **Live AI (30 min).** Set `ANTHROPIC_API_KEY`, restart, press "KI-Prüfung starten" on one real LV. Check the kept/dropped counter and whether the findings are worth reading. Tune the system prompt in `llm/review.ts` if needed.
3. **The hall project (1 h).** It is loaded as one project of 27 LVs. Go through the interface list and pick two or three gaps you can explain on stage; remember their OZ. The Rolljet item in `LV_18_Estrich` 11.3.30 is the first candidate.
## Sunday 22 Nov: pitch

7. **Freeze by 11:00.** Only wording and bug fixes after that.
8. **Demo script** from [[04 Pitch]], rehearsed twice with a timer, on the real files (the script names them).
9. **Backup:** a screen recording of the full flow, in case the Wi-Fi or the projector fails. The app runs offline anyway; the recording covers a dead laptop.
10. **Slides:** five at most. The `hackathon-demo-deck` skill builds them as one HTML file.

## Later, if this continues after the hackathon

- GAEB 2000 (.P8x) import; OCR for scanned PDFs.
- STLB-Bau and DIN 276 coding for stronger completeness checks.
- Co-occurrence statistics from a real LV archive instead of hand-written trade templates.
- Company playbook: own clauses, own surcharges, own word lists.
- Bid versus tender diff (did the bidder change quantities or texts?).
- Learning from decisions: findings the estimators keep rejecting lose weight.
