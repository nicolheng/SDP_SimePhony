---
name: Heritage Editorial
description: Warm cream paper surfaces, deep espresso ink, terracotta accents, and crisp hairline cards built for architectural clarity.
mode: light
---

# Heritage Editorial

## Palette

| Role       | Value     | Notes                                                  |
| ---------- | --------- | ------------------------------------------------------ |
| bg         | `#FAF6F1` | warm parchment canvas                                  |
| text       | `#1C1814` | deep espresso ink for primary copy & dark hero frames  |
| accent     | `#C64A1F` | terracotta callouts, eyebrows, key figures, focus cues |
| muted      | `#5E554D` | warm slate-brown secondary copy & table body text      |
| soft       | `#8A7F75` | footnotes, captions, subtle dividers, directional arrows |
| card       | `#FFFDFA` | elevated warm-white card surface                       |
| line       | `#E3D7CA` | 2 px hairline card borders & structural rules          |
| watermark  | `#F4ECE3` | large background section numerals                      |
| orangeSoft | `#FBEDE6` | warm accent tint for people / alert highlights         |
| blue       | `#24589E` | agent / analytical logic                               |
| blueSoft   | `#E8EFF8` | agent badge and reasoning surface                      |
| green      | `#2E7D4F` | verified / approved / passed states                    |
| greenSoft  | `#E6F2EA` | verified badge tint                                    |
| amber      | `#B7791F` | pending review / caution states                        |
| amberSoft  | `#FBF1DD` | caution badge tint                                     |
| bright     | `#FF7A00` | luminous orange highlight reserved for dark hero slides |

## Typography

- Display font: `"Inter", system-ui, -apple-system, sans-serif` — weight 800–900 for headlines, `-0.02em` tracking.
- Body font: `"Inter", system-ui, -apple-system, sans-serif` — weight 400–500 for prose, 600–700 for labels.
- Script accent (cover & closer wordmarks only): `"Allura", cursive`.
- Webfont import: `https://fonts.googleapis.com/css2?family=Allura&family=Inter:wght@400;500;600;700;800;900&display=swap`
- Type-scale overrides (against `slide-authoring` defaults on a 1920 × 1080 canvas):
  - Hero title: `104px` (up to `140px` for short single-line covers)
  - Page heading: `64px` (`80px` on centerpiece morph slides)
  - Body text: `30px` (`22–28px` inside structured multi-column cards and tables)
  - Caption / eyebrow / footer: `22–24px`

## Layout

- Content padding: `120px` horizontal (`PAD_X`), `96px` top anchor for Eyebrow + Title, `100px` bottom footer reserve.
- Alignment: left-aligned editorial grid; centered ceremonial framing reserved for centerpiece morph transitions.
- Grid notes: Body region spans `top: 290px` (or `340px` when a subtitle is present) to `bottom: 100px`, giving a `640–690px` vertical budget inside a `1680px` wide track.

## Fixed components

These are paste-ready. Copy them verbatim into a slide that uses this theme.

### Title

```tsx
const Title = ({ children, size = 64 }: { children: React.ReactNode; size?: number }) => (
  <h1
    style={{
      fontFamily: 'var(--osd-font-display)',
      fontSize: size,
      fontWeight: 800,
      lineHeight: 1.12,
      letterSpacing: '-0.02em',
      margin: '18px 0 0',
      color: 'var(--osd-text)',
    }}
  >
    {children}
  </h1>
);
```

### Footer

Pull the page number from `useSlidePageNumber()` — never hardcode `pageNum` / `total` props.

```tsx
import { useSlidePageNumber } from '@open-slide/core';

const Footer = () => {
  const { current, total } = useSlidePageNumber();
  return (
    <div
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        bottom: 46,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 20,
        color: '#8A7F75',
      }}
    >
      <span style={{ letterSpacing: '0.1em', fontWeight: 600 }}>HERITAGE EDITORIAL</span>
      <span style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
        {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
    </div>
  );
};
```

### Eyebrow

```tsx
const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: 24,
      fontWeight: 700,
      letterSpacing: '0.16em',
      color: 'var(--osd-accent)',
      textTransform: 'uppercase',
    }}
  >
    {children}
  </div>
);
```

## Motion

- Philosophy: rich — disciplined editorial continuity combining 260–280 ms hold-and-fade cuts, 900 ms Magic-Move morph transitions for shared process states, and 1100 ms ease-in-out camera pans across multi-part diagrams.
- Reusable keyframes:

```css
@keyframes sf-rise { from { opacity: 0; transform: translateY(34px); } to { opacity: 1; transform: none; } }
@keyframes sf-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sf-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 -10% 0 0); } }
@keyframes sf-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(198,74,31,0.45); } 50% { box-shadow: 0 0 0 16px rgba(198,74,31,0); } }
```

## Aesthetic

Editorial paper-and-print warmth paired with architectural precision: warm cream (`#FAF6F1`) backgrounds, deep espresso (`#1C1814`) typography, restrained terracotta (`#C64A1F`) accents, and crisp `2px` hairline (`#E3D7CA`) cards on elevated `#FFFDFA` paper with soft natural drop shadows. High-drama dark `#1C1814` bookends (cover, closing, section dividers) frame light, scannable content pages. Avoid neon glows, harsh pure-black `#000000` cards, cluttered decorative gradients, or decorative emoji.

## Example usage

```tsx
const Cover: Page = () => (
  <div
    style={{
      width: '100%',
      height: '100%',
      background: '#1C1814',
      color: '#FAF6F1',
      padding: 120,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      fontFamily: 'var(--osd-font-body)',
    }}
  >
    <Eyebrow>People Challenge</Eyebrow>
    <h1
      style={{
        fontFamily: 'var(--osd-font-display)',
        fontSize: 'var(--osd-size-hero)',
        fontWeight: 800,
        lineHeight: 1.06,
        letterSpacing: '-0.025em',
        margin: '24px 0 0',
      }}
    >
      Don’t just close the defect.
      <br />
      <span style={{ color: '#FF7A00' }}>Prove the root cause is fixed.</span>
    </h1>
    <p style={{ fontSize: 30, color: 'rgba(250,246,241,0.82)', maxWidth: 1120, marginTop: 32, lineHeight: 1.5 }}>
      One trusted record across residents, developers, and contractors.
    </p>
  </div>
);
```
