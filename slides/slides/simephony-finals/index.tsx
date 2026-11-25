import type { DesignSystem, Page, SlideMeta, SlideTransition } from '@open-slide/core';
import { ImagePlaceholder, MorphElement, useIsActivePage, useSlidePageNumber } from '@open-slide/core';
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';

import peopleAiWorkflow from './assets/agent-workflow-people-ai.svg';
import appBuyer from './assets/app-buyer.png';
import appSdpConsole from './assets/app-sdp-console.png';
import appTechnician from './assets/app-technician.png';
import closingImg from './assets/closing.jpg';
import demoPoster from './assets/demo-poster.jpg';
import demoVideo from './assets/demo.mp4';
import coverImg from './assets/cover.jpg';
import targetUsers from './assets/target-users.jpg';
import teamNicol from './assets/team-nicol.jpg';
import teamPhoebe from './assets/team-phoebe.jpg';
import teamSynyee from './assets/team-synyee.jpg';
import teamXiaowen from './assets/team-xiaowen.jpg';
import testimonialKimberly from './assets/testimonial-kimberly.jpg';
import testimonialLim from './assets/testimonial-lim.jpg';

// ---------------------------------------------------------------------------
// Design tokens (Heritage Editorial theme — tweakable from the Design panel)
// ---------------------------------------------------------------------------

export const design: DesignSystem = {
  palette: { bg: '#FAF6F1', text: '#1C1814', accent: '#C64A1F' },
  fonts: {
    display: '"Inter", system-ui, -apple-system, sans-serif',
    body: '"Inter", system-ui, -apple-system, sans-serif',
  },
  typeScale: { hero: 104, body: 30 },
  radius: 20,
};

// Semantic colours outside the DesignSystem shape (matched to themes/heritage-editorial.md)
const muted = '#5E554D';
const soft = '#8A7F75';
const card = '#FFFDFA';
const line = '#E3D7CA';
const blue = '#24589E';
const blueSoft = '#E8EFF8';
const orangeSoft = '#FBEDE6';
const green = '#2E7D4F';
const greenSoft = '#E6F2EA';
const amber = '#B7791F';
const amberSoft = '#FBF1DD';
const ink = '#1C1814';
const bright = '#FF7A00';
const watermark = '#F4ECE3';
// Content blocks (stat tiles, callout bars): a light peach with dark text, instead of near-black.
const BLOCK = '#FBE3D6';
const BLOCK_TEXT = '#1C1814'; // text on a BLOCK
const BLOCK_HI = '#C64A1F'; // highlight text on a BLOCK

// Fonts: Inter for everything, Allura for the script wordmark
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Allura&family=Inter:wght@400;500;600;700;800;900&display=swap';
const FONT_LINK_ID = 'osd-webfont-simephony-finals';
if (typeof document !== 'undefined') {
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== FONT_HREF) link.href = FONT_HREF;
}

// Keyframes used by entrance animations and pulses
const STYLE_ID = 'osd-styles-simephony-finals';
const css = `
@keyframes sf-rise { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
@keyframes sf-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes sf-wipe { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 -10% 0 0) } }
@keyframes sf-zoom { from { transform: scale(1.12) } to { transform: scale(1) } }
@keyframes sf-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(198,74,31,0.45) } 50% { box-shadow: 0 0 0 16px rgba(198,74,31,0) } }
@keyframes sf-ring { from { transform: scale(0.7); opacity: 0.9 } to { transform: scale(2.6); opacity: 0 } }
@keyframes sf-blink { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
@keyframes sf-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
@keyframes sf-drip { 0% { transform: translateY(0); opacity: 0 } 20% { opacity: 1 } 100% { transform: translateY(40px); opacity: 0 } }
`;
if (typeof document !== 'undefined') {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

// ---------------------------------------------------------------------------
// Motion system (one cohesive DNA across every cut, morph, and camera beat)
// ---------------------------------------------------------------------------

const EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
// Smooth ease-out (no overshoot) for every entrance; the stamp keeps a small overshoot so it still "lands".
const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const STAMP = 'cubic-bezier(0.34, 1.3, 0.64, 1)';
const CAM_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const CAM_MS = 1050;
const HOLD: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];

/** Appendix pages: the incoming page rises 6px while fading in over the held outgoing page. */
export const transition: SlideTransition = {
  duration: 260,
  exit: { duration: 260, easing: EASE_IN, keyframes: HOLD },
  enter: {
    duration: 260,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
  },
};

/** Cover, closing & section divider: calm settle with gentle rise and hairline unblur. */
const settle: SlideTransition = {
  duration: 280,
  exit: { duration: 280, easing: EASE_IN, keyframes: HOLD },
  enter: {
    duration: 280,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: 'translateY(10px)', filter: 'blur(4px)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
    ],
  },
};

/** Main pitch pages: shared elements (pipeline, motto chips, chapter rail) glide seamlessly. */
const MORPH_MS = 560;
const morphCut: SlideTransition = {
  duration: 300,
  exit: { duration: 300, easing: EASE_IN, keyframes: HOLD },
  enter: { duration: 300, easing: EASE_OUT, keyframes: [{ opacity: 0 }, { opacity: 1 }] },
  morph: { duration: MORPH_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
};

/** Style for an element that enters when `on` turns true (spring rise by default). */
const reveal = (on: boolean, delay = 0, from = 'translateY(16px)'): CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : from,
  transition: `opacity 500ms ${EASE_OUT} ${delay}ms, transform 650ms ${SPRING} ${delay}ms`,
});

/** CSS keyframe animation, gated to the active audience instance. */
const anim = (live: boolean, name: string, ms: number, delay = 0, easing = EASE_OUT): CSSProperties =>
  live ? { animation: `${name} ${ms}ms ${easing} ${delay}ms both` } : {};


/**
 * Auto beats: on the live page, `beat` steps 0 → count by itself every `stepMs` (after `startMs`), no clicks.
 * Every other instance (thumbnails, snapshots, print) shows the final beat.
 */
function useAutoBeat(count: number, stepMs: number, startMs = 0) {
  return useTimeline(Array.from({ length: count }, (_, i) => startMs + stepMs * (i + 1)));
}

/** Like useAutoBeat, but with explicit times (ms after arrival): beat = how many times have passed. */
function useTimeline(times: number[]) {
  const live = useIsActivePage();
  const key = times.join(',');
  const [beat, setBeat] = useState(live ? 0 : times.length);
  useEffect(() => {
    if (!live) {
      setBeat(times.length);
      return;
    }
    setBeat(0);
    const timers = times.map((t, i) => setTimeout(() => setBeat(i + 1), t));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, key]);
  return beat;
}

/** True one frame after the live page mounts (to trigger CSS transitions); always true elsewhere. */
function useArrived() {
  const live = useIsActivePage();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!live) return;
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setOn(true));
    });
    return () => cancelAnimationFrame(id);
  }, [live]);
  return !live || on;
}

type Focus = { x: number; y: number; s: number };
const OVERVIEW: Focus = { x: 960, y: 0, s: 1 };

/**
 * A camera over the page body: puts point (x, y) at the exact centre of the body area, zoomed to `s`.
 * Not clamped to the edges, so a focused item is always centred. `s <= 1` is the plain overview.
 */
const Camera = ({ w, h, f, ms = CAM_MS, children }: { w: number; h: number; f: Focus; ms?: number; children: ReactNode }) => {
  const x = f.s <= 1 ? w / 2 : f.x;
  const y = f.s <= 1 ? h / 2 : f.y;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: w,
        height: h,
        transformOrigin: '0 0',
        transform: `translate(${w / 2}px, ${h / 2}px) scale(${f.s}) translate(${-x}px, ${-y}px)`,
        transition: `transform ${ms}ms ${CAM_EASE}`,
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
};

/** Counts up from 0 once `go` turns true on the live page; shows the final value elsewhere. */
const CountUp = ({ to, suffix = '', go = true }: { to: number; suffix?: string; go?: boolean }) => {
  const live = useIsActivePage();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!live || !go) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1200);
      setV(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, go, to]);
  const shown = !live ? to : !go ? 0 : v;
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {shown}
      {suffix}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Shared building blocks (Heritage Editorial fixed components + layout)
// ---------------------------------------------------------------------------

const fill: CSSProperties = {
  width: '100%',
  height: '100%',
  // Own stacking context per page: during a slide change open-slide stacks the old and new page without one,
  // so any z-index inside a page (e.g. a card) would otherwise paint over the incoming page until the cut ends.
  isolation: 'isolate',
  fontFamily: 'var(--osd-font-body)',
  position: 'relative',
  overflow: 'hidden',
};

const PAD_X = 120;
const FOOT = 100;

const PageNo = ({ color = soft }: { color?: string }) => {
  const { current, total } = useSlidePageNumber();
  return (
    <span style={{ fontSize: 22, color, fontVariantNumeric: 'tabular-nums' }}>
      {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
    </span>
  );
};

const RAIL_W = 132;

const RailLabel = ({ i, active, children }: { i: number; active: number; children: ReactNode }) => (
  <div
    style={{
      width: RAIL_W,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: i === active ? 800 : 600,
      letterSpacing: '0.08em',
      color: i === active ? 'var(--osd-accent)' : i < active ? muted : '#B9AEA3',
    }}
  >
    {children}
  </div>
);

/** Chapter rail for the main pitch. The marker morphs smoothly across adjacent slides. */
const Rail = ({ active }: { active: number }) => (
  <div style={{ position: 'relative', display: 'flex' }}>
    <RailLabel i={0} active={active}>STAKES</RailLabel>
    <RailLabel i={1} active={active}>PROBLEM</RailLabel>
    <RailLabel i={2} active={active}>SOLUTION</RailLabel>
    <RailLabel i={3} active={active}>INNOVATION</RailLabel>
    <RailLabel i={4} active={active}>IMPACT</RailLabel>
    <RailLabel i={5} active={active}>FEASIBILITY</RailLabel>
    <RailLabel i={6} active={active}>SCALE</RailLabel>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: -12, height: 3, background: '#EDE3D8', borderRadius: 2 }} />
    <MorphElement id="rail-marker">
      <div
        style={{
          position: 'absolute',
          left: RAIL_W * active + 26,
          width: RAIL_W - 52,
          bottom: -13,
          height: 5,
          borderRadius: 3,
          background: '#C64A1F',
        }}
      />
    </MorphElement>
  </div>
);

const Footer = ({ chapter }: { chapter?: number }) => (
  <div
    style={{ position: 'absolute', left: PAD_X, right: PAD_X, bottom: 46, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 20, color: soft }}
  >
    <span style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
      {chapter == null ? 'SIMEPHONY · GROUP WE HIT THE TOKEN LIMIT' : 'SIMEPHONY'}
    </span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 44 }}>
      {chapter == null ? null : <Rail active={chapter} />}
      <PageNo />
    </div>
  </div>
);

const Eyebrow = ({ children }: { children: ReactNode }) => (
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

const Title = ({ children, size = 64 }: { children: ReactNode; size?: number }) => (
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

/**
 * Standard content page: eyebrow + title at a fixed spot, body below, footer.
 * `focus` puts the body under a camera; `overlay` sits above the camera (not zoomed);
 * `mark` is the architectural watermark numeral; `chapter` renders the chapter rail.
 */
const Frame = ({
  eyebrow,
  title,
  subtitle,
  children,
  bodyTop = 290,
  focus,
  camMs,
  overlay,
  mark,
  chapter,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  bodyTop?: number;
  focus?: Focus;
  camMs?: number;
  overlay?: ReactNode;
  mark?: string;
  chapter?: number;
}) => {
  const h = 1080 - bodyTop - FOOT;
  const inner = <div style={{ position: 'absolute', left: PAD_X, right: PAD_X, top: 0, bottom: 0 }}>{children}</div>;
  return (
    <div style={{ ...fill, background: 'var(--osd-bg)', color: 'var(--osd-text)' }}>
      {mark ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: 50,
            bottom: 70,
            fontSize: 360,
            fontWeight: 900,
            lineHeight: 0.85,
            letterSpacing: '-0.05em',
            color: watermark,
            fontFamily: 'var(--osd-font-display)',
          }}
        >
          {mark}
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: PAD_X, right: PAD_X, top: 92 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Title>{title}</Title>
        {subtitle ? (
          <p style={{ fontSize: 28, color: muted, margin: '12px 0 0', lineHeight: 1.4 }}>{subtitle}</p>
        ) : null}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: bodyTop, height: h, overflow: focus ? 'hidden' : 'visible' }}>
        {focus ? (
          <Camera w={1920} h={h} f={focus} ms={camMs}>
            {inner}
          </Camera>
        ) : (
          inner
        )}
      </div>
      {overlay ? (
        // Outside the camera's clip box, so overlay items (e.g. the motto chips) can sit just above the footer.
        <div style={{ position: 'absolute', left: PAD_X, right: PAD_X, top: bodyTop, height: h, pointerEvents: 'none' }}>{overlay}</div>
      ) : null}
      <Footer chapter={chapter} />
    </div>
  );
};

const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{ background: card, border: `2px solid ${line}`, borderRadius: 'var(--osd-radius)', padding: 32, boxSizing: 'border-box', boxShadow: '0 1px 0 rgba(28,24,20,0.03), 0 18px 40px -24px rgba(28,24,20,0.18)', ...style }}
  >
    {children}
  </div>
);

const NumBadge = ({ n, color = 'var(--osd-accent)' }: { n: string; color?: string }) => (
  <div
    style={{
      width: 52,
      height: 52,
      borderRadius: 26,
      border: `2px solid ${color}`,
      color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 21,
      fontWeight: 800,
      flexShrink: 0,
    }}
  >
    {n}
  </div>
);

const Arrow = ({ color = soft, size = 30 }: { color?: string; size?: number }) => (
  <span style={{ color, fontSize: size, fontWeight: 600 }}>→</span>
);

/** Crisp vector icons so zoom beats never pixelate. */
const Icon = ({
  name,
  color = '#C64A1F',
  size = 40,
}: {
  name: 'camera' | 'link' | 'alert' | 'shield' | 'layers' | 'plug' | 'calendar' | 'map' | 'chat' | 'chart';
  color?: string;
  size?: number;
}) => {
  const p = { fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      {name === 'camera' ? (
        <>
          <path {...p} d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle {...p} cx="12" cy="13" r="3.5" />
        </>
      ) : null}
      {name === 'link' ? (
        <>
          <path {...p} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path {...p} d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </>
      ) : null}
      {name === 'alert' ? (
        <>
          <path {...p} d="M12 3l9.5 17h-19z" />
          <path {...p} d="M12 10v4M12 17.5v.01" />
        </>
      ) : null}
      {name === 'shield' ? <path {...p} d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z M8.5 12l2.5 2.5 4.5-5" /> : null}
      {name === 'layers' ? <path {...p} d="M12 3l9 5-9 5-9-5z M3 13l9 5 9-5" /> : null}
      {name === 'plug' ? <path {...p} d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" /> : null}
      {name === 'calendar' ? (
        <>
          <rect {...p} x="3" y="5" width="18" height="16" rx="2" />
          <path {...p} d="M16 3v4M8 3v4M3 10h18" />
        </>
      ) : null}
      {name === 'map' ? <path {...p} d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" /> : null}
      {name === 'chat' ? <path {...p} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> : null}
      {name === 'chart' ? <path {...p} d="M3 3v18h18 M7 16l4-4 4 3 5-6" /> : null}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// 01 · Cover (wordmark writes in, headline rises line by line)
// ---------------------------------------------------------------------------

const Cover: Page = () => {
  const live = useIsActivePage();
  return (
    <div style={{ ...fill, background: ink, color: '#fff' }}>
      <img
        src={coverImg}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...anim(live, 'sf-zoom', 6000, 0, EASE_OUT) }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(20,14,10,0.94) 0%, rgba(20,14,10,0.74) 45%, rgba(20,14,10,0.22) 100%)',
        }}
      />
      <div style={{ position: 'absolute', left: PAD_X, top: 96, fontSize: 24, letterSpacing: '0.16em', opacity: 0.82, ...anim(live, 'sf-fade', 700, 150), translate: '1px 0px' }}>TOP 13 PITCH</div>
      <div
        style={{ position: 'absolute', right: 130, top: 60, fontFamily: '"Allura", cursive', fontSize: 230, lineHeight: 1, letterSpacing: '-0.045em', color: '#FBE3D3', paddingRight: 30, ...anim(live, 'sf-wipe', 1600, 260, 'cubic-bezier(0.5, 0, 0.3, 1)'), translate: '91.13px -5.22px' }}
      >
        Simephony
      </div>
      <div style={{ position: 'absolute', left: PAD_X, bottom: 185, width: 1600 }}>
        <div style={anim(live, 'sf-rise', 650, 750)}>
          <Eyebrow>People Challenge</Eyebrow>
        </div>
        <h1
          style={{
            fontFamily: 'var(--osd-font-display)',
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.025em',
            margin: '24px 0 0',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={anim(live, 'sf-rise', 750, 950)}>Don’t just close the defect.</div>
          <div style={{ color: bright, ...anim(live, 'sf-rise', 750, 1300) }}>Prove the root cause is fixed.</div>
        </h1>
        <p style={{ fontSize: 32, lineHeight: 1.5, margin: '34px 0 0', color: 'rgba(255,255,255,0.88)', maxWidth: 1220, ...anim(live, 'sf-rise', 750, 1750) }}>
          Simephony is an agentic resolution layer that verifies every repair and spots recurring defects early,
          connecting buyers, Sime Darby Property and contractors through one trusted record.
        </p>
      </div>
      <div
        style={{
          position: 'absolute',
          left: PAD_X,
          right: PAD_X,
          bottom: 56,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 22,
          color: 'rgba(255,255,255,0.72)',
          ...anim(live, 'sf-fade', 700, 2100),
        }}
      >
        <span style={{ fontWeight: 600, color: '#fff' }}>Group We Hit The Token Limit</span>
        <span>Image: Sime Darby Property, official website</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 03 · The problem (stats count up, then the buyer and developer journeys build)
// ---------------------------------------------------------------------------

/** The news lower-third band on slide 2. */
const NEWS_BAND: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 96,
  height: 64,
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
  background: BLOCK,
  borderTop: '3px solid #C64A1F',
};

const NewsBandLabel = ({ children }: { children: ReactNode }) => (
  <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', padding: `0 28px 0 ${PAD_X}px`, background: '#C64A1F', color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: '0.14em', flexShrink: 0 }}>
    {children}
  </div>
);

const Stat = ({ on, value, label }: { on: boolean; value: ReactNode; label: string }) => (
  <div style={{ flex: 1, display: 'flex', ...reveal(on, 0, 'translateY(18px)') }}>
    <Card style={{ flex: 1, padding: '28px 32px 32px' }}>
      <div style={{ fontSize: 88, fontWeight: 800, color: 'var(--osd-accent)', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 25, lineHeight: 1.4, marginTop: 16, color: muted }}>{label}</div>
    </Card>
  </div>
);

/** Shared pipeline pill styles (Problem page and Missing-step page morph between them). */
/** `width` gives every pill in a row the same fixed width so two journeys line up column by column. */
const pillStyle = (size: number, bg: string, color: string, width?: number): CSSProperties => ({
  padding: width ? `${Math.round(size * 0.36)}px 0` : `${Math.round(size * 0.36)}px ${Math.round(size * 0.84)}px`,
  width,
  boxSizing: 'border-box',
  textAlign: 'center',
  borderRadius: 999,
  background: bg,
  color,
  fontSize: size,
  fontWeight: 600,
  border: `2px solid ${line}`,
  whiteSpace: 'nowrap',
});

/** Problem-page journey grid: label | step → step → step → step → verdict. Both rows share it. */
const JOURNEY_LABEL = 200;
const JOURNEY_STEP = 214;
const JOURNEY_ARROW = 46;
const journeyGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `${JOURNEY_LABEL}px ${`${JOURNEY_STEP}px ${JOURNEY_ARROW}px `.repeat(4)}auto`,
  alignItems: 'center',
  justifyItems: 'center',
  rowGap: 46,
};

/**
 * Morph ids are only attached while the pipeline is visible (`on`). A hidden pill that still carried an id
 * would be faded in by the runtime during the cut from a page without that id (the Cover), then vanish.
 */
const morphId = (id: string, on: boolean) => (on ? id : undefined) as string;

const PipeArrow = ({ id, size, on = true, delay = 0 }: { id: string; size: number; on?: boolean; delay?: number }) => (
  <span style={reveal(on, delay, 'translateX(-12px)')}>
    <MorphElement id={morphId(id, on)}>
      <span style={{ color: soft, fontSize: size * 1.2, fontWeight: 600 }}>→</span>
    </MorphElement>
  </span>
);

const PipePill = ({ id, size, width, on = true, delay = 0, children }: { id: string; size: number; width?: number; on?: boolean; delay?: number; children: ReactNode }) => (
  <span style={reveal(on, delay, 'translateY(20px)')}>
    <MorphElement id={morphId(id, on)}>
      <div style={pillStyle(size, card, ink, width)}>{children}</div>
    </MorphElement>
  </span>
);

const BlindPill = ({ on, delay, children }: { on: boolean; delay: number; children: ReactNode }) => (
  <span style={reveal(on, delay, 'translateY(20px)')}>
    <div style={pillStyle(22, card, ink, JOURNEY_STEP)}>{children}</div>
  </span>
);

const BlindArrow = ({ on, delay }: { on: boolean; delay: number }) => (
  <span style={{ color: soft, fontSize: 26, fontWeight: 600, ...reveal(on, delay, 'translateX(-12px)') }}>→</span>
);

/** The four steps every defect goes through today. `width` = fixed pill width (Problem page grid). */
const Pipeline = ({ size, on = true, width }: { size: number; on?: boolean; width?: number }) => (
  <>
    <PipePill id="pipe-reported" size={size} width={width} on={on} delay={0}>Reported</PipePill>
    <PipeArrow id="pipe-arrow-1" size={size} on={on} delay={110} />
    <PipePill id="pipe-assigned" size={size} width={width} on={on} delay={170}>Assigned</PipePill>
    <PipeArrow id="pipe-arrow-2" size={size} on={on} delay={280} />
    <PipePill id="pipe-repaired" size={size} width={width} on={on} delay={340}>Marked “repaired”</PipePill>
    <PipeArrow id="pipe-arrow-3" size={size} on={on} delay={450} />
    <PipePill id="pipe-closed" size={size} width={width} on={on} delay={510}>Closed</PipePill>
  </>
);

/** The "missing step" pill. Only its background shape morphs so text never stretches. */
const GapPill = ({
  size,
  bg,
  color,
  borderColor,
  dashed,
  glow,
  pulse,
  textStyle,
  on = true,
  children,
}: {
  on?: boolean;
  size: number;
  bg: string;
  color: string;
  borderColor: string;
  dashed?: boolean;
  glow?: boolean;
  pulse?: boolean;
  textStyle?: CSSProperties;
  children: ReactNode;
}) => (
  <div style={{ position: 'relative' }}>
    <MorphElement id={morphId('pipe-gap', on)}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          background: bg,
          border: `2px ${dashed ? 'dashed' : 'solid'} ${borderColor}`,
          boxShadow: glow ? '0 12px 30px rgba(46,125,79,0.35)' : 'none',
          animation: pulse ? 'sf-pulse 1.8s ease-in-out 1.4s infinite' : undefined,
        }}
      />
    </MorphElement>
    <div
      style={{ position: 'relative', padding: `${Math.round(size * 0.36)}px ${Math.round(size * 0.84)}px`, border: '2px solid transparent', color, fontSize: size, fontWeight: glow ? 800 : 700, whiteSpace: 'nowrap', ...textStyle }}
    >
      {children}
    </div>
  </div>
);


const Problem: Page = () => {
  // No clicks: the four stats land and count up together, then the two journeys build (1.3 s).
  const beat = useTimeline([1300]);
  const live = useIsActivePage();
  const arrived = useArrived();
  const piped = beat >= 1;
  return (
    <Frame eyebrow="02 · The problem" title="House defects get closed but don’t always get resolved." bodyTop={316} mark="02" chapter={1}>
      <div style={{ display: 'flex', gap: 32 }}>
        <Stat on={arrived} value={<CountUp to={95} suffix="%" go={arrived} />} label="of homebuyers faced problems with how complaints were handled" />
        <Stat on={arrived} value={<CountUp to={70} suffix="%" go={arrived} />} label="faced the same defect issues more than once" />
        <Stat on={arrived} value={<CountUp to={50} suffix="%" go={arrived} />} label="were unsatisfied with the developer’s response and speed" />
        <Stat on={arrived} value={<>1 in <CountUp to={2} go={arrived} /></>} label="were never asked to sign off a repair after it was done" />
      </div>
      <div style={{ ...journeyGrid, marginTop: 42, translate: '0px 52.17px' }}>
        <span style={{ justifySelf: 'start', fontSize: 22, fontWeight: 700, color: ink, lineHeight: 1.25, ...reveal(piped, 0, 'translateX(-16px)') }}>
          The Buyer’s Journey:
        </span>
        <Pipeline size={22} width={JOURNEY_STEP} on={piped} />
        <PipeArrow id="pipe-arrow-4" size={22} on={piped} delay={620} />
        <span style={{ justifySelf: 'start', ...reveal(piped, 700, 'scale(0.94)') }}>
          <GapPill size={22} on={piped} bg={orangeSoft} color="#C64A1F" borderColor="#C64A1F" dashed pulse={live && piped}>
            Actually fixed? Nobody checks.
          </GapPill>
        </span>
        <span style={{ justifySelf: 'start', fontSize: 22, fontWeight: 700, color: ink, lineHeight: 1.25, ...reveal(piped, 540, 'translateX(-16px)') }}>
          The Developer’s Blindspot:
        </span>
        <BlindPill on={piped} delay={600}>Isolated Ticket</BlindPill>
        <BlindArrow on={piped} delay={680} />
        <BlindPill on={piped} delay={740}>No History</BlindPill>
        <BlindArrow on={piped} delay={820} />
        <BlindPill on={piped} delay={880}>Repeat Repair</BlindPill>
        <BlindArrow on={piped} delay={960} />
        <BlindPill on={piped} delay={1020}>Systemic Risk</BlindPill>
        <BlindArrow on={piped} delay={1100} />
        <span style={{ justifySelf: 'start', ...reveal(piped, 1180, 'scale(0.94)') }}>
            <div
              style={{
                padding: '8px 18px',
                borderRadius: 999,
                background: orangeSoft,
                border: '2px dashed #C64A1F',
                color: '#C64A1F',
                fontSize: 22,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              Recurring defects? Nobody noticed.
            </div>
          </span>
      </div>
      <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 20, color: soft, lineHeight: 1.45, margin: 0, ...reveal(piped, 1300, 'none') }}>
        Sources: Yusof et al. (2025), <i>Journal of Engineering, Design and Technology</i>, study of 104 Malaysian
        homebuyers; National House Buyers Association (HBA) via iProperty Malaysia, 2021.
      </p>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 02 · In the news (opens the pitch over a news sting: breaking-news headline, the ruling, a scrolling ticker)
// ---------------------------------------------------------------------------

const DefectChip = ({ on, delay, children }: { on: boolean; delay: number; children: ReactNode }) => (
  <span style={{ display: 'inline-block', padding: '10px 22px', borderRadius: 999, border: `2px solid ${line}`, background: card, fontSize: 24, fontWeight: 700, color: ink, ...reveal(on, delay, 'translateY(10px)') }}>
    {children}
  </span>
);

const TICKER =
  'Court of Appeal upholds ruling against the developer  ·  Liability for latent defects may extend beyond the 24-month Defect Liability Period  ·  Defects included water seepage, cracks, burst pipes and poor electrical wiring  ·  Source: Court of Appeal judgment, Civil Appeal B-02(C)(W)-591-04/2023, 30 Jan 2026 (eFiling, Kehakiman Malaysia)  ·  ';

/**
 * Wireframe globe behind the news slide. Meridians are recomputed each frame (orthographic projection,
 * front half only, fading towards the rim) so it really turns. Thumbnails and exports show a still frame.
 */
const GLOBE = { cx: 1530, cy: 520, r: 400 };
const GLOBE_MERIDIANS = 18; // every 20°
const GLOBE_LATS = [-60, -40, -20, 0, 20, 40, 60];

const meridianPath = (lon: number) => {
  const { cx, cy, r } = GLOBE;
  const rx = Math.abs(Math.sin(lon)) * r;
  const sweep = Math.sin(lon) >= 0 ? 1 : 0;
  return `M ${cx} ${cy - r} A ${rx.toFixed(1)} ${r} 0 0 ${sweep} ${cx} ${cy + r}`;
};

const Globe = () => {
  const live = useIsActivePage();
  const refs = useRef<(SVGPathElement | null)[]>([]);
  useEffect(() => {
    const draw = (t: number) => {
      refs.current.forEach((el, i) => {
        if (!el) return;
        const lon = (i / GLOBE_MERIDIANS) * Math.PI * 2 + t;
        const front = Math.cos(lon);
        el.setAttribute('d', meridianPath(lon));
        el.style.opacity = front > 0 ? String(0.25 + 0.75 * front) : '0';
      });
    };
    draw(0.35);
    if (!live) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      draw(0.35 + ((now - t0) / 1000) * 0.18); // ~35 s per turn
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live]);
  const { cx, cy, r } = GLOBE;
  return (
    <svg aria-hidden width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <g fill="none" stroke="#C64A1F" strokeWidth={2} opacity={0.16}>
        <circle cx={cx} cy={cy} r={r} strokeWidth={3} />
        {GLOBE_LATS.map((lat) => {
          const y = cy - Math.sin((lat * Math.PI) / 180) * r;
          const w = Math.cos((lat * Math.PI) / 180) * r;
          return <line key={lat} x1={cx - w} y1={y} x2={cx + w} y2={y} />;
        })}
        {Array.from({ length: GLOBE_MERIDIANS }, (_, i) => (
          <path key={i} ref={(el) => { refs.current[i] = el; }} />
        ))}
      </g>
    </svg>
  );
};

const WhyItMatters: Page = () => {
  // No clicks: "breaking news" pill, then the headline, the case, the defects, and the ticker starts rolling.
  const live = useIsActivePage();
  const arrived = useArrived();
  return (
    <div style={{ ...fill, background: 'var(--osd-bg)', color: 'var(--osd-text)' }}>
      <Globe />
      <div aria-hidden style={{ position: 'absolute', right: 50, bottom: 170, fontSize: 360, fontWeight: 900, lineHeight: 0.85, letterSpacing: '-0.05em', color: watermark, fontFamily: 'var(--osd-font-display)' }}>
        01
      </div>
      <div style={{ position: 'absolute', left: PAD_X, right: PAD_X, top: 92 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, ...reveal(arrived, 0, 'translateY(10px)') }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: '#C64A1F', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 22, fontWeight: 800, letterSpacing: '0.14em', translate: '0px 125px' }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: '#fff', ...(live ? { animation: 'sf-blink 1.2s ease-in-out infinite' } : {}) }} />
            IN THE NEWS
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.12em', color: muted, translate: '0px 121px' }}>COURT OF APPEAL · 30 JAN 2026</span>
        </div>
        <h1 style={{ fontFamily: 'var(--osd-font-display)', fontSize: 64, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.02em', margin: '34px 0 0', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'block', ...reveal(arrived, 250, 'translateY(16px)'), translate: '0px 121px' }}>Developers may stay liable for latent defects,</span>
          <span style={{ display: 'block', color: 'var(--osd-accent)', ...reveal(arrived, 450, 'translateY(16px)'), translate: '0px 121px' }}>even after the 24-month Defect Liability Period.</span>
        </h1>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 34, color: ink, ...reveal(arrived, 750, 'translateY(12px)'), translate: '0px 121px' }}>
          Sime Darby Property (Bukit Jelutong) Sdn Bhd v Ooi Cheng Huat @ Ooi Peng Huat &amp; 2 Ors
        </div>
        <p style={{ fontSize: 27, lineHeight: 1.5, color: muted, margin: '12px 0 0', maxWidth: 1400, ...reveal(arrived, 850, 'translateY(12px)'), translate: '0px 121px' }}>
          The Court of Appeal upheld the ruling. The case shows why defect rectification needs evidence and long-term accountability.
        </p>
        <div style={{ display: 'flex', gap: 14, marginTop: 30, flexWrap: 'wrap', translate: '0px 121px' }}>
          <DefectChip on={arrived} delay={1000}>Water seepage</DefectChip>
          <DefectChip on={arrived} delay={1080}>Structural cracks</DefectChip>
          <DefectChip on={arrived} delay={1160}>Plumbing</DefectChip>
          <DefectChip on={arrived} delay={1240}>Electrical</DefectChip>
        </div>
      </div>
      <MorphElement id="news-band">
        <div style={NEWS_BAND}>
          <NewsBandLabel>LATEST</NewsBandLabel>
          <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{ display: 'inline-block', paddingLeft: 28, fontSize: 22, fontWeight: 600, color: ink, ...(live ? { animation: 'sf-ticker 26s linear 0.6s infinite' } : {}) }}>
              {TICKER}
              {TICKER}
            </div>
          </div>
        </div>
      </MorphElement>
      <Footer chapter={0} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// 04 · Solution (camera visits buyer → console → technician, oval draws around "proof")
// ---------------------------------------------------------------------------

const RoleLabel = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>{children}</div>
);

const RoleCaption = ({ children }: { children: ReactNode }) => (
  <p style={{ fontSize: 23, lineHeight: 1.4, color: muted, margin: '8px 0 0', textAlign: 'center' }}>{children}</p>
);

const Phone = ({ src, alt }: { src: string; alt: string }) => (
  <div
    style={{
      width: 186,
      height: 384,
      borderRadius: 32,
      border: `10px solid ${ink}`,
      overflow: 'hidden',
      background: '#fff',
      boxShadow: '0 30px 50px -20px rgba(28,24,20,0.4)',
    }}
  >
    <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
  </div>
);

/** The three-part motto. Same ids on Solution and How it works so chips glide and recolour. */
const Motto = ({ id, bg, color, children }: { id: string; bg: string; color: string; children: ReactNode }) => (
  <MorphElement id={id}>
    <div style={{ background: bg, color, fontSize: 27, fontWeight: 700, padding: '15px 32px', borderRadius: 12, whiteSpace: 'nowrap' }}>
      {children}
    </div>
  </MorphElement>
);


const Solution: Page = () => {
  // No camera: the three apps rise in together, then the "proof" circle and the "know the unknown" block (0.9 s).
  const arrived = useArrived();
  const done = useTimeline([900]) >= 1;
  return (
    <Frame
      eyebrow="03 · Solution"
      chapter={2}
      mark="03"
      title={
        <>
          Simephony: From complaint <Arrow color={muted} size={56} /> resolution <Arrow color={muted} size={56} />{' '}
          <span style={{ position: 'relative', color: 'var(--osd-accent)' }}>
            proof
            <svg viewBox="0 0 200 90" style={{ position: 'absolute', left: -16, top: -10, width: 190, height: 96, overflow: 'visible' }}>
              <ellipse
                cx="100"
                cy="46"
                rx="96"
                ry="38"
                fill="none"
                stroke="#C64A1F"
                strokeWidth="4"
                transform="rotate(-4 100 46)"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={done ? 0 : 1}
                style={{ transition: `stroke-dashoffset 850ms ${EASE_OUT} 250ms` }}
              />
            </svg>
          </span>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 60 }}>
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, ...reveal(arrived, 100, 'translateY(18px)') }}>
          <RoleLabel>BUYER</RoleLabel>
          <Phone src={appBuyer} alt="Buyer app: check and sign off screen" />
          <RoleCaption>Track repairs, verify fixes and stay informed throughout the process.</RoleCaption>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, ...reveal(arrived, 220, 'translateY(18px)') }}>
          <RoleLabel>SDP CONSOLE</RoleLabel>
          <div
            style={{
              width: 620,
              height: 370,
              borderRadius: 22,
              border: `12px solid ${ink}`,
              overflow: 'hidden',
              boxShadow: '0 30px 50px -20px rgba(28,24,20,0.4)',
              marginTop: 8,
            }}
          >
            <img src={appSdpConsole} alt="SDP console analytics" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left' }} />
          </div>
          <RoleCaption>Monitor all cases, approvals and recurring defects with explainable AI recommendations.</RoleCaption>
        </div>
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, ...reveal(arrived, 340, 'translateY(18px)') }}>
          <RoleLabel>TECHNICIAN</RoleLabel>
          <Phone src={appTechnician} alt="Technician app: case history" />
          <RoleCaption>Review unit history before arrival to deliver verified repairs.</RoleCaption>
        </div>
      </div>
      <div style={{ background: BLOCK, color: BLOCK_TEXT, borderRadius: 16, padding: '18px 30px', position: 'absolute', left: 0, right: 0, bottom: 0, ...reveal(done, 0, 'translateY(12px)') }}>
        <span style={{ fontSize: 26, fontWeight: 800 }}>
          Simephony helps developers <span style={{ color: BLOCK_HI }}>know the unknown.</span>
        </span>
        <span style={{ fontSize: 22, opacity: 0.92 }}>
          {' '}It connects the invisible dots across defect reports, repair outcomes and historical patterns, so a recurring issue surfaces before it escalates.
        </span>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 05 · How it works (the people / AI agents workflow; the ticket glides stage to stage above it)
// ---------------------------------------------------------------------------

/** The four stage columns of agent-workflow-people-ai.svg, in body px (diagram drawn 1680 px wide). */
const STAGE_COLS: [number, number][] = [[0, 576], [576, 952], [952, 1291], [1291, 1680]];
const STAGE_MID = STAGE_COLS.map(([l, r]) => (l + r) / 2);

const HowItWorks: Page = () => {
  // No clicks: the diagram fades in, the ticket glides across the four stages (a soft frame follows it), then the frame fades.
  const arrived = useArrived();
  const beat = useTimeline([300, 1000, 1700, 2400, 3100]);
  const at = Math.max(0, Math.min(beat - 1, 3));
  const framing = beat >= 1 && beat < 5;
  const [l, r] = STAGE_COLS[at];
  const MOVE = `600ms cubic-bezier(0.45, 0, 0.55, 1)`;
  return (
    <Frame eyebrow="04 · How it works" title="One defect, four stages, one trusted record" bodyTop={250} chapter={2} mark="04">
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 56 }}>
        <div style={{ position: 'absolute', left: STAGE_MID[0], width: STAGE_MID[3] - STAGE_MID[0], top: 26, height: 4, background: line, borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: STAGE_MID[0], width: STAGE_MID[at] - STAGE_MID[0], top: 26, height: 4, background: '#C64A1F', borderRadius: 2, transition: `width ${MOVE}` }} />
        <div style={{ position: 'absolute', left: STAGE_MID[at] - 160, width: 320, top: 0, display: 'flex', justifyContent: 'center', transition: `left ${MOVE}`, ...reveal(beat >= 1, 0, 'translateY(8px)') }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: BLOCK, color: BLOCK_TEXT, border: '2px solid #E9B9A3', borderRadius: 999, padding: '10px 22px', fontSize: 22, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 12px 26px -14px rgba(28,24,20,0.4)' }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: '#C64A1F', display: 'inline-block' }} />
            Ceiling leak · A-12-08
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 72, width: 1680, height: 492, ...reveal(arrived, 0, 'translateY(12px)') }}>
        <img src={peopleAiWorkflow} alt="Simephony workflow: people and AI agents across report, inspect, verify and recurrence" style={{ width: 1680, height: 492, display: 'block' }} />
        <div
          style={{
            position: 'absolute',
            top: -6,
            height: 504,
            left: l - 4,
            width: r - l + 8,
            borderRadius: 18,
            border: '3px solid #C64A1F',
            background: 'rgba(198,74,31,0.05)',
            boxShadow: '0 0 0 6px rgba(198,74,31,0.10)',
            opacity: framing ? 1 : 0,
            transition: `left ${MOVE}, width ${MOVE}, opacity 500ms ${EASE_OUT}`,
            pointerEvents: 'none',
          }}
        />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, ...reveal(beat >= 5, 0, 'translateY(10px)') }}>
        <Motto id="motto-ai" bg={blueSoft} color={blue}>AI recommends.</Motto>
        <Arrow />
        <Motto id="motto-people" bg={orangeSoft} color="#A63A14">Humans decide.</Motto>
        <Arrow />
        <Motto id="motto-system" bg="#ECE8E3" color={ink}>The system records.</Motto>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// Demo (the recorded walkthrough: buyer and technician apps side by side)
// ---------------------------------------------------------------------------

const DEMO_W = 1500;
const DEMO_H = Math.round((DEMO_W * 864) / 1920);

const Demo: Page = () => {
  // Plays from the start (with sound) when the slide opens; stops and rewinds when you leave.
  // Thumbnails, the PDF and other non-live views show the poster frame instead of a player.
  const live = useIsActivePage();
  const arrived = useArrived();
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (live) {
      v.currentTime = 0;
      v.play().catch(() => {
        // the browser blocked sound: play muted rather than not at all
        v.muted = true;
        v.play().catch(() => {});
      });
    } else {
      v.pause();
    }
  }, [live]);
  const box: CSSProperties = { width: DEMO_W, height: DEMO_H, display: 'block', borderRadius: 18, background: '#000' };
  return (
    <Frame eyebrow="Live demo" title="Buyer and technician, side by side." bodyTop={262} chapter={3}>
      <div style={{ display: 'flex', justifyContent: 'center', ...reveal(arrived, 0, 'translateY(16px)') }}>
        <div style={{ borderRadius: 18, border: `2px solid ${line}`, boxShadow: '0 30px 60px -30px rgba(28,24,20,0.45)', overflow: 'hidden' }}>
          {live ? (
            <video ref={ref} src={demoVideo} poster={demoPoster} playsInline controls preload="auto" style={box} />
          ) : (
            <img src={demoPoster} alt="Simephony demo: buyer and technician apps side by side" style={{ ...box, objectFit: 'cover' }} />
          )}
        </div>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 06 · Innovation (PDF Page 6: 4 updated pillars, 4-row comparison, L8–L13 stack map)
// ---------------------------------------------------------------------------

const Feature = ({ n, title, body, on, delay }: { n: string; title: string; body: ReactNode; on: boolean; delay: number }) => (
  <div style={reveal(on, delay)}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <NumBadge n={n} />
      <div style={{ fontSize: 26, fontWeight: 800 }}>{title}</div>
    </div>
    <div style={{ fontSize: 21, lineHeight: 1.42, color: muted, marginTop: 8 }}>{body}</div>
  </div>
);

const CompareRow = ({ left, right, last, on, delay }: { left: string; right: string; last?: boolean; on: boolean; delay: number }) => (
  <div style={{ display: 'flex', borderBottom: last ? 'none' : `2px solid ${line}`, ...reveal(on, delay, 'translateX(32px)') }}>
    <div style={{ flex: 1, padding: '11px 20px', fontSize: 21, color: muted }}>{left}</div>
    <div style={{ flex: 1, padding: '11px 20px', fontSize: 21, fontWeight: 700, borderLeft: `2px solid ${line}` }}>{right}</div>
  </div>
);

/* Building cross-section (after the PDF's leak cutaway): floors L13–L8, units 07 / 08 / 09, shared riser in stack 08. */
const SEC_TOP = 34;
const SEC_FLOOR = 60;
const secY = (i: number) => SEC_TOP + i * SEC_FLOOR; // i = 0 for L13 … 5 for L8
const UNIT_08 = 334;

const SecFloor = ({ i, label }: { i: number; label: string }) => (
  <g>
    <text x="40" y={secY(i) + 37} textAnchor="end" fontSize="18" fontWeight="700" fill={muted}>{label}</text>
    <rect x="56" y={secY(i)} width="180" height={SEC_FLOOR - 6} rx="4" fill="#F4ECE3" />
    <rect x="244" y={secY(i)} width="180" height={SEC_FLOOR - 6} rx="4" fill="#F4ECE3" />
    <rect x="452" y={secY(i)} width="170" height={SEC_FLOOR - 6} rx="4" fill="#F4ECE3" />
    <rect x="52" y={secY(i) + SEC_FLOOR - 6} width="574" height="6" fill="#D9CBBB" />
  </g>
);

/** A leak marker: a labelled pill on the ceiling of the affected unit ("Leak", or "Leak ×3" for A-12-08). */
/** Water dripping from the ceiling of one leaking unit (clipped to that unit; live page only). */
const UNIT_DRIPS: [number, number][] = [[-70, 0], [-48, 520], [-22, 260], [6, 780], [32, 140], [58, 640], [76, 380]];
const UnitDrips = ({ cx, i, on, delay }: { cx: number; i: number; on: boolean; delay: number }) => {
  const live = useIsActivePage();
  const top = secY(i);
  const clip = `sf-unit-${cx}-${i}`;
  return (
    <g clipPath={`url(#${clip})`} style={{ opacity: on ? 1 : 0, transition: `opacity 300ms ${EASE_OUT} ${delay}ms` }}>
      <clipPath id={clip}>
        <rect x={cx - 90} y={top} width={180} height={SEC_FLOOR - 6} />
      </clipPath>
      <rect x={cx - 90} y={top} width={180} height={5} fill="#6E9BD6" opacity="0.45" />
      {UNIT_DRIPS.map(([dx, d], k) => (
        <line
          key={k}
          x1={cx + dx}
          y1={top + 4}
          x2={cx + dx}
          y2={top + 14}
          stroke="#5A8BD0"
          strokeWidth="2.4"
          strokeLinecap="round"
          style={live && on ? { animation: `sf-drip 900ms ease-in ${delay + d}ms infinite` } : { opacity: 0 }}
        />
      ))}
    </g>
  );
};

const LeakTag = ({ cx, i, hot, on, delay }: { cx: number; i: number; hot?: boolean; on: boolean; delay: number }) => {
  const w = hot ? 150 : 104;
  const y = secY(i) + 32;
  return (
    <g
      style={{
        opacity: on ? 1 : 0,
        transform: on ? 'scale(1)' : 'scale(0.85)',
        transformBox: 'fill-box',
        transformOrigin: 'center',
        transition: `opacity 250ms ${EASE_OUT} ${delay}ms, transform 420ms ${SPRING} ${delay}ms`,
      }}
    >
      <rect x={cx - w / 2} y={y - 16} width={w} height={32} rx={16} fill={hot ? '#C64A1F' : '#F0A35E'} />
      <path d={`M${cx - w / 2 + 22} ${y - 9} C${cx - w / 2 + 22} ${y - 9} ${cx - w / 2 + 15} ${y} ${cx - w / 2 + 15} ${y + 3} a7 7 0 0 0 14 0 C${cx - w / 2 + 29} ${y} ${cx - w / 2 + 22} ${y - 9} ${cx - w / 2 + 22} ${y - 9}z`} fill="#fff" />
      <text x={cx - w / 2 + 36} y={y + 6} fontSize="17" fontWeight="800" fill="#fff">
        {hot ? 'Leak ×3' : 'Leak'}
      </text>
    </g>
  );
};

const StackSection = ({ leaks, hot }: { leaks: boolean; hot: boolean }) => {
  return (
    <svg viewBox="0 0 650 430" style={{ width: 584, height: 386, marginTop: 8, overflow: 'visible' }}>
      <text x="146" y="22" textAnchor="middle" fontSize="18" fontWeight="700" fill={muted}>Unit 07</text>
      <text x={UNIT_08} y="22" textAnchor="middle" fontSize="18" fontWeight="800" fill={hot ? '#C64A1F' : muted} style={{ transition: 'fill 400ms' }}>Unit 08</text>
      <text x="537" y="22" textAnchor="middle" fontSize="18" fontWeight="700" fill={muted}>Unit 09</text>
      <SecFloor i={0} label="L13" />
      <SecFloor i={1} label="L12" />
      <SecFloor i={2} label="L11" />
      <SecFloor i={3} label="L10" />
      <SecFloor i={4} label="L9" />
      <SecFloor i={5} label="L8" />
      {/* Shared riser shaft beside stack 08 */}
      <rect x="430" y={SEC_TOP} width="16" height={SEC_FLOOR * 6} rx="4" fill={hot ? '#C64A1F' : '#CDBFB0'} style={{ transition: `fill 500ms ${EASE_OUT} 150ms` }} />
      <text x="438" y={SEC_TOP + SEC_FLOOR * 6 + 26} textAnchor="middle" fontSize="16" fontWeight="700" fill={hot ? '#C64A1F' : soft} style={{ transition: 'fill 400ms' }}>riser</text>
      <UnitDrips cx={UNIT_08} i={4} on={leaks} delay={0} />
      <UnitDrips cx={UNIT_08} i={3} on={leaks} delay={150} />
      <UnitDrips cx={UNIT_08} i={2} on={leaks} delay={300} />
      <UnitDrips cx={146} i={1} on={leaks} delay={450} />
      <UnitDrips cx={UNIT_08} i={1} on={leaks} delay={600} />
      <LeakTag cx={UNIT_08} i={4} on={leaks} delay={0} />
      <LeakTag cx={UNIT_08} i={3} on={leaks} delay={150} />
      <LeakTag cx={UNIT_08} i={2} on={leaks} delay={300} />
      <LeakTag cx={146} i={1} on={leaks} delay={450} />
      <LeakTag cx={UNIT_08} i={1} hot on={leaks} delay={600} />
      {/* The link: one dashed bracket around stack 08 + the riser */}
      <rect
        x="236"
        y={secY(1) - 8}
        width="220"
        height={SEC_FLOOR * 4 + 10}
        rx="14"
        fill="none"
        stroke="#C64A1F"
        strokeWidth="3.5"
        strokeDasharray="10 8"
        style={{ opacity: hot ? 1 : 0, transition: `opacity 450ms ${EASE_OUT}` }}
      />
      <g style={{ opacity: hot ? 1 : 0, transition: `opacity 400ms ${EASE_OUT} 250ms` }}>
        <rect x="262" y={secY(5) + 8} width="168" height="34" rx="17" fill="#C64A1F" />
        <text x="346" y={secY(5) + 31} textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff">Shared riser defect</text>
      </g>
    </svg>
  );
};

const Innovation: Page = () => {
  // Two batches, no clicks: the building and its leaks (then the escalation), then the whole right column.
  const beat = useTimeline([250, 1150, 1900]);
  const leaks = beat >= 1;
  const hot = beat >= 2;
  const right = beat >= 3;
  return (
    <Frame
      eyebrow="05 · Innovation"
      title="What a normal ticket system can’t do"
      subtitle="From tracking complaints to detecting systemic risks."
      bodyTop={290}
      mark="05"
      chapter={3}
    >
      <div style={{ display: 'flex', gap: 48, height: 680 }}>
        <Card style={{ width: 640, padding: '22px 28px', flexShrink: 0, height: 680, display: 'flex', flexDirection: 'column', ...reveal(beat >= 0, 0, 'translateY(24px)') }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '0.12em' }}>BLOCK A · SECTION VIEW</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: hot ? 'var(--osd-accent)' : soft, transition: 'color 400ms' }}>
              {hot ? '● 1 pattern, not 5 tickets' : '○ 5 separate tickets'}
            </div>
          </div>
          <StackSection leaks={leaks} hot={hot} />
          <div style={{ display: 'flex', gap: 24, fontSize: 20, color: muted, marginTop: 6 }}>
            <span><b style={{ color: 'var(--osd-accent)' }}>■</b> 3 reports from A-12-08</span>
            <span><b style={{ color: '#F0A35E' }}>■</b> related leaks in the stack</span>
          </div>
          <div
            style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 16, background: BLOCK, color: BLOCK_TEXT, borderRadius: 14, padding: '14px 20px', ...reveal(hot, 500, 'translateY(24px)') }}
          >
            <Icon name="alert" color={BLOCK_HI} size={32} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Auto-escalated to SDP</div>
              <div style={{ fontSize: 19, opacity: 0.82, marginTop: 2 }}>3rd occurrence · 4 units in stack 08 · extra inspection proposed</div>
            </div>
          </div>
        </Card>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '629.34px', minWidth: '0px', minHeight: '0px', maxWidth: 'none', maxHeight: 'none', flexShrink: '0', flexGrow: '0', flexBasis: 'auto', width: '992px', translate: '0px 0px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 36, rowGap: 16, translate: '0px 26px' }}>
            <Feature
              on={right}
              delay={0}
              n="01"
              title="Similar-Defect Linking"
              body="Connects related defects across units, stacks and contractors to identify potential systemic issues."
            />
            <Feature
              on={right}
              delay={60}
              n="02"
              title="Recurrence Detection"
              body="Triggers automatic escalation when recurring defects or multiple affected units meet defined thresholds."
            />
            <Feature
              on={right}
              delay={120}
              n="03"
              title="Human-in-the-Loop"
              body="AI investigates and recommends. Humans approve verdicts, repair sign-offs and escalations."
            />
            <Feature
              on={right}
              delay={180}
              n="04"
              title="Evidence & Guardrails"
              body="Maintains traceable records, detects duplicate repair photos and restricts unsafe AI responses."
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ border: `2px solid ${ink}`, borderRadius: 16, overflow: 'hidden', background: card, ...reveal(right, 0, 'translateY(24px)'), translate: '0px 18px' }}>
              <div style={{ display: 'flex', background: '#F2EBE3', borderBottom: `2px solid ${line}` }}>
                <div style={{ flex: 1, padding: '10px 20px', fontSize: 18, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--osd-accent)' }}>NORMAL SYSTEM</div>
                <div style={{ flex: 1, padding: '10px 20px', fontSize: 18, fontWeight: 800, letterSpacing: '0.1em', color: green, borderLeft: `2px solid ${line}` }}>SIMEPHONY</div>
              </div>
              <CompareRow on={right} delay={80} left="3rd complaint = New ticket" right="3rd occurrence = Auto-escalation" />
              <CompareRow on={right} delay={180} left="Contractor marks repaired = Closed" right="Failed verification = Case reopens" />
              <CompareRow on={right} delay={280} left="30 days to identify pattern" right="< 24 hours to flag systemic issue" />
              <CompareRow on={right} delay={380} left="Separate reports" right="Connected defect patterns" last />
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 07 · Impact (PDF Page 8: updated copy, camera visits each card)
// ---------------------------------------------------------------------------

const ImpactCard = ({ n, icon, title, on, children }: { n: string; icon: 'camera' | 'link' | 'alert'; title: string; on: boolean; children: ReactNode }) => (
  <div style={{ flex: 1, display: 'flex', ...reveal(on, 0, 'translateY(18px)') }}>
    <Card style={{ flex: 1, padding: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 70, height: 70, borderRadius: 20, background: orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={38} />
        </div>
        <span style={{ fontSize: 44, fontWeight: 900, color: '#EADFD3' }}>{n}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, marginTop: 20 }}>{title}</div>
      <ul style={{ fontSize: 24, lineHeight: 1.45, color: muted, margin: '14px 0 0', paddingLeft: 28, listStyleType: 'disc' }}>{children}</ul>
    </Card>
  </div>
);

const ValueTile = ({ who, what, on, delay }: { who: string; what: string; on: boolean; delay: number }) => (
  <div style={{ flex: 1, padding: '0 32px', ...reveal(on, delay) }}>
    <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '0.12em', color: BLOCK_HI }}>{who}</div>
    <div style={{ fontSize: 26, fontWeight: 600, marginTop: 8, lineHeight: 1.35 }}>{what}</div>
  </div>
);

const Impact: Page = () => {
  // Two automatic batches: the three cards together, then the values bar (all in about 2 s).
  const arrived = useArrived();
  const done = useTimeline([1000]) >= 1;
  return (
    <Frame
      eyebrow="06 · Impact"
      title="Closed doesn’t mean resolved"
      subtitle="Simephony verifies outcomes, connects recurrence and flags systemic risks."
      bodyTop={296}
      mark="06"
      chapter={4}
    >
      <div style={{ display: 'flex', gap: 32 }}>
        <ImpactCard on={arrived} n="01" icon="camera" title="Verify actual resolution">
          <li style={{ marginBottom: 8 }}>AI compares the repair photo with the original and flags any mismatch for SDP</li>
          <li style={{ marginBottom: 8 }}>Closes only after SDP and the buyer both sign off</li>
          <li>Unresolved defects stay visible</li>
        </ImpactCard>
        <ImpactCard on={arrived} n="02" icon="link" title="Connect the pattern">
          <li style={{ marginBottom: 10 }}>Connect related cases across units, floors, stacks and repair histories</li>
          <li>A returning defect counts as a recurrence, not a new ticket</li>
        </ImpactCard>
        <ImpactCard on={arrived} n="03" icon="alert" title="Escalate early">
          <li style={{ marginBottom: 10 }}>Repeated occurrence or units with defects in a stack → flagged as systemic</li>
          <li>Route suspected systemic issues for Sime Darby Property approval before arranging an extra inspection</li>
        </ImpactCard>
      </div>
      <div
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', background: BLOCK, color: BLOCK_TEXT, borderRadius: 'var(--osd-radius)', padding: '26px 0', ...reveal(done, 0, 'translateY(18px)'), translate: '0px -20px' }}
      >
        <div style={{ padding: '0 40px', fontSize: 30, fontWeight: 800, color: BLOCK_HI }}>Values</div>
        <ValueTile on={done} delay={160} who="RESIDENTS" what="Clearer updates and greater confidence" />
        <ValueTile on={done} delay={300} who="OPERATIONS" what="Less duplicated investigation and repeat work" />
        <ValueTile on={done} delay={440} who="QUALITY" what="Earlier signals of systemic defects" />
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 08 · Feasibility (PDF Page 9: 4 architecture layers + built-in human accountability + 3 pillars)
// ---------------------------------------------------------------------------

const ARCH_X = [0, 328, 656, 984];

const ArchBox = ({
  x,
  icon,
  title,
  body,
  tone,
  state,
}: {
  x: number;
  icon: 'layers' | 'plug' | 'shield' | 'link';
  title: string;
  body: string;
  tone: 'light' | 'warm' | 'dark';
  state: 'off' | 'active' | 'done';
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: 0,
      width: 288,
      height: 226,
      boxSizing: 'border-box',
      borderRadius: 18,
      padding: '22px 22px',
      background: tone === 'dark' ? BLOCK : tone === 'warm' ? orangeSoft : card,
      color: tone === 'dark' ? BLOCK_TEXT : ink,
      border: tone === 'dark' ? '2px solid #C64A1F' : tone === 'warm' ? '2px solid #E9B9A3' : `2px solid ${line}`,
      opacity: state === 'off' ? 0.3 : 1,
      transform: state === 'active' ? 'translateY(-4px)' : 'none',
      boxShadow: state === 'active' ? '0 26px 46px -22px rgba(198,74,31,0.52)' : '0 18px 40px -26px rgba(28,24,20,0.2)',
      transition: `opacity 500ms ${EASE_OUT}, transform 500ms ${SPRING}, box-shadow 500ms`,
    }}
  >
    <Icon name={icon} color={tone === 'dark' ? BLOCK_HI : '#C64A1F'} size={34} />
    <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.25, marginTop: 10 }}>{title}</div>
    <div style={{ fontSize: 19, lineHeight: 1.38, marginTop: 8, opacity: 0.85 }}>{body}</div>
  </div>
);

const ArchArrow = ({ x, on }: { x: number; on: boolean }) => (
  <div style={{ position: 'absolute', left: x, top: 96, width: 40, textAlign: 'center', fontSize: 28, fontWeight: 800, color: on ? '#C64A1F' : '#D8CCBF', transition: 'color 400ms' }}>
    →
  </div>
);

const WhyCol = ({ n, title, on, delay, children }: { n: string; title: string; on: boolean; delay: number; children: ReactNode }) => (
  <div style={{ flex: 1, ...reveal(on, delay) }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <NumBadge n={n} />
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.25 }}>{title}</div>
    </div>
    <ul style={{ fontSize: 22, lineHeight: 1.45, color: muted, margin: '14px 0 0', paddingLeft: 28, listStyleType: 'disc' }}>{children}</ul>
  </div>
);

const Feasibility: Page = () => {
  // No clicks: the packet glides once through the four layers (~1 s), each layer lighting as it passes,
  // then the three reasons appear.
  const arrived = useArrived();
  const beat = useTimeline([480, 820, 1150, 1400]);
  const at = Math.min(beat, 3);
  const st = (i: number): 'off' | 'active' | 'done' => (beat >= 4 ? 'done' : i === at ? 'active' : i < at ? 'done' : 'off');
  return (
    <Frame eyebrow="07 · Feasibility" title="How it fits alongside SDP’s systems" mark="07" chapter={5}>
      <div style={{ position: 'relative', height: 284, translate: '0.4px -11.69px' }}>
        <ArchBox x={ARCH_X[0]} icon="link" state={st(0)} tone="light" title="Core Data & Storage" body="SQLite, photo uploads and a full event log as the audit trail" />
        <ArchArrow x={288} on={at >= 1} />
        <ArchBox x={ARCH_X[1]} icon="plug" state={st(1)} tone="warm" title="Backend & FastMCP Tools" body="Business rules, bookings and case statuses in one rules layer" />
        <ArchArrow x={616} on={at >= 2} />
        <ArchBox x={ARCH_X[2]} icon="shield" state={st(2)} tone="dark" title="Simephony AI Agents" body="Intake · Similar Defect · Triage · Booking · Verification · Recurrence" />
        <ArchArrow x={944} on={at >= 3} />
        <ArchBox x={ARCH_X[3]} icon="layers" state={st(3)} tone="light" title="Role-Based Portals" body="Buyer · Technician · SDP team" />

        {/* Human accountability panel from PDF Page 9 */}
        <div
          style={{
            position: 'absolute',
            left: 1304,
            top: 0,
            width: 376,
            height: 226,
            boxSizing: 'border-box',
            borderRadius: 18,
            padding: '20px 24px',
            background: BLOCK,
            color: BLOCK_TEXT,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 22px 44px -22px rgba(28,24,20,0.45)',
            opacity: beat >= 3 ? 1 : 0.35,
            transition: `opacity 500ms ${EASE_OUT}`,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, color: BLOCK_HI, lineHeight: 1.2 }}>
            Human accountability stays built in.
          </div>
          <div style={{ fontSize: 19, lineHeight: 1.4, color: muted }}>
            <span style={{ color: green, fontWeight: 800 }}>✓</span> Technicians record technical verdicts
          </div>
          <div style={{ fontSize: 19, lineHeight: 1.4, color: muted }}>
            <span style={{ color: green, fontWeight: 800 }}>✓</span> SDP approves extra inspections
          </div>
          <div style={{ fontSize: 19, lineHeight: 1.4, color: muted }}>
            <span style={{ color: green, fontWeight: 800 }}>✓</span> Backend enforces statuses &amp; permissions
          </div>
        </div>

        {/* Travelling data packet across the 4 system boxes */}
        <div style={{ position: 'absolute', left: 144, width: 984, top: 256, height: 4, background: line, borderRadius: 2 }} />
        <div
          style={{
            position: 'absolute',
            left: (arrived ? ARCH_X[3] : ARCH_X[0]) + 144 - 13,
            top: 245,
            width: 26,
            height: 26,
            borderRadius: 13,
            background: '#C64A1F',
            boxShadow: '0 0 0 8px rgba(198,74,31,0.18), 0 0 26px rgba(198,74,31,0.55)',
            transition: `left 1000ms cubic-bezier(0.45, 0, 0.55, 1) 150ms, opacity 400ms ${EASE_OUT}`,
            opacity: beat >= 4 ? 0 : 1,
          }}
        />
      </div>

      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)', marginTop: 10, ...reveal(beat >= 4, 0) }}>
        WHY IT’S FEASIBLE
      </div>
      <div style={{ display: 'flex', gap: 48, marginTop: 18 }}>
        <WhyCol on={beat >= 4} delay={60} n="01" title="Built on an achievable technology stack">
          <li style={{ marginBottom: 8 }}>Prototype: LangGraph, FastAPI / FastMCP, Next.js, SQLite. Local Ollama or Cloud Gemini AI Model, switched through config.</li>
          <li>Falls back to rules or holds for SDP review if a model fails.</li>
        </WhyCol>
        <WhyCol on={beat >= 4} delay={200} n="02" title="Human oversight built into every step">
          <li style={{ marginBottom: 8 }}>AI investigates and recommends; technicians record verdicts while SDP approves extra inspections.</li>
          <li>Backend rules enforce case statuses, bookings, permissions and alerts.</li>
        </WhyCol>
        <WhyCol on={beat >= 4} delay={340} n="03" title="Middleware without replacing systems">
          <li style={{ marginBottom: 8 }}>Integrates with existing systems and databases through APIs and FastMCP tools.</li>
          <li>Uses event-driven processing and SSE for live case updates.</li>
        </WhyCol>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 09 · Scalability (PDF Page 10: winding road roadmap with 750+ tests & camera ride)
// ---------------------------------------------------------------------------

const NODE_X = [148, 496, 844, 1192, 1532];
const NODE_Y = [308, 378, 308, 378, 308];

const WindingPhase = ({
  n,
  x,
  y,
  above,
  name,
  when,
  body,
  checks,
  on,
  current,
  here,
}: {
  n: string;
  x: number;
  y: number;
  above: boolean;
  name: string;
  when: string;
  body: string;
  checks: string[];
  on: boolean;
  current: boolean;
  here?: boolean;
}) => {
  const cardLeft = Math.min(Math.max(x - 150, 0), 1680 - 336);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - 30,
          top: y - 30,
          width: 60,
          height: 60,
          borderRadius: 30,
          background: on ? '#C64A1F' : card,
          color: on ? '#fff' : '#D5C8BA',
          border: `3px solid ${on ? '#C64A1F' : '#E3D7CA'}`,
          fontSize: 24,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          transform: current ? 'scale(1.18)' : 'scale(1)',
          boxShadow: current ? '0 0 0 10px rgba(198,74,31,0.16)' : 'none',
          transition: `background 400ms, color 400ms, border-color 400ms, transform 560ms ${SPRING}, box-shadow 400ms`,
          zIndex: 2,
        }}
      >
        {n}
      </div>
      <div
        style={{
          position: 'absolute',
          left: cardLeft,
          top: above ? 0 : 426,
          width: 336,
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.18 }}>{name}</div>
        <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--osd-accent)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          {when}
          {here ? (
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.1em', color: '#fff', background: '#C64A1F', padding: '4px 9px', borderRadius: 6 }}>
              WE ARE HERE
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 20, lineHeight: 1.38, color: muted, marginTop: 8 }}>{body}</div>
        <div style={{ fontSize: 20, lineHeight: 1.35, color: blue, fontWeight: 700, marginTop: 8 }}>
          ✓ {checks[0]}
          {checks[1] ? (
            <div style={{ marginTop: 4 }}>✓ {checks[1]}</div>
          ) : null}
        </div>
      </div>
    </>
  );
};

const RoadSegment = ({ d, on, ms = CAM_MS }: { d: string; on: boolean; ms?: number }) => (
  <>
    <path d={d} fill="none" stroke={line} strokeWidth="14" strokeLinecap="round" />
    <path
      d={d}
      fill="none"
      stroke="#C64A1F"
      strokeWidth="14"
      strokeLinecap="round"
      pathLength={1}
      strokeDasharray="1"
      strokeDashoffset={on ? 0 : 1}
      style={{ transition: `stroke-dashoffset ${ms}ms ${CAM_EASE}` }}
    />
  </>
);

/** "Built to scale": the two points that make one engine work across developments (bottom-right of the roadmap). */
const EngineCard = ({ on }: { on: boolean }) => (
  <div
    style={{
      position: 'absolute',
      left: 1396,
      top: 430,
      width: 284,
      boxSizing: 'border-box',
      background: BLOCK,
      color: BLOCK_TEXT,
      borderRadius: 18,
      padding: '18px 22px',
    }}
  >
    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.12em', color: BLOCK_HI }}>ONE ENGINE, MANY DEVELOPMENTS</div>
    <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'flex-start' }}>
      <Icon name="layers" color={BLOCK_HI} size={24} />
      <div>
        <div style={{ fontSize: 19, fontWeight: 800 }}>Configurable rules</div>
        <div style={{ fontSize: 16, lineHeight: 1.35, opacity: 0.8 }}>Categories, thresholds and workflows in rules.yaml</div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-start' }}>
      <Icon name="plug" color={BLOCK_HI} size={24} />
      <div>
        <div style={{ fontSize: 19, fontWeight: 800 }}>Modular agents</div>
        <div style={{ fontSize: 16, lineHeight: 1.35, opacity: 0.8 }}>Add trade-specific agents and integrations</div>
      </div>
    </div>
  </div>
);

const Scalability: Page = () => {
  // No clicks, no zoom: the road and phases 0 → 4 colour in one after another (~2 s).
  const beat = useTimeline([250, 600, 950, 1300, 1650]);
  const at = Math.min(beat, 4);
  return (
    <Frame eyebrow="08 · Scalability & implementation" title="Prove on one phase, then scale across townships" mark="08" chapter={6}>
      <svg viewBox="0 0 1680 690" style={{ position: 'absolute', left: 0, top: 0, width: 1680, height: 690, pointerEvents: 'none' }}>
        <RoadSegment d="M 148 308 C 285 308, 359 378, 496 378" on={at >= 1} ms={340} />
        <RoadSegment d="M 496 378 C 633 378, 707 308, 844 308" on={at >= 2} ms={340} />
        <RoadSegment d="M 844 308 C 981 308, 1055 378, 1192 378" on={at >= 3} ms={340} />
        <RoadSegment d="M 1192 378 C 1329 378, 1395 308, 1532 308" on={at >= 4} ms={340} />
      </svg>

      <WindingPhase
        n="0"
        x={NODE_X[0]}
        y={NODE_Y[0]}
        above
        here
        on={beat >= 0}
        current={false}
        name="Prototype"
        when="Now"
        body="Working end-to-end multi-agent system with 4 live defect scenarios."
        checks={['750+ automated tests passing']}
      />
      <WindingPhase
        n="1"
        x={NODE_X[1]}
        y={NODE_Y[1]}
        above={false}
        on={beat >= 1}
        current={false}
        name="Shadow pilot"
        when="Months 1–3"
        body="Runs silently alongside the Command & Contact Centre (CCC) on one new handover phase."
        checks={['AI recommends, staff decide', 'Target: > 90% staff alignment']}
      />
      <WindingPhase
        n="2"
        x={NODE_X[2]}
        y={NODE_Y[2]}
        above
        on={beat >= 2}
        current={false}
        name="Live pilot"
        when="Months 4–6"
        body="Active deployment for waterproofing, leaks and electrical with real-time booking & verification."
        checks={['Measure repeat visits & reopens']}
      />
      <WindingPhase
        n="3"
        x={NODE_X[3]}
        y={NODE_Y[3]}
        above={false}
        on={beat >= 3}
        current={false}
        name="Township Scale"
        when="Months 6–12"
        body="Multi-township rollout integrated with CCC and Procore across all trades."
        checks={['Contractor quality benchmarking']}
      />
      <WindingPhase
        n="4"
        x={NODE_X[4]}
        y={NODE_Y[4]}
        above
        on={beat >= 4}
        current={false}
        name="Portfolio Expansion"
        when="Year 2+"
        body="Extends to SDP’s Investment & Asset Management portfolio (retail malls, KL East, industrial) post-DLP."
        checks={['Recurring-income property workflows']}
      />
      <EngineCard on={beat >= 5} />
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

const ThankYou: Page = () => {
  const live = useIsActivePage();
  return (
    <div style={{ ...fill, background: ink, color: '#fff' }}>
      <img src={closingImg} alt="" style={{ position: 'absolute', right: 0, top: 0, width: 860, height: '100%', objectFit: 'cover', ...anim(live, 'sf-fade', 1200, 0) }} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: 860, height: '100%', background: 'linear-gradient(90deg, #1C1814 0%, rgba(28,24,20,0) 40%)' }} />
      <div style={{ position: 'absolute', left: PAD_X, top: 0, bottom: 0, width: 1020, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: '"Allura", cursive', fontSize: 150, color: '#FBE3D3', lineHeight: 1, paddingRight: 30, alignSelf: 'flex-start', ...anim(live, 'sf-wipe', 1400, 180, 'cubic-bezier(0.5, 0, 0.3, 1)') }}>
          Simephony
        </div>
        <h1 style={{ fontSize: 120, fontWeight: 800, letterSpacing: '-0.03em', margin: '36px 0 0', lineHeight: 1, ...anim(live, 'sf-rise', 750, 750) }}>Thank you!</h1>
        <p style={{ fontSize: 34, lineHeight: 1.4, margin: '36px 0 0', color: 'rgba(255,255,255,0.86)', ...anim(live, 'sf-rise', 750, 1100) }}>
          Don’t just close the defect. <span style={{ color: bright, fontWeight: 700 }}>Prove the root cause is fixed.</span>
        </p>
        <p style={{ fontSize: 25, margin: '52px 0 0', color: 'rgba(255,255,255,0.62)', ...anim(live, 'sf-fade', 700, 1500) }}>Group We Hit The Token Limit · Questions welcome</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Appendix divider
// ---------------------------------------------------------------------------

const AppendixRow = ({ k, label }: { k: string; label: string }) => (
  <div style={{ display: 'flex', gap: 24, fontSize: 29, alignItems: 'baseline' }}>
    <span style={{ width: 40, fontWeight: 800, color: bright }}>{k}</span>
    <span>{label}</span>
  </div>
);

const AppendixDivider: Page = () => (
  <div style={{ ...fill, background: ink, color: '#fff' }}>
    <div style={{ position: 'absolute', left: PAD_X, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.16em', color: bright }}>{''}<br />{''}</div>
      <h1 style={{ fontSize: 140, fontWeight: 800, letterSpacing: '-0.03em', margin: '20px 0 0', lineHeight: 1 }}>Appendix</h1>
    </div>
    <div style={{ position: 'absolute', left: 1000, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
      <AppendixRow k="A" label="Testimonials &amp; homeowner voices" />
      <AppendixRow k="B" label="Value-added model &amp; sources" />
      <AppendixRow k="C" label="Target users" />
      <AppendixRow k="D" label="AI justification, AIGE &amp; NIST risks" />
      <AppendixRow k="E" label="Risks and mitigation" />
      <AppendixRow k="F" label="Future enhancements" />
      <AppendixRow k="G" label="Meet the team" />
    </div>
    <div style={{ position: 'absolute', right: PAD_X, bottom: 48 }}>
      <PageNo color="rgba(255,255,255,0.6)" />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// A · Testimonials + Homeowner Voices (PDF Pages 12 & 13)
// ---------------------------------------------------------------------------

const Person = ({ src, name, role, rotate, children }: { src: string; name: string; role: string; rotate: number; children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
    <div style={{ background: '#fff', padding: '14px 14px 40px', boxShadow: '0 14px 30px rgba(28,24,20,0.16)', transform: `rotate(${rotate}deg)`, flexShrink: 0 }}>
      <img src={src} alt={name} style={{ width: 220, height: 220, objectFit: 'cover', display: 'block' }} />
    </div>
    <div>
      <div style={{ fontSize: 27, fontWeight: 800 }}>{name}</div>
      <div style={{ fontSize: 21, color: muted, marginTop: 4 }}>{role}</div>
      <ul style={{ margin: '14px 0 0', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 22, lineHeight: 1.4, color: ink }}>
        {children}
      </ul>
    </div>
  </div>
);

const Change = ({ done, title, body }: { done: boolean; title: string; body: string }) => (
  <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        flexShrink: 0,
        background: done ? green : amberSoft,
        color: done ? '#fff' : amber,
        border: done ? 'none' : `2px dashed ${amber}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        fontWeight: 800,
        boxSizing: 'border-box',
      }}
    >
      {done ? '✓' : '…'}
    </div>
    <div>
      <div style={{ fontSize: 25, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 21, lineHeight: 1.4, color: muted, marginTop: 4 }}>{body}</div>
    </div>
  </div>
);

const Testimonials: Page = () => (
  <Frame eyebrow="Appendix A · Testimonials" title="We listened, then we built it" mark="A">
    <div style={{ display: 'flex', gap: 56, height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 48 }}>
        <Person src={testimonialKimberly} name="Kimberly Anne Surin, 27" role="Interior Designer" rotate={-2}>
          <li>Buyers may not need to book repair slots, as third-party contractors usually handle repairs.</li>
          <li>Introduce a dedicated contractor role.</li>
          <li>Add a shared communication tab for buyers, SDP and contractors to exchange updates and notes.</li>
        </Person>
        <Person src={testimonialLim} name="Lim Yap Cheong, 57" role="Taman Prestij III House Owner" rotate={2}>
          <li>Repair scheduling should be handled by SDP or contractors, not buyers.</li>
          <li>Provide one overall sign-off for all completed defects.</li>
          <li>Support bulk defect management, as one unit may have 20–30 defects.</li>
        </Person>
      </div>
      <Card style={{ width: 610, padding: 36, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>WHAT WE CHANGED</div>
        <Change done title="No more booking by the buyer" body="Inspection and repair times are booked automatically with the first free technician." />
        <Change done title="One overall sign-off per unit" body="The buyer verifies each defect and signs off the whole unit once, supporting multi-defect units." />
        <Change done={false} title="Next: dedicated contractor role" body="For third-party agents or contractors managing repairs on the owner’s behalf." />
        <Change done={false} title="Next: shared communication tab" body="So buyers, SDP and contractors can exchange defect notes in one thread." />
      </Card>
    </div>
  </Frame>
);

const VoiceCard = ({
  quote,
  author,
  response,
  on,
  delay,
}: {
  quote: string;
  author: string;
  response: string;
  on: boolean;
  delay: number;
}) => (
  <Card style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', ...reveal(on, delay) }}>
    <div>
      <div style={{ fontSize: 21, lineHeight: 1.42, color: ink }}>“{quote}”</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: soft, marginTop: 10 }}>– {author}</div>
    </div>
    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.08em', color: '#C64A1F', background: orangeSoft, padding: '5px 12px', borderRadius: 999 }}>
        WHAT WE DO
      </span>
      <span style={{ fontSize: 20, fontWeight: 800, color: ink }}>{response}</span>
    </div>
  </Card>
);

const HomeownerVoices: Page = () => {
  const arrived = useArrived();
  return (
    <Frame
      eyebrow="Appendix A · Market voices"
      title="Real voices from Malaysian homeowners"
      subtitle="Observed pain points from public homeowner discussions (Lowyat Forum) — and how Simephony responds."
      bodyTop={322}
      mark="A"
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, height: 618 }}>
        <VoiceCard
          on={arrived}
          delay={60}
          quote="The developer spent a month rectifying what I submitted, but not 100% was actually fixed. They removed all the defect stickers and claimed it was rectified. After a few rounds of ‘ding-dong’, I gave up."
          author="WaterBuffalo, Homeowner (Lowyat Forum)"
          response="Every defect tracked until verified"
        />
        <VoiceCard
          on={arrived}
          delay={160}
          quote="My house has been about 7 years now, but there are issues I could not foresee back then. Latent defects, is the word? How do I handle a structural issue when the DLP is long gone?"
          author="1tanmee, Homeowner (Lowyat Forum)"
          response="Early systemic defect detection"
        />
        <VoiceCard
          on={arrived}
          delay={260}
          quote="Initially we only found minor defects like cracked skim coat or uneven paint. Only after hiring building inspectors did we discover systemic corner-cutting, leading to a RM150k court settlement."
          author="kira_88, Homeowner (Lowyat Forum)"
          response="Cross-unit pattern alerts before escalation"
        />
        <VoiceCard
          on={arrived}
          delay={360}
          quote="You might get 500 defect stickers posted by an inspector, but only 5 to 8 of them get entertained unless there is clear accountability."
          author="submergedx, Homeowner (Lowyat Forum)"
          response="Full audit trail + resident sign-off verification"
        />
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// B · Value-added model (4 pages: Less Admin ROI, Value Cycle, 7 Streams, 5-Year Chart, Sources)
// ---------------------------------------------------------------------------

const AdminMetric = ({ metric, label, sub }: { metric: string; label: string; sub: string }) => (
  <div style={{ background: BLOCK, color: BLOCK_TEXT, borderRadius: 16, padding: '14px 24px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
    <div style={{ fontSize: 40, fontWeight: 900, color: BLOCK_HI, lineHeight: 1.05 }}>{metric}</div>
    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{label}</div>
    <div style={{ fontSize: 18, color: muted, marginTop: 4, lineHeight: 1.35 }}>{sub}</div>
  </div>
);

const PrepStep = ({ n, text }: { n: string; text: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <div style={{ width: 34, height: 34, borderRadius: 17, background: '#C64A1F', color: '#fff', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {n}
    </div>
    <div style={{ fontSize: 22, color: ink, fontWeight: 600 }}>{text}</div>
  </div>
);

const FreedItem = ({ text }: { text: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    <span style={{ width: 12, height: 12, borderRadius: 6, background: blue, flexShrink: 0 }} />
    <span style={{ fontSize: 23, color: ink, fontWeight: 600, lineHeight: 1.35 }}>{text}</span>
  </div>
);

const ValueAdmin: Page = () => {
  const arrived = useArrived();
  return (
    <Frame
      eyebrow="Appendix B · Value-added model"
      title="Less admin, more time for judgement"
      subtitle="Simephony’s AI agents prepare the repetitive first pass on every defect case, so your team can review, approve and focus on work that needs care."
      bodyTop={332}
      mark="B"
    >
      <div style={{ display: 'flex', gap: 28, height: 500 }}>
        <div style={{ width: 470, display: 'flex', flexDirection: 'column', gap: 14, ...reveal(arrived, 60) }}>
          <AdminMetric metric="100×+" label="lower cost per case" sub="AI first pass ≈ RM0.06–0.08 vs ≈ RM13–27 of manual admin effort" />
          <AdminMetric metric="Minutes" label="not 45–60 min of admin per case" sub="First drafts prepared for your team to review and approve" />
          <AdminMetric metric="375–500 hrs" label="freed up every month" sub="At 500 cases a month (illustrative volume)" />
        </div>

        <Card style={{ flex: 1, padding: '28px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', ...reveal(arrived, 180) }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: ink }}>What the AI prepares first</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
              <PrepStep n="1" text="Read the report and categorise it" />
              <PrepStep n="2" text="Check past cases for recurrence" />
              <PrepStep n="3" text="Find a technician, draft the booking" />
              <PrepStep n="4" text="Draft about 8 buyer updates" />
              <PrepStep n="5" text="Draft the repair review checklist" />
            </div>
          </div>
          <div style={{ background: blue, color: '#fff', borderRadius: 12, padding: '14px 20px', textAlign: 'center', fontSize: 21, fontWeight: 700 }}>
            Your team reviews, approves and decides
          </div>
        </Card>

        <Card style={{ flex: 1, padding: '28px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28, ...reveal(arrived, 300) }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: blue }}>Where the freed time goes</div>
          <FreedItem text="Complex and sensitive cases" />
          <FreedItem text="Buyer and technician relationships" />
          <FreedItem text="Spotting recurring defects and root causes" />
          <FreedItem text="Quality and process decisions" />
        </Card>
      </div>

      <div style={{ marginTop: 20, background: BLOCK, color: BLOCK_TEXT, borderRadius: 14, padding: '15px 28px', textAlign: 'center', fontSize: 25, fontWeight: 800, ...reveal(arrived, 400) }}>
        AI handles the repetitive work. <span style={{ color: BLOCK_HI }}>People make the decisions.</span>
      </div>
      <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 19, color: soft, margin: 0 }}>
        Powered by Gemini 3.1 Flash-Lite and Gemini 3.5 Flash-Lite. Hours freed based on 500 cases/month (illustrative volume).
      </p>
    </Frame>
  );
};

const CycleStep = ({ n, title, body, color }: { n: string; title: string; body: string; color: string }) => (
  <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
    <div style={{ width: 48, height: 48, borderRadius: 24, background: color, color: '#fff', fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {n}
    </div>
    <div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 24, lineHeight: 1.4, color: muted, marginTop: 4 }}>{body}</div>
    </div>
  </div>
);

const Arc = ({ d, color, delay, drawn }: { d: string; color: string; delay: number; drawn: boolean }) => (
  <path
    d={d}
    fill="none"
    stroke={color}
    strokeWidth="18"
    strokeLinecap="round"
    pathLength={1}
    strokeDasharray="1"
    strokeDashoffset={drawn ? 0 : 1}
    style={{ transition: `stroke-dashoffset 900ms ${EASE_OUT} ${delay}ms` }}
  />
);

const ValueCycle: Page = () => {
  const drawn = useArrived();
  return (
    <Frame eyebrow="Appendix B · Value-added model" title="One handover, earning every year after" mark="B">
      <div style={{ display: 'flex', gap: 96, alignItems: 'center', height: '100%' }}>
        <svg viewBox="0 0 600 600" style={{ width: 560, height: 560, flexShrink: 0 }}>
          <circle cx="300" cy="300" r="210" fill="none" stroke="#E3D7CA" strokeWidth="18" />
          <Arc drawn={drawn} delay={100} color="#C64A1F" d="M300 90 A210 210 0 0 1 500 235" />
          <Arc drawn={drawn} delay={500} color="#D56A46" d="M500 235 A210 210 0 0 1 423 470" />
          <Arc drawn={drawn} delay={900} color="#24589E" d="M177 470 A210 210 0 0 1 100 235" />
          <text x="300" y="290" textAnchor="middle" fontSize="38" fontWeight="800" fill="#1C1814">Every cohort</text>
          <text x="300" y="336" textAnchor="middle" fontSize="38" fontWeight="800" fill="#1C1814">compounds</text>
          <circle cx="300" cy="90" r="30" fill="#C64A1F" />
          <text x="300" y="100" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">1</text>
          <circle cx="500" cy="235" r="30" fill="#C64A1F" />
          <text x="500" y="245" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">2</text>
          <circle cx="423" cy="470" r="30" fill="#1C1814" />
          <text x="423" y="480" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">3</text>
          <circle cx="177" cy="470" r="30" fill="#24589E" />
          <text x="177" y="480" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">4</text>
          <circle cx="100" cy="235" r="30" fill="#1C1814" />
          <text x="100" y="245" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">5</text>
        </svg>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 30 }}>
          <CycleStep n="1" color="#C64A1F" title="Handover phase" body="Every new unit enters Simephony on day one." />
          <CycleStep n="2" color="#C64A1F" title="Verify repairs (24-month DLP)" body="Buyer-verified repairs cut repeat visits, disputes and rework." />
          <CycleStep n="3" color={ink} title="Build trust and data" body="Verified repairs earn trust; every case sharpens recurrence detection." />
          <CycleStep n="4" color={blue} title="Paid plans after the DLP" body="Homes, strata buildings and SDP assets move onto recurring plans." />
          <CycleStep n="5" color={ink} title="Better next phase" body="Recurrence patterns improve designs and contractor choice, then the loop repeats." />
        </div>
      </div>
    </Frame>
  );
};

const Stream = ({ k, title, body, value, color, upside }: { k: string; title: string; body: string; value: string; color: string; upside?: boolean }) => (
  <Card style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '22px 28px', ...(upside ? { background: 'transparent', border: `2px dashed ${line}`, boxShadow: 'none' } : {}) }}>
    <div style={{ width: 46, height: 46, borderRadius: 10, background: color, color: '#fff', fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {k}
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 21, lineHeight: 1.35, color: muted, marginTop: 4 }}>{body}</div>
    </div>
    <div style={{ fontSize: 34, fontWeight: 800, color, whiteSpace: 'nowrap' }}>{value}</div>
  </Card>
);

const StreamHead = ({ label, total, color }: { label: string; total: string; color: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `3px solid ${color}`, paddingBottom: 12 }}>
    <span style={{ fontSize: 30, fontWeight: 800, color }}>{label}</span>
    <span style={{ fontSize: 24, fontWeight: 700, color }}>{total}</span>
  </div>
);

const ValueStreams: Page = () => (
  <Frame eyebrow="Appendix B · Value-added model" title="Save first, then earn: four value streams" mark="B">
    <div style={{ display: 'flex', gap: 48 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <StreamHead label="Saves during the DLP" total="Year 5: RM0.93m" color="#C64A1F" />
        <Stream k="A" color="#9A3317" title="Fewer repeat visits" body="Repeat visits avoided × RM350, plus admin hours saved" value="RM669k" />
        <Stream k="B" color="#D45B2C" title="Lower dispute risk" body="Evidence-backed records avoid a share of disputes" value="RM133k" />
        <Stream k="C" color="#E9A060" title="Contractor back-charges" body="Failed-repair cost recovered with photo evidence" value="RM126k" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <StreamHead label="Earns after the DLP" total="Year 5: RM0.24m" color={blue} />
        <Stream k="D" color={blue} title="Strata subscriptions" body="Annual fee per JMB / MC building" value="RM236k" />
        <Stream upside k="E" color={soft} title="Developer licences (upside)" body="Not counted in totals; licensed to other developers from Year 3" value="RM700k" />
        <div style={{ background: BLOCK, color: BLOCK_TEXT, borderRadius: 16, padding: '20px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Counted Year-5 value (A–D)</div>
            <div style={{ fontSize: 19, opacity: 0.8, marginTop: 4 }}>≈ 3.9× the RM0.3m a year it costs to run</div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: BLOCK_HI }}>RM1.16m</div>
        </div>
      </div>
    </div>
  </Frame>
);

const BigStat = ({ value, label }: { value: string; label: string }) => (
  <div style={{ background: BLOCK, color: BLOCK_TEXT, borderRadius: 16, padding: '22px 28px', flex: 1 }}>
    <div style={{ fontSize: 44, fontWeight: 800, color: BLOCK_HI, letterSpacing: '-0.02em' }}>{value}</div>
    <div style={{ fontSize: 21, marginTop: 6, opacity: 0.85, lineHeight: 1.3 }}>{label}</div>
  </div>
);

// Year-5 value (RM thousand). 1250k = 440 px of plot height, baseline at y = 500.
// Colours validated for colour-blind separation; every segment is also labelled.
const Y5_BASE = 500;
const Y5_K = 0.352;
const Y5_BAR = 210;

/** One stacked segment; `bottom` is where it starts, in RM k. */
const Seg = ({ cx, bottom, value, k, color, ink: textInk = '#fff' }: { cx: number; bottom: number; value: number; k: string; color: string; ink?: string }) => {
  const y = Y5_BASE - (bottom + value) * Y5_K;
  const h = value * Y5_K - 2;
  return (
    <g>
      <rect x={cx - Y5_BAR / 2} y={y} width={Y5_BAR} height={h} rx={4} fill={color} />
      <text x={cx} y={y + h / 2 + 8} textAnchor="middle" fontSize="22" fontWeight="800" fill={textInk}>
        {k} · {value}
      </text>
    </g>
  );
};

/** A bar that grows up from the baseline once `on` turns true. */
const GrowBar = ({ cx, on, delay, label, sub, children }: { cx: number; on: boolean; delay: number; label: string; sub: string; children: ReactNode }) => (
  <g>
    <g
      style={{
        transformBox: 'view-box',
        transformOrigin: `${cx}px ${Y5_BASE}px`,
        transform: on ? 'scaleY(1)' : 'scaleY(0)',
        transition: `transform 900ms ${CAM_EASE} ${delay}ms`,
      }}
    >
      {children}
    </g>
    <text x={cx} y={Y5_BASE + 40} textAnchor="middle" fontSize="23" fontWeight="800" fill={ink}>{label}</text>
    <text x={cx} y={Y5_BASE + 70} textAnchor="middle" fontSize="20" fill={muted}>{sub}</text>
  </g>
);

/** Brace on the right of the counted bar that groups segments (from / to in RM k). */
const Brace = ({ x, from, to, label, value, color, on, delay }: { x: number; from: number; to: number; label: string; value: string; color: string; on: boolean; delay: number }) => {
  const y1 = Y5_BASE - to * Y5_K + 3;
  const y2 = Y5_BASE - from * Y5_K - 3;
  return (
    <g style={{ opacity: on ? 1 : 0, transition: `opacity 400ms ${EASE_OUT} ${delay}ms` }}>
      <path d={`M${x} ${y1} h10 V${y2} h-10`} fill="none" stroke={color} strokeWidth="3" />
      <text x={x + 22} y={(y1 + y2) / 2 - 4} fontSize="26" fontWeight="800" fill={color}>{value}</text>
      <text x={x + 22} y={(y1 + y2) / 2 + 22} fontSize="18" fill={muted}>{label}</text>
    </g>
  );
};

const YearFive: Page = () => {
  const on = useArrived();
  const grid = (v: number) => (
    <g key={v}>
      <line x1="90" x2="900" y1={Y5_BASE - v * Y5_K} y2={Y5_BASE - v * Y5_K} stroke={line} strokeWidth="2" />
      <text x="78" y={Y5_BASE - v * Y5_K + 7} textAnchor="end" fontSize="19" fill={soft}>{v}</text>
    </g>
  );
  return (
    <Frame eyebrow="Appendix B · Value-added model" title="Year 5: savings first, recurring earnings next" mark="B">
      <div style={{ display: 'flex', gap: 48, height: '100%', alignItems: 'center' }}>
        <div style={{ flexShrink: 0 }}>
          <svg viewBox="0 0 920 590" style={{ width: 940, height: 603, display: 'block' }} role="img" aria-label="Year 5 value, RM thousand. Counted: A 669, B 133, C 126 saved during the DLP; D 236 earned after it; RM1.16m in total. Upside not counted: E 700.">
            <text x="0" y="34" fontSize="20" fontWeight="700" fill={soft} letterSpacing="0.06em">YEAR 5 VALUE BY STREAM · RM THOUSAND</text>
            {grid(250)}
            {grid(500)}
            {grid(750)}
            {grid(1000)}
            {grid(1250)}
            <line x1="90" x2="900" y1={Y5_BASE} y2={Y5_BASE} stroke={soft} strokeWidth="2" />
            <GrowBar cx={260} on={on} delay={150} label="Counted value" sub="A–D · RM1.16m">
              <Seg cx={260} bottom={0} value={669} k="A" color="#9A3317" />
              <Seg cx={260} bottom={669} value={133} k="B" color="#D45B2C" />
              <Seg cx={260} bottom={802} value={126} k="C" color="#E9A060" ink={ink} />
              <Seg cx={260} bottom={928} value={236} k="D" color={blue} />
            </GrowBar>
            <Brace x={378} from={0} to={928} value="RM0.93m" label="saved in the DLP" color="#C64A1F" on={on} delay={1100} />
            <Brace x={378} from={928} to={1164} value="RM0.24m" label="earned after it" color={blue} on={on} delay={1300} />
            <GrowBar cx={720} on={on} delay={600} label="Upside, not counted" sub="E · RM0.70m">
              <rect x={720 - Y5_BAR / 2} y={Y5_BASE - 700 * Y5_K} width={Y5_BAR} height={700 * Y5_K - 2} rx={4} fill="none" stroke={soft} strokeWidth="2.5" strokeDasharray="8 7" />
              <text x={720} y={Y5_BASE - 350 * Y5_K + 8} textAnchor="middle" fontSize="22" fontWeight="800" fill={muted}>E · 700</text>
            </GrowBar>
          </svg>
          <p style={{ fontSize: 19, color: soft, margin: '6px 0 0' }}>
            Stream key (A–E) and what each stream counts: next slide.
          </p>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, ...reveal(on, 900) }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <BigStat value="RM1.16m" label="counted Year-5 value (A–D)" />
            <BigStat value="≈ 3.9×" label="the RM0.3m yearly run cost" />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <BigStat value="+RM0.70m" label="licence upside, not counted (E)" />
            <BigStat value="24 mo" label="statutory DLP period" />
          </div>
          <Card style={{ padding: '22px 28px' }}>
            <div style={{ fontSize: 23, fontWeight: 800 }}>Key base-case assumptions</div>
            <ul style={{ fontSize: 21, lineHeight: 1.5, color: muted, margin: '8px 0 0', paddingLeft: 26 }}>
              <li>About 3,000 handovers a year</li>
              <li>RM350 per repair visit; 20% → 40% of repeat visits avoided</li>
              <li>Strata fee per JMB / MC building after the DLP</li>
              <li>Build RM500k; run RM300k a year</li>
            </ul>
          </Card>
        </div>
      </div>
    </Frame>
  );
};

/** Where each named source lives (same links as the Canva deck's sources page). Clickable in the PDF export too. */
const SOURCE_URLS: Record<string, string> = {
  'Gemini 3.1 Flash-Lite': 'https://openrouter.ai/google/gemini-3.1-flash-lite',
  'Gemini 3.5 Flash-Lite': 'https://www.eesel.ai/blog/gemini-3-5-flash-lite-pricing',
  AJobThing: 'https://www.ajobthing.com/resources/recruitment-tools/salary-comparison-tool/customer-service-executive-salary-in-kuala-lumpur',
  Aniday: 'https://aniday.com/en/malaysia/epf-socso-eis',
  Wise: 'https://wise.com/au/currency-converter/usd-to-myr-rate',
  NBER: 'https://www.nber.org/papers/w31161',
  'Stanford GSB': 'https://www.gsb.stanford.edu/insights/generative-ai-boost-can-boost-productivity-without-replacing-workers',
  EdgeProp: 'https://www.edgeprop.my/guides/buying/comprehensive-overview-defect-liability-period',
  'iProperty (30-day repair)': 'https://www.iproperty.com.my/guides/defects-strata-buildings-in-malaysia-homebuyer-rights-legal-case',
  FY2021: 'https://simedarbyproperty.com/annualreport2021/How-We-Added-Value-in-2021.html',
  FY2022: 'https://api.edgeprop.my/content/1905406/sime-darby-propertys-4q-net-profit-surges-643-higher-property-sales',
  FY2023: 'https://sdpvirtual.simedarbyproperty.com/annualreport2023/download/sdp-ir2023-gmd.pdf',
  FY2024: 'https://simedarbyproperty.com/annualreport2024/download/sdp-ir2024-key-highlights.pdf',
  'Aquant benchmark': 'https://customerthink.com/?p=1080461',
  VSight: 'https://vsight.io/glossary/what-is-first-time-fix-rate-ftfr/',
  'Recommend.my': 'https://recommend.my/blog/?p=15570',
  'Tribunal claims': 'https://mahwengkwai.com/?p=36926',
  'Claim volume': 'https://edgeprop.my/content/housing-tribunal-gets-back-rm400-million-disgruntled-buyers',
  'Planning Malaysia': 'https://mail.planningmalaysia.org/index.php/pmj/article/download/1682/1361/2570',
  SpeedHome: 'https://speedhome.com/blog/what-is-jmb-in-malaysia/',
  Bernama: 'https://www.bernama.com/en/news.php?id=2401051',
  MHub: 'https://www.mhub.my/vp-defect',
  ProFix: 'https://www.malaysiakini.com/announcement/680057',
};

const SourceLink = ({ name }: { name: string }) => {
  const href = SOURCE_URLS[name];
  if (!href) return <>{name}</>;
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(198,74,31,0.55)', textUnderlineOffset: 4 }}>
      {name}
    </a>
  );
};

const SourceLine = ({ label, refs }: { label: string; refs: string }) => (
  <li style={{ marginBottom: 10 }}>
    <b style={{ color: ink }}>{label}:</b>{' '}
    <span style={{ color: muted }}>
      {refs.split(' · ').map((name, i) => (
        <span key={name}>
          {i > 0 && ' · '}
          <SourceLink name={name} />
        </span>
      ))}
    </span>
  </li>
);

const ValueSources: Page = () => (
  <Frame eyebrow="Appendix B · Sources" title="Sources and evidence" mark="B">
    <div style={{ display: 'flex', gap: 40, height: 540 }}>
      <Card style={{ flex: 1, padding: '32px 36px' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--osd-accent)' }}>AI cost and time</div>
        <ul style={{ fontSize: 23, lineHeight: 1.55, margin: '20px 0 0', paddingLeft: 26 }}>
          <SourceLine label="Model pricing" refs="Gemini 3.1 Flash-Lite · Gemini 3.5 Flash-Lite" />
          <SourceLine label="KL salaries" refs="AJobThing" />
          <SourceLine label="EPF and SOCSO rates" refs="Aniday" />
          <SourceLine label="USD / MYR rate" refs="Wise" />
          <SourceLine label="AI & support productivity" refs="NBER · Stanford GSB" />
        </ul>
      </Card>
      <Card style={{ flex: 1.2, padding: '32px 36px' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: blue }}>Value model benchmarks</div>
        <ul style={{ fontSize: 22, lineHeight: 1.5, margin: '20px 0 0', paddingLeft: 26 }}>
          <SourceLine label="24-month DLP" refs="EdgeProp · iProperty (30-day repair)" />
          <SourceLine label="SDP units delivered" refs="FY2021 · FY2022 · FY2023 · FY2024" />
          <SourceLine label="Repeat visits" refs="Aquant benchmark · VSight" />
          <SourceLine label="Malaysian repair prices" refs="Recommend.my" />
          <SourceLine label="Homebuyer disputes" refs="Tribunal claims · Claim volume" />
          <SourceLine label="Contractor DLP liability" refs="Planning Malaysia" />
          <SourceLine label="Strata & defect platforms" refs="SpeedHome · Bernama · MHub · ProFix" />
        </ul>
      </Card>
    </div>
    <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 20, color: soft, lineHeight: 1.45, margin: 0 }}>
      Illustrative model baselines (internal estimates): 45–60 min manual handling per case, ~25k input / 5k output tokens per case, RM350 per visit, and projected RM stream totals.
    </p>
  </Frame>
);

// ---------------------------------------------------------------------------
// D · Target users (PDF Page 20)
// ---------------------------------------------------------------------------

const UserRow = ({ who, pain, gain }: { who: string; pain: string; gain: string }) => (
  <Card style={{ padding: '26px 32px' }}>
    <div style={{ fontSize: 26, fontWeight: 800 }}>{who}</div>
    <div style={{ display: 'flex', gap: 32, marginTop: 12 }}>
      <div style={{ flex: 1, fontSize: 23, lineHeight: 1.4 }}>
        <b style={{ color: 'var(--osd-accent)' }}>Pain: </b>
        <span style={{ color: muted }}>{pain}</span>
      </div>
      <div style={{ flex: 1, fontSize: 23, lineHeight: 1.4 }}>
        <b style={{ color: blue }}>Gain: </b>
        <span style={{ color: muted }}>{gain}</span>
      </div>
    </div>
  </Card>
);

const TargetUsers: Page = () => (
  <Frame eyebrow="Appendix C · Target users" title="We see the user’s frustration" mark="C">
    <div style={{ display: 'flex', gap: 48, height: '100%' }}>
      <img src={targetUsers} alt="Buyer, developer and contractor with their frustrations" style={{ width: 620, height: 620, objectFit: 'cover', borderRadius: 'var(--osd-radius)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <UserRow who="BUYER / Homeowner" pain="“I report defects but lose track. I get kicked between parties.”" gain="Live tracking, a repair I can verify myself, one trusted record." />
        <UserRow who="SDP Staff / Developer" pain="Mismatched records, disputes and no view of recurring patterns." gain="An audit trail, early recurrence alerts and control over escalations." />
        <UserRow who="TECHNICIAN / Subcontractor" pain="No defect history, so repeat repairs happen without context." gain="Full case history before the visit, clear verdicts, less rework." />
      </div>
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// E · AI justification, AIGE (PDF Page 21 + code audit), and NIST AI RMF
// ---------------------------------------------------------------------------

const Question = ({ n, q, a }: { n: string; q: string; a: string }) => (
  <Card style={{ flex: 1, padding: 36 }}>
    <NumBadge n={n} color={blue} />
    <div style={{ fontSize: 32, fontWeight: 800, marginTop: 20 }}>{q}</div>
    <div style={{ fontSize: 25, lineHeight: 1.45, color: muted, marginTop: 14 }}>{a}</div>
  </Card>
);

const AiHowWeDecided: Page = () => (
  <Frame eyebrow="Appendix D · AI justification" title="AI only where it helps" subtitle="We asked the same three questions about every step in the defect flow." bodyTop={340} mark="D">
    <div style={{ display: 'flex', gap: 28 }}>
      <Question n="1" q="Is the input messy?" a="Free text in English, Malay or Manglish, and photos, are hard for fixed rules. AI is good at this." />
      <Question n="2" q="How bad is a mistake?" a="When a mistake is costly, the AI never decides on its own." />
      <Question n="3" q="Must it be explained?" a="A rule can be quoted, e.g. “3rd time in this unit”. A model’s answer can’t, so those decisions use rules." />
    </div>
    <div style={{ display: 'flex', gap: 28, marginTop: 40, alignItems: 'stretch' }}>
      <div style={{ flex: 2, background: BLOCK, color: BLOCK_TEXT, borderRadius: 'var(--osd-radius)', padding: '30px 36px', fontSize: 30, fontWeight: 700, lineHeight: '2' }}>
        AI handles the <span style={{ color: BLOCK_HI }}>messy inputs</span>, rules handle the decisions that must be{' '}
        <span style={{ color: BLOCK_HI }}>consistent</span>, and people make the <span style={{ color: BLOCK_HI }}>final calls</span>.
      </div>
      <Card style={{ flex: 1, padding: '24px 30px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.1em', color: muted }}>LOCAL OR CLOUD</div>
        <div style={{ fontSize: 23, lineHeight: 1.45, marginTop: 8 }}>
          Runs on <b>local or cloud models</b>, switched in config; personal data is masked before any cloud call. If a model fails, rules take over or SDP reviews it, so a case never gets stuck.
        </div>
      </Card>
    </div>
  </Frame>
);

type Who = 'ai' | 'rules' | 'people' | 'mixed';

const WhoTag = ({ who, children }: { who: Who; children: ReactNode }) => {
  const c =
    who === 'ai'
      ? { bg: blueSoft, fg: blue }
      : who === 'rules'
        ? { bg: amberSoft, fg: '#8A5A12' }
        : who === 'people'
          ? { bg: orangeSoft, fg: '#A63A14' }
          : { bg: '#EEE9F6', fg: '#5B3F99' };
  return <span style={{ display: 'inline-block', background: c.bg, color: c.fg, fontWeight: 700, padding: '4px 14px', borderRadius: 8 }}>{children}</span>;
};

type Lvl = 'Low' | 'Medium' | 'High' | 'Very high';

const Level = ({ v }: { v: Lvl }) => (
  <span style={{ fontWeight: v === 'Very high' || v === 'High' ? 700 : 500, color: v === 'Very high' ? '#A63A14' : v === 'High' ? ink : muted }}>{v}</span>
);

const SuitRow = ({ step, messy, cost, explain, who, decision, shade }: { step: string; messy: string; cost: Lvl; explain: Lvl; who: Who; decision: string; shade?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', fontSize: 22, lineHeight: 1.3, background: shade ? '#F6F0E9' : 'transparent', minHeight: 58 }}>
    <div style={{ width: 380, padding: '8px 16px', fontWeight: 700 }}>{step}</div>
    <div style={{ width: 300, padding: '8px 16px', color: muted }}>{messy}</div>
    <div style={{ width: 170, padding: '8px 16px' }}><Level v={cost} /></div>
    <div style={{ width: 170, padding: '8px 16px' }}><Level v={explain} /></div>
    <div style={{ flex: 1, padding: '8px 16px' }}><WhoTag who={who}>{decision}</WhoTag></div>
  </div>
);

const TH = ({ w, children }: { w?: number; children: ReactNode }) => (
  <div style={{ width: w, flex: w ? undefined : 1, padding: '12px 16px', fontSize: 19, fontWeight: 800, letterSpacing: '0.08em', color: muted }}>{children}</div>
);

const AiSuitability: Page = () => (
  <Frame eyebrow="Appendix D · AI justification" title="Who decides each step: AI, rules or people" mark="D">
    <div style={{ borderTop: `3px solid ${ink}` }}>
      <div style={{ display: 'flex', borderBottom: `2px solid ${line}` }}>
        <TH w={380}>STEP</TH>
        <TH w={300}>MESSY INPUT?</TH>
        <TH w={170}>MISTAKE COST</TH>
        <TH w={170}>EXPLAIN?</TH>
        <TH>WHO DECIDES</TH>
      </div>
      <SuitRow step="Read the defect report" messy="Yes: 3 languages + photo" cost="Medium" explain="Medium" who="ai" decision="AI vision model + guardrails + fallback" />
      <SuitRow shade step="Find similar past cases" messy="No: case records" cost="Medium" explain="High" who="rules" decision="Rules; AI writes a one-line reason" />
      <SuitRow step="Urgency" messy="Partly: report text" cost="High" explain="High" who="mixed" decision="AI proposes, must cite a numbered rule" />
      <SuitRow shade step="Trade and repair time" messy="No" cost="High" explain="High" who="rules" decision="Rules (fixed repair plan)" />
      <SuitRow step="Inspection result" messy="No" cost="Very high" explain="Very high" who="people" decision="People (the technician)" />
      <SuitRow shade step="Recurrence and escalation" messy="No: counts" cost="High" explain="High" who="mixed" decision="Rules count, SDP staff decide" />
      <SuitRow step="Systemic match score" messy="No: counts" cost="Medium" explain="High" who="rules" decision="Rules (a formula, labelled as such)" />
      <SuitRow shade step="Check repair photos" messy="Yes: photos" cost="Medium" explain="High" who="mixed" decision="Rule checks → AI suggests → person decides" />
      <SuitRow step="Repair sign-off" messy="No" cost="Very high" explain="Very high" who="people" decision="People (SDP staff, then the buyer)" />
      <SuitRow shade step="Write buyer updates" messy="Yes: wording" cost="Medium" explain="Low" who="ai" decision="AI language model + guardrails + fixed sentences" />
    </div>
  </Frame>
);

type Status = 'covered' | 'partly';

const StatusPill = ({ s }: { s: Status }) => (
  <span
    style={{
      display: 'inline-block',
      whiteSpace: 'nowrap',
      fontSize: 20,
      fontWeight: 800,
      padding: '6px 16px',
      borderRadius: 999,
      background: s === 'covered' ? greenSoft : amberSoft,
      color: s === 'covered' ? green : '#8A5A12',
    }}
  >
    {s === 'covered' ? '● Covered' : '◐ Partly covered'}
  </span>
);

const Principle = ({ name, how, s, shade }: { name: string; how: string; s: Status; shade?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '14px 18px', background: shade ? '#F6F0E9' : 'transparent', borderRadius: 10 }}>
    <div style={{ width: 360, fontSize: 24, fontWeight: 800, lineHeight: 1.25 }}>{name}</div>
    <div style={{ flex: 1, fontSize: 22, lineHeight: 1.4, color: muted }}>{how}</div>
    <div style={{ width: 230, textAlign: 'right' }}><StatusPill s={s} /></div>
  </div>
);

/** Appendix D · AIGE: the old one-page summary and the code-level audit, merged into one slide. */
const AiAige: Page = () => (
  <Frame
    eyebrow="Appendix D · AI Governance & Ethics (AIGE)"
    title="AI with boundaries. Humans with accountability."
    subtitle="All seven principles of Malaysia’s AIGE guidelines (MOSTI, Sept 2024), checked against our code on 9 Nov 2026."
    bodyTop={340}
    mark="D"
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Principle name="Fairness" s="partly" how="Same urgency, repair and escalation rules for every case. Malay and Manglish are read too. Accuracy per language not measured yet." />
      <Principle shade name="Reliability, safety and control" s="covered" how="Tests on the real models, timeouts and retries, rule fallback, guardrails on urgency and messages." />
      <Principle name="Privacy and data security" s="partly" how="Local or cloud models; names, emails, phones and unit numbers masked before any cloud call. Photos aren’t masked; server-side EXIF stripping and production auth are next." />
      <Principle shade name="Inclusivity" s="partly" how="Malay and Manglish input; bigger buttons and “what happens next” steps. App screens are English-only, no voice input." />
      <Principle name="Transparency" s="covered" how="“Why the AI decided this” panel, AI vs rule results labelled, Agent Trace page, review reasons with confidence." />
      <Principle shade name="Accountability" s="covered" how="The AI never records the inspection result, signs off a repair or approves an escalation." />
      <Principle name="Human benefit" s="partly" how="Built to cut repeat repairs and give clearer updates. Not measured yet: that needs SDP pilot data." />
    </div>
  </Frame>
);

const RiskRow = ({ risk, measure, manage, shade }: { risk: string; measure: string; manage: string; shade?: boolean }) => (
  <div style={{ display: 'flex', fontSize: 22, lineHeight: 1.4, background: shade ? '#F6F0E9' : 'transparent' }}>
    <div style={{ width: 470, padding: '16px 18px', fontWeight: 700 }}>{risk}</div>
    <div style={{ flex: 1, padding: '16px 18px', color: muted }}>{measure}</div>
    <div style={{ flex: 1, padding: '16px 18px' }}>{manage}</div>
  </div>
);

const AiRisks: Page = () => (
  <Frame eyebrow="Appendix D · AI risks (NIST AI RMF)" title="What could go wrong, how we tested it, what we did" mark="D">
    <div style={{ borderTop: `3px solid ${ink}` }}>
      <div style={{ display: 'flex', borderBottom: `2px solid ${line}` }}>
        <TH w={470}>RISK · MAP</TH>
        <TH>HOW WE TESTED IT · MEASURE</TH>
        <TH>WHAT WE DID · MANAGE</TH>
      </div>
      <RiskRow risk="AI rates an ordinary leak as high urgency" measure="Seen in the 21 Oct live run. A live test now checks three reports; only the leak near a light is high." manage="The model must cite a numbered rule, and a high rule needs matching words." />
      <RiskRow shade risk="AI misreads a Malay room name" measure="The language model read “bilik tidur utama” (master bedroom) as a bathroom." manage="Later agents get the checked English location; intake asks instead of guessing." />
      <RiskRow risk="Photo check passes a photo with no repair" measure="Unit tests with the same file and near-identical photos." manage="Code checks run first, the technician’s note isn’t sent, SDP staff decide." />
      <RiskRow shade risk="A buyer message admits liability" measure="Guardrail unit tests and live wording tests." manage="Guardrails remove the words; a fixed message is sent if the draft still fails." />
      <RiskRow risk="The model is slow or down" measure="Timeouts, and the USE_AI_AGENTS=only test mode." manage="Rule-based fallback; a failed new report is held for SDP review." />
    </div>
    <p style={{ position: 'absolute', left: 0, right: 0, bottom: 0, margin: 0, fontSize: 21, color: soft, lineHeight: 1.5 }}>
      Evidence: tests/integration/test_live_regressions.py (pytest -m live_llm) · scripts/web_flow_live.py · tests/unit/test_guardrails.py
    </p>
  </Frame>
);

// ---------------------------------------------------------------------------
// F · Risks and mitigation (PDF Page 22)
// ---------------------------------------------------------------------------

const MitRow = ({ risk, fix, shade }: { risk: string; fix: string; shade?: boolean }) => (
  <div style={{ display: 'flex', fontSize: 22, lineHeight: 1.4, background: shade ? '#F6F0E9' : 'transparent' }}>
    <div style={{ width: 540, padding: '14px 18px', fontWeight: 700 }}>{risk}</div>
    <div style={{ flex: 1, padding: '14px 18px', color: muted }}>{fix}</div>
  </div>
);

const Risks: Page = () => (
  <Frame eyebrow="Appendix E · Risk and mitigation" title="Operational risks and how we handle them" mark="E">
    <div style={{ borderTop: `3px solid ${ink}` }}>
      <div style={{ display: 'flex', borderBottom: `2px solid ${line}` }}>
        <TH w={540}>RISK</TH>
        <TH>MITIGATION</TH>
      </div>
      <MitRow risk="A buyer’s verification is wrong or disputed" fix="SDP approves every repair first, and the AI flags repair photos that don’t match the original. Reopening needs a new photo within grace period." />
      <MitRow shade risk="False “systemic issue” alerts" fix="Thresholds are configurable. SDP sees the evidence (reasons and stack map) and approves before any extra inspection." />
      <MitRow risk="Integration with SDP’s systems" fix="Middleware through APIs and MCP tools; the shadow pilot runs beside the Command & Contact Centre first." />
      <MitRow shade risk="Privacy of photos from inside homes (PDPA)" fix="A local model keeps photos on SDP’s own infrastructure. With a cloud model, names, contact details and unit numbers are masked first; photos themselves are not masked." />
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// G · Future enhancement (PDF Page 23: all 5 structured enhancements)
// ---------------------------------------------------------------------------

const FutureCard = ({
  n,
  icon,
  title,
  children,
}: {
  n: string;
  icon: 'calendar' | 'map' | 'chat' | 'chart' | 'camera';
  title: string;
  children: ReactNode;
}) => (
  <Card style={{ flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 50, height: 50, borderRadius: 14, background: orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} color="#C64A1F" size={28} />
        </div>
        <div style={{ fontSize: 25, fontWeight: 800, color: ink }}>{title}</div>
      </div>
      <span style={{ fontSize: 24, fontWeight: 900, color: '#D8CCBF' }}>{n}</span>
    </div>
    <ul style={{ fontSize: 21, lineHeight: 1.45, color: muted, margin: 0, paddingLeft: 24 }}>{children}</ul>
  </Card>
);

const Future: Page = () => (
  <Frame eyebrow="Appendix F · Future enhancement" title="What’s next for Simephony" mark="F">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: 616 }}>
      <div style={{ display: 'flex', gap: 24, flex: 1 }}>
        <FutureCard n="01" icon="calendar" title="Integrated Technician Calendar">
          <li>Built-in calendar for technicians to manage appointments, track assigned jobs and avoid scheduling conflicts.</li>
        </FutureCard>
        <FutureCard n="02" icon="chat" title="Centralised Communication">
          <li>Introduce an in-app chat for buyers, developers and technicians/contractors to communicate, share updates and provide additional instructions.</li>
        </FutureCard>
      </div>
      <div style={{ display: 'flex', gap: 24, flex: 1 }}>
        <FutureCard n="03" icon="chart" title="AI-Powered Quality Insights">
          <li style={{ marginBottom: 6 }}>Generate reports from historical defect data to identify recurring construction issues and contractor performance patterns.</li>
          <li>Use these insights to improve future inspection checklists, construction quality reviews and contractor evaluations.</li>
        </FutureCard>
        <FutureCard n="04" icon="camera" title="Real-Time AI Photo Guidance">
          <li style={{ marginBottom: 6 }}>Provide live camera instructions to help buyers capture clearer defect photos:</li>
          <li>“Move your camera closer to the defect.” · “Adjust your angle to capture the affected area.” · “Improve the lighting for a clearer image.”</li>
        </FutureCard>
      </div>
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// H · Team (PDF Page 24)
// ---------------------------------------------------------------------------

/**
 * `crop` places the photo inside a 390×380 frame: the image is drawn `h` px tall at offset (`x`, `y`).
 * Each photo is framed differently, so the numbers are tuned per person to put every face at the same
 * size (~114 px) and the same spot (centre, 36% down).
 */
const Member = ({ photo, crop, name, role, children }: { photo?: string; crop?: { h: number; x: number; y: number }; name: string; role: string; children: ReactNode }) => (
  <div style={{ flex: 1 }}>
    {photo && crop ? (
      <div style={{ position: 'relative', height: 380, overflow: 'hidden', borderRadius: 'var(--osd-radius)', background: '#E9E1D7' }}>
        <img src={photo} alt={name} style={{ position: 'absolute', left: crop.x, top: crop.y, height: crop.h, width: 'auto', maxWidth: 'none', display: 'block' }} />
      </div>
    ) : (
      <ImagePlaceholder hint={`Photo of ${name}`} height={380} />
    )}
    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--osd-accent)', marginTop: 28 }}>{name}</div>
    <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{role}</div>
    <ul style={{ fontSize: 23, lineHeight: 1.45, color: muted, margin: '14px 0 0', paddingLeft: 28 }}>{children}</ul>
  </div>
);

const Team: Page = () => (
  <Frame eyebrow="Appendix G · Meet the team" title="Group We Hit The Token Limit" mark="G">
    <div style={{ display: 'flex', gap: 40 }}>
      <Member photo={teamPhoebe} crop={{ h: 760, x: -108, y: -50 }} name="PHOEBE ANGELINA SURIN" role="Team Leader · Frontend Developer">
        <li>Led the team and product vision</li>
        <li>Built the full user experience</li>
      </Member>
      <Member photo={teamNicol} crop={{ h: 671, x: -48, y: -146 }} name="NICOL HENG SI YI" role="AI Developer">
        <li>Multi-agent AI workflow</li>
        <li>Defect intake and photo checks</li>
      </Member>
      <Member photo={teamSynyee} crop={{ h: 671, x: -158, y: -118 }} name="TAN SYN YEE" role="AI Developer">
        <li>AI reasoning and validation</li>
        <li>Calendar booking and reminders</li>
      </Member>
      <Member photo={teamXiaowen} crop={{ h: 860, x: -92, y: -44 }} name="LIM XIAO WEN" role="Backend Developer">
        <li>API and database reliability</li>
        <li>Live Gmail notifications</li>
      </Member>
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// Transitions and page order
// ---------------------------------------------------------------------------

Cover.transition = settle;
ThankYou.transition = settle;
AppendixDivider.transition = settle;

// Only pages that carry an object across the cut morph (pipeline → Verified, motto chips). A morph holds the
// previous page on screen while it glides, so every other page uses the quick default fade instead.

export const meta: SlideMeta = {
  title: 'Simephony · Final pitch',
  createdAt: '2026-11-10T14:48:36.194Z',
  theme: 'heritage-editorial',
};

export const notes: (string | undefined)[] = [
  'Open with the hook: closing a ticket is not the same as fixing the root cause. Introduce Simephony as an agentic resolution layer across buyers, SDP, and contractors.',
  'Play the news sting. Read it like a news segment: on 30 January 2026 the Court of Appeal dismissed Sime Darby Property’s appeal in Sime Darby Property (Bukit Jelutong) v Ooi Cheng Huat — the 24-month Defect Liability Period covers patent defects only, so developers may stay liable for latent defects found later. The six bungalows had water seepage, cracks, burst pipes and poor electrical wiring. Source: the Court of Appeal judgment on eFiling (Kehakiman Malaysia).',
  'Only the numbers: 95% of homebuyers had problems with how complaints were handled, 70% faced the same defect more than once, 50% were unhappy with the response and speed, and 1 in 2 were never asked to sign off a repair. Defects get closed, not resolved.',
  'Simephony: from complaint to resolution to proof. The buyer app, the SDP console and the technician app. Land on: Simephony helps developers know the unknown — it connects the dots across reports, repairs and history.',
  'Plays by itself: the Ceiling leak ticket for A-12-08 glides through the four stages while a frame follows it on the diagram — people on top, AI agents below. End on the motto: AI recommends, humans decide, the system records.',
  'Plays by itself: water drips from the ceilings of five units in stack 08 — to a normal ticket system, five separate tickets. The shared riser lights up: one pattern, auto-escalated to SDP. Then the four innovations and normal system vs Simephony.',
  'The demo plays by itself with sound (about 2 minutes). Buyer on the left reports the defect; the technician on the right sees it arrive, fixes it and sends proof back. Talk over it or let it run; use the player bar to skip ahead if time is short.',
  'Plays by itself: the three impacts (verify, connect, escalate) land together, then the value bar for residents, operations and quality.',
  'Plays by itself: a case runs through Data → FastMCP rules → AI agents → portals, with human accountability built in, then the three reasons it is feasible.',
  'Plays by itself: the road colours in from the working prototype (750+ automated tests) through shadow pilot (>90% staff alignment), live pilot, township scale and portfolio expansion. Close on one engine: configurable rules.yaml and modular agents.',
  'Close strong: Don’t just close the defect. Prove the root cause is fixed. Open the floor for Q&A.',
  'Q&A Appendix directory — jump directly to any supporting deep-dive.',
  'Appendix A1: User feedback from Kimberly and Lim and the exact product changes we shipped (plus next steps).',
  'Appendix A2: Real Malaysian homeowner quotes from Lowyat Forum showing why audit trails, verification, and systemic alerts matter.',
  'Appendix B1: Operational ROI — 100×+ cheaper AI first pass frees 375–500 staff hours per month for high-judgement work.',
  'Appendix B2: Compounding handover value cycle across the 24-month DLP and post-DLP services.',
  'Appendix B3: Year 5 brings RM1.16m of counted value — RM0.93m saved during the DLP plus RM0.24m of strata subscriptions after it — about 3.9 times the RM0.3m a year it costs to run. Developer licences (RM0.70m) are upside we do not count. The stream key is on the next slide.',
  'Appendix B4: the four counted streams — fewer repeat visits, lower dispute risk and contractor back-charges during the DLP, then strata subscriptions after it. Developer licences are upside only.',
  'Appendix B5: model pricing, salary, DLP and industry benchmark sources behind the ROI and value model.',
  'Appendix C: Buyer, SDP staff, and Technician pains and gains.',
  'Appendix C1: why we split messy inputs (AI), consistent decisions (rules) and final accountability (people). Runs on local or cloud models, switched in config.',
  'Appendix C2: Step-by-step suitability matrix showing who decides every action.',
  'Appendix C3: all seven AIGE principles checked against our code — four covered, three partly covered, and what is still next for each.',
  'Appendix C4: NIST AI RMF failure modes we tested and the technical safeguards we built.',
  'Appendix D: operational risks — disputed verifications, false systemic alerts, integration with SDP systems and photo privacy (PDPA). AI-specific failure modes are on the previous slide.',
  'Appendix E: Four post-hackathon enhancements: technician calendar, in-app chat, AI quality insights, and live photo guidance.',
  'Appendix G: Meet Group We Hit The Token Limit.',
];

export default [
  Cover,
  WhyItMatters,
  Problem,
  Solution,
  HowItWorks,
  Innovation,
  Demo,
  Impact,
  Feasibility,
  Scalability,
  ThankYou,
  AppendixDivider,
  Testimonials,
  HomeownerVoices,
  ValueAdmin,
  ValueCycle,
  YearFive,
  ValueStreams,
  ValueSources,
  TargetUsers,
  AiHowWeDecided,
  AiSuitability,
  AiAige,
  AiRisks,
  Risks,
  Future,
  Team,
] satisfies Page[];
