# Simephony pitch deck

The final pitch deck, built with [open-slide](https://github.com/open-slide/open-slide): every slide is a React
component on a fixed 1920 × 1080 canvas. The deck lives in
[`slides/simephony-finals/index.tsx`](slides/simephony-finals/index.tsx) and its images in
`slides/simephony-finals/assets/`.

**Just want to present?** Open [`simephony-finals.html`](simephony-finals.html) in Chrome or Edge and press **F**.
That one file has everything in it, so it works from a USB stick on any laptop with no internet.
Jump to [Presenting on someone else's laptop](#presenting-on-someone-elses-laptop).

## Contents

1. [Set up (once)](#1-set-up-once)
2. [Run the deck while you edit](#2-run-the-deck-while-you-edit)
3. [Present](#3-present)
4. [Edit a slide](#4-edit-a-slide)
5. [How the animations work](#5-how-the-animations-work)
6. [Make the single HTML file](#6-make-the-single-html-file)
7. [Presenting on someone else's laptop](#presenting-on-someone-elses-laptop)
8. [Troubleshooting](#troubleshooting)

## 1. Set up (once)

You need [Node.js](https://nodejs.org) 22 or newer. Check with `node -v`.

```bash
cd slides
npm install
```

## 2. Run the deck while you edit

```bash
cd slides
npm run dev
```

Open the address it prints (usually http://localhost:5173) and click the **Simephony · Final pitch** card. Every
time you save `index.tsx`, the browser updates by itself.

The editor view shows every slide **fully built**, with all its steps showing. The step-by-step animations only
play in Present mode (next section).

## 3. Present

| Key | What it does |
| --- | --- |
| **F** or the red **Present** button | Fullscreen Present mode |
| **→**, **Space**, clicker | Next slide |
| **←** | Previous slide |
| **Esc** | Leave Present mode |

Every slide now animates by itself when it opens (about 2–3 seconds), so one click per slide is all you need.
Each slide's animation:

| Slide | Clicks | What each click shows |
| --- | --- | --- |
| 02 In the news | 0 | Breaking-news opener: the headline, the case and the defects appear; the "LATEST" ticker scrolls (play your news sting here) |
| 03 Problem | 0 | The ticker band holds still and becomes the sources line while the four stats count up |
| 04 Solution | 0 | The three apps appear together, then the "proof" circle and the "know the unknown" block |
| 05 How it works | 0 | The people / AI agents diagram; the "Ceiling leak" ticket glides stage to stage with a frame following it, then the motto |
| 06 Innovation | 0 | Water drips in five units, the shared riser is flagged, then the right column lands |
| 07 Impact | 0 | Three cards together, then the Values bar |
| 08 Feasibility | 0 | The packet glides through the four layers (~1 s), then the three reasons |
| 09 Scale | 0 | Text always shown; the road and circles 0 → 4 colour in (~2 s) |

Coming back to a slide with **←** shows it fully built.

## 4. Edit a slide

Everything is in one file: [`slides/simephony-finals/index.tsx`](slides/simephony-finals/index.tsx). Each slide is a
`const Something: Page = () => ( ... )` block. To find one, search the file for its title text, or for `: Page =`.

- **Change words:** edit the text between the tags and save.
- **Change colours or fonts for the whole deck:** edit `design` near the top of the file, or use the **Design**
  button in the editor.
- **Swap an image:** put the file in `slides/simephony-finals/assets/` and change the matching `import` at the top.
  Team photos are cropped per person with the `crop` prop on each `<Member>` (so every face lines up); a new
  photo needs its own `crop` numbers.
- **Reorder or remove slides:** edit the list at the very bottom of the file (`export default [ ... ]`).

Rules from open-slide: keep each slide inside 1920 × 1080 (anything past the edge is cut off), don't add npm
packages, and don't edit `package.json` or `open-slide.config.ts`.

Using Claude Code? Run it inside `slides/`: the skills in `.claude/skills/` teach it how open-slide works. For
example, "make the title on the Impact page shorter" or "apply the comments".

## 5. How the animations work

Three building blocks, all defined near the top of `index.tsx`:

**Beats** (`useBeats(n)`) give a slide `n` extra clicks. The slide reads `beat` (0 on arrival, then 1, 2, …) and
decides what to show:

```tsx
const MySlide: Page = () => {
  const { beat, cues } = useBeats(2); // 2 extra clicks
  return (
    <Frame eyebrow="..." title="...">
      {cues /* must be rendered once; it is invisible */}
      <div style={reveal(beat >= 0)}>Shown on arrival</div>
      <div style={reveal(beat >= 1)}>Shown after 1 click</div>
      <div style={reveal(beat >= 2, 200)}>Shown after 2 clicks, 200 ms later</div>
    </Frame>
  );
};
```

`reveal(on, delay?, from?)` fades an element in and springs it up when `on` becomes true.

**Camera.** Give `Frame` a `focus` and the slide body zooms to scale `s` around point `(x, y)`. `x` and `y` are
measured in pixels from the top-left of the area below the title, with the 120 px side margin included. Use
`OVERVIEW` for the normal, zoomed-out view:

```tsx
const focus = beat === 0 ? { x: 400, y: 200, s: 1.5 } : OVERVIEW;
<Frame ... focus={focus}>
```

**Morphs.** An element wrapped in `<MorphElement id="same-id">` on two neighbouring slides glides from one to the
other when you change slides. The slide being entered needs `transition = morphCut` (set at the bottom of the
file). This is how the pipeline flies from slide 2 to slide 3, the black motto chips fly from slide 5 to slide 6,
and the chapter marker in the footer slides along.

The open-slide reference for all of this is in `.claude/skills/slide-authoring/` (`morph.md`, `steps.md`,
`transitions.md`).

## 6. Make the single HTML file

After editing, rebuild the presentable file:

```bash
cd slides
node tools/flat-html/build-flat.mjs
```

It takes about 10 seconds and overwrites `slides/simephony-finals.html` (about 5 MB). Commit that file too, so
teammates can download the latest version straight from GitHub.

What the script does ([`tools/flat-html/build-flat.mjs`](tools/flat-html/build-flat.mjs)):

1. Builds the app with open-slide's own build settings, but as **one** JavaScript file. Chrome blocks a page opened
   from disk from loading other script files, so they all have to be inside the HTML.
2. Turns every image and font into text inside the file, so nothing is loaded from the internet. Only the Latin
   font files are kept; the full font set made the file 63 MB.
3. Swaps the page router for one that keeps its place in memory
   ([`tools/flat-html/router-shim.tsx`](tools/flat-html/router-shim.tsx)). The normal router reads the address bar,
   and for a file on disk that's `C:\...\simephony-finals.html`, which isn't a slide.

open-slide's own **Export → HTML** button is different: it saves still snapshots, so the clicks, camera and morphs
are lost. Use the script above instead.

## Presenting on someone else's laptop

1. Copy `simephony-finals.html` to a USB stick, or download it from GitHub
   (open the file, then **⋯ → Download**). Rename it if you like.
2. On the venue laptop, open it in **Chrome or Edge**: double-click it, or drag it into a browser window. Only Chrome
   has been tested; Firefox and Safari haven't.
3. Press **F** to go fullscreen. Use **→** or the clicker to advance.
4. Before your slot, click through once to check the projector shows the whole 16:9 slide.

No internet, install or server is needed.

## Troubleshooting

- **`npm run dev` says the port is in use.** Another dev server is running. Close it, or use the new address it
  prints.
- **Text in the HTML file looks like a plain system font.** It was built offline and couldn't download Inter and
  Allura. Rebuild once while online.
- **A click does nothing on a slide.** Make sure you're in Present mode (**F**). In the editor view every step is
  always showing.
- **The page looks cut off or too small.** Press **F** for fullscreen. The deck scales to fit any 16:9 screen.
- **The build fails after updating packages.** The script relies on open-slide's internal build setup. Run
  `npm install` again; if it still fails, check that `node_modules/@open-slide/core/dist/vite` still exists.
