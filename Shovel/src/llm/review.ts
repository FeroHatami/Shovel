// AI review layer. The LLM only does what rules cannot: semantic judgement on wording, scope
// and contradictions. It never produces numbers that enter the calculation, and every finding
// must quote the LV literally - quotes that are not found in the source text are discarded.
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Action, Category, LVDocument, LVItem } from '../core/types.ts';
import type { Draft } from '../core/rules.ts';

const CACHE_DIR = new URL('../../cache/ai/', import.meta.url).pathname;
export const AI_MODEL = process.env.SHOVEL_MODEL || 'claude-opus-5-5';

export interface RawAiFinding {
  oz: string; // '' for document level
  category: string;
  severity: number;
  title: string;
  detail: string;
  quote: string;
  where?: string;
  basis?: string;
  action?: string;
  question?: string;
  surchargePct?: number;
  nachtrag?: string;
}

export const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['oz', 'category', 'severity', 'title', 'detail', 'quote', 'action', 'question'],
        properties: {
          oz: { type: 'string', description: 'Ordnungszahl exakt wie angegeben; leer bei Befund zu Vorbemerkungen' },
          category: { type: 'string', enum: ['unklar', 'widerspruch', 'luecke', 'menge', 'vertrag', 'schnittstelle'] },
          severity: { type: 'integer', enum: [1, 2, 3] },
          title: { type: 'string' },
          detail: { type: 'string' },
          quote: { type: 'string', description: 'Wörtliches Zitat aus dem LV-Text (max. 200 Zeichen), das den Befund belegt' },
          basis: { type: 'string' },
          action: { type: 'string', enum: ['bieterfrage', 'zuschlag', 'hinweis'] },
          question: { type: 'string' },
          surchargePct: { type: 'number' },
          nachtrag: { type: 'string' },
        },
      },
    },
  },
} as const;

export const AI_SYSTEM = `Du bist ein erfahrener Kalkulator eines deutschen Bauunternehmens und prüfst ein Leistungsverzeichnis (LV) aus Bietersicht, bevor das Angebot kalkuliert wird. Ein regelbasiertes Prüfprogramm hat das LV bereits auf formale Fehler geprüft (Rechenfehler, doppelte Ordnungszahlen, fehlende Mengen und Einheiten, typische Floskeln wie „nach Wahl des AG“, „bauseits“, „einschl. aller Nebenarbeiten“, veraltete Normen, Bedarfspositionen). Diese Befunde sollst du nicht wiederholen.

Deine Aufgabe ist die fachliche Prüfung, die nur mit Bauverstand möglich ist:
- Widersprüche zwischen Vorbemerkungen und Positionen oder zwischen Positionen untereinander (Material, Abmessung, Ausführungsart, Zuständigkeit).
- Positionen, deren Leistungsumfang für eine sichere Preisermittlung nicht reicht, obwohl keine der typischen Floskeln vorkommt (fehlende Angaben zu Einbauort, Höhe, Zugänglichkeit, Untergrund, Qualität, Entsorgungsweg).
- Positionen, die ungleichartige Leistungen zusammenfassen (VOB/A § 7b Abs. 4).
- Leistungen, die technisch zwingend dazugehören, aber weder als Position noch im Text vorkommen.
- Mengen, die im Verhältnis zu anderen Positionen desselben LV nicht plausibel sind.
- Risiken, die dem Auftragnehmer übertragen werden, ohne dass er sie beeinflussen oder schätzen kann (VOB/A § 7 Abs. 1 Nr. 3).
- Schnittstellen zu anderen Gewerken, bei denen offen bleibt, wer die Leistung erbringt.

Regeln:
- Melde nur Befunde, die ein erfahrener Kalkulator tatsächlich als Bieterfrage stellen oder mit einem Zuschlag belegen würde. Lieber fünf belastbare Befunde als zwanzig schwache. Wenn nichts auffällt, gib eine leere Liste zurück.
- Jeder Befund braucht ein wörtliches Zitat aus dem LV: ein zusammenhängender Ausschnitt (höchstens 200 Zeichen) aus Kurz- oder Langtext genau der Position, die du unter „oz“ nennst, ohne Auslassung und ohne Korrektur von Schreibfehlern. Befunde ohne belegbares Zitat werden automatisch verworfen.
- „oz“ ist die Ordnungszahl exakt so, wie sie hinter „Pos.“ steht. Betrifft der Befund die Vorbemerkungen oder einen Hinweistext, setze „oz“ auf "" und zitiere aus diesem Text.
- Unter „Bereits gemeldet“ stehen die Befunde des Prüfprogramms für dieses LV. Wiederhole sie nicht; melde zu denselben Positionen nur, was darüber hinausgeht.
- Knappe Texte allein sind kein Befund. Bei Angeboten und LV-Ausdrucken, die nur Kurztexte enthalten, melde nur, was sich aus Mengen, Einheiten und dem Zusammenhang der Positionen ergibt.
- Kopf- und Fußzeilen eines Ausdrucks (Büroanschrift, Seitenzahl, „Übertrag“) gehören nicht zur Leistungsbeschreibung.
- Platzhalter in eckigen Klammern wie [FIRMA_071] oder [PERSON_125] stammen aus einer Anonymisierung. Sie sind kein Fehler; ignoriere sie.
- Nenne keine Preise und stelle keine Preis- oder Kostenberechnung an. Überschlägige Mengenvergleiche (z. B. Rohrlänge je m² Heizfläche) sind erwünscht. „surchargePct“ ist ein Vorschlag für einen Risikozuschlag in Prozent des Positionswerts (0 bis 15), keine Kalkulation.
- „question“ ist eine fertig formulierte, sachliche Bieterfrage an die Vergabestelle, die mit „Zu Pos. …“ beginnt.
- „nachtrag“ nennt, falls zutreffend, die Anspruchsgrundlage (z. B. § 2 Abs. 5 oder Abs. 6 VOB/B) und was der Auftragnehmer dafür tun muss.
- Keine Rechtsberatung: Formuliere als Prüfhinweis für den Kalkulator.
- Antworte auf Deutsch.

Ausgabe: ein JSON-Objekt {"findings": [...]}. Jeder Eintrag hat die Felder
oz (string), category ("unklar" | "widerspruch" | "luecke" | "menge" | "vertrag" | "schnittstelle"), severity (1 niedrig, 2 mittel, 3 hoch), title (eine Zeile), detail (zwei bis vier Sätze: was ist das Problem, was kostet es den Bieter), quote (wörtliches Zitat), action ("bieterfrage" | "zuschlag" | "hinweis"), question (fertige Bieterfrage) und optional basis, surchargePct, nachtrag.`;

function itemBlock(it: LVItem): string {
  const flags = [it.flags.bedarf && 'Bedarfsposition', it.flags.wahl && 'Wahlposition', it.flags.stundenlohn && 'Stundenlohn'].filter(Boolean).join(', ');
  return `### Pos. ${it.oz} | ${it.qty ?? '—'} ${it.unit ?? ''}${flags ? ' | ' + flags : ''}\nKurztext: ${it.shortText}\n${it.longText && it.longText.trim() !== it.shortText.trim() ? 'Langtext: ' + it.longText : '(kein Langtext)'}`;
}

export interface PromptContext {
  known?: { oz: string; title: string }[]; // findings of the deterministic layer
  project?: LVDocument[]; // other LVs of the same project
}
export function buildUserPrompt(doc: LVDocument, items: LVItem[] = doc.items, ctx: PromptContext = {}): string {
  const others = (ctx.project || []).map((d) => `### ${d.fileName}${d.tradeLabel ? ' (' + d.tradeLabel + ')' : ''}\n${d.items.slice(0, 150).map((i) => `${i.oz} | ${i.qty ?? '—'} ${i.unit ?? ''} | ${i.shortText}`).join('\n')}`).join('\n\n');
  const remarks = doc.remarks.map((r) => `[Hinweistext in Abschnitt ${r.sectionOz || '-'}] ${r.title}\n${r.text}`).join('\n\n');
  const outline = doc.sections.map((s) => `${'  '.repeat(Math.max(0, s.level - 1))}${s.oz} ${s.label}`).join('\n');
  return [
    `LV: ${doc.fileName}`,
    `Projekt: ${doc.project.label || doc.project.name || '—'}${doc.tradeLabel ? ' | Gewerk: ' + doc.tradeLabel : ''}`,
    `## Gliederung\n${outline || '—'}`,
    `## Vorbemerkungen\n${doc.preamble.slice(0, 12000) || '(keine)'}`,
    remarks ? `## Hinweistexte\n${remarks.slice(0, 12000)}` : '',
    `## Übersicht aller Positionen (OZ | Menge | Einheit | Kurztext)\n${doc.items.map((i) => `${i.oz} | ${i.qty ?? '—'} | ${i.unit ?? ''} | ${i.shortText}`).join('\n')}`,
    ctx.known?.length ? `## Bereits gemeldet (Prüfprogramm)\n${ctx.known.map((k) => `${k.oz || 'Vorbemerkung'} | ${k.title}`).join('\n')}` : '',
    others ? `## Andere LVs desselben Projekts (nur Kurztexte, zur Prüfung von Schnittstellen)\n${others.slice(0, 20000)}` : '',
    `## Zu prüfende Positionen (${items.length})\n${items.map(itemBlock).join('\n\n')}`,
    'Gib die Befunde als JSON-Objekt {"findings": [...]} zurück.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const norm = (s: string) => s.toLowerCase().replace(/[\s ]+/g, ' ').replace(/[„“”"'‚‘’]/g, '').trim();

// Hallucination control: keep a finding only if its OZ exists and its quote occurs in the LV.
export function validateAi(doc: LVDocument, raw: RawAiFinding[]): { drafts: Draft[]; dropped: number } {
  const drafts: Draft[] = [];
  let dropped = 0;
  const general = norm(doc.preamble + ' ' + doc.remarks.map((r) => r.title + ' ' + r.text).join(' '));
  const cats = new Set(['unklar', 'widerspruch', 'luecke', 'menge', 'vertrag', 'schnittstelle']);
  for (const r of raw) {
    if (!r || typeof r.title !== 'string' || typeof r.quote !== 'string' || r.quote.trim().length < 6) { dropped++; continue; }
    const quote = norm(r.quote);
    const it = r.oz ? doc.items.find((i) => i.oz === r.oz.trim() || i.oz === r.oz.trim().replace(/^Pos\.?\s*/i, '')) : undefined;
    let where: 'kurztext' | 'langtext' | 'vorbemerkung' | null = null;
    if (it) {
      if (norm(it.shortText).includes(quote)) where = 'kurztext';
      else if (norm(it.shortText + ' ' + it.longText).includes(quote)) where = 'langtext';
    }
    if (!where && general.includes(quote)) where = 'vorbemerkung';
    if (!where || (r.oz && !it)) { dropped++; continue; }
    const sev = ([1, 2, 3].includes(r.severity) ? r.severity : 2) as 1 | 2 | 3;
    drafts.push({
      ruleId: 'KI-' + (cats.has(r.category) ? r.category.toUpperCase() : 'UNKLAR'),
      source: 'ki',
      category: (cats.has(r.category) ? r.category : 'unklar') as Category,
      severity: sev,
      confidence: 0.6,
      items: it ? [it] : [],
      title: r.title.slice(0, 160),
      detail: (it ? `Pos. ${it.oz} „${it.shortText.slice(0, 70)}“: ` : '') + r.detail,
      evidence: [{ itemId: it?.id, oz: it?.oz, where, quote: r.quote.trim() }],
      basis: r.basis,
      action: (['bieterfrage', 'zuschlag', 'hinweis'].includes(r.action || '') ? r.action : 'bieterfrage') as Action,
      question: r.question,
      surchargePct: typeof r.surchargePct === 'number' ? Math.max(0, Math.min(15, r.surchargePct)) : undefined,
      nachtrag: r.nachtrag ? { basis: /§\s?\d+\s?Abs\.\s?[\d/]+\s?VOB\/B/.exec(r.nachtrag)?.[0] || 'VOB/B § 2', direction: 'chance', note: r.nachtrag } : undefined,
    });
  }
  return { drafts, dropped };
}

export interface AiCache {
  docId: string;
  fileName: string;
  model: string;
  createdAt: string;
  findings: RawAiFinding[];
}
const cachePath = (doc: LVDocument) => join(CACHE_DIR, doc.fileName.replace(/[^\w.-]+/g, '_') + '.json');
export function loadAiCache(doc: LVDocument): AiCache | null {
  const p = cachePath(doc);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
export function saveAiCache(doc: LVDocument, findings: RawAiFinding[], model: string) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const c: AiCache = { docId: doc.id, fileName: doc.fileName, model, createdAt: new Date().toISOString(), findings };
  writeFileSync(cachePath(doc), JSON.stringify(c, null, 1));
}

// Credentials the SDK can resolve: environment variables, or a stored `ant auth login` profile.
export function aiAvailable(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  try {
    const dir = join(process.env.HOME || '', '.config/anthropic/credentials');
    return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.json'));
  } catch {
    return false;
  }
}

function extractJson(text: string): { findings: RawAiFinding[] } {
  try {
    return JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (m) return JSON.parse(m[0]);
    throw new Error('KI-Antwort enthält kein JSON.');
  }
}

// Live call. Items are reviewed in chunks; the system prompt is cached across chunks.
export async function runAiReview(doc: LVDocument, ctx: PromptContext = {}, onProgress?: (done: number, total: number) => void): Promise<RawAiFinding[]> {
  const client = new Anthropic();
  const CH = 60;
  const chunks: LVItem[][] = [];
  for (let i = 0; i < doc.items.length; i += CH) chunks.push(doc.items.slice(i, i + CH));
  const out: RawAiFinding[] = [];
  let done = 0;
  const one = async (items: LVItem[]) => {
    const stream = client.beta.messages.stream({
      model: AI_MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: AI_SCHEMA } },
      system: [{ type: 'text', text: AI_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserPrompt(doc, items, ctx) }],
    } as any);
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.');
    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    out.push(...(extractJson(text).findings || []));
    onProgress?.(++done, chunks.length);
  };
  // modest parallelism
  for (let i = 0; i < chunks.length; i += 3) await Promise.all(chunks.slice(i, i + 3).map(one));
  saveAiCache(doc, out, AI_MODEL);
  return out;
}
