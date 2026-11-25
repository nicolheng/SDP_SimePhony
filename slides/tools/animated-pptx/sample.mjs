// node sample.mjs <out.json> [pages] [segMs]
// Plays the deck in Present mode and, for every page, records when each element becomes visible,
// how it moves / scales on the way in, and when clip / stroke reveals run. Output: one JSON with,
// per page, a list of elements in 1920×1080 page coordinates (final rect) plus their timing.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const here = dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9342;
const [outFile, pagesArg, segArg] = process.argv.slice(2);
const PAGES = Number(pagesArg ?? 26);
const SEG = Number(segArg ?? 5000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), 'open-slide-cdp-prof-samp')}`, '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 150 && !wsUrl; i++) { await sleep(200); try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800)); return r.result?.result?.value; };
const key = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };

// In-page sampler. Starts at t=0, samples every ~33 ms for `dur` ms.
const SAMPLER = `window.__sample = (dur) => new Promise((resolve) => {
  const t0 = performance.now();
  const data = new Map();
  const roots = new Map(); // root -> first seen
  const walk = (el, op, t) => {
    const cs = getComputedStyle(el);
    const o = op * parseFloat(cs.opacity || '1') * (cs.visibility === 'hidden' || cs.display === 'none' ? 0 : 1);
    let d = data.get(el);
    if (!d) { d = { s: [] }; data.set(el, d); }
    const r = el.getBoundingClientRect();
    d.s.push([t, r.x, r.y, r.width, r.height, o, cs.clipPath + '|' + cs.strokeDashoffset]);
    for (const c of el.children) walk(c, o, t);
  };
  const step = () => {
    const t = performance.now() - t0;
    for (const d of document.querySelectorAll('div')) if (d.style.isolation === 'isolate' && !roots.has(d)) roots.set(d, t);
    for (const [root] of roots) if (root.isConnected) walk(root, 1, t);
    if (t < dur) setTimeout(step, 30); else finish();
  };
  const finish = () => {
    let best = null, bestT = -1;
    for (const [root, seen] of roots) {
      if (!root.isConnected) continue;
      const r = root.getBoundingClientRect();
      if (r.width < 100 || r.right <= 0 || r.left >= innerWidth) continue;
      if (seen > bestT) { best = root; bestT = seen; }
    }
    if (!best) return resolve({ error: 'no root' });
    const R = best.getBoundingClientRect();
    const k = 1920 / R.width;
    const out = [];
    const all = [best, ...best.querySelectorAll('*')];
    for (const el of all) {
      const d = data.get(el); if (!d || !d.s.length) continue;
      const s = d.s, last = s[s.length - 1];
      if (last[3] < 1 || last[4] < 1 || last[5] < 0.05) continue;
      const fx = (last[1] - R.x) * k, fy = (last[2] - R.y) * k, fw = last[3] * k, fh = last[4] * k;
      const pts = s.map(([t, x, y, w, h, o, c]) => [Math.round(t), +(((x - R.x) * k) - fx).toFixed(1), +(((y - R.y) * k) - fy).toFixed(1), +((w * k) / fw).toFixed(3), +((h * k) / fh).toFixed(3), +o.toFixed(3), c === last[6] ? 0 : 1]);
      out.push({ fw: parseInt(getComputedStyle(el).fontWeight, 10) || 400, tag: el.tagName.toLowerCase(), text: (el.childElementCount ? '' : (el.textContent || '').trim().slice(0, 30)), x: +fx.toFixed(1), y: +fy.toFixed(1), w: +fw.toFixed(1), h: +fh.toFixed(1), pts });
    }
    resolve({ seenAt: bestT, items: out });
  };
  step();
});`;

await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:5179/s/simephony-finals?p=2' });
await sleep(9000);
await key('f', 'KeyF', 70);
await sleep(3500);
await evalJs(SAMPLER);
const result = [];
for (let p = 1; p <= PAGES; p++) {
  const run = send('Runtime.evaluate', { expression: `window.__sample(${SEG})`, returnByValue: true, awaitPromise: true });
  await sleep(20);
  if (p === 1) await key('ArrowLeft', 'ArrowLeft', 37); else await key('ArrowRight', 'ArrowRight', 39);
  const r = await run;
  const v = r.result?.result?.value;
  result.push(v);
  console.log(`page ${p}: ${v?.items?.length ?? v?.error}`);
}
writeFileSync(outFile, JSON.stringify(result));
// close the whole headless browser through CDP (on Windows kill() only stops the launcher,
// and a leftover instance blocks printing on the next run)
await Promise.race([send('Browser.close'), sleep(3000)]);
ws.close(); edge.kill();
process.exit(0);
