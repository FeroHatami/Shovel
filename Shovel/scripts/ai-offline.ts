// Offline path for the AI review (used when no API credentials are on the machine):
//   node scripts/ai-offline.ts prompt <lv-file>            -> prints the exact prompt
//   node scripts/ai-offline.ts import <lv-file> <json> [model]  -> validates quotes and writes the cache
import { readFileSync } from 'node:fs';
import { parseFile } from '../src/core/parse/index.ts';
import { analyze } from '../src/core/engine.ts';
import { AI_SYSTEM, buildUserPrompt, saveAiCache, validateAi } from '../src/llm/review.ts';

const [mode, file, json, model] = process.argv.slice(2);
const doc = await parseFile(new Uint8Array(readFileSync(file)), file.split('/').pop()!);
const det = analyze(doc).findings;
if (mode === 'prompt') console.log(AI_SYSTEM + '\n\n=====\n\n' + buildUserPrompt(doc, doc.items, { known: det.map((f) => ({ oz: f.oz, title: f.title })) }));
else {
  const raw = JSON.parse(readFileSync(json, 'utf8')).findings;
  const { drafts, dropped } = validateAi(doc, raw);
  const kept = raw.filter((r: any) => drafts.some((d) => d.title === String(r.title).slice(0, 160)));
  saveAiCache(doc, kept, model || 'claude (offline)');
  console.log(`${doc.fileName}: ${raw.length} Befunde geliefert, ${drafts.length} belegt, ${dropped} verworfen (Zitat nicht im LV gefunden)`);
}
