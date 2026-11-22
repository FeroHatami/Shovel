# Shovel – submission

TUM.ai Construction Hackathon 2026, Challenge A (errors and risks in bills of quantities).

Shovel reads a bill of quantities (GAEB, PDF, Excel or a photo) and hands it back marked up in red pen: contradictions, gaps and price risks are underlined in the document, each with a note in the margin and a drafted question to the client. One click per note produces the bid package. "What changed?" compares two versions of one bill of quantities.

| File | What it is |
|---|---|
| `Shovel-Demo.mp4` | Demo video, 72 seconds, narrated with subtitles, recorded from the running app on the organisers' files |
| `Shovel-Slides.pdf` | Pitch slides, 7 pages |
| `Shovel-Source.zip` | Source code of the prototype |

## Run the prototype

Needs Node 23.6 or newer. Text recognition for photos and scans needs macOS.

```bash
unzip Shovel-Source.zip
cd Shovel
npm install
npm run build
npm start
```

Open http://localhost:8787 and drop in a file. The dataset from the organisers is not in the archive; the demo files in `fixtures/` are our own.
