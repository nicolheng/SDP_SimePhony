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

const RAIL_W = 168;

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

/** Chapter rail for the main pitch: the four parts of the brief (problem · solution · value · pilot & ask). */
const Rail = ({ active }: { active: number }) => (
  <div style={{ position: 'relative', display: 'flex' }}>
    <RailLabel i={0} active={active}>PROBLEM</RailLabel>
    <RailLabel i={1} active={active}>SOLUTION</RailLabel>
    <RailLabel i={2} active={active}>VALUE</RailLabel>
    <RailLabel i={3} active={active}>PILOT &amp; ASK</RailLabel>
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
  titleSize,
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
  titleSize?: number;
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
        <Title size={titleSize}>{title}</Title>
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
    <Frame eyebrow="02 · Problem · The evidence" title="House defects get closed but don’t always get resolved." bodyTop={316} mark="02" chapter={0}>
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
// 01 · Problem: the ruling (D'Island Residence, High Court, Nov 2026) + the buyer's side of the same story
// ---------------------------------------------------------------------------

const RulingChip = ({ on, delay, children }: { on: boolean; delay: number; children: ReactNode }) => (
  <span style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 999, border: `2px solid ${line}`, background: '#fff', fontSize: 18, fontWeight: 700, color: ink, ...reveal(on, delay, 'translateY(8px)') }}>
    {children}
  </span>
);

/** One beat of the buyer's story: when, what the system did, what the buyer saw. */
const StoryBeat = ({ when, status, hot, last, on, delay, children }: { when: string; status: string; hot?: boolean; last?: boolean; on: boolean; delay: number; children: ReactNode }) => (
  <div style={{ position: 'relative', paddingLeft: 44, paddingBottom: last ? 0 : 18, ...reveal(on, delay, 'translateX(-12px)') }}>
    {last ? null : <div style={{ position: 'absolute', left: 9, top: 22, bottom: -4, width: 3, background: line }} />}
    <div style={{ position: 'absolute', left: 0, top: 6, width: 21, height: 21, borderRadius: 11, background: hot ? '#C64A1F' : card, border: `3px solid ${hot ? '#C64A1F' : '#D9B8A6'}`, boxSizing: 'border-box' }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.08em', color: hot ? 'var(--osd-accent)' : muted }}>{when}</span>
      <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 6, background: hot ? '#C64A1F' : '#F2EBE3', color: hot ? '#fff' : muted }}>
        {status}
      </span>
    </div>
    <div style={{ fontSize: 23, lineHeight: 1.35, color: ink, marginTop: 4 }}>{children}</div>
  </div>
);

const CourtCase: Page = () => {
  // No clicks: the ruling lands, then the buyer's story builds beat by beat, then the SDP band.
  const arrived = useArrived();
  const beat = useTimeline([700, 1000, 1300, 1600, 1900, 2400]);
  return (
    <Frame
      eyebrow="01 · Problem · High Court ruling, November 2026"
      title="Repairs that don’t hold don’t end the liability"
      titleSize={60}
      subtitle="Recurring leaks, repaired again and again, still there after the 24-month Defect Liability Period (DLP)."
      bodyTop={300}
      chapter={0}
    >
      <div style={{ display: 'flex', gap: 40, height: 500 }}>
        <Card style={{ flex: 1, padding: '28px 34px', display: 'flex', flexDirection: 'column', ...reveal(arrived, 0, 'translateY(16px)') }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--osd-accent)' }}>THE RULING · SHAH ALAM HIGH COURT</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 10 }}>71 purchasers v Astana Modal (M) Sdn Bhd</div>
          <div style={{ fontSize: 21, color: muted, marginTop: 4 }}>42 homes · D’Island Residence, Puchong · grounds delivered 17 Nov 2026</div>
          <blockquote style={{ margin: '22px 0 0', paddingLeft: 24, borderLeft: '5px solid #C64A1F', fontSize: 25, lineHeight: 1.45, color: ink, fontStyle: 'italic' }}>
            “Earlier rectification works and the expiry of the DLP do not provide a complete defence where the water leakage
            remained or recurred because the repairs were ineffective.”
            <div style={{ fontSize: 19, fontStyle: 'normal', fontWeight: 700, color: soft, marginTop: 8 }}>Judge Sumathi Murugiah</div>
          </blockquote>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 'auto' }}>
            <RulingChip on={arrived} delay={200}>Recurring water leaks</RulingChip>
            <RulingChip on={arrived} delay={280}>Repaired several times</RulingChip>
            <RulingChip on={arrived} delay={360}>Recurred after the DLP</RulingChip>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 16, color: ink }}>
            Ordered: pay to rectify the recurring leaks <span style={{ color: 'var(--osd-accent)' }}>+ RM35,000 legal costs</span>
          </div>
        </Card>

        <Card style={{ flex: 1, padding: '28px 34px', background: '#fff', ...reveal(arrived, 120, 'translateY(16px)') }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.14em', color: muted, marginBottom: 18 }}>THE BUYER’S SIDE · HOW IT HAPPENS</div>
          <StoryBeat on={beat >= 1} delay={0} when="MONTH 3" status="MARKED REPAIRED">Ceiling stain in the master bedroom.</StoryBeat>
          <StoryBeat on={beat >= 2} delay={0} when="MONTH 9" status="NEW TICKET">Leaking again, same spot. Patched again.</StoryBeat>
          <StoryBeat on={beat >= 3} delay={0} when="MONTH 20" status="NEW TICKET">“Third time. You said it was fixed.” Upstairs too.</StoryBeat>
          <StoryBeat on={beat >= 4} delay={0} when="MONTH 26" status="DLP ENDS">Still leaking. Nobody linked the three reports.</StoryBeat>
          <StoryBeat on={beat >= 5} delay={0} when="YEAR 5" status="IN COURT" hot last>Ceiling plaster damaged. The buyers sue.</StoryBeat>
        </Card>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 36, display: 'flex', alignItems: 'center', gap: 28, background: BLOCK, color: BLOCK_TEXT, borderRadius: 16, padding: '16px 28px', ...reveal(beat >= 6, 0, 'translateY(12px)') }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.12em', color: BLOCK_HI, flexShrink: 0, lineHeight: 1.3 }}>
          WHY IT MATTERS
          <br />
          TO SDP
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.4 }}>
          SDP aims for <b>“zero defects in end products”</b>, set up a Command &amp; Contact Centre for{' '}
          <b>“customer communications, disputes and defects”</b>, and plans to <b>“deepen AI integration across all business functions”</b>.
        </div>
      </div>
      <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 17, color: soft, margin: 0 }}>
        Sources: High Court ruling, New Straits Times, 18 Nov 2026 · SDP Sustainability Report 2024 · SDP Integrated Annual Report 2024 · Buyer’s timeline is illustrative.
      </p>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 03 · Solution: overall flow (video) + one feature per slide (video / image slots)
// ---------------------------------------------------------------------------

/**
 * A slot for a screen recording or screenshot.
 * Empty → a dashed placeholder. To fill it, put the file in ./assets/, import it at the top of this file
 * (e.g. `import flowVideo from './assets/flow.mp4'`) and pass `video={flowVideo}` (or `image={...}` for a still).
 * Videos play muted from the start each time the slide opens and pause when you leave.
 */
const MediaSlot = ({ w, h, hint, video, image, loop = true }: { w: number; h: number; hint: string; video?: string; image?: string; loop?: boolean }) => {
  const live = useIsActivePage();
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (live) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [live]);
  const frame: CSSProperties = { width: w, height: h, flexShrink: 0, borderRadius: 18, border: `2px solid ${line}`, boxShadow: '0 30px 60px -30px rgba(28,24,20,0.45)', overflow: 'hidden', background: '#fff' };
  const media: CSSProperties = { width: '100%', height: '100%', display: 'block', objectFit: 'cover', objectPosition: 'top left' };
  if (video) {
    return (
      <div style={frame}>
        <video ref={ref} src={video} muted loop={loop} playsInline preload="auto" style={media} />
      </div>
    );
  }
  if (image) {
    return (
      <div style={frame}>
        <img src={image} alt={hint} style={media} />
      </div>
    );
  }
  return (
    <div
      style={{ width: w, height: h, flexShrink: 0, boxSizing: 'border-box', borderRadius: 18, border: '3px dashed #D9B8A6', background: '#F6EFE7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center', padding: 40 }}
    >
      <div style={{ width: 92, height: 92, borderRadius: 46, background: '#C64A1F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 24 24" width={40} height={40}>
          <path d="M8 5v14l11-7z" fill="#fff" />
        </svg>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: ink }}>{hint}</div>
      <div style={{ fontSize: 21, color: muted }}>
        Video or screenshot · {w} × {h} · {loop ? 'loops, muted' : 'plays once, muted'}
      </div>
    </div>
  );
};

type Actor = 'BUYER' | 'AI' | 'TECHNICIAN' | 'SDP' | 'DONE';
const ACTOR_COLOR: Record<Actor, string> = { BUYER: '#C64A1F', AI: blue, TECHNICIAN: green, SDP: ink, DONE: green };

/** One step of the overall flow (left rail on the Solution page). */
const FlowStep = ({ n, who, title, on, delay, last }: { n: string; who: Actor; title: string; on: boolean; delay: number; last?: boolean }) => (
  <div style={{ position: 'relative', display: 'flex', gap: 18, alignItems: 'flex-start', paddingBottom: last ? 0 : 22, ...reveal(on, delay, 'translateX(-12px)') }}>
    {last ? null : <div style={{ position: 'absolute', left: 21, top: 44, bottom: 0, width: 3, background: line }} />}
    <div
      style={{ width: 45, height: 45, borderRadius: 23, flexShrink: 0, background: who === 'DONE' ? green : card, border: `3px solid ${ACTOR_COLOR[who]}`, color: who === 'DONE' ? '#fff' : ACTOR_COLOR[who], fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}
    >
      {who === 'DONE' ? '✓' : n}
    </div>
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.12em', color: ACTOR_COLOR[who] }}>{who === 'DONE' ? 'CLOSED' : who}</div>
      <div style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.25, marginTop: 2, color: ink }}>{title}</div>
    </div>
  </div>
);

const SOL_VIDEO_W = 1156;
const SOL_VIDEO_H = 650;

const SolutionFlow: Page = () => {
  const arrived = useArrived();
  return (
    <Frame
      eyebrow="03 · Solution · Simephony"
      title="Simephony: verified from report to closure"
      subtitle="Three apps and a team of AI agents. AI does the first pass; people approve every decision."
      bodyTop={310}
      chapter={1}
    >
      <div style={{ display: 'flex', gap: 40 }}>
        <div style={{ flex: 1, paddingTop: 4 }}>
          <FlowStep on={arrived} delay={0} n="1" who="BUYER" title="Reports the defect with photos" />
          <FlowStep on={arrived} delay={90} n="2" who="AI" title="Checks it is valid, with a reason" />
          <FlowStep on={arrived} delay={180} n="3" who="TECHNICIAN" title="Accepts or rejects the job" />
          <FlowStep on={arrived} delay={270} n="4" who="TECHNICIAN" title="Fixes it with the unit history + AI repair guide" />
          <FlowStep on={arrived} delay={360} n="5" who="SDP" title="Verifies the repair" />
          <FlowStep on={arrived} delay={450} n="6" who="BUYER" title="Checks it and signs off" />
          <FlowStep on={arrived} delay={540} n="7" who="DONE" title="Closed, with a PDF record" last />
        </div>
        <div style={reveal(arrived, 150, 'translateY(16px)')}>
          <MediaSlot w={SOL_VIDEO_W} h={SOL_VIDEO_H} loop={false} hint="Overall flow recording (20–30 s)" />
        </div>
      </div>
    </Frame>
  );
};

/** One feature per slide: media on the left; who it is for, what it does and what is different on the right. */
const FeatureSlide = ({ n, area, title, who, diff, media, children }: { n: string; area: string; title: string; who: string; diff: ReactNode; media: ReactNode; children: ReactNode }) => {
  const arrived = useArrived();
  return (
    <Frame eyebrow={`03 · Solution · Feature ${n} of 4 · ${area}`} title={title} bodyTop={290} chapter={1}>
      <div style={{ display: 'flex', gap: 44, height: 619 }}>
        <div style={reveal(arrived, 0, 'translateY(16px)')}>{media}</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', ...reveal(arrived, 180, 'translateY(16px)') }}>
          <span style={{ alignSelf: 'flex-start', fontSize: 18, fontWeight: 800, letterSpacing: '0.12em', color: '#A63A14', background: orangeSoft, padding: '7px 14px', borderRadius: 8 }}>
            FOR {who}
          </span>
          <ul style={{ fontSize: 24, lineHeight: 1.42, color: ink, margin: '22px 0 0', paddingLeft: 26, display: 'flex', flexDirection: 'column', gap: 14 , listStyleType: 'disc' }}>{children}</ul>
          <div style={{ marginTop: 'auto', background: BLOCK, color: BLOCK_TEXT, borderRadius: 16, padding: '18px 22px' }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: BLOCK_HI }}>WHAT’S DIFFERENT</div>
            <div style={{ fontSize: 21, lineHeight: 1.4, marginTop: 6 }}>{diff}</div>
          </div>
        </div>
      </div>
    </Frame>
  );
};

const FEAT_W = 1100;
const FEAT_H = 619;

const FeatToday: Page = () => (
  <FeatureSlide
    n="1"
    area="SDP console"
    title="Today: AI prepares, your team decides"
    who="CCC OFFICERS"
    media={<MediaSlot w={FEAT_W} h={FEAT_H} hint="SDP console · Today queue" />}
    diff="Some tools let AI agents act without an approval step. Here every verdict, rejection and escalation has a named person behind it."
  >
    <li>One live queue: approvals, repair deadlines, DLP warnings and buyers to call back</li>
    <li>Each case arrives with an AI verdict, the technician’s measurement and a reason code</li>
    <li>Invalid or unsure cases go to SDP review. AI never rejects a buyer on its own</li>
  </FeatureSlide>
);

const FeatInsights: Page = () => (
  <FeatureSlide
    n="2"
    area="SDP console"
    title="Insights: where defects really come from"
    who="PROJECT & QUALITY MANAGERS"
    media={<MediaSlot w={FEAT_W} h={FEAT_H} hint="SDP console · Insights" />}
    diff="Most defect apps stop at the ticket. Insights turn closed cases into decisions for the next phase."
  >
    <li>This building: KPIs against baseline, time per stage, where every report ended up</li>
    <li>Leak sources, defect categories and a scorecard for every contractor</li>
    <li>Next building: lessons and recommendations for design and contractor choice</li>
  </FeatureSlide>
);

const FeatSystemic: Page = () => (
  <FeatureSlide
    n="3"
    area="Systemic issues"
    title="Systemic issues: 5 tickets, 1 root cause"
    who="QUALITY & TECHNICAL TEAMS"
    media={<MediaSlot w={FEAT_W} h={FEAT_H} hint="Similar-defect linking · block heatmap" />}
    diff="Dashboards count recurring issues. Simephony links the actual cases, so one root-cause fix replaces repeat repairs."
  >
    <li>Links similar defects across units, stacks and repair history</li>
    <li>Repeats, reopens and shared units raise a systemic flag on the block heatmap</li>
    <li>A report after the DLP that matches an earlier repair is flagged as a possible latent defect</li>
  </FeatureSlide>
);

const FeatEvidence: Page = () => (
  <FeatureSlide
    n="4"
    area="Evidence chain"
    title="Evidence chain: every step on record"
    who="SDP, BUYERS & LEGAL"
    media={<MediaSlot w={FEAT_W} h={FEAT_H} hint="Agent trace · rectification record PDF" />}
    diff="In the D’Island ruling, repeat repairs were no defence. A verified record shows what was fixed, when, and whether it held."
  >
    <li>Report, AI verdict, measurement and every decision, time-stamped</li>
    <li>Before and after photos for every repair round; reused photos are caught</li>
    <li>Closes only after SDP verifies and the buyer signs off, with a PDF record</li>
  </FeatureSlide>
);

/** Differentiation table row: what today's defect apps do vs Simephony. */
const DiffRow = ({ cap, today, last }: { cap: string; today: string; last?: boolean }) => {
  const has = today === '✓';
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: last ? 'none' : `2px solid ${line}`, minHeight: 74 }}>
      <div style={{ flex: 1, padding: '10px 22px', fontSize: 23, fontWeight: 600, color: ink, lineHeight: 1.3 }}>{cap}</div>
      <div style={{ width: 200, padding: '10px 16px', textAlign: 'center', fontSize: has ? 28 : 20, fontWeight: 700, color: has ? green : soft, borderLeft: `2px solid ${line}` }}>{today}</div>
      <div style={{ width: 170, padding: '10px 16px', textAlign: 'center', fontSize: 28, fontWeight: 800, color: green, borderLeft: `2px solid ${line}`, background: greenSoft, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
    </div>
  );
};

const ScaleStep = ({ n, title, body, last }: { n: string; title: string; body: string; last?: boolean }) => (
  <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', position: 'relative', paddingBottom: last ? 0 : 22 }}>
    {last ? null : <div style={{ position: 'absolute', left: 21, top: 46, bottom: 0, width: 3, background: '#E9B9A3' }} />}
    <NumBadge n={n} />
    <div style={{ paddingTop: 4 }}>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 20, lineHeight: 1.38, color: muted, marginTop: 2 }}>{body}</div>
    </div>
  </div>
);

const Different: Page = () => {
  const arrived = useArrived();
  return (
    <Frame eyebrow="03 · Solution · Differentiation & scale" title="Different by design, built to scale" chapter={1}>
      <div style={{ display: 'flex', gap: 44 }}>
        <div style={{ width: 990, ...reveal(arrived, 0, 'translateY(16px)') }}>
          <div style={{ border: `2px solid ${ink}`, borderRadius: 16, overflow: 'hidden', background: card }}>
            <div style={{ display: 'flex', background: '#F2EBE3', borderBottom: `2px solid ${line}`, fontSize: 17, fontWeight: 800, letterSpacing: '0.1em' }}>
              <div style={{ flex: 1, padding: '12px 22px', color: muted }}>CAPABILITY</div>
              <div style={{ width: 200, padding: '12px 16px', textAlign: 'center', color: 'var(--osd-accent)', borderLeft: `2px solid ${line}` }}>DEFECT APPS TODAY</div>
              <div style={{ width: 170, padding: '12px 16px', textAlign: 'center', color: green, borderLeft: `2px solid ${line}` }}>SIMEPHONY</div>
            </div>
            <DiffRow cap="Photo report, status tracking, PDF export" today="✓" />
            <DiffRow cap="AI validity check against DLP rules, with a reason code" today="—" />
            <DiffRow cap="Step-by-step repair guide for the technician" today="—" />
            <DiffRow cap="Closes only after SDP and the buyer both verify" today="Sign-off only" />
            <DiffRow cap="Links recurring cases across units, with evidence" today="Dashboards" last />
          </div>
          <p style={{ fontSize: 18, lineHeight: 1.45, color: soft, margin: '14px 0 0' }}>
            “Defect apps today”: public features of Malaysian developer apps (including SDP’s) and defect platforms we reviewed in Nov 2026.
            None we found applies AI to homebuyer defect reports.
          </p>
        </div>
        <Card style={{ flex: 1, padding: '26px 30px', ...reveal(arrived, 180, 'translateY(16px)') }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)', marginBottom: 20 }}>ONE ENGINE, MANY DEVELOPMENTS</div>
          <ScaleStep n="1" title="One handover phase" body="Pilot alongside the CCC" />
          <ScaleStep n="2" title="All 27 townships" body="Rules, thresholds and workflows per township in one config file" />
          <ScaleStep n="3" title="After the DLP" body="Strata buildings and SDP’s own assets" />
          <ScaleStep n="4" title="Back into construction" body="Contractor scorecards and lessons for the next phase’s design" last />
        </Card>
      </div>
    </Frame>
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
      eyebrow="Appendix H · The three apps"
      mark="H"
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
    <Frame eyebrow="Appendix H · How it works" title="One defect, four stages, one trusted record" bodyTop={250} mark="H">
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
    <Frame eyebrow="Appendix H · Full demo" title="Buyer and technician, side by side." bodyTop={262}>
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
      eyebrow="Appendix H · Innovation"
      title="What a normal ticket system can’t do"
      subtitle="From tracking complaints to detecting systemic risks."
      bodyTop={290}
      mark="H"
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
    <Frame eyebrow="05 · Pilot & ask · Readiness" title="Ready to pilot: built, tested, fits SDP’s systems" titleSize={60} chapter={3}>
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
        <WhyCol on={beat >= 4} delay={60} n="01" title="Working today, not a mock-up">
          <li style={{ marginBottom: 8 }}>4 defect scenarios run end to end; 750+ automated tests pass.</li>
          <li>LangGraph, FastAPI / FastMCP, Next.js. Local or cloud AI model, switched in config; rules take over if a model fails.</li>
        </WhyCol>
        <WhyCol on={beat >= 4} delay={200} n="02" title="Human oversight built into every step">
          <li style={{ marginBottom: 8 }}>AI investigates and recommends; technicians record verdicts while SDP approves extra inspections.</li>
          <li>Backend rules enforce case statuses, bookings, permissions and alerts.</li>
        </WhyCol>
        <WhyCol on={beat >= 4} delay={340} n="03" title="Sits beside SDP’s systems">
          <li style={{ marginBottom: 8 }}>Pilot: batch import from the CCC and Procore. Live APIs to them and the SDP app in Year 2.</li>
          <li>Data can stay in Malaysia (Azure Malaysia West or AWS Malaysia region).</li>
        </WhyCol>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 04 · Business value (headline number with its build-up, then value over time + sensitivity)
// ---------------------------------------------------------------------------

type TagKind = 'sdp' | 'bench' | 'est' | 'measured';
const TAG_STYLE: Record<TagKind, { label: string; color: string; bg: string }> = {
  sdp: { label: 'SDP DATA', color: blue, bg: blueSoft },
  bench: { label: 'BENCHMARK', color: amber, bg: amberSoft },
  est: { label: 'ESTIMATE', color: '#A63A14', bg: orangeSoft },
  measured: { label: 'MEASURED', color: green, bg: greenSoft },
};

/** Where a number comes from: SDP data, an external benchmark, our estimate, or measured on the prototype. */
const Tag = ({ kind, children }: { kind: TagKind; children?: ReactNode }) => {
  const t = TAG_STYLE[kind];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: t.color, background: t.bg, padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
      <b style={{ letterSpacing: '0.08em', fontWeight: 800 }}>{t.label}</b>
      {children ? <span style={{ color: ink, fontWeight: 600 }}>{children}</span> : null}
    </span>
  );
};

/** One counted value line: what it is, the type of saving, the formula and where each input comes from. */
const ValueLine = ({ k, title, kind, value, formula, on, delay, children }: { k: string; title: string; kind: string; value: string; formula: string; on: boolean; delay: number; children: ReactNode }) => (
  <Card style={{ padding: '14px 24px', ...reveal(on, delay, 'translateX(24px)') }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#C64A1F', color: '#fff', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k}</div>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{title}</div>
      <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.1em', color: muted, border: `2px solid ${line}`, padding: '3px 9px', borderRadius: 6 }}>{kind}</span>
      <div style={{ marginLeft: 'auto', fontSize: 38, fontWeight: 800, color: 'var(--osd-accent)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
    <div style={{ fontSize: 21, color: ink, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{formula}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{children}</div>
  </Card>
);

const Uncounted = ({ title, body }: { title: string; body: string }) => (
  <div>
    <div style={{ fontSize: 21, fontWeight: 800, color: ink }}>{title}</div>
    <div style={{ fontSize: 18, lineHeight: 1.35, color: muted, marginTop: 2 }}>{body}</div>
  </div>
);

const HeadStat = ({ value, label }: { value: string; label: string }) => (
  <div>
    <div style={{ fontSize: 34, fontWeight: 800, color: BLOCK_HI, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 20, lineHeight: 1.35, marginTop: 2 }}>{label}</div>
  </div>
);

const ValueHeadline: Page = () => {
  const arrived = useArrived();
  const lines = useTimeline([350]) >= 1;
  return (
    <Frame
      eyebrow="04 · Business value · Base case at full rollout"
      title="RM0.78m a year of counted value, 2.6× its run cost"
      titleSize={56}
      bodyTop={270}
      chapter={2}
    >
      <div style={{ display: 'flex', gap: 36 }}>
        <div style={{ width: 500, flexShrink: 0, background: BLOCK, color: BLOCK_TEXT, borderRadius: 'var(--osd-radius)', padding: '30px 34px', boxSizing: 'border-box', ...reveal(arrived, 0, 'translateY(16px)') }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.14em', color: BLOCK_HI }}>COUNTED VALUE PER YEAR</div>
          <div style={{ fontSize: 90, fontWeight: 900, letterSpacing: '-0.04em', color: BLOCK_HI, lineHeight: 1.05, marginTop: 6 }}>RM0.78m</div>
          <div style={{ fontSize: 22, lineHeight: 1.4, marginTop: 4 }}>at about 3,000 handovers a year, once every township is on Simephony</div>
          <div style={{ height: 2, background: '#EFC3AE', margin: '22px 0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <HeadStat value="RM0.30m" label="a year to run (build-up in Pilot & ask)" />
            <HeadStat value="RM0.43m" label="downside, if both big estimates come in low (1.4×)" />
            <HeadStat value="A + B + C only" label="cash saved and costs avoided; nothing soft is counted" />
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ValueLine on={lines} delay={0} k="A" title="Fewer repeat visits" kind="CASH SAVING" value="RM0.39m" formula="12,000 visits × 23% repeat × 40% avoided × RM350 a visit">
            <Tag kind="sdp">3,000 handovers</Tag>
            <Tag kind="bench">23%: Aquant 2026</Tag>
            <Tag kind="est">4 visits/unit, 40%, RM350</Tag>
          </ValueLine>
          <ValueLine on={lines} delay={120} k="B" title="Recurring defects stopped early" kind="COST AVOIDED" value="RM0.27m" formula="RM1.4bn residential build cost × 0.38% post-handover rework × 5% prevented">
            <Tag kind="sdp">FY2025 cost of sales</Tag>
            <Tag kind="bench">0.38%: Love 2026</Tag>
            <Tag kind="est">5% prevented</Tag>
          </ValueLine>
          <ValueLine on={lines} delay={240} k="C" title="Disputes avoided" kind="COST AVOIDED" value="RM0.13m" formula="6 tribunal-scale disputes × ≈RM22k (average award + staff time)">
            <Tag kind="bench">≈RM20k award: KPKT</Tag>
            <Tag kind="est">6 a year</Tag>
          </ValueLine>
          <div style={{ border: `2px dashed ${line}`, borderRadius: 'var(--osd-radius)', padding: '12px 24px', ...reveal(lines, 380, 'translateX(24px)') }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.12em', color: soft }}>NOT COUNTED IN THE TOTAL</div>
            <div style={{ display: 'flex', gap: 28, marginTop: 8 }}>
              <Uncounted title="≈3 people of CCC time" body="≈RM0.1m, redeployed" />
              <Uncounted title="Referrals" body="RM4k–20k per sale" />
              <Uncounted title="Court-scale cases" body="RM0.5m+ each" />
              <Uncounted title="After the DLP" body="Strata and SDP assets" />
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
};

// Value over time (RM m). One axis for value, cost and cumulative net, so they compare directly.
const VT = { left: 80, right: 980, top: 70, bottom: 520 };
const VT_ZERO = (VT.top + VT.bottom) / 2; // y of RM0
const VT_K = (VT.bottom - VT.top) / 1.6; // px per RM1m (axis −0.8 … +0.8)
const vtY = (v: number) => VT_ZERO - v * VT_K;
const vtX = (i: number) => VT.left + (i + 0.5) * 180;
const VT_VALUE = [0.04, 0.31, 0.78, 0.78, 0.78];
const VT_COST = [0.5, 0.5, 0.3, 0.3, 0.3];
const VT_CUM = [-0.46, -0.65, -0.17, 0.31, 0.79];

/** One year: value bar and cost bar side by side, growing up from RM0. */
const YearBars = ({ i, on, label, sub }: { i: number; on: boolean; label: string; sub: string }) => {
  const cx = vtX(i);
  const grow = (delay: number): CSSProperties => ({
    transformBox: 'view-box',
    transformOrigin: `${cx}px ${VT_ZERO}px`,
    transform: on ? 'scaleY(1)' : 'scaleY(0)',
    transition: `transform 800ms ${CAM_EASE} ${delay}ms`,
  });
  const v = VT_VALUE[i];
  const c = VT_COST[i];
  return (
    <g>
      <g style={grow(i * 120)}>
        <rect x={cx - 60} y={vtY(v)} width={56} height={v * VT_K} rx={4} fill="#C64A1F" />
        <rect x={cx + 4} y={vtY(c)} width={56} height={c * VT_K} rx={4} fill={blue} />
      </g>
      <text x={cx - 32} y={vtY(v) - 10} textAnchor="middle" fontSize="19" fontWeight="800" fill={ink} style={{ opacity: on ? 1 : 0, transition: `opacity 300ms ${EASE_OUT} ${i * 120 + 700}ms` }}>
        {v.toFixed(2)}
      </text>
      <text x={cx} y={VT.bottom + 40} textAnchor="middle" fontSize="22" fontWeight="800" fill={ink}>{label}</text>
      <text x={cx} y={VT.bottom + 66} textAnchor="middle" fontSize="18" fill={muted}>{sub}</text>
    </g>
  );
};

const CumPoint = ({ i, on }: { i: number; on: boolean }) => {
  const v = VT_CUM[i];
  const x = vtX(i);
  const y = vtY(v);
  return (
    <g style={{ opacity: on ? 1 : 0, transition: `opacity 300ms ${EASE_OUT} ${900 + i * 120}ms` }}>
      <circle cx={x} cy={y} r={9} fill={ink} stroke={card} strokeWidth={3} />
      <text
        x={i === 0 ? x - 14 : i === 1 ? x : x + 14}
        y={i === 0 ? y + 6 : i === 4 ? y - 14 : y + 30}
        textAnchor={i === 0 ? 'end' : i === 1 ? 'middle' : 'start'}
        fontSize="19"
        fontWeight="800"
        fill={ink}
        stroke={card}
        strokeWidth={6}
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        {v > 0 ? '+' : '−'}
        {Math.abs(v).toFixed(2)}
      </text>
    </g>
  );
};

const SensRow = ({ label, value, ratio, strong, shade }: { label: string; value: string; ratio: string; strong?: boolean; shade?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', background: shade ? '#F6EFE7' : 'transparent', borderRadius: 10 }}>
    <span style={{ flex: 1, fontSize: 21, fontWeight: strong ? 800 : 500, color: ink, lineHeight: 1.3 }}>{label}</span>
    <span style={{ width: 120, textAlign: 'right', fontSize: 23, fontWeight: 800, color: ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    <span style={{ width: 80, textAlign: 'right', fontSize: 23, fontWeight: 800, color: 'var(--osd-accent)', fontVariantNumeric: 'tabular-nums' }}>{ratio}</span>
  </div>
);

const ValueOverTime: Page = () => {
  const on = useArrived();
  const cum = VT_CUM.map((v, i) => `${i === 0 ? 'M' : 'L'} ${vtX(i)} ${vtY(v)}`).join(' ');
  const beX = vtX(2) + (0.17 / 0.48) * 180;
  return (
    <Frame eyebrow="04 · Business value · Over time" title="Value grows with scale: break-even in Year 4" titleSize={60} bodyTop={270} chapter={2}>
      <div style={{ display: 'flex', gap: 40 }}>
        <div style={{ flexShrink: 0 }}>
          <svg viewBox="0 0 1000 600" style={{ width: 1000, height: 600, display: 'block', overflow: 'visible' }} role="img" aria-label="Counted value, cost and cumulative net by year, RM million. Value 0.04, 0.31, 0.78, 0.78, 0.78. Cost 0.50, 0.50, 0.30, 0.30, 0.30. Cumulative net −0.46, −0.65, −0.17, +0.31, +0.79.">
            <text x="0" y="20" fontSize="18" fontWeight="700" fill={soft} letterSpacing="0.06em">RM MILLION A YEAR · BASE CASE</text>
            <g transform="translate(470 6)">
              <rect x="0" y="0" width="18" height="18" rx="3" fill="#C64A1F" />
              <text x="26" y="16" fontSize="18" fontWeight="700" fill={ink}>Counted value</text>
              <rect x="176" y="0" width="18" height="18" rx="3" fill={blue} />
              <text x="202" y="16" fontSize="18" fontWeight="700" fill={ink}>Cost</text>
              <line x1="278" x2="314" y1="9" y2="9" stroke={ink} strokeWidth="3" />
              <circle cx="296" cy="9" r="6" fill={ink} />
              <text x="324" y="16" fontSize="18" fontWeight="700" fill={ink}>Cumulative net</text>
            </g>
            <line x1={VT.left} x2={VT.right} y1={vtY(0.5)} y2={vtY(0.5)} stroke={line} strokeWidth="2" />
            <line x1={VT.left} x2={VT.right} y1={vtY(-0.5)} y2={vtY(-0.5)} stroke={line} strokeWidth="2" />
            <text x={VT.left - 12} y={vtY(0.5) + 6} textAnchor="end" fontSize="18" fill={soft}>+0.5</text>
            <text x={VT.left - 12} y={VT_ZERO + 6} textAnchor="end" fontSize="18" fill={soft}>0</text>
            <text x={VT.left - 12} y={vtY(-0.5) + 6} textAnchor="end" fontSize="18" fill={soft}>−0.5</text>
            <YearBars i={0} on={on} label="Year 1" sub="Pilot + 1 township" />
            <YearBars i={1} on={on} label="Year 2" sub="3 townships" />
            <YearBars i={2} on={on} label="Year 3" sub="All townships" />
            <YearBars i={3} on={on} label="Year 4" sub="Full run" />
            <YearBars i={4} on={on} label="Year 5" sub="Full run" />
            <line x1={VT.left} x2={VT.right} y1={VT_ZERO} y2={VT_ZERO} stroke={soft} strokeWidth="2" />
            <g style={{ opacity: on ? 1 : 0, transition: `opacity 400ms ${EASE_OUT} 1500ms` }}>
              <line x1={beX} x2={beX} y1={VT.top + 10} y2={VT.bottom} stroke={green} strokeWidth="2.5" strokeDasharray="8 6" />
              <text x={beX + 10} y={VT.bottom - 8} fontSize="19" fontWeight="800" fill={green}>Break-even</text>
            </g>
            <path d={cum} fill="none" stroke={ink} strokeWidth="3" pathLength={1} strokeDasharray="1" strokeDashoffset={on ? 0 : 1} style={{ transition: `stroke-dashoffset 1000ms ${EASE_OUT} 900ms` }} />
            <CumPoint i={0} on={on} />
            <CumPoint i={1} on={on} />
            <CumPoint i={2} on={on} />
            <CumPoint i={3} on={on} />
            <CumPoint i={4} on={on} />
          </svg>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, ...reveal(on, 600, 'translateY(16px)') }}>
          <Card style={{ padding: '20px 18px' }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: muted, padding: '0 18px 8px' }}>IF OUR ESTIMATES ARE WRONG</div>
            <SensRow strong shade label="Base case" value="RM0.78m" ratio="2.6×" />
            <SensRow label="Visits avoided 20%, not 40%" value="RM0.59m" ratio="2.0×" />
            <SensRow label="Rework prevented 2%, not 5%" value="RM0.62m" ratio="2.1×" />
            <SensRow label="Both low" value="RM0.43m" ratio="1.4×" />
            <div style={{ fontSize: 18, color: soft, padding: '6px 18px 0' }}>Ratio = counted value ÷ RM0.30m yearly run cost</div>
          </Card>
          <div style={{ background: BLOCK, color: BLOCK_TEXT, borderRadius: 16, padding: '20px 24px' }}>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.3 }}>
              Avoiding one court-scale judgment <span style={{ color: BLOCK_HI }}>(≈RM0.5m)</span> pays for the whole pilot.
            </div>
            <div style={{ fontSize: 18, color: muted, marginTop: 6 }}>e.g. Agile Mont Kiara, High Court 2025: ≈RM0.51m in damages</div>
          </div>
          <div style={{ fontSize: 21, lineHeight: 1.4, color: ink }}>
            <b>Five years, base case:</b> RM2.7m counted value for RM1.9m total cost (pilot, integration, running).
          </div>
        </div>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 05 · Pilot & ask (cost build-up, plan & resources, success measures, the decision)
// ---------------------------------------------------------------------------

/** A cost line with a bar sized by its share of the card total. */
const CostRow = ({ label, sub, value, share, color = '#C64A1F' }: { label: string; sub?: string; value: string; share: number; color?: string }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: ink }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 23, fontWeight: 800, color: ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
    {sub ? <div style={{ fontSize: 17, color: muted, marginTop: 1 }}>{sub}</div> : null}
    <div style={{ height: 8, background: '#F2EBE3', borderRadius: 4, marginTop: 6 }}>
      <div style={{ width: `${Math.max(share * 100, 1.5)}%`, height: 8, background: color, borderRadius: 4 }} />
    </div>
  </div>
);

const ScenarioRow = ({ label, sub, value, hot }: { label: string; sub: string; value: string; hot?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: `2px solid ${line}` }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: ink }}>{label}</div>
      <div style={{ fontSize: 17, color: muted, marginTop: 1 }}>{sub}</div>
    </div>
    <span style={{ fontSize: 23, fontWeight: 800, color: hot ? 'var(--osd-accent)' : ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
  </div>
);

const CostHead = ({ label, total }: { label: string; total: string }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: muted }}>{label}</div>
    <div style={{ fontSize: 40, fontWeight: 900, color: 'var(--osd-accent)', letterSpacing: '-0.02em', marginTop: 2 }}>{total}</div>
  </div>
);

const Cost: Page = () => {
  const arrived = useArrived();
  return (
    <Frame eyebrow="05 · Pilot & ask · Indicative cost" title="RM0.5m to pilot, RM0.3m a year to run" bodyTop={270} chapter={3}>
      <div style={{ display: 'flex', gap: 28, height: 590 }}>
        <Card style={{ flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', ...reveal(arrived, 0, 'translateY(16px)') }}>
          <CostHead label="6-MONTH PILOT" total="RM500k" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <CostRow label="Team, 6 months" sub="Tech lead, full-stack, AI engineer, ½ QA" value="RM360k" share={0.72} />
            <CostRow label="Change and training" sub="≈10% of project cost (Prosci)" value="RM40k" share={0.08} />
            <CostRow label="Pen test and PDPA review" sub="CSA-licensed tester" value="RM25k" share={0.05} />
            <CostRow label="Cloud in Malaysia + AI" value="RM10k" share={0.02} color={blue} />
            <CostRow label="Contingency (15%)" value="RM65k" share={0.13} color={soft} />
          </div>
          <div style={{ fontSize: 17, lineHeight: 1.4, color: soft, marginTop: 'auto' }}>Salaries: Randstad 2026 guide × 1.3 for EPF, SOCSO, EIS, HRDF and bonus.</div>
        </Card>

        <Card style={{ flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', ...reveal(arrived, 120, 'translateY(16px)') }}>
          <CostHead label="RUNNING COST, FROM YEAR 3" total="RM300k a year" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <CostRow label="Support team (1.5 people)" value="RM230k" share={0.77} />
            <CostRow label="Yearly pen test" value="RM25k" share={0.083} />
            <CostRow label="Malaysia-region cloud" value="RM21k" share={0.07} color={blue} />
            <CostRow label="Monitoring and backup" value="RM15k" share={0.05} color={blue} />
            <CostRow label="AI (≈75,000 defect items)" value="RM7k" share={0.023} color={blue} />
            <CostRow label="WhatsApp updates" value="RM2k" share={0.007} color={blue} />
          </div>
          <div style={{ fontSize: 17, lineHeight: 1.4, color: soft, marginTop: 'auto' }}>Plus a one-off RM200k in Year 2 to connect to the CCC, Procore and the SDP app.</div>
        </Card>

        <Card style={{ flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', ...reveal(arrived, 240, 'translateY(16px)') }}>
          <CostHead label="AI COST PER CASE, BY SCENARIO" total="≈RM0.08 blended" />
          <ScenarioRow label="Rejected" sub="AI check, then SDP review" value="RM0.02–0.03" />
          <ScenarioRow label="Fixed first time" sub="Check, booking, guide, verification" value="RM0.06–0.08" />
          <ScenarioRow label="Reopened" sub="Second repair round, photos re-checked" value="RM0.09–0.13" />
          <ScenarioRow label="Systemic" sub="Linked across units and escalated" value="RM0.12–0.18" hot />
          <div style={{ fontSize: 20, lineHeight: 1.4, color: ink, marginTop: 12 }}>
            Manual admin today: <b>RM13–27 a case</b>. Premium AI model: still under RM1.
          </div>
          <div style={{ fontSize: 17, lineHeight: 1.4, color: soft, marginTop: 'auto' }}>Gemini Flash-Lite list prices at RM4.11 to the US dollar.</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: BLOCK, color: BLOCK_TEXT, borderRadius: 14, padding: '14px 28px', textAlign: 'center', fontSize: 24, fontWeight: 800, ...reveal(arrived, 400, 'translateY(12px)') }}>
        Only 2% of the pilot is cloud and AI. <span style={{ color: BLOCK_HI }}>The money goes on people, change and safeguards.</span>
      </div>
    </Frame>
  );
};

/** One phase of the pilot plan. `ask` marks the phases this decision funds. */
const PhaseCol = ({ when, name, body, gate, ask, on, delay }: { when: string; name: string; body: string; gate?: string; ask?: boolean; on: boolean; delay: number }) => (
  <div
    style={{ flex: 1, display: 'flex', flexDirection: 'column', background: ask ? card : 'transparent', border: ask ? `2px solid ${line}` : `2px dashed ${line}`, borderRadius: 16, padding: '16px 20px', boxSizing: 'border-box', ...reveal(on, delay, 'translateY(14px)') }}
  >
    <div style={{ height: 6, borderRadius: 3, background: ask ? '#C64A1F' : '#E3D7CA', marginBottom: 12 }} />
    <div style={{ fontSize: 19, fontWeight: 800, color: ask ? 'var(--osd-accent)' : soft }}>{when}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color: ink, marginTop: 2 }}>{name}</div>
    <div style={{ fontSize: 19, lineHeight: 1.38, color: muted, marginTop: 6 }}>{body}</div>
    {gate ? (
      <div style={{ marginTop: 'auto', paddingTop: 10 }}>
        <span style={{ display: 'inline-block', fontSize: 16, fontWeight: 800, letterSpacing: '0.06em', color: '#fff', background: green, padding: '5px 10px', borderRadius: 6 }}>◆ GATE: {gate}</span>
      </div>
    ) : null}
  </div>
);

const NeedItem = ({ children }: { children: ReactNode }) => (
  <li style={{ fontSize: 21, lineHeight: 1.38, color: ink }}>{children}</li>
);

const DepRow = ({ risk, fix }: { risk: string; fix: string }) => (
  <div style={{ fontSize: 21, lineHeight: 1.38 }}>
    <b style={{ color: ink }}>{risk}:</b> <span style={{ color: muted }}>{fix}</span>
  </div>
);

const PilotPlan: Page = () => {
  const arrived = useArrived();
  return (
    <Frame eyebrow="05 · Pilot & ask · Plan and resources" title="Six months on one handover phase, two gates" titleSize={60} bodyTop={270} chapter={3}>
      <div style={{ position: 'relative', paddingTop: 34 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 'calc(60% - 10px)', borderTop: '3px solid #C64A1F', ...reveal(arrived, 0, 'none') }}>
          <span style={{ position: 'absolute', left: 0, top: -14, background: 'var(--osd-bg)', paddingRight: 14, fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>THIS ASK · RM0.5m</span>
        </div>
        <div style={{ display: 'flex', gap: 16, height: 268 }}>
          <PhaseCol ask on={arrived} delay={0} when="Month 0" name="Set up" body="Baseline from the last phase’s CCC and Procore tickets. PDPA sign-off, pen test." />
          <PhaseCol ask on={arrived} delay={100} when="Months 1–3" name="Shadow" body="Runs beside the CCC on ~300 units. AI recommends, staff decide; buyers see no change." gate="≥ 90% AGREEMENT" />
          <PhaseCol ask on={arrived} delay={200} when="Months 4–6" name="Live" body="Buyers report in the app, technicians use repair guides, buyers sign off." gate="GO / NO-GO" />
          <PhaseCol on={arrived} delay={300} when="Year 2" name="Townships" body="APIs to the CCC, Procore and the SDP app. More trades. ≈RM0.2m one-off." />
          <PhaseCol on={arrived} delay={400} when="Year 3+" name="Portfolio" body="All ~3,000 handovers a year. RM0.3m a year to run." />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 28, marginTop: 26 }}>
        <Card style={{ flex: 1, padding: '22px 30px', ...reveal(arrived, 450, 'translateY(14px)') }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>WHAT WE NEED FROM SDP</div>
          <ul style={{ margin: '12px 0 0', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 6, listStyleType: 'disc' }}>
            <NeedItem>A business owner: the Head of the Command &amp; Contact Centre</NeedItem>
            <NeedItem>One newly handed-over phase (~300 units) in its DLP</NeedItem>
            <NeedItem>2–3 CCC officers and 2 contractor technicians as pilot users</NeedItem>
            <NeedItem>12 months of past defect tickets and photos, anonymised</NeedItem>
            <NeedItem>One IT contact and a review by SDP’s data protection officer</NeedItem>
          </ul>
        </Card>
        <Card style={{ flex: 1, padding: '22px 30px', display: 'flex', flexDirection: 'column', gap: 10, ...reveal(arrived, 550, 'translateY(14px)') }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: blue }}>DEPENDENCIES AND HOW WE HANDLE THEM</div>
          <DepRow risk="Data and PDPA" fix="anonymised extract, kept in Malaysia, DPO sign-off first" />
          <DepRow risk="Integration" fix="the pilot uses a batch import; live APIs only in Year 2" />
          <DepRow risk="Contractor adoption" fix="one app, and the repair guide saves them time" />
          <DepRow risk="AI mistakes" fix="SDP reviews every rejection; rules take over if a model fails" />
        </Card>
      </div>
    </Frame>
  );
};

const MeasureRow = ({ measure, base, target, how, primary, shade }: { measure: string; base: string; target: string; how: string; primary?: boolean; shade?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', minHeight: 62, background: primary ? BLOCK : shade ? '#F6EFE7' : 'transparent', borderRadius: 10 }}>
    <div style={{ flex: 1, padding: '8px 20px', fontSize: 22, fontWeight: primary ? 800 : 600, color: ink, lineHeight: 1.3 }}>
      {primary ? <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.1em', color: '#fff', background: '#C64A1F', padding: '3px 8px', borderRadius: 5, marginRight: 12, verticalAlign: 3 }}>PRIMARY</span> : null}
      {measure}
    </div>
    <div style={{ width: 330, padding: '8px 16px', fontSize: 20, color: muted }}>{base}</div>
    <div style={{ width: 210, padding: '8px 16px', fontSize: 23, fontWeight: 800, color: primary ? BLOCK_HI : 'var(--osd-accent)' }}>{target}</div>
    <div style={{ width: 330, padding: '8px 16px', fontSize: 20, color: muted }}>{how}</div>
  </div>
);

const Success: Page = () => {
  const arrived = useArrived();
  const th: CSSProperties = { fontSize: 16, fontWeight: 800, letterSpacing: '0.12em', color: soft, padding: '0 16px 10px' };
  return (
    <Frame eyebrow="05 · Pilot & ask · Success measures" title="How we’ll know it works, agreed before day one" titleSize={58} bodyTop={270} chapter={3}>
      <div style={reveal(arrived, 0, 'translateY(14px)')}>
        <div style={{ display: 'flex', borderBottom: `2px solid ${line}`, marginBottom: 6 }}>
          <div style={{ ...th, flex: 1, paddingLeft: 20 }}>MEASURE</div>
          <div style={{ ...th, width: 330 }}>BASELINE</div>
          <div style={{ ...th, width: 210 }}>TARGET</div>
          <div style={{ ...th, width: 330 }}>HOW WE MEASURE IT</div>
        </div>
        <MeasureRow primary measure="Repeat-visit rate" base="SDP’s last comparable phase" target="−20% by M6" how="CCC and Procore visit logs" />
        <MeasureRow measure="AI verdict matches SDP’s inspector" base="New measure" target="≥ 90%" how="Blind sample, months 1–3" />
        <MeasureRow shade measure="Repairs done within the 30-day SPA window" base="Last comparable phase" target="≥ 90%" how="Case timestamps" />
        <MeasureRow measure="Closed repairs signed off by the buyer" base="1 in 2 never asked today" target="≥ 80%" how="In-app sign-off" />
        <MeasureRow shade measure="Recurring patterns accepted by QA" base="Not tracked today" target="≥ 1 by M6" how="QA review of flagged issues" />
      </div>
      <div style={{ display: 'flex', gap: 28, marginTop: 24 }}>
        <Card style={{ flex: 1, padding: '20px 28px', ...reveal(arrived, 250, 'translateY(14px)') }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: green }}>GUARDRAILS, ALWAYS ON</div>
          <ul style={{ margin: '10px 0 0', paddingLeft: 24, fontSize: 21, lineHeight: 1.45, color: ink , listStyleType: 'disc' }}>
            <li>No valid defect rejected without SDP review</li>
            <li>Buyer complaints and escalations no higher than baseline</li>
            <li>Zero personal-data incidents</li>
          </ul>
        </Card>
        <Card style={{ flex: 1, padding: '20px 28px', borderColor: '#E9B9A3', ...reveal(arrived, 350, 'translateY(14px)') }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>WHEN WE STOP</div>
          <ul style={{ margin: '10px 0 0', paddingLeft: 24, fontSize: 21, lineHeight: 1.45, color: ink , listStyleType: 'disc' }}>
            <li><b>Month 3:</b> agreement under 80%, or staff say it adds work → stop or rescope</li>
            <li><b>Month 6:</b> repeat visits down less than 10% → no rollout</li>
          </ul>
        </Card>
      </div>
    </Frame>
  );
};

const AskTile = ({ label, value, sub, on, delay }: { label: string; value: string; sub: string; on: boolean; delay: number }) => (
  <div style={{ flex: 1, display: 'flex', ...reveal(on, delay, 'translateY(16px)') }}>
    <Card style={{ flex: 1, padding: '24px 28px' }}>
      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.14em', color: muted }}>{label}</div>
      <div style={{ fontSize: 52, fontWeight: 900, color: 'var(--osd-accent)', letterSpacing: '-0.02em', marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 21, lineHeight: 1.4, color: ink, marginTop: 8 }}>{sub}</div>
    </Card>
  </div>
);

const Ask: Page = () => {
  const arrived = useArrived();
  const close = useTimeline([700]) >= 1;
  return (
    <Frame eyebrow="05 · Pilot & ask · The decision" title="Our ask: approve a 6-month pilot on one phase" titleSize={60} bodyTop={270} chapter={3}>
      <div style={{ display: 'flex', gap: 24 }}>
        <AskTile on={arrived} delay={0} label="BUDGET" value="RM0.5m" sub="≈RM60k a month for the team; 2% cloud and AI" />
        <AskTile on={arrived} delay={100} label="SCOPE" value="~300 units" sub="One newly handed-over phase, defects in the DLP" />
        <AskTile on={arrived} delay={200} label="OWNER" value="Head of CCC" sub="Business owner, with QA for systemic issues" />
        <AskTile on={arrived} delay={300} label="NEXT DECISION" value="Month 6" sub="Go / no-go on rolling out to townships" />
      </div>
      <div style={{ display: 'flex', gap: 28, marginTop: 28 }}>
        <Card style={{ flex: 1, padding: '22px 30px', ...reveal(arrived, 400, 'translateY(14px)') }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>AT MONTH 6 YOU GET</div>
          <ul style={{ margin: '10px 0 0', paddingLeft: 24, fontSize: 22, lineHeight: 1.45, color: ink , listStyleType: 'disc' }}>
            <li>Repeat visits, 30-day repairs and sign-offs, measured against your baseline</li>
            <li>The value model re-run with SDP’s own cost per visit</li>
            <li>A go / no-go recommendation you can check line by line</li>
          </ul>
        </Card>
        <Card style={{ flex: 1, padding: '22px 30px', ...reveal(arrived, 500, 'translateY(14px)') }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.12em', color: blue }}>IF IT WORKS, WHAT FOLLOWS</div>
          <ul style={{ margin: '10px 0 0', paddingLeft: 24, fontSize: 22, lineHeight: 1.45, color: ink , listStyleType: 'disc' }}>
            <li>Year 2: ≈RM0.2m to connect the CCC, Procore and the SDP app</li>
            <li>Year 3 on: RM0.3m a year to run, RM0.78m a year back</li>
            <li>Break-even in Year 4 (base case)</li>
          </ul>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: BLOCK, color: BLOCK_TEXT, borderRadius: 16, padding: '22px 32px', textAlign: 'center', fontSize: 30, fontWeight: 800, ...reveal(close, 0, 'translateY(14px)') }}>
        If it misses the month-3 targets, we stop. <span style={{ color: BLOCK_HI }}>You will have spent at most RM0.25m.</span>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// Closing: the human value (trust → word of mouth) and thank you
// ---------------------------------------------------------------------------

const Closing: Page = () => {
  const live = useIsActivePage();
  return (
    <div style={{ ...fill, background: ink, color: '#fff' }}>
      <img src={closingImg} alt="" style={{ position: 'absolute', right: 0, top: 0, width: 760, height: '100%', objectFit: 'cover', ...anim(live, 'sf-fade', 1200, 0) }} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: 760, height: '100%', background: 'linear-gradient(90deg, #1C1814 0%, rgba(28,24,20,0) 45%)' }} />
      <div style={{ position: 'absolute', left: PAD_X, top: 0, bottom: 0, width: 1060, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.16em', color: bright, ...anim(live, 'sf-rise', 650, 150) }}>WHY IT MATTERS TO PEOPLE</div>
        <h1 style={{ fontSize: 72, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.08, margin: '20px 0 0' }}>
          <div style={anim(live, 'sf-rise', 750, 300)}>Fix it once. Prove it.</div>
          <div style={{ color: bright, ...anim(live, 'sf-rise', 750, 600) }}>Earn the referral.</div>
        </h1>
        <p style={{ fontSize: 29, lineHeight: 1.5, margin: '30px 0 0', color: 'rgba(255,255,255,0.88)', ...anim(live, 'sf-rise', 750, 900) }}>
          Remember the buyer who reported the same leak three times. With Simephony, the second report links to the first, the repair is
          checked with them, and the pattern reaches the team building the next phase.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 34, padding: '18px 26px', borderRadius: 16, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', ...anim(live, 'sf-rise', 750, 1200) }}>
          <span style={{ fontSize: 40, fontWeight: 900, color: bright, whiteSpace: 'nowrap' }}>RM4k–20k</span>
          <span style={{ fontSize: 22, lineHeight: 1.4, color: 'rgba(255,255,255,0.86)' }}>
            what SDP has paid for one introduced sale. A homeowner who trusts you introduces the next buyer for free.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 28, marginTop: 44, ...anim(live, 'sf-rise', 750, 1500) }}>
          <span style={{ fontFamily: '"Allura", cursive', fontSize: 96, color: '#FBE3D3', lineHeight: 1 }}>Thank you</span>
          <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.62)' }}>Group We Hit The Token Limit · Questions welcome</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: PAD_X, bottom: 40, fontSize: 17, color: 'rgba(255,255,255,0.5)' }}>
        Referral figure: SDP Introducer Cash Rewards Program terms (RM4,000–RM20,000 per unit, 2021).
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
      <AppendixRow k="H" label="Product deep-dive: demo, workflow, innovation" />
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
      eyebrow="Appendix B · Capacity released (not counted as cash)"
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

const AssumptionRow = ({ input, base, source, kind, shade }: { input: string; base: string; source: ReactNode; kind: TagKind; shade?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', minHeight: 50, background: shade ? '#F6EFE7' : 'transparent', borderRadius: 8 }}>
    <div style={{ width: 470, padding: '6px 18px', fontSize: 20, fontWeight: 700, color: ink }}>{input}</div>
    <div style={{ width: 230, padding: '6px 14px', fontSize: 20, fontWeight: 800, color: ink, fontVariantNumeric: 'tabular-nums' }}>{base}</div>
    <div style={{ flex: 1, padding: '6px 14px', fontSize: 18, color: muted, lineHeight: 1.3 }}>{source}</div>
    <div style={{ width: 160, padding: '6px 14px' }}>
      <Tag kind={kind} />
    </div>
  </div>
);

const ValueAssumptions: Page = () => (
  <Frame eyebrow="Appendix B · Value model" title="Every input, and where it comes from" subtitle="Base case, downside in brackets. The pilot replaces every estimate with SDP’s own data." bodyTop={300} mark="B">
    <AssumptionRow shade input="Handovers a year" base="≈3,000" source="SDP: 3,440 (FY2023) and 2,346 (FY2024) units delivered" kind="sdp" />
    <AssumptionRow input="Repair visits per unit in the DLP" base="4" source="Team estimate; replace with CCC visit logs" kind="est" />
    <AssumptionRow shade input="Share of visits that are repeats" base="23%" source="Aquant 2026 field-service benchmark: median first-time fix 77%" kind="bench" />
    <AssumptionRow input="Repeat visits avoided" base="40% (20%)" source="Estimate; top-quartile first-time fix is 88% (Aquant)" kind="est" />
    <AssumptionRow shade input="SDP cost per visit" base="RM350" source="Malaysian repair call-out rates; replace with SDP data" kind="est" />
    <AssumptionRow input="Residential build cost a year" base="RM1.4bn" source="50% of FY2025 cost of sales (RM2.79bn), the residential share of sales" kind="sdp" />
    <AssumptionRow shade input="Post-handover rework" base="0.38%" source="Love 2026, J. Constr. Eng. Manage. (measured on one contractor’s projects)" kind="bench" />
    <AssumptionRow input="Rework prevented by early linking" base="5% (2%)" source="Estimate; tested by the pilot’s systemic-issue measure" kind="est" />
    <AssumptionRow shade input="Tribunal-scale disputes avoided" base="6 × ≈RM22k" source="KPKT: RM26.4m awarded, 1,331 homebuyer cases resolved a year" kind="bench" />
    <AssumptionRow input="AI cost per case" base="RM0.02–0.18" source="Gemini Flash-Lite list prices; 12k–70k tokens a case, by scenario" kind="bench" />
    <AssumptionRow shade input="Team cost" base="× 1.3 loaded" source="Randstad 2026 salary guide; EPF, SOCSO, EIS and HRDF rates (Aniday)" kind="bench" />
  </Frame>
);

/** Where each named source lives. Clickable in the PDF export too. */
const SOURCE_URLS: Record<string, string> = {
  'NST, 18 Nov 2026': 'https://www.nst.com.my/',
  'SDP SR2024': 'https://www.simedarbyproperty.com/sites/default/files/2025-05/SR2024.pdf',
  'SDP IAR2024': 'https://simedarbyproperty.com/annualreport2024/download/sdp-ir2024-gmd.pdf',
  'SDP Key Highlights 2024': 'https://simedarbyproperty.com/annualreport2024/download/sdp-ir2024-key-highlights.pdf',
  'SDP Q4 FY2025 briefing': 'https://www.simedarbyproperty.com/sites/default/files/2026-02/%5BANALYST%5D%20Q4%20FY2025%20Financial%20Results%20Briefings_no_video.pdf',
  'SDP Introducer T&C': 'https://www.simedarbyproperty.com/introducer/',
  'Aquant 2026': 'https://aquant.ai/resources/post/aquants-2026-field-service-benchmark-companies-can-unlock-up-to-26-in-service-cost-savings-by-scaling-knowledge-across-the-workforce',
  'Love 2026 (ASCE)': 'https://www.asce.org/publications-and-news/civil-engineering-source/article/2026/01/22/how-much-does-field-rework-in-construction-actually-cost',
  'KPKT via RTM': 'https://berita.rtm.gov.my/?p=164871',
  'Agile Mont Kiara (SAYS)': 'https://says.com/my/news/mm2h-couple-wins-rm500k-suit-after-mont-kiara-condo-declared-uninhabitable',
  'Gemini pricing': 'https://aistudio.google.com/docs/pricing',
  Randstad: 'https://www.randstad.com.my/most-in-demand-jobs-malaysia-emerging-technology/',
  Aniday: 'https://aniday.com/en/malaysia/epf-socso-eis',
  Prosci: 'https://prosci.com/blog/how-to-budget-for-change-management',
  'Azure Malaysia West': 'https://azure.microsoft.com/en-us/explore/global-infrastructure/geographies/',
  'Oski (integration)': 'https://oski.site/blog/cost-to-integrate-salesforce-crm',
  'WhatsApp rates': 'https://respond.io/blog/whatsapp-api-pricing-malaysia',
  'Pen test (Exabytes)': 'https://www.exabytes.my/enterprise/secure/vapt',
  'NBER / QJE': 'https://www.nber.org/papers/w31161',
  'Yusof et al. 2025': 'https://www.emerald.com/insight/content/doi/10.1108/JEDT-01-2024-0017/full/html',
  'Chong et al. 2025': 'https://irep.iium.edu.my/125358/',
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
  <li style={{ marginBottom: 8 }}>
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
    <div style={{ display: 'flex', gap: 40, height: 590 }}>
      <Card style={{ flex: 1, padding: '28px 36px' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--osd-accent)' }}>Problem and value</div>
        <ul style={{ fontSize: 22, lineHeight: 1.5, margin: '16px 0 0', paddingLeft: 26 }}>
          <SourceLine label="D’Island ruling" refs="NST, 18 Nov 2026" />
          <SourceLine label="SDP priorities" refs="SDP SR2024 · SDP IAR2024" />
          <SourceLine label="SDP scale and costs" refs="SDP Key Highlights 2024 · SDP Q4 FY2025 briefing" />
          <SourceLine label="Homebuyer surveys" refs="Yusof et al. 2025 · Chong et al. 2025" />
          <SourceLine label="Repeat visits" refs="Aquant 2026" />
          <SourceLine label="Post-handover rework" refs="Love 2026 (ASCE)" />
          <SourceLine label="Tribunal awards" refs="KPKT via RTM" />
          <SourceLine label="Court-scale case" refs="Agile Mont Kiara (SAYS)" />
          <SourceLine label="Referral value" refs="SDP Introducer T&C" />
        </ul>
      </Card>
      <Card style={{ flex: 1, padding: '28px 36px' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: blue }}>Cost</div>
        <ul style={{ fontSize: 22, lineHeight: 1.5, margin: '16px 0 0', paddingLeft: 26 }}>
          <SourceLine label="AI model prices" refs="Gemini pricing" />
          <SourceLine label="Salaries and statutory cost" refs="Randstad · Aniday" />
          <SourceLine label="Change management (10%)" refs="Prosci" />
          <SourceLine label="Cloud in Malaysia" refs="Azure Malaysia West" />
          <SourceLine label="Integration and upkeep" refs="Oski (integration)" />
          <SourceLine label="Messaging" refs="WhatsApp rates" />
          <SourceLine label="Penetration testing" refs="Pen test (Exabytes)" />
          <SourceLine label="AI and support productivity" refs="NBER / QJE" />
        </ul>
      </Card>
    </div>
    <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 19, color: soft, lineHeight: 1.45, margin: 0 }}>
      Exchange rate RM4.11 per US dollar (Bernama, 18 Nov 2026). Estimates are labelled on every value slide and in the input table.
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
Closing.transition = settle;
AppendixDivider.transition = settle;

export const meta: SlideMeta = {
  title: 'Simephony · Final pitch',
  createdAt: '2026-11-10T14:48:36.194Z',
  theme: 'heritage-editorial',
};

export const notes: (string | undefined)[] = [
  // 01 Cover
  'Hold for two seconds. “Don’t just close the defect. Prove the root cause is fixed.” Then straight into the ruling.',
  // 02 Court case (0:00–0:25)
  `[0:00–0:25] Last week the Shah Alam High Court ruled against the developer of D’Island Residence in Puchong. Recurring water leaks were repaired several times and kept coming back, even after the 24-month DLP.
The judge said earlier repairs and the end of the DLP are not a complete defence when the repairs were ineffective. The developer must pay to fix the leaks, plus RM35,000 costs.
(Act the buyer’s side: Month 3 a stain, Month 9 again, Month 20 “third time, you said it was fixed”, DLP ends, Year 5 court.)
Close on the band: this is exactly what SDP set out to prevent — zero defects in end products, a Command & Contact Centre for disputes and defects, and AI across the business.`,
  // 03 Problem (0:25–0:45)
  `[0:25–0:45] And it is not one case. In a study of 104 Malaysian homebuyers, 95% had problems with how complaints were handled, 70% saw the same defect more than once, and 1 in 2 were never asked to sign off a repair.
For buyers, “repaired” is not checked. For the developer, each report is an isolated ticket, so a recurring defect is nobody’s job to notice. Defects get closed, not resolved.`,
  // 04 Solution flow (0:45–1:15)
  `[0:45–1:15] Simephony. Let the recording run (20–30 s) and narrate the left rail:
the buyer reports with photos; AI checks it is valid and gives a reason; the technician accepts the job and fixes it with the unit’s history and an AI repair guide; SDP verifies; the buyer checks and signs off; the case closes with a PDF record.`,
  // 05 Feature 1 · Today
  '[1:15–1:24] Today is where the CCC works. One queue of decisions, each with the AI verdict, the measurement and a reason. Invalid or unsure goes to SDP review — AI never rejects a buyer on its own.',
  // 06 Feature 2 · Insights
  '[1:24–1:33] Insights is for managers: where every report ended up, time per stage, leak sources and a scorecard per contractor — and lessons for the next building.',
  // 07 Feature 3 · Systemic
  '[1:33–1:42] This is the D’Island problem solved: similar defects are linked across units and repair history. Five tickets become one root cause, and a post-DLP report matching an earlier repair is flagged for SDP review.',
  // 08 Feature 4 · Evidence
  '[1:42–1:51] And every step is on record: time-stamped, with before and after photos for every round, closed only when SDP and the buyer both verify. If it is ever disputed, the record shows what was fixed and whether it held.',
  // 09 Different & scale
  '[1:51–2:00] What’s different: today’s defect apps, SDP’s included, track tickets. None we found applies AI to homebuyer reports, verifies with the buyer, or links recurring cases. One engine, configured per township, so it scales across all 27 — and later past the DLP.',
  // 10 Value headline (2:00–2:50)
  `[2:00–2:50] Headline first: at full rollout, about RM0.78 million a year of counted value — 2.6 times the RM0.3 million it costs to run.
Three lines, each tagged by where the number comes from. A: fewer repeat visits, RM0.39m — the only cash line. B: recurring defects stopped before the next phase, RM0.27m. C: disputes avoided, RM0.13m.
Everything orange-tagged is our estimate, and that is what the pilot measures. Freed staff time, referrals and court cases are NOT in the total.`,
  // 11 Value over time (2:50–3:30)
  `[2:50–3:30] Value grows with coverage: pilot and one township in Year 1, three townships in Year 2, all of them from Year 3. Break-even early in Year 4; RM2.7m of value for RM1.9m of cost over five years.
If we are wrong on both big estimates, it is still 1.4× its running cost. And one court-scale judgment, about half a million ringgit, would pay for the whole pilot.`,
  // 12 Readiness (3:30–3:45)
  '[3:30–3:45] Is it real? Yes: four defect scenarios run end to end with 750+ automated tests. It sits beside the CCC and Procore — batch import in the pilot, APIs later — and data can stay in Malaysia.',
  // 13 Cost (3:45–4:10)
  `[3:45–4:10] RM0.5m for a six-month pilot: RM360k is the team, the rest is training, a licensed pen test, cloud, and 15% contingency. Running it is RM0.3m a year.
AI cost depends on the case: two sen for a rejected report, about seven for a first-time fix, up to eighteen for a systemic case. Manual admin is RM13–27. Only 2% of the pilot is cloud and AI.`,
  // 14 Pilot plan (4:10–4:25)
  '[4:10–4:25] Month 0 we set the baseline from your last phase. Months 1–3 it runs in shadow beside the CCC — staff decide, buyers see nothing new. Months 4–6 it goes live. Two gates. What we need: a business owner, one phase of ~300 units, a few pilot users, anonymised history, and DPO sign-off.',
  // 15 Success measures (4:25–4:40)
  '[4:25–4:40] Agreed before day one. Primary: repeat visits down 20% against your last phase. Plus inspector agreement ≥90%, 30-day repairs ≥90%, buyer sign-off ≥80%, at least one systemic pattern QA accepts. And we say up front when we stop.',
  // 16 Ask (4:40–4:52)
  '[4:40–4:52] So our ask: approve a six-month pilot on one phase. RM0.5m, ~300 units, the Head of CCC as owner, and a go/no-go at month 6. If it misses the month-3 targets, we stop — you will have spent at most RM0.25m.',
  // 17 Closing (4:52–5:00)
  '[4:52–5:00] Remember the buyer with the same leak three times. Fix it once, prove it, and that buyer introduces your next one — for free. Thank you. Questions welcome.',
  // Appendix
  'Q&A appendix directory — jump straight to any supporting page.',
  'Appendix A1: user feedback from Kimberly and Lim and the product changes we shipped.',
  'Appendix A2: Malaysian homeowner quotes (Lowyat Forum): why verification, audit trails and systemic alerts matter.',
  'Appendix B1: every value input, its source, and whether it is SDP data, a benchmark or our estimate. Use for “where does that number come from?”',
  'Appendix B2: capacity released — AI first pass ≈RM0.06–0.08 vs RM13–27 of manual admin per case, ≈375–500 staff hours a month at 500 cases. Shown as capacity, not counted as cash.',
  'Appendix B3: sources for the problem, value and cost numbers.',
  'Appendix C: buyer, SDP staff and technician pains and gains.',
  'Appendix D1: why we split messy inputs (AI), consistent decisions (rules) and accountability (people).',
  'Appendix D2: step-by-step suitability matrix — who decides every action.',
  'Appendix D3: the seven AIGE principles checked against our code.',
  'Appendix D4: NIST AI RMF failure modes we tested and the safeguards we built.',
  'Appendix E: operational risks — disputed verifications, false systemic alerts, integration and PDPA.',
  'Appendix F: post-hackathon enhancements.',
  'Appendix G: meet the team.',
  'Appendix H1: the full recorded walkthrough, buyer and technician side by side (about 2 minutes, with sound).',
  'Appendix H2: the people / AI-agent workflow across report, inspect, verify and recurrence.',
  'Appendix H3: the three apps — buyer, SDP console, technician.',
  'Appendix H4: the stack-08 leak animation — five tickets become one pattern — and normal system vs Simephony.',
];

export default [
  Cover,
  CourtCase,
  Problem,
  SolutionFlow,
  FeatToday,
  FeatInsights,
  FeatSystemic,
  FeatEvidence,
  Different,
  ValueHeadline,
  ValueOverTime,
  Feasibility,
  Cost,
  PilotPlan,
  Success,
  Ask,
  Closing,
  AppendixDivider,
  Testimonials,
  HomeownerVoices,
  ValueAssumptions,
  ValueAdmin,
  ValueSources,
  TargetUsers,
  AiHowWeDecided,
  AiSuitability,
  AiAige,
  AiRisks,
  Risks,
  Future,
  Team,
  Demo,
  HowItWorks,
  Solution,
  Innovation,
] satisfies Page[];
