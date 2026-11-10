// Builds ONE self-contained HTML file of a deck that works when opened straight from disk
// (USB stick, any laptop, no server, no internet). Clicks, camera moves and morphs all keep working.
//
// Usage (from the slides/ folder):   node tools/flat-html/build-flat.mjs [deck-id]
// Output:                            slides/<deck-id>.html
//
// How it works:
// 1. Reuses open-slide's own Vite config, but forces a single JS chunk and inlines every image/font.
// 2. Swaps the URL router for an in-memory one that starts on the deck (file:// has no route path).
// 3. Inlines the JS, the CSS and the Google fonts (Inter, Allura) into the HTML.
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createViteConfig } from '@open-slide/core/vite';
import { build, mergeConfig } from 'vite';

const deck = process.argv[2] ?? 'simephony-finals';
const here = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(here, '../..'); // the slides/ workspace
const outDir = path.join(cwd, 'dist-flat');
const realRouter = path.join(cwd, 'node_modules/react-router-dom/dist/index.mjs').replace(/\\/g, '/');
const shim = path.join(here, 'router-shim.tsx').replace(/\\/g, '/');

process.chdir(cwd);
const base = await createViteConfig({ userCwd: cwd, mode: 'build' });
const config = mergeConfig(base, {
  base: './',
  logLevel: 'warn',
  resolve: {
    alias: [
      { find: /^react-router-dom$/, replacement: shim },
      { find: /^REAL_REACT_ROUTER_DOM$/, replacement: realRouter },
    ],
  },
  build: {
    outDir,
    emptyOutDir: true,
    // Images become data: URLs. Of open-slide's UI fonts keep only Latin Geist; the rest
    // (other scripts) are left out, so the browser just falls back if it ever needs them.
    assetsInlineLimit: (file) => !/\.(woff2?|ttf|otf)$/i.test(file) || /geist-latin-wght/i.test(file),
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 100000,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
await build(config);

// ---- stitch everything into one HTML file -------------------------------------------------
const assetsDir = path.join(outDir, 'assets');
const files = readdirSync(assetsDir);
const js = files.filter((f) => f.endsWith('.js'));
const cssFiles = files.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`expected 1 JS chunk, got ${js.length}: ${js.join(', ')}`);

const code = readFileSync(path.join(assetsDir, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const styles = cssFiles.map((f) => readFileSync(path.join(assetsDir, f), 'utf8')).join('\n').replace(/<\/style/gi, '<\\/style');

// Google fonts used by the deck, inlined so the file works offline.
async function inlineGoogleFonts(href) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const all = await (await fetch(href, { headers: { 'User-Agent': ua } })).text();
  // Keep only the Latin subsets (each block is preceded by a /* subset */ comment).
  const cssText = all
    .split(/(?=\/\*\s*[a-z-]+\s*\*\/)/)
    .filter((block) => /^\/\*\s*latin\s*\*\//.test(block))
    .join('\n');
  const urls = [...new Set([...cssText.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  let out = cssText;
  for (const u of urls) {
    const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
    out = out.split(u).join(`data:font/woff2;base64,${buf.toString('base64')}`);
  }
  return out;
}
let fonts = '';
try {
  fonts = await inlineGoogleFonts(
    'https://fonts.googleapis.com/css2?family=Allura&family=Inter:wght@400;500;600;700;800;900&display=swap',
  );
} catch (e) {
  console.warn('Could not inline Google fonts (offline?). The file will use them only when online.', e.message);
}

let html = readFileSync(path.join(outDir, 'index.html'), 'utf8');
html = html
  .replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/g, '')
  .replace(/<link\b[^>]*rel="(?:stylesheet|modulepreload)"[^>]*>/g, '')
  .replace(/<link\b[^>]*rel="icon"[^>]*>/g, '');
const head = [
  `<style>${fonts}</style>`,
  `<style>${styles}</style>`,
  `<script>window.__FLAT_START__ = ${JSON.stringify(`/s/${deck}`)};</script>`,
].join('\n');
// Function replacers: the bundle contains "$&" / "$'" sequences that a string replacement would expand.
html = html.replace('</head>', () => `${head}\n</head>`);
html = html.replace('</body>', () => `<script type="module">${code}</script>\n</body>`);

const outFile = path.join(cwd, `${deck}.html`);
writeFileSync(outFile, html);
rmSync(outDir, { recursive: true, force: true });
console.log(`Wrote ${outFile} (${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB)`);
