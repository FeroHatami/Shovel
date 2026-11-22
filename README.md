# Shovel

AI counter-check for construction bills of quantities (German: Leistungsverzeichnis, LV). Built for the TUM.ai Construction Hackathon 2026, Challenge A.

Drop in a bill of quantities (GAEB, PDF, Excel or a photo) and get it back marked up in red pen: contradictions, gaps and price risks are underlined in the document itself, each with a note in the margin and a drafted question to the client. One click per note produces the bid package. "What changed?" compares two versions of one bill of quantities.

**Watch the demo:** [`Submission/Shovel-Demo.mp4`](Submission/Shovel-Demo.mp4) (72 seconds) · **Slides:** [`Submission/Shovel-Slides.pdf`](Submission/Shovel-Slides.pdf)

## Run it

Needs Node 23.6 or newer. Text recognition for photos and scans needs macOS.

```bash
cd Shovel
npm install
npm run build
npm start
```

Open http://localhost:8787 and drop in a file. Demo files are in `Shovel/fixtures/`.

## What is where

| Folder | Contents |
|---|---|
| `Submission/` | The hand-in: demo video, slides, source archive |
| `Shovel/` | The prototype (parsers, checks, server, web interface, tests) |
| `Production/` | Scripts that record the video and build the slides |
| `Obsidian/` | Research, concept, plan and pitch notes |

The organisers' dataset is not part of this repository.
