# Shovel demo video

`Shovel-Demo.mp4`: 1920×1080, 72 seconds, English voiceover (Kokoro neural voice "am_michael", generated locally) with burned-in subtitles. Recorded from the running app (red-pen document design) on the organisers' real files.

## What it shows

| Time | Scene | Narration |
|---|---|---|
| 0:00 | Title card | This is Shovel. Drop in a bill of quantities, and get it back marked up in red pen. |
| 0:05 | Home, search, open `8209.003` | These are the organisers' real tenders. Open one. |
| 0:09 | The marked-up document; DN 125 vs DN 100 | It is your document, with every problem underlined and a note in the margin. Here: short text DN 125, long text DN 100. |
| 0:18 | Ask the client | One click to ask the client. The question is already written. |
| 0:22 | Bid package: letter, surcharges, files | Your questions become a finished letter, with risk surcharges and a bid draft for your estimating software. |
| 0:28 | Photo of a printed page with marks on it | Only have paper? Take a photo. Shovel draws its marks right on your page. |
| 0:38 | What changed? (demo revision of `PROJEKT_004`) | When the client sends a revised version days before the deadline, Shovel shows exactly what changed: quantities, texts, new items – and the new risks they bring. |
| 0:49 | Hand-over gap in `LV_18_Estrich` | Across a whole building, it finds work that falls between the trades. |
| 0:54 | Mischkalkulation in `Angebot AN24-0305` | And in bids, prices that cannot cover their cost. |
| 0:57 | Closing card | Rules you can trust. Prices from your own projects. AI only where it can quote the source. |

## Rebuild after changing the app or the text

1. Edit `narration.json` (`say` is spoken, `cap` is the subtitle).
2. `.tts/venv/bin/python make-voice.py` – voice clips and timings into `build/`.
3. Start the app (`cd ../../Shovel && npm start`). Make sure `estrich-page-photo.jpg` is **not** in the workspace (the video uploads it live; remove it with `DELETE /api/doc/:id`, the id is in `/api/state`).
4. `node make-demo.mjs` – records the walkthrough timed to the voice and writes `Shovel-Demo.mp4`. The demo revision `GAEB-[PROJEKT_004]_Nachsendung-1_Demo.X83` must be in the workspace (upload it from `Shovel/fixtures/revision/`). Afterwards delete the uploaded photo again.

Needs ffmpeg and the Playwright copy in `../Pitch/node_modules`.
