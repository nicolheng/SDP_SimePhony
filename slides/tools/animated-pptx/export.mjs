// node export.mjs <pdf|pptx|image-pptx> <outDir>
// Drives open-slide's own exporters in headless Edge. PPTX: captures the browser download.
// PDF: replaces window.print with Page.printToPDF (headless has no print dialog).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const here = dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const [kind, outDir] = [process.argv[2], process.argv[3]];
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), 'open-slide-cdp-prof2')}`, '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 150 && !wsUrl; i++) { await sleep(200); try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) events.push(m); });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const clickAt = async (x, y) => {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, pointerType: 'mouse' });
};
const rectOf = (js) => evalJs(`(() => { const el = ${js}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir, eventsEnabled: true });
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__printCalls = 0; window.print = () => { window.__printCalls++; };' });
await send('Page.navigate', { url: 'http://localhost:5179/s/simephony-finals' });
await sleep(9000);

const label = { pdf: 'Export as PDF', pptx: 'Export as PPTX', 'image-pptx': 'Export as image PPTX' }[kind];
const trig = await rectOf(`document.querySelector('[aria-label="Download"]')`);
if (!trig) throw new Error('download button not found');
await clickAt(trig.x, trig.y);
await sleep(800);
const item = await rectOf(`[...document.querySelectorAll('[role="menuitem"]')].find(e => e.textContent.trim() === ${JSON.stringify(label)})`);
if (!item) throw new Error('menu item not found: ' + label);
await clickAt(item.x, item.y);
const t0 = Date.now();

if (kind === 'pdf') {
  while (!(await evalJs('window.__printCalls')) && Date.now() - t0 < 600000) await sleep(500);
  await sleep(1500);
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, timeout: 300000 });
  if (!pdf.result) { console.log(JSON.stringify(pdf.error), await evalJs('window.__printCalls')); }
  writeFileSync(join(outDir, 'simephony-finals.pdf'), Buffer.from(pdf.result.data, 'base64'));
  await evalJs(`window.dispatchEvent(new Event('afterprint'))`);
  console.log('pdf written', Math.round((Date.now() - t0) / 1000) + 's');
} else {
  while (!events.some((e) => e.method === 'Browser.downloadProgress' && e.params.state === 'completed') && Date.now() - t0 < 600000) {
    await sleep(1000);
    // keep the event queue alive by pinging
    await send('Runtime.evaluate', { expression: '1' });
  }
  console.log('download done', Math.round((Date.now() - t0) / 1000) + 's', readdirSync(outDir));
}
// close the whole headless browser through CDP (on Windows kill() only stops the launcher,
// and a leftover instance blocks printing on the next run)
await Promise.race([send('Browser.close'), sleep(3000)]);
ws.close(); edge.kill();
process.exit(0);
