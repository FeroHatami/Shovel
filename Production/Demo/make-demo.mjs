// Records the one-minute Shovel demo: drives the running app (http://localhost:8787) in a browser,
// timed to the voiceover clips in build/, then muxes video, voice and subtitles into Shovel-Demo.mp4.
//   1. python3 make-voice.py   (voiceover clips + build/timing.json from narration.json)
//   2. node make-demo.mjs      (needs the app running on :8787)
// Frames are taken with the browser's screencast at 1920 x 960 (sharp text), not with Playwright's
// low-resolution video recorder.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const here = new URL('./', import.meta.url).pathname;
const require = createRequire(here + '../Pitch/');
const { chromium } = require('playwright');

const T = JSON.parse(readFileSync(here + 'build/timing.json', 'utf8'));
const S = Object.fromEntries(T.map((s) => [s.id, s]));
// The app is laid out at 1440 x 720 and scaled up 4/3 by CSS inside a 1920 x 960 window, so the
// screencast frames are native 1920 x 960 with sharp text. A 120 px subtitle band is added below.
const W = 1920, H = 960, K = 4 / 3;
const FR = process.env.FRAMES_DIR || here + 'build/frames-raw';
const GAP = 0.35; // pause after each sentence

// Visible cursor and click ripple (Playwright's video does not show the real mouse).
const OVERLAY = `(() => {
  try { localStorage.setItem('shovel-tour-done', '1'); localStorage.setItem('shovel-lang', 'en'); } catch (e) {}
  const scale = () => {
    const st = document.createElement('style');
    st.textContent = 'html{overflow:hidden!important;background:#f3f1ec}body{width:1440px!important;height:720px!important;overflow-y:auto!important;overflow-x:hidden!important;transform:scale(1.3333333);transform-origin:0 0}.pages,.rail{max-height:620px!important}.rv-top{position:sticky}';
    document.documentElement.appendChild(st);
  };
  if (document.documentElement) scale(); else document.addEventListener('DOMContentLoaded', scale);
  addEventListener('hashchange', () => { if (document.body) document.body.scrollTop = 0; });
  if (location.protocol === 'file:') return;
  const mk = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div');
    c.id = '__cur';
    c.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:rgba(255,107,26,.10);border:3px solid #ff6b1a;box-shadow:0 0 0 2px rgba(255,255,255,.85);z-index:2147483647;pointer-events:none;transform:translate(960px,480px)';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:' + (e.clientX - 8) + 'px;top:' + (e.clientY - 8) + 'px;width:16px;height:16px;border-radius:50%;border:3px solid #ff6b1a;z-index:2147483646;pointer-events:none;transition:all .5s ease-out';
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.left = (e.clientX - 30) + 'px'; r.style.top = (e.clientY - 30) + 'px'; r.style.width = '60px'; r.style.height = '60px'; r.style.opacity = '0'; }));
      setTimeout(() => r.remove(), 700);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk();
})();`;

rmSync(FR, { recursive: true, force: true });
mkdirSync(FR, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-US' });
await ctx.addInitScript(OVERLAY);
const page = await ctx.newPage();
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', async (e) => {
  const file = `${FR}/${String(frames.length + 1).padStart(6, '0')}.jpg`;
  writeFileSync(file, Buffer.from(e.data, 'base64'));
  frames.push({ file, ts: e.metadata.timestamp ?? Date.now() / 1000 });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }); } catch {}
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: 1920, maxHeight: 960, everyNthFrame: 1 });
const tVid = Date.now();
const now = () => (Date.now() - tVid) / 1000;
const wait = (ms) => page.waitForTimeout(ms);
const marks = [];

async function scene(id, fn) {
  const start = now();
  marks.push({ id, start });
  await fn();
  const left = start + S[id].dur + GAP - now();
  if (left > 0) await wait(left * 1000);
  else console.log(`scene ${id} ran ${(-left).toFixed(2)} s longer than its sentence`);
}

let pos = { x: W / 2, y: H / 2 };
async function glide(x, y, ms = 520) {
  const n = Math.max(10, Math.round(ms / 18));
  const { x: x0, y: y0 } = pos;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
    await wait(ms / n / 2);
  }
  pos = { x, y };
}
const loc = (t) => (typeof t === 'string' ? page.locator(t).first() : t);
async function moveTo(target, { dx = 0, dy = 0, ms } = {}) {
  const l = loc(target);
  await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox();
  await glide(b.x + Math.min(b.width / 2, 180) + dx, b.y + Math.min(b.height / 2, 20) + dy, ms);
}
async function click(target, opts) {
  await moveTo(target, opts);
  await wait(140);
  await page.mouse.down();
  await page.mouse.up();
  await wait(200);
}
async function scroll(dy, steps = 14) {
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await wait(28); }
}
async function search(text) {
  const box = page.getByPlaceholder(/Search file/i);
  await click(box);
  await box.fill('');
  await page.keyboard.type(text, { delay: 75 });
  await wait(250);
}

// ---------------------------------------------------------------- the walkthrough
await page.goto('file://' + here + 'build/intro.html');
await scene('intro', async () => { await wait(200); });

const PHOTO = here + 'assets/estrich-page-photo.jpg';
const STATE = await (await fetch('http://localhost:8787/api/state?lang=en')).json();
const idOf = (f) => STATE.docs.find((d) => d.fileName === f)?.id;
const row = (f) => `.trow[data-file="${f}"]`;
const hash = async (h, sel) => { await page.evaluate((h) => { location.hash = h; }, h); await page.waitForSelector(sel); await wait(350); };
const center = async (target) => { await loc(target).evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(650); };

await page.goto('http://localhost:8787/#/');
await page.waitForSelector('.trow');
await page.mouse.move(pos.x, pos.y);
await scene('open', async () => {
  await glide(700 * K, 330 * K, 500);
  const box = page.locator('.search');
  await click(box);
  await page.keyboard.type('8209', { delay: 70 });
  await wait(300);
  await click(row('8209.003_Leistungsverzeichnis_leer.X83'));
  await page.waitForSelector('.rail');
});

await scene('doc', async () => {
  await wait(500);
  await glide(640 * K, 400 * K, 500);
  await scroll(360, 18);
  await wait(900);
  await click('.sevjump');
  await wait(1100);
  await moveTo(page.locator('.it.marked:has(.note.on) mark').first(), { ms: 600 });
  await wait(1300);
  await moveTo(page.locator('.it.marked:has(.note.on) mark').nth(1), { ms: 600 });
  await wait(1200);
  await moveTo('.note.on .n-t', { ms: 600 });
});

await scene('decide', async () => {
  await moveTo('.note.on .n-q', { ms: 450 });
  await wait(500);
  await click('.note.on [data-decide="bieterfrage"]');
  await wait(900);
});

await scene('package', async () => {
  await click('[data-go="package"]');
  await page.waitForSelector('.letter');
  await wait(500);
  await glide(820 * K, 430 * K, 400);
  await scroll(300, 16);
  await wait(700);
  await click('[data-tab="prices"]');
  await wait(900);
  await moveTo('[data-export="questions"]', { ms: 400 });
  await moveTo('[data-export="x84"]', { ms: 400 });
  await wait(300);
});

await scene('photo', async () => {
  await hash('#/', '.trow');
  const btn = page.getByRole('button', { name: /Take a photo/i });
  await moveTo(btn, { ms: 500 });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), click(btn)]);
  await fc.setFiles(PHOTO);
  await page.waitForSelector('.mk', { timeout: 30000 });
  await wait(900);
  await glide(640 * K, 430 * K, 400);
  await page.mouse.wheel(0, 230);
  await wait(700);
  await click(page.locator('.mk.s2').first());
  await wait(1100);
  await click(page.locator('.mk.s2').nth(1));
  await wait(900);
});

await scene('compare', async () => {
  await hash('#/doc/' + idOf('GAEB-[PROJEKT_004]_Nachsendung-1_Demo.X83'), '.rail');
  await wait(300);
  await click('[data-compare]');
  await page.waitForSelector('.tiles');
  await wait(900);
  await moveTo(page.locator('.tile').first(), { ms: 500 });
  await wait(600);
  await glide(700 * K, 440 * K, 400);
  await scroll(330, 18);
  await wait(1500);
  await scroll(430, 20);
  await wait(1500);
  await scroll(420, 20);
  await wait(1200);
});

await scene('project', async () => {
  await hash('#/doc/' + idOf('LV_18_Estrich.pdf'), '.rail');
  const n = page.locator('.note', { hasText: /heating contractor/i }).first();
  await center(n);
  await click(n.locator('.n-t'));
  await wait(500);
  await moveTo(page.locator('.it.marked:has(.note.on) mark').first(), { ms: 600 });
  await wait(900);
});

await scene('bid', async () => {
  await hash('#/doc/' + idOf('Angebot AN24-0305.pdf'), '.rail');
  const n = page.locator('.note', { hasText: /mixed pricing/i }).first();
  await center(n);
  await moveTo(n.locator('.n-t'), { ms: 500 });
  await wait(1400);
});

await page.goto('file://' + here + 'build/outro.html');
await scene('outro', async () => { await wait(200); });
await wait(1200);

await cdp.send('Page.stopScreencast');
const endEpoch = Date.now() / 1000;
await ctx.close();
// video time 0 = first frame; marks were taken on the same clock
const zero = frames[0].ts;
const shift = tVid / 1000 - zero;
for (const m of marks) m.start += shift;
const end = endEpoch - zero;
const list = ['ffconcat version 1.0'];
frames.forEach((fr, i) => {
  const d = (i + 1 < frames.length ? frames[i + 1].ts : endEpoch) - fr.ts;
  list.push(`file '${fr.file}'`, `duration ${Math.max(0.001, d).toFixed(4)}`);
});
list.push(`file '${frames[frames.length - 1].file}'`);
writeFileSync(here + 'build/frames.ffconcat', list.join('\n') + '\n');
writeFileSync(here + 'build/marks.json', JSON.stringify({ marks, end, frames: frames.length }, null, 1));
console.log(`${frames.length} frames captured`);

// ---------------------------------------------------------------- subtitles as image bands
const capPage = await browser.newPage({ viewport: { width: 1920, height: 120 } });
for (const s of T) {
  await capPage.setContent(`<!doctype html><html><body style="margin:0;width:1920px;height:120px;background:#111;display:flex;align-items:center;justify-content:center;font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif"><div style="max-width:1640px;color:#fff;font-size:31px;line-height:1.35;text-align:center;font-weight:500">${s.cap}</div></body></html>`);
  await capPage.screenshot({ path: here + `build/cap-${s.id}.png` });
}
await browser.close();

// ---------------------------------------------------------------- mux
const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', here + 'build/frames.ffconcat'];
for (const s of T) args.push('-i', here + `build/cap-${s.id}.png`);
for (const s of T) args.push('-i', here + `build/${s.id}.wav`);
const f = [];
f.push(`[0:v]scale=1920:960:flags=lanczos,fps=30,format=yuv420p,pad=1920:1080:0:0:color=0x111111[v0]`);
marks.forEach((m, i) => {
  const next = i + 1 < marks.length ? marks[i + 1].start : end;
  const k = T.findIndex((s) => s.id === m.id);
  f.push(`[v${i}][${1 + k}:v]overlay=0:960:enable='between(t,${m.start.toFixed(3)},${next.toFixed(3)})'[v${i + 1}]`);
});
marks.forEach((m, i) => {
  const k = T.findIndex((s) => s.id === m.id);
  const ms = Math.round((m.start + 0.15) * 1000);
  f.push(`[${1 + T.length + k}:a]adelay=${ms}|${ms}[a${i}]`);
});
f.push(`${marks.map((_, i) => `[a${i}]`).join('')}amix=inputs=${marks.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
args.push('-filter_complex', f.join(';'), '-map', `[v${marks.length}]`, '-map', '[aout]',
  '-t', end.toFixed(3), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', here + 'Shovel-Demo.mp4');
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log(`done: ${here}Shovel-Demo.mp4 (${end.toFixed(1)} s)`);
console.log(marks.map((m) => `${m.id} @ ${m.start.toFixed(2)} s`).join(' · '));
