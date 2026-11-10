import type { DesignSystem, Page, SlideMeta, SlideTransition } from '@open-slide/core';
import { ImagePlaceholder, MorphElement, Step, Steps, useIsActivePage, useSlidePageNumber } from '@open-slide/core';
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import agentWorkflow from './assets/agent-workflow.png';
import appBuyer from './assets/app-buyer.png';
import appSdpConsole from './assets/app-sdp-console.png';
import appTechnician from './assets/app-technician.png';
import closingImg from './assets/closing.jpg';
import coverImg from './assets/cover.jpg';
import fiveYearChart from './assets/five-year-chart.png';
import targetUsers from './assets/target-users.jpg';
import teamNicol from './assets/team-nicol.jpg';
import teamXiaowen from './assets/team-xiaowen.jpg';
import testimonialKimberly from './assets/testimonial-kimberly.jpg';
import testimonialLim from './assets/testimonial-lim.jpg';

// ---------------------------------------------------------------------------
// Design tokens (tweakable from the Design panel)
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

// Extra colours outside the DesignSystem shape
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
@keyframes sf-rise { from { opacity: 0; transform: translateY(34px) } to { opacity: 1; transform: none } }
@keyframes sf-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes sf-wipe { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 -10% 0 0) } }
@keyframes sf-zoom { from { transform: scale(1.12) } to { transform: scale(1) } }
@keyframes sf-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(198,74,31,0.45) } 50% { box-shadow: 0 0 0 16px rgba(198,74,31,0) } }
@keyframes sf-ring { from { transform: scale(0.7); opacity: 0.9 } to { transform: scale(2.6); opacity: 0 } }
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
// Motion system
// ---------------------------------------------------------------------------

const EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
const SPRING = 'cubic-bezier(0.34, 1.45, 0.64, 1)';
const CAM_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const CAM_MS = 1100;
const HOLD: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];

/** Appendix pages: the new page rises 6px while fading in. */
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

/** Cover / closing: rise a little further with a hair of blur. */
const settle: SlideTransition = {
  duration: 280,
  exit: { duration: 280, easing: EASE_IN, keyframes: HOLD },
  enter: {
    duration: 280,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: 'translateY(12px)', filter: 'blur(4px)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
    ],
  },
};

/** Main pitch pages: shared elements (pipeline, motto chips, chapter marker) glide between pages. */
const MORPH_MS = 900;
const morphCut: SlideTransition = {
  duration: 300,
  exit: { duration: 320, easing: EASE_IN, keyframes: HOLD },
  enter: { duration: 320, easing: EASE_OUT, keyframes: [{ opacity: 0 }, { opacity: 1 }] },
  morph: { duration: MORPH_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
};

/** Style for an element that enters when `on` turns true (spring rise by default). */
const reveal = (on: boolean, delay = 0, from = 'translateY(40px)'): CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : from,
  transition: `opacity 480ms ${EASE_OUT} ${delay}ms, transform 760ms ${SPRING} ${delay}ms`,
});

/** CSS keyframe animation, only on the instance the audience is watching. */
const anim = (live: boolean, name: string, ms: number, delay = 0, easing = EASE_OUT): CSSProperties =>
  live ? { animation: `${name} ${ms}ms ${easing} ${delay}ms both` } : {};

/**
 * Beats: each click (→) advances one beat before moving to the next page.
 * Built on the framework's <Steps>: hidden cue steps, and we count how many are revealed.
 * Entering forward starts at beat 0; jumping in or coming back shows the last beat.
 */
function useBeats(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(count);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBeat(el.querySelectorAll('[data-osd-step="revealed"]').length);
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-osd-step'] });
    return () => mo.disconnect();
  }, []);
  const cues = (
    <div ref={ref} style={{ display: 'none' }}>
      <Steps>
        {Array.from({ length: count }, (_, i) => (
          <Step key={i} duration={0}>
            <span />
          </Step>
        ))}
      </Steps>
    </div>
  );
  return { beat, cues };
}

/** True one frame after the live page mounts (to trigger CSS transitions); always true elsewhere. */
function useArrived() {
  const live = useIsActivePage();
  const [on, setOn] = useState(!live);
  useEffect(() => {
    if (!live) {
      setOn(true);
      return;
    }
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setOn(true));
    });
    return () => cancelAnimationFrame(id);
  }, [live]);
  return on;
}

type Focus = { x: number; y: number; s: number };
const OVERVIEW: Focus = { x: 960, y: 0, s: 1 };

/** A camera over the page body: zooms to scale `s` around point (x, y), clamped to the edges. */
const Camera = ({ w, h, f, children }: { w: number; h: number; f: Focus; children: ReactNode }) => {
  const hw = w / (2 * f.s);
  const hh = h / (2 * f.s);
  const x = Math.min(Math.max(f.x, hw), w - hw);
  const y = Math.min(Math.max(f.y, hh), h - hh);
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
        transition: `transform ${CAM_MS}ms ${CAM_EASE}`,
      }}
    >
      {children}
    </div>
  );
};

/** Counts up from 0 once `go` turns true on the live page; shows the final value elsewhere. */
const CountUp = ({ to, suffix = '', go = true }: { to: number; suffix?: string; go?: boolean }) => {
  const live = useIsActivePage();
  const [v, setV] = useState(live ? 0 : to);
  useEffect(() => {
    if (!live) {
      setV(to);
      return;
    }
    if (!go) {
      setV(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1300);
      setV(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, go, to]);
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {v}
      {suffix}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const fill: CSSProperties = {
  width: '100%',
  height: '100%',
  fontFamily: 'var(--osd-font-body)',
  position: 'relative',
  overflow: 'hidden',
};

const PAD_X = 120;
const FOOT = 100;

const PageNo = ({ color = soft }: { color?: string }) => {
  const { current } = useSlidePageNumber();
  return (
    <span style={{ fontSize: 22, color, fontVariantNumeric: 'tabular-nums' }}>
      {String(current).padStart(2, '0')}
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

/** Chapter rail for the main pitch. The marker morphs from page to page. */
const Rail = ({ active }: { active: number }) => (
  <div style={{ position: 'relative', display: 'flex' }}>
    <RailLabel i={0} active={active}>PROBLEM</RailLabel>
    <RailLabel i={1} active={active}>STAKES</RailLabel>
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
    style={{
      position: 'absolute',
      left: PAD_X,
      right: PAD_X,
      bottom: 46,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: 20,
      color: soft,
    }}
  >
    <span style={{ letterSpacing: '0.1em', fontWeight: 600 }}>
      {chapter == null ? 'SIMEPHONY · GROUP WE HIT TOKEN LIMIT' : 'SIMEPHONY'}
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
 * `mark` is the big watermark numeral; `chapter` shows the chapter rail.
 */
const Frame = ({
  eyebrow,
  title,
  subtitle,
  children,
  bodyTop = 290,
  focus,
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
      <div style={{ position: 'absolute', left: PAD_X, right: PAD_X, top: 96 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Title>{title}</Title>
        {subtitle ? (
          <p style={{ fontSize: 30, color: muted, margin: '14px 0 0', lineHeight: 1.4 }}>{subtitle}</p>
        ) : null}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: bodyTop, height: h, overflow: focus ? 'hidden' : 'visible' }}>
        {focus ? (
          <Camera w={1920} h={h} f={focus}>
            {inner}
          </Camera>
        ) : (
          inner
        )}
        {overlay ? (
          <div style={{ position: 'absolute', left: PAD_X, right: PAD_X, top: 0, bottom: 0, pointerEvents: 'none' }}>{overlay}</div>
        ) : null}
      </div>
      <Footer chapter={chapter} />
    </div>
  );
};

const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      background: card,
      border: `2px solid ${line}`,
      borderRadius: 'var(--osd-radius)',
      padding: 32,
      boxSizing: 'border-box',
      boxShadow: '0 1px 0 rgba(28,24,20,0.03), 0 18px 40px -24px rgba(28,24,20,0.18)',
      ...style,
    }}
  >
    {children}
  </div>
);

const NumBadge = ({ n, color = 'var(--osd-accent)' }: { n: string; color?: string }) => (
  <div
    style={{
      width: 56,
      height: 56,
      borderRadius: 28,
      border: `2px solid ${color}`,
      color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 22,
      fontWeight: 700,
      flexShrink: 0,
    }}
  >
    {n}
  </div>
);

const Arrow = ({ color = soft, size = 30 }: { color?: string; size?: number }) => (
  <span style={{ color, fontSize: size, fontWeight: 600 }}>→</span>
);

/** Small line icons, drawn in SVG so they stay crisp under the camera zoom. */
const Icon = ({ name, color = '#C64A1F', size = 40 }: { name: 'camera' | 'link' | 'alert' | 'shield' | 'layers' | 'plug'; color?: string; size?: number }) => {
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
    </svg>
  );
};

// ---------------------------------------------------------------------------
// 01 · Cover (entrance: wordmark writes in, headline rises line by line)
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
            'linear-gradient(90deg, rgba(20,14,10,0.94) 0%, rgba(20,14,10,0.74) 45%, rgba(20,14,10,0.2) 100%)',
        }}
      />
      <div style={{ position: 'absolute', left: PAD_X, top: 96, fontSize: 24, letterSpacing: '0.16em', opacity: 0.8, ...anim(live, 'sf-fade', 800, 200) }}>
        TOP 10 · FINAL PITCH
      </div>
      <div
        style={{
          position: 'absolute',
          right: 130,
          top: 60,
          fontFamily: '"Allura", cursive',
          fontSize: 230,
          lineHeight: 1,
          color: '#FBE3D3',
          paddingRight: 30,
          ...anim(live, 'sf-wipe', 1800, 300, 'cubic-bezier(0.5, 0, 0.3, 1)'),
        }}
      >
        Simephony
      </div>
      <div style={{ position: 'absolute', left: PAD_X, bottom: 190, width: 1250 }}>
        <div style={anim(live, 'sf-rise', 700, 900)}>
          <Eyebrow>People Challenge</Eyebrow>
        </div>
        <h1
          style={{
            fontFamily: 'var(--osd-font-display)',
            fontSize: 'var(--osd-size-hero)',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            margin: '24px 0 0',
          }}
        >
          <div style={anim(live, 'sf-rise', 800, 1100)}>Don’t just close the defect.</div>
          <div style={{ color: bright, ...anim(live, 'sf-rise', 800, 1500) }}>Prove it’s resolved.</div>
        </h1>
        <p style={{ fontSize: 32, lineHeight: 1.5, margin: '36px 0 0', color: 'rgba(255,255,255,0.88)', ...anim(live, 'sf-rise', 800, 2000) }}>
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
          color: 'rgba(255,255,255,0.7)',
          ...anim(live, 'sf-fade', 800, 2400),
        }}
      >
        <span style={{ fontWeight: 600, color: '#fff' }}>Group We Hit Token Limit</span>
        <span>Image: Sime Darby Property, official website</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 02 · The problem (camera visits each stat as it counts up, then the pipeline builds)
// ---------------------------------------------------------------------------

const Stat = ({ on, value, label }: { on: boolean; value: ReactNode; label: string }) => (
  <div style={{ flex: 1, display: 'flex', ...reveal(on, 0, 'translateY(60px) scale(0.96)') }}>
    <Card style={{ flex: 1, padding: '36px 36px 40px' }}>
      <div style={{ fontSize: 96, fontWeight: 800, color: 'var(--osd-accent)', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 28, lineHeight: 1.4, marginTop: 20, color: muted }}>{label}</div>
    </Card>
  </div>
);

/** Shared pipeline pill styles (Problem page and Missing-step page morph between them). */
const pillStyle = (size: number, bg: string, color: string): CSSProperties => ({
  padding: `${Math.round(size * 0.42)}px ${Math.round(size * 0.92)}px`,
  borderRadius: 999,
  background: bg,
  color,
  fontSize: size,
  fontWeight: 600,
  border: `2px solid ${line}`,
  whiteSpace: 'nowrap',
});

const PipeArrow = ({ id, size, on = true, delay = 0 }: { id: string; size: number; on?: boolean; delay?: number }) => (
  <span style={reveal(on, delay, 'translateX(-14px)')}>
    <MorphElement id={id}>
      <span style={{ color: soft, fontSize: size * 1.25, fontWeight: 600 }}>→</span>
    </MorphElement>
  </span>
);

const PipePill = ({ id, size, on = true, delay = 0, children }: { id: string; size: number; on?: boolean; delay?: number; children: ReactNode }) => (
  <span style={reveal(on, delay, 'translateY(24px)')}>
    <MorphElement id={id}>
      <div style={pillStyle(size, card, ink)}>{children}</div>
    </MorphElement>
  </span>
);

/** The four steps every defect goes through today. */
const Pipeline = ({ size, on = true }: { size: number; on?: boolean }) => (
  <>
    <PipePill id="pipe-reported" size={size} on={on} delay={0}>Reported</PipePill>
    <PipeArrow id="pipe-arrow-1" size={size} on={on} delay={140} />
    <PipePill id="pipe-assigned" size={size} on={on} delay={220}>Assigned</PipePill>
    <PipeArrow id="pipe-arrow-2" size={size} on={on} delay={360} />
    <PipePill id="pipe-repaired" size={size} on={on} delay={440}>Marked “repaired”</PipePill>
    <PipeArrow id="pipe-arrow-3" size={size} on={on} delay={580} />
    <PipePill id="pipe-closed" size={size} on={on} delay={660}>Closed</PipePill>
  </>
);

/** The "missing step" pill. Only its shape morphs, so the text never gets squashed. */
const GapPill = ({
  size,
  bg,
  color,
  borderColor,
  dashed,
  glow,
  pulse,
  children,
}: {
  size: number;
  bg: string;
  color: string;
  borderColor: string;
  dashed?: boolean;
  glow?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) => (
  <div style={{ position: 'relative' }}>
    <MorphElement id="pipe-gap">
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
      style={{
        position: 'relative',
        padding: `${Math.round(size * 0.42)}px ${Math.round(size * 0.92)}px`,
        border: '2px solid transparent',
        color,
        fontSize: size,
        fontWeight: glow ? 800 : 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  </div>
);

const STAT_X = [318, 746, 1174, 1602];

const Problem: Page = () => {
  const { beat, cues } = useBeats(4);
  const live = useIsActivePage();
  const focus = beat < 4 ? { x: STAT_X[beat], y: 165, s: 1.6 } : OVERVIEW;
  const piped = beat >= 4;
  return (
    <Frame eyebrow="01 · The problem" title="House defects get closed but don’t always get resolved" focus={focus} mark="01" chapter={0}>
      {cues}
      <div style={{ display: 'flex', gap: 32 }}>
        <Stat on={beat >= 0} value={<CountUp to={95} suffix="%" go={beat >= 0} />} label="of homebuyers faced problems with how complaints were handled" />
        <Stat on={beat >= 1} value={<CountUp to={70} suffix="%" go={beat >= 1} />} label="faced the same defect more than once" />
        <Stat on={beat >= 2} value={<CountUp to={50} suffix="%" go={beat >= 2} />} label="were unsatisfied with the developer’s response and speed" />
        <Stat on={beat >= 3} value={<>1 in <CountUp to={2} go={beat >= 3} /></>} label="were never asked to sign off a repair after it was done" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 72 }}>
        <span style={{ fontSize: 28, fontWeight: 700, marginRight: 8, ...reveal(piped, 0, 'translateX(-20px)') }}>Today:</span>
        <Pipeline size={24} on={piped} />
        <PipeArrow id="pipe-arrow-4" size={24} on={piped} delay={800} />
        <span style={reveal(piped, 900, 'scale(0.6)')}>
          <GapPill size={24} bg={orangeSoft} color="#C64A1F" borderColor="#C64A1F" dashed pulse={live && piped}>
            Actually fixed? Nobody checks.
          </GapPill>
        </span>
      </div>
      <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 21, color: soft, lineHeight: 1.5, margin: 0, ...reveal(piped, 1100, 'none') }}>
        Sources: Yusof et al. (2025), <i>Journal of Engineering, Design and Technology</i>, study of 104 Malaysian
        homebuyers; National House Buyers Association (HBA) via iProperty Malaysia, 2021.
      </p>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 02b · The missing step (morph from the Problem pipeline)
// ---------------------------------------------------------------------------

const Proof = ({ icon, title, body }: { icon: 'camera' | 'shield' | 'alert'; title: string; body: string }) => (
  <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <div style={{ width: 76, height: 76, borderRadius: 38, background: greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={green} size={40} />
    </div>
    <div style={{ fontSize: 32, fontWeight: 800, marginTop: 18 }}>{title}</div>
    <div style={{ fontSize: 26, lineHeight: 1.45, color: muted, marginTop: 10 }}>{body}</div>
  </div>
);

const MissingStep: Page = () => (
  <div style={{ ...fill, background: 'var(--osd-bg)', color: 'var(--osd-text)' }}>
    <div style={{ position: 'absolute', left: PAD_X, right: PAD_X, top: 190, textAlign: 'center' }}>
      <Eyebrow>Simephony</Eyebrow>
      <Title size={80}>Adds the step nobody checks</Title>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 450, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <Pipeline size={28} />
      <MorphElement id="pipe-arrow-4">
        <span style={{ color: green, fontSize: 36, fontWeight: 800 }}>→</span>
      </MorphElement>
      <GapPill size={32} bg={green} color="#FFFFFF" borderColor={green} glow>
        Verified ✓
      </GapPill>
    </div>
    <div style={{ position: 'absolute', left: 240, right: 240, top: 610 }}>
      <Steps>
        <Step duration={420}>
          <div style={{ display: 'flex', gap: 64 }}>
            <Proof icon="camera" title="Photo-checked" body="AI compares the repair photo with the original report" />
            <Proof icon="shield" title="Signed off" body="SDP approves, then the buyer confirms each defect" />
            <Proof icon="alert" title="Watched" body="A repeat in the unit or the stack is flagged early" />
          </div>
        </Step>
      </Steps>
    </div>
    <Footer chapter={0} />
  </div>
);

// ---------------------------------------------------------------------------
// 03 · Why it matters (a form fills the frame, the FORGED stamp slams down, the case slides in)
// ---------------------------------------------------------------------------

const FormField = ({ label, w }: { label: string; w: number }) => (
  <div style={{ marginTop: 22 }}>
    <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.08em', color: soft }}>{label}</div>
    <div style={{ marginTop: 10, height: 14, width: w, borderRadius: 7, background: '#E9E1D7' }} />
  </div>
);

const FormMock = ({ stamped }: { stamped: boolean }) => (
  <div style={{ width: 640, transform: 'rotate(-2deg)', flexShrink: 0 }}>
    <div
      style={{
        position: 'relative',
        background: '#FFFFFF',
        borderRadius: 10,
        padding: '40px 44px 44px',
        boxShadow: '0 30px 60px -30px rgba(28,24,20,0.45), 0 2px 0 rgba(28,24,20,0.05)',
        height: 580,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.14em' }}>DEFECT RECTIFICATION FORM</div>
        <div style={{ fontSize: 16, color: soft, border: `1.5px solid ${line}`, borderRadius: 6, padding: '4px 10px' }}>ILLUSTRATION</div>
      </div>
      <div style={{ height: 2, background: ink, margin: '18px 0 6px' }} />
      <FormField label="UNIT" w={300} />
      <FormField label="DEFECT REPORTED" w={480} />
      <FormField label="RECTIFICATION DONE" w={420} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 30, fontSize: 22 }}>
        <div style={{ width: 26, height: 26, border: `2.5px solid ${ink}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>✓</div>
        Defect rectified to the owner’s satisfaction
      </div>
      <div style={{ marginTop: 34, fontSize: 18, fontWeight: 700, letterSpacing: '0.08em', color: soft }}>OWNER’S SIGNATURE</div>
      <svg viewBox="0 0 360 80" width={360} height={80} style={{ display: 'block', marginTop: 4 }}>
        <path
          d="M8 58 C 30 10, 48 10, 52 52 S 80 70, 96 30 S 120 8, 128 50 C 134 70, 150 64, 166 40 S 200 22, 214 48 C 226 66, 250 30, 268 36 S 300 56, 340 34"
          fill="none"
          stroke="#1F3F8F"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </svg>
      <div style={{ height: 2, background: '#CFC5B9', width: 420 }} />
      <div
        style={{
          position: 'absolute',
          left: 170,
          top: 400,
          padding: '14px 26px',
          border: '6px solid #C0281B',
          borderRadius: 10,
          color: '#C0281B',
          fontSize: 46,
          fontWeight: 900,
          letterSpacing: '0.08em',
          lineHeight: 1.05,
          textAlign: 'center',
          background: 'rgba(255,255,255,0.6)',
          mixBlendMode: 'multiply',
          opacity: stamped ? 0.92 : 0,
          transform: stamped ? 'rotate(-12deg) scale(1)' : 'rotate(-24deg) scale(2.4)',
          transition: `opacity 200ms ${EASE_OUT}, transform 520ms ${SPRING}`,
        }}
      >
        SIGNATURE
        <br />
        FORGED
      </div>
    </div>
  </div>
);

const WhyItMatters: Page = () => {
  const { beat, cues } = useBeats(2);
  const focus = beat === 0 ? { x: PAD_X + 320, y: 300, s: 1.18 } : beat === 1 ? { x: PAD_X + 400, y: 440, s: 1.55 } : OVERVIEW;
  return (
    <Frame eyebrow="02 · Why it matters" title="When the record can’t be trusted, everyone loses" focus={focus} mark="02" chapter={1}>
      {cues}
      <div style={{ display: 'flex', gap: 90, alignItems: 'flex-start', paddingTop: 20 }}>
        <FormMock stamped={beat >= 1} />
        <div style={{ flex: 1, ...reveal(beat >= 2, 0, 'translateX(80px)') }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.12em', color: muted }}>
            REAL-WORLD SIGNAL · COURT OF APPEAL, 30 JAN 2026
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--osd-accent)', marginTop: 18, lineHeight: 1.3 }}>
            Sime Darby Property (Bukit Jelutong) Sdn Bhd v Ooi Cheng Huat &amp; Ors
          </div>
          <p style={{ fontSize: 28, lineHeight: 1.55, margin: '20px 0 0', color: muted }}>
            The High Court found that signatures on some defect rectification forms had been forged. The Court of Appeal
            upheld the judgment for six bungalow owners.
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 24, ...reveal(beat >= 2, 350) }}>
            <span style={{ fontSize: 84, fontWeight: 900, letterSpacing: '-0.03em', color: ink }}>RM4.8m</span>
            <span style={{ fontSize: 26, color: muted }}>judgment upheld</span>
          </div>
          <div style={{ marginTop: 24, background: ink, color: '#fff', borderRadius: 16, padding: '22px 28px', fontSize: 28, fontWeight: 700, lineHeight: 1.4, ...reveal(beat >= 2, 650) }}>
            A defect record must be a trusted chain of evidence, not just a signed form.
          </div>
          <p style={{ fontSize: 20, color: soft, margin: '16px 0 0' }}>Source: Free Malaysia Today, 30 Jan 2026</p>
        </div>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 04 · Solution (camera visits buyer → console → technician, then the circle draws round "proof")
// ---------------------------------------------------------------------------

const RoleLabel = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>{children}</div>
);

const RoleCaption = ({ children }: { children: ReactNode }) => (
  <p style={{ fontSize: 26, lineHeight: 1.45, color: muted, margin: '20px 0 0', textAlign: 'center' }}>{children}</p>
);

const Phone = ({ src, alt }: { src: string; alt: string }) => (
  <div
    style={{
      width: 200,
      height: 414,
      borderRadius: 34,
      border: `10px solid ${ink}`,
      overflow: 'hidden',
      background: '#fff',
      boxShadow: '0 30px 50px -20px rgba(28,24,20,0.4)',
    }}
  >
    <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
  </div>
);

/** The three-part motto. Same ids on Solution and How it works, so the chips fly down and recolour. */
const Motto = ({ id, bg, color, children }: { id: string; bg: string; color: string; children: ReactNode }) => (
  <MorphElement id={id}>
    <div style={{ background: bg, color, fontSize: 28, fontWeight: 700, padding: '16px 34px', borderRadius: 12, whiteSpace: 'nowrap' }}>
      {children}
    </div>
  </MorphElement>
);

const SOL_X = [300, 960, 1620];

const Solution: Page = () => {
  const { beat, cues } = useBeats(3);
  const focus = beat < 3 ? { x: SOL_X[beat], y: 280, s: beat === 1 ? 1.45 : 1.6 } : OVERVIEW;
  const done = beat >= 3;
  return (
    <Frame
      eyebrow="03 · Solution"
      chapter={2}
      mark="03"
      focus={focus}
      title={
        <>
          Simephony: complaint <Arrow color={muted} size={56} /> resolution <Arrow color={muted} size={56} />{' '}
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
                style={{ transition: `stroke-dashoffset 900ms ${EASE_OUT} 300ms` }}
              />
            </svg>
          </span>
        </>
      }
      overlay={
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 16 }}>
          <span style={reveal(done, 200)}>
            <Motto id="motto-ai" bg={ink} color="#FFFFFF">AI recommends</Motto>
          </span>
          <span style={reveal(done, 400)}>
            <Motto id="motto-people" bg={ink} color="#FFFFFF">Humans decide</Motto>
          </span>
          <span style={reveal(done, 600)}>
            <Motto id="motto-system" bg={ink} color="#FFFFFF">The system records</Motto>
          </span>
        </div>
      }
    >
      {cues}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 60 }}>
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, ...reveal(beat >= 0, 0, 'translateY(80px)') }}>
          <RoleLabel>BUYER</RoleLabel>
          <Phone src={appBuyer} alt="Buyer app: check and sign off screen" />
          <RoleCaption>Track repairs, verify fixes and stay informed.</RoleCaption>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, ...reveal(beat >= 1, 0, 'translateY(80px)') }}>
          <RoleLabel>SDP CONSOLE</RoleLabel>
          <div
            style={{
              width: 640,
              height: 400,
              borderRadius: 22,
              border: `12px solid ${ink}`,
              overflow: 'hidden',
              boxShadow: '0 30px 50px -20px rgba(28,24,20,0.4)',
              marginTop: 8,
            }}
          >
            <img src={appSdpConsole} alt="SDP console analytics" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left' }} />
          </div>
          <RoleCaption>Monitor every case, approval and recurring defect, with explainable AI.</RoleCaption>
        </div>
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, ...reveal(beat >= 2, 0, 'translateY(80px)') }}>
          <RoleLabel>TECHNICIAN</RoleLabel>
          <Phone src={appTechnician} alt="Technician app: case history" />
          <RoleCaption>See the unit’s history before arriving, then record the verdict.</RoleCaption>
        </div>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 05 · How it works (a case ticket travels the timeline; the camera follows it)
// ---------------------------------------------------------------------------

const StageCol = ({
  n,
  name,
  ai,
  people,
  status,
  on,
  active,
}: {
  n: string;
  name: string;
  ai: ReactNode;
  people: ReactNode;
  status: string;
  on: boolean;
  active: boolean;
}) => (
  <div style={{ width: 396, display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, ...reveal(on, 0) }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          background: active ? 'var(--osd-accent)' : ink,
          color: '#fff',
          fontSize: 24,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 400ms',
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800 }}>{name}</div>
    </div>
    <div style={{ background: orangeSoft, border: '2px solid #E9B9A3', borderRadius: 16, padding: '20px 24px', height: 150, boxSizing: 'border-box', ...reveal(on, 200) }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>PEOPLE</div>
      <div style={{ fontSize: 25, lineHeight: 1.4, marginTop: 8 }}>{people}</div>
    </div>
    <div style={{ background: blueSoft, border: '2px solid #B8CBE6', borderRadius: 16, padding: '20px 24px', height: 170, boxSizing: 'border-box', ...reveal(on, 400) }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.12em', color: blue }}>AI AGENTS</div>
      <div style={{ fontSize: 25, lineHeight: 1.4, marginTop: 8 }}>{ai}</div>
    </div>
    <div style={{ fontSize: 21, fontWeight: 700, color: muted, letterSpacing: '0.06em', ...reveal(on, 600) }}>{status}</div>
  </div>
);

const STAGE_X = [318, 746, 1174, 1602]; // body coordinates of each stage's centre

const HowItWorks: Page = () => {
  const { beat, cues } = useBeats(4);
  const at = Math.min(beat, 3);
  const focus = beat < 4 ? { x: STAGE_X[beat], y: 322, s: 1.25 } : OVERVIEW;
  const tokenX = STAGE_X[at] - PAD_X; // inner coordinates
  return (
    <Frame
      eyebrow="04 · How it works"
      title="One defect, four stages, one trusted record"
      chapter={2}
      mark="04"
      focus={focus}
      overlay={
        <div
          style={{
            position: 'absolute',
            left: -PAD_X,
            right: -PAD_X,
            bottom: 0,
            height: 84,
            padding: `0 ${PAD_X}px`,
            background: 'linear-gradient(180deg, rgba(250,246,241,0) 0%, #FAF6F1 22%)',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 20,
          }}
        >
          <Motto id="motto-ai" bg={blueSoft} color={blue}>AI recommends</Motto>
          <Arrow />
          <Motto id="motto-people" bg={orangeSoft} color="#A63A14">Humans decide</Motto>
          <Arrow />
          <Motto id="motto-system" bg="#ECE8E3" color={ink}>The system records</Motto>
        </div>
      }
    >
      {cues}
      {/* track + travelling case ticket */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 50, height: 60 }}>
        <div style={{ position: 'absolute', left: STAGE_X[0] - PAD_X, width: STAGE_X[3] - STAGE_X[0], top: 28, height: 4, background: line, borderRadius: 2 }} />
        <div
          style={{
            position: 'absolute',
            left: STAGE_X[0] - PAD_X,
            width: tokenX - (STAGE_X[0] - PAD_X),
            top: 28,
            height: 4,
            background: '#C64A1F',
            borderRadius: 2,
            transition: `width ${CAM_MS}ms ${CAM_EASE}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: tokenX - 160,
            width: 320,
            top: 0,
            display: 'flex',
            justifyContent: 'center',
            transition: `left ${CAM_MS}ms ${CAM_EASE}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: ink,
              color: '#fff',
              borderRadius: 999,
              padding: '12px 24px',
              fontSize: 22,
              fontWeight: 700,
              boxShadow: '0 14px 30px -10px rgba(28,24,20,0.5)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 6, background: bright, display: 'inline-block' }} />
            Ceiling leak · A-12-08
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 120, display: 'flex', gap: 32 }}>
        <StageCol
          n="1"
          on={beat >= 0}
          active={at === 0 && beat < 4}
          name="Report & triage"
          people="Resident reports with a photo and a description."
          ai="Intake reads it, Triage sets urgency, Booking picks the first free technician."
          status="SUBMITTED → VISIT_SCHEDULED"
        />
        <StageCol
          n="2"
          on={beat >= 1}
          active={at === 1 && beat < 4}
          name="Inspect & repair"
          people="Technician inspects and records VALID or INVALID."
          ai="Repair Estimate books the repair time from the fixed plan."
          status="VALID → REPAIRED"
        />
        <StageCol
          n="3"
          on={beat >= 2}
          active={at === 2 && beat < 4}
          name="Verify & sign off"
          people="SDP signs off, then the resident checks each defect."
          ai="Verification checks the repair photo and writes a safe check guide."
          status="PENDING_SIGNOFF → CLOSED"
        />
        <StageCol
          n="4"
          on={beat >= 3}
          active={at === 3 && beat < 4}
          name="Recurrence"
          people="SDP approves an extra inspection."
          ai="Recurrence counts repeats and stack clusters, then briefs the technician."
          status="REOPENED → EXTRA_INSPECTION"
        />
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 06 · Innovation (leaks light up floor by floor, the 3rd one escalates, then the comparison)
// ---------------------------------------------------------------------------

type Tone = 'base' | 'hit' | 'hot';

const Cell = ({ tone, on, delay }: { tone: Tone; on: boolean; delay: number }) => {
  const lit = tone !== 'base' && on;
  return (
    <div style={{ position: 'relative', width: 110, height: 60 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: '#EFE4D8' }} />
      {tone !== 'base' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 10,
            background: tone === 'hot' ? '#C64A1F' : '#F0A35E',
            color: '#fff',
            fontSize: 26,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: lit ? 1 : 0,
            transform: lit ? 'scale(1)' : 'scale(0.4)',
            transition: `opacity 300ms ${EASE_OUT} ${delay}ms, transform 600ms ${SPRING} ${delay}ms`,
          }}
        >
          {tone === 'hot' ? '3×' : ''}
        </div>
      ) : null}
      {tone === 'hot' && lit ? (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 10, border: '4px solid #C64A1F', animation: 'sf-ring 1.6s ease-out 0.3s infinite' }} />
      ) : null}
    </div>
  );
};

const GridLabel = ({ children }: { children: ReactNode }) => (
  <div style={{ width: 110, fontSize: 22, color: muted, textAlign: 'center', fontWeight: 700 }}>{children}</div>
);

/** One floor of the stack. Leak cells light with the row's delay; the 3× cell waits for `hot`. */
const FloorRow = ({ floor, a, b, c, d, e, on, hot = false }: { floor: string; a: Tone; b: Tone; c: Tone; d: Tone; e: Tone; on: [boolean, number]; hot?: boolean }) => {
  const lit = (t: Tone) => (t === 'hot' ? hot : on[0]);
  const wait = (t: Tone) => (t === 'hot' ? 0 : on[1]);
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ width: 70, fontSize: 22, color: muted, fontWeight: 700 }}>{floor}</div>
      <Cell tone={a} on={lit(a)} delay={wait(a)} />
      <Cell tone={b} on={lit(b)} delay={wait(b)} />
      <Cell tone={c} on={lit(c)} delay={wait(c)} />
      <Cell tone={d} on={lit(d)} delay={wait(d)} />
      <Cell tone={e} on={lit(e)} delay={wait(e)} />
    </div>
  );
};

const Feature = ({ n, title, body, on, delay }: { n: string; title: string; body: ReactNode; on: boolean; delay: number }) => (
  <div style={reveal(on, delay)}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <NumBadge n={n} />
      <div style={{ fontSize: 27, fontWeight: 800 }}>{title}</div>
    </div>
    <div style={{ fontSize: 23, lineHeight: 1.45, color: muted, marginTop: 10 }}>{body}</div>
  </div>
);

const CompareRow = ({ left, right, last, on, delay }: { left: string; right: string; last?: boolean; on: boolean; delay: number }) => (
  <div style={{ display: 'flex', borderBottom: last ? 'none' : `2px solid ${line}`, ...reveal(on, delay, 'translateX(40px)') }}>
    <div style={{ flex: 1, padding: '14px 22px', fontSize: 23, color: muted }}>{left}</div>
    <div style={{ flex: 1, padding: '14px 22px', fontSize: 23, fontWeight: 700, borderLeft: `2px solid ${line}` }}>{right}</div>
  </div>
);

const Innovation: Page = () => {
  const { beat, cues } = useBeats(3);
  const arrived = useArrived();
  const focus = beat === 0 ? { x: 640, y: 300, s: 1.5 } : beat === 1 ? { x: 640, y: 400, s: 1.2 } : OVERVIEW;
  const leaks = arrived && beat >= 0;
  const hot = beat >= 1;
  return (
    <Frame eyebrow="05 · Innovation" title="What a normal ticket system can’t do" focus={focus} mark="05" chapter={3}>
      {cues}
      <div style={{ display: 'flex', gap: 80, height: '100%' }}>
        <Card style={{ width: 760, padding: '30px 36px', flexShrink: 0, height: 640 }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.12em' }}>BLOCK A · STACK VIEW</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ width: 70 }} />
              <GridLabel>06</GridLabel>
              <GridLabel>07</GridLabel>
              <GridLabel>08</GridLabel>
              <GridLabel>09</GridLabel>
              <GridLabel>10</GridLabel>
            </div>
            <FloorRow floor="L13" a="base" b="base" c="base" d="base" e="base" on={[leaks, 0]} />
            <FloorRow floor="L12" a="base" b="hit" c="hot" d="base" e="base" on={[leaks, 1500]} hot={hot} />
            <FloorRow floor="L11" a="base" b="base" c="hit" d="base" e="base" on={[leaks, 1100]} />
            <FloorRow floor="L10" a="base" b="base" c="hit" d="base" e="base" on={[leaks, 700]} />
            <FloorRow floor="L9" a="base" b="base" c="hit" d="base" e="base" on={[leaks, 300]} />
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 21, color: muted, marginTop: 22 }}>
            <span><b style={{ color: '#F0A35E' }}>■</b> leak reported</span>
            <span><b style={{ color: 'var(--osd-accent)' }}>■</b> 3rd leak in A-12-08</span>
          </div>
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: ink,
              color: '#fff',
              borderRadius: 14,
              padding: '16px 22px',
              ...reveal(hot, 500, 'translateY(30px)'),
            }}
          >
            <Icon name="alert" color={bright} size={34} />
            <div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>Auto-escalated to SDP</div>
              <div style={{ fontSize: 20, opacity: 0.8, marginTop: 2 }}>3rd occurrence · 4 units in stack 08 · extra inspection proposed</div>
            </div>
          </div>
        </Card>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 36 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 40, rowGap: 30 }}>
            <Feature on={beat >= 2} delay={0} n="01" title="Recurrence detection" body="3rd occurrence, or 3+ units in one stack → auto-escalation." />
            <Feature on={beat >= 2} delay={150} n="02" title="Similar-defect linking" body="Links cases across the unit, stack, neighbours and contractor." />
            <Feature on={beat >= 2} delay={300} n="03" title="Human-in-the-loop" body="The AI can’t record verdicts, sign off, or approve escalations." />
            <Feature on={beat >= 2} delay={450} n="04" title="Guardrails" body="Blocks liability language and unsafe steps in buyer messages." />
          </div>
          <div style={{ border: `2px solid ${ink}`, borderRadius: 16, overflow: 'hidden', background: card, ...reveal(beat >= 3, 0, 'translateY(30px)') }}>
            <div style={{ display: 'flex', background: '#F2EBE3', borderBottom: `2px solid ${line}` }}>
              <div style={{ flex: 1, padding: '12px 22px', fontSize: 19, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--osd-accent)' }}>NORMAL SYSTEM</div>
              <div style={{ flex: 1, padding: '12px 22px', fontSize: 19, fontWeight: 800, letterSpacing: '0.1em', color: green, borderLeft: `2px solid ${line}` }}>SIMEPHONY</div>
            </div>
            <CompareRow on={beat >= 3} delay={100} left="3rd complaint = new ticket" right="3rd occurrence = escalation" />
            <CompareRow on={beat >= 3} delay={250} left="Same issue repeated 5×" right="Pattern flagged as it happens" />
            <CompareRow on={beat >= 3} delay={400} left="30 days to spot a pattern" right="< 24 hours to flag it" last />
          </div>
        </div>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 07 · Impact (camera visits each card)
// ---------------------------------------------------------------------------

const ImpactCard = ({ n, icon, title, on, children }: { n: string; icon: 'camera' | 'link' | 'alert'; title: string; on: boolean; children: ReactNode }) => (
  <div style={{ flex: 1, display: 'flex', ...reveal(on, 0, 'translateY(70px) scale(0.96)') }}>
    <Card style={{ flex: 1, padding: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={40} />
        </div>
        <span style={{ fontSize: 44, fontWeight: 900, color: '#EADFD3' }}>{n}</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, marginTop: 22 }}>{title}</div>
      <ul style={{ fontSize: 25, lineHeight: 1.45, color: muted, margin: '16px 0 0', paddingLeft: 28 }}>{children}</ul>
    </Card>
  </div>
);

const ValueTile = ({ who, what, on, delay }: { who: string; what: string; on: boolean; delay: number }) => (
  <div style={{ flex: 1, padding: '0 32px', ...reveal(on, delay) }}>
    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>{who}</div>
    <div style={{ fontSize: 28, fontWeight: 600, marginTop: 10, lineHeight: 1.35 }}>{what}</div>
  </div>
);

const IMPACT_X = [389, 959, 1529];

const Impact: Page = () => {
  const { beat, cues } = useBeats(3);
  const focus = beat < 3 ? { x: IMPACT_X[beat], y: 190, s: 1.5 } : OVERVIEW;
  const done = beat >= 3;
  return (
    <Frame
      eyebrow="06 · Impact"
      title="Closed doesn’t mean resolved"
      subtitle="Simephony verifies outcomes, connects recurrence and flags systemic risks."
      bodyTop={340}
      focus={focus}
      mark="06"
      chapter={4}
    >
      {cues}
      <div style={{ display: 'flex', gap: 32 }}>
        <ImpactCard on={beat >= 0} n="01" icon="camera" title="Verify the repair">
          <li style={{ marginBottom: 10 }}>AI compares the repair photo with the original and flags a mismatch</li>
          <li style={{ marginBottom: 10 }}>Closes only after SDP and the buyer sign off</li>
          <li>Unresolved defects stay visible</li>
        </ImpactCard>
        <ImpactCard on={beat >= 1} n="02" icon="link" title="Connect the pattern">
          <li style={{ marginBottom: 10 }}>Links cases across units, floors, stacks and repair history</li>
          <li>Flags systemic issues missed when complaints are handled one by one</li>
        </ImpactCard>
        <ImpactCard on={beat >= 2} n="03" icon="alert" title="Escalate early">
          <li style={{ marginBottom: 10 }}>Gives SDP the recurrence evidence and an inspection brief</li>
          <li>SDP approves before any extra inspection is booked</li>
        </ImpactCard>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          background: ink,
          color: '#fff',
          borderRadius: 'var(--osd-radius)',
          padding: '28px 0',
          ...reveal(done, 0, 'translateY(40px)'),
        }}
      >
        <div style={{ padding: '0 40px', fontSize: 30, fontWeight: 800, color: bright }}>Value</div>
        <ValueTile on={done} delay={200} who="RESIDENTS" what="Clearer updates, more confidence" />
        <ValueTile on={done} delay={350} who="OPERATIONS" what="Less duplicated investigation and rework" />
        <ValueTile on={done} delay={500} who="QUALITY" what="Earlier signals of systemic defects" />
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 08 · Feasibility (a data packet travels through the architecture, lighting each layer)
// ---------------------------------------------------------------------------

const ARCH_X = [0, 440, 880, 1320]; // inner x of each 360px box

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
      width: 360,
      height: 230,
      boxSizing: 'border-box',
      borderRadius: 18,
      padding: '24px 26px',
      background: tone === 'dark' ? ink : tone === 'warm' ? orangeSoft : card,
      color: tone === 'dark' ? '#fff' : ink,
      border: tone === 'dark' ? `2px solid ${ink}` : tone === 'warm' ? '2px solid #E9B9A3' : `2px solid ${line}`,
      opacity: state === 'off' ? 0.28 : 1,
      transform: state === 'active' ? 'translateY(-10px) scale(1.04)' : 'none',
      boxShadow: state === 'active' ? '0 30px 50px -22px rgba(198,74,31,0.55)' : '0 18px 40px -26px rgba(28,24,20,0.2)',
      transition: `opacity 500ms ${EASE_OUT}, transform 700ms ${SPRING}, box-shadow 500ms`,
    }}
  >
    <Icon name={icon} color={tone === 'dark' ? bright : '#C64A1F'} size={36} />
    <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.25, marginTop: 12 }}>{title}</div>
    <div style={{ fontSize: 21, lineHeight: 1.4, marginTop: 8, opacity: 0.85 }}>{body}</div>
  </div>
);

const ArchArrow = ({ x, on }: { x: number; on: boolean }) => (
  <div style={{ position: 'absolute', left: x, top: 96, width: 80, textAlign: 'center', fontSize: 34, fontWeight: 800, color: on ? '#C64A1F' : '#D8CCBF', transition: 'color 400ms' }}>
    →
  </div>
);

const WhyCol = ({ n, title, on, delay, children }: { n: string; title: string; on: boolean; delay: number; children: ReactNode }) => (
  <div style={{ flex: 1, ...reveal(on, delay) }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <NumBadge n={n} />
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.25 }}>{title}</div>
    </div>
    <ul style={{ fontSize: 24, lineHeight: 1.45, color: muted, margin: '18px 0 0', paddingLeft: 28 }}>{children}</ul>
  </div>
);

const Feasibility: Page = () => {
  const { beat, cues } = useBeats(4);
  const at = Math.min(beat, 3);
  const st = (i: number): 'off' | 'active' | 'done' => (beat >= 4 ? 'done' : i === at ? 'active' : i < at ? 'done' : 'off');
  return (
    <Frame eyebrow="07 · Feasibility" title="Fits beside SDP’s systems, with people in charge" mark="07" chapter={5}>
      {cues}
      <div style={{ position: 'relative', height: 300 }}>
        <ArchBox x={ARCH_X[0]} icon="layers" state={st(0)} tone="light" title="Role-based portals" body="Buyer · Technician · SDP team" />
        <ArchArrow x={360} on={at >= 1} />
        <ArchBox x={ARCH_X[1]} icon="plug" state={st(1)} tone="warm" title="Backend + FastMCP tools" body="Business rules, bookings and case statuses in one rules layer" />
        <ArchArrow x={800} on={at >= 2} />
        <ArchBox x={ARCH_X[2]} icon="shield" state={st(2)} tone="dark" title="Simephony AI agents" body="Intake · Similar defect · Triage · Booking · Verification · Recurrence · Comms" />
        <ArchArrow x={1240} on={at >= 3} />
        <ArchBox x={ARCH_X[3]} icon="link" state={st(3)} tone="light" title="Data & audit trail" body="SQLite, photo uploads and a full event log" />
        <div style={{ position: 'absolute', left: 180, width: 1320, top: 270, height: 4, background: line, borderRadius: 2 }} />
        <div
          style={{
            position: 'absolute',
            left: ARCH_X[at] + 180 - 14,
            top: 258,
            width: 28,
            height: 28,
            borderRadius: 14,
            background: '#C64A1F',
            boxShadow: '0 0 0 8px rgba(198,74,31,0.18), 0 0 30px rgba(198,74,31,0.6)',
            transition: `left 900ms ${CAM_EASE}`,
            opacity: beat >= 4 ? 0 : 1,
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 56, marginTop: 50 }}>
        <WhyCol on={beat >= 4} delay={0} n="01" title="An achievable stack">
          <li style={{ marginBottom: 8 }}>LangGraph agents on local Ollama (Qwen2.5, LLaVA), FastAPI, Next.js</li>
          <li>Every AI step falls back to rules if a model fails</li>
        </WhyCol>
        <WhyCol on={beat >= 4} delay={180} n="02" title="Human oversight at every step">
          <li style={{ marginBottom: 8 }}>Technicians record verdicts; SDP approves extra inspections</li>
          <li>Backend rules enforce statuses, bookings and permissions</li>
        </WhyCol>
        <WhyCol on={beat >= 4} delay={360} n="03" title="Middleware, not a replacement">
          <li style={{ marginBottom: 8 }}>Connects to existing systems through APIs and FastMCP tools</li>
          <li>Live status updates through events and SSE</li>
        </WhyCol>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 09 · Scalability (the roadmap draws itself; the camera rides along)
// ---------------------------------------------------------------------------

const PHASE_W = 336;

const Phase = ({
  n,
  name,
  when,
  body,
  outcome,
  on,
  current,
  here,
}: {
  n: string;
  name: string;
  when: string;
  body: string;
  outcome: string;
  on: boolean;
  current: boolean;
  here?: boolean;
}) => (
  <div style={{ width: PHASE_W, flexShrink: 0, position: 'relative' }}>
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 50,
        width: 64,
        height: 64,
        borderRadius: 32,
        background: on ? '#C64A1F' : card,
        color: on ? '#fff' : '#D5C8BA',
        border: `3px solid ${on ? '#C64A1F' : '#E3D7CA'}`,
        fontSize: 26,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        transform: current ? 'scale(1.18)' : 'scale(1)',
        boxShadow: current ? '0 0 0 10px rgba(198,74,31,0.15)' : 'none',
        transition: `background 400ms, color 400ms, border-color 400ms, transform 600ms ${SPRING}, box-shadow 400ms`,
      }}
    >
      {n}
    </div>
    <div style={{ paddingTop: 150, paddingRight: 28, ...reveal(on, 200) }}>
      <div style={{ fontSize: 32, fontWeight: 800 }}>{name}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--osd-accent)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
        {when}
        {here ? (
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.12em', color: '#fff', background: '#C64A1F', padding: '5px 10px', borderRadius: 6 }}>
            WE ARE HERE
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 24, lineHeight: 1.45, color: muted, marginTop: 14 }}>{body}</div>
      <div style={{ fontSize: 24, lineHeight: 1.4, color: blue, fontWeight: 700, marginTop: 16 }}>✓ {outcome}</div>
    </div>
  </div>
);

const Scalability: Page = () => {
  const { beat, cues } = useBeats(5);
  const at = Math.min(beat, 4);
  const focus = beat < 5 ? { x: PAD_X + 140 + PHASE_W * beat, y: 280, s: 1.5 } : OVERVIEW;
  return (
    <Frame eyebrow="08 · Scalability & implementation" title="Prove it on one handover phase, then scale" focus={focus} mark="08" chapter={6}>
      {cues}
      <div style={{ position: 'absolute', left: 32, width: PHASE_W * 4, top: 80, height: 4, background: line, borderRadius: 2 }} />
      <div
        style={{
          position: 'absolute',
          left: 32,
          width: PHASE_W * at,
          top: 80,
          height: 4,
          background: '#C64A1F',
          borderRadius: 2,
          transition: `width ${CAM_MS}ms ${CAM_EASE}`,
        }}
      />
      <div style={{ display: 'flex' }}>
        <Phase n="1" here on={beat >= 0} current={at === 0 && beat < 5} name="Prototype" when="Now" body="Working end-to-end demo with four scenarios." outcome="372 automated tests passing" />
        <Phase n="2" on={beat >= 1} current={at === 1 && beat < 5} name="Shadow pilot" when="3 months" body="Runs beside the Command & Contact Centre on one new phase. AI recommends, staff decide." outcome="AI matches staff decisions" />
        <Phase n="3" on={beat >= 2} current={at === 2 && beat < 5} name="Live pilot" when="+3 months" body="AI books, verifies and escalates, starting with leak and electrical cases." outcome="Fewer reopens and repeat visits" />
        <Phase n="4" on={beat >= 3} current={at === 3 && beat < 5} name="Scale" when="6–12 months" body="More townships and all defect types, connected to the CCC and Procore." outcome="Contractor quality scores in use" />
        <Phase n="5" on={beat >= 4} current={at === 4 && beat < 5} name="Portfolio" when="Year 2+" body="Extends to malls and industrial assets after the 24-month liability period." outcome="Recurring-income assets" />
      </div>
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
      <img src={closingImg} alt="" style={{ position: 'absolute', right: 0, top: 0, width: 860, height: '100%', objectFit: 'cover', ...anim(live, 'sf-fade', 1400, 0) }} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: 860, height: '100%', background: 'linear-gradient(90deg, #1C1814 0%, rgba(28,24,20,0) 40%)' }} />
      <div style={{ position: 'absolute', left: PAD_X, top: 0, bottom: 0, width: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: '"Allura", cursive', fontSize: 150, color: '#FBE3D3', lineHeight: 1, paddingRight: 30, alignSelf: 'flex-start', ...anim(live, 'sf-wipe', 1600, 200, 'cubic-bezier(0.5, 0, 0.3, 1)') }}>
          Simephony
        </div>
        <h1 style={{ fontSize: 120, fontWeight: 800, letterSpacing: '-0.03em', margin: '40px 0 0', lineHeight: 1, ...anim(live, 'sf-rise', 800, 900) }}>Thank you!</h1>
        <p style={{ fontSize: 36, lineHeight: 1.4, margin: '40px 0 0', color: 'rgba(255,255,255,0.85)', ...anim(live, 'sf-rise', 800, 1300) }}>
          Don’t just close the defect. <span style={{ color: bright, fontWeight: 700 }}>Prove it’s resolved.</span>
        </p>
        <p style={{ fontSize: 26, margin: '56px 0 0', color: 'rgba(255,255,255,0.6)', ...anim(live, 'sf-fade', 800, 1800) }}>Group We Hit Token Limit · Questions welcome</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Appendix divider
// ---------------------------------------------------------------------------

const AppendixRow = ({ k, label }: { k: string; label: string }) => (
  <div style={{ display: 'flex', gap: 24, fontSize: 30, alignItems: 'baseline' }}>
    <span style={{ width: 40, fontWeight: 800, color: bright }}>{k}</span>
    <span>{label}</span>
  </div>
);

const AppendixDivider: Page = () => (
  <div style={{ ...fill, background: ink, color: '#fff' }}>
    <div style={{ position: 'absolute', left: PAD_X, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.16em', color: bright }}>FOR Q&amp;A</div>
      <h1 style={{ fontSize: 140, fontWeight: 800, letterSpacing: '-0.03em', margin: '20px 0 0', lineHeight: 1 }}>Appendix</h1>
    </div>
    <div style={{ position: 'absolute', left: 1060, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
      <AppendixRow k="A" label="Testimonials: what we changed" />
      <AppendixRow k="B" label="Value-added model" />
      <AppendixRow k="C" label="The agents and their jobs" />
      <AppendixRow k="D" label="Target users" />
      <AppendixRow k="E" label="AI justification and AIGE" />
      <AppendixRow k="F" label="Risks and mitigation" />
      <AppendixRow k="G" label="Future enhancement" />
      <AppendixRow k="H" label="Meet the team" />
    </div>
    <div style={{ position: 'absolute', right: PAD_X, bottom: 48 }}>
      <PageNo color="rgba(255,255,255,0.6)" />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// A · Testimonials → what we changed
// ---------------------------------------------------------------------------

const Person = ({ src, name, role, rotate, children }: { src: string; name: string; role: string; rotate: number; children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
    <div style={{ background: '#fff', padding: '14px 14px 40px', boxShadow: '0 14px 30px rgba(28,24,20,0.16)', transform: `rotate(${rotate}deg)`, flexShrink: 0 }}>
      <img src={src} alt={name} style={{ width: 230, height: 230, objectFit: 'cover', display: 'block' }} />
    </div>
    <div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{name}</div>
      <div style={{ fontSize: 22, color: muted, marginTop: 4 }}>{role}</div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  </div>
);

const Quote = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 24, lineHeight: 1.4, fontStyle: 'italic', color: ink }}>“{children}”</div>
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
      <div style={{ fontSize: 26, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 22, lineHeight: 1.4, color: muted, marginTop: 4 }}>{body}</div>
    </div>
  </div>
);

const Testimonials: Page = () => (
  <Frame eyebrow="Appendix A · Testimonials" title="We listened, then we built it" mark="A">
    <div style={{ display: 'flex', gap: 64, height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 56 }}>
        <Person src={testimonialKimberly} name="Kimberly Anne Surin, 27" role="Interior Designer, Vuemont Studio Sdn Bhd" rotate={-2}>
          <Quote>Might not need buyer to book slots, as normally ask 3rd party to do</Quote>
          <Quote>Can have a tab for everyone to talk, so buyer can give notes</Quote>
        </Person>
        <Person src={testimonialLim} name="Lim Yap Cheong, 57" role="House owner" rotate={2}>
          <Quote>Buyer shouldn’t book repair slot liao</Quote>
          <Quote>Make overall sign-off… might have 20–30 defects</Quote>
        </Person>
      </div>
      <Card style={{ width: 640, padding: 40, display: 'flex', flexDirection: 'column', gap: 30 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>WHAT WE CHANGED</div>
        <Change done title="No more booking by the buyer" body="Inspection and repair times are now booked automatically with the first free technician." />
        <Change done title="One sign-off per unit" body="The buyer checks every defect and signs off the whole unit once, with one timer per unit." />
        <Change done={false} title="Next: a 3rd-party role" body="For agents or contractors who handle repairs for the owner." />
        <Change done={false} title="Next: a shared notes tab" body="So the buyer can leave notes for everyone working on the case." />
      </Card>
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// B · Value-added model (3 pages)
// ---------------------------------------------------------------------------

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
          <CycleStep n="1" color="#C64A1F" title="Hand over a phase" body="Every new unit enters Simephony on day one." />
          <CycleStep n="2" color="#C64A1F" title="Verify repairs (24-month DLP)" body="Buyer-verified repairs cut repeat visits, disputes and rework." />
          <CycleStep n="3" color={ink} title="Build trust and data" body="Every verified case sharpens recurrence detection." />
          <CycleStep n="4" color={blue} title="Paid plans after the DLP" body="Homes, strata buildings and SDP assets move onto recurring plans." />
          <CycleStep n="5" color={ink} title="Better next phase" body="Recurrence patterns improve designs and contractor choice." />
        </div>
      </div>
    </Frame>
  );
};

const Stream = ({ k, title, body, value, color }: { k: string; title: string; body: string; value: string; color: string }) => (
  <Card style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '22px 28px' }}>
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
  <Frame eyebrow="Appendix B · Value-added model" title="Seven value streams: save first, then earn" mark="B">
    <div style={{ display: 'flex', gap: 48 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <StreamHead label="Saves during the DLP" total="Year 5: RM0.93m" color="#C64A1F" />
        <Stream k="A" color="#C64A1F" title="Fewer repeat visits" body="Repeat visits avoided × RM350, plus admin hours" value="RM669k" />
        <Stream k="B" color="#C64A1F" title="Lower dispute risk" body="Evidence-backed records avoid a share of disputes" value="RM133k" />
        <Stream k="C" color="#C64A1F" title="Contractor back-charges" body="Failed-repair cost recovered with photo evidence" value="RM126k" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <StreamHead label="Earns after the DLP" total="Year 5: RM2.06m" color={blue} />
        <Stream k="D" color={blue} title="Home Care plan" body="RM30 a month per home; gross profit shown" value="RM468k" />
        <Stream k="E" color={blue} title="Strata subscriptions" body="Annual fee per JMB / MC building" value="RM236k" />
        <Stream k="F" color={blue} title="SDP malls and industrial" body="Defect intelligence for IAM assets" value="RM660k" />
        <Stream k="G" color={blue} title="Developer licences" body="Licensed to other developers from Year 3" value="RM700k" />
      </div>
    </div>
  </Frame>
);

const BigStat = ({ value, label }: { value: string; label: string }) => (
  <div style={{ background: ink, color: '#fff', borderRadius: 16, padding: '26px 30px', flex: 1 }}>
    <div style={{ fontSize: 48, fontWeight: 800, color: bright, letterSpacing: '-0.02em' }}>{value}</div>
    <div style={{ fontSize: 22, marginTop: 6, opacity: 0.85 }}>{label}</div>
  </div>
);

const FiveYears: Page = () => (
  <Frame eyebrow="Appendix B · Value-added model" title="Five years: recurring earnings overtake savings" mark="B">
    <div style={{ display: 'flex', gap: 64, height: '100%', alignItems: 'center' }}>
      <img src={fiveYearChart} alt="Stacked bars, Year 1 RM1.0m to Year 5 RM3.0m; recurring earnings grow faster than savings" style={{ width: 900, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', gap: 18 }}>
          <BigStat value="33% → 69%" label="recurring share, Y1 → Y5" />
          <BigStat value="RM7.4m" label="5-year net value" />
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <BigStat value="Year 1" label="payback" />
          <BigStat value="~3,250" label="Home Care homes, Y5" />
        </div>
        <Card style={{ padding: '24px 30px' }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Base-case assumptions</div>
          <ul style={{ fontSize: 22, lineHeight: 1.5, color: muted, margin: '10px 0 0', paddingLeft: 26 }}>
            <li>~3,000 handovers a year (SDP FY2021: 3,129)</li>
            <li>Repeat visits avoided: 20% → 40%; RM350 per visit</li>
            <li>Home Care: RM30/month, 5% → 13% uptake</li>
            <li>Build RM500k; run RM300k a year</li>
          </ul>
        </Card>
      </div>
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// C · Agents
// ---------------------------------------------------------------------------

const AgentCard = ({ step, name, body }: { step: string; name: string; body: string }) => (
  <Card style={{ flex: 1, padding: 28, height: 330 }}>
    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>{step}</div>
    <div style={{ fontSize: 28, fontWeight: 800, marginTop: 12, lineHeight: 1.2 }}>{name}</div>
    <div style={{ fontSize: 23, lineHeight: 1.45, color: muted, marginTop: 14 }}>{body}</div>
  </Card>
);

const Chevron = () => <div style={{ alignSelf: 'center', fontSize: 30, fontWeight: 800, color: '#D9C9B8' }}>›</div>;

const Checkpoint = ({ children, dim }: { children: ReactNode; dim?: boolean }) => (
  <div style={{ flex: 1, borderRadius: 16, padding: '22px 24px', background: dim ? '#ECE5DD' : blueSoft, fontSize: 23, lineHeight: 1.4, color: dim ? muted : '#1C3F70' }}>
    {children}
  </div>
);

const Agents: Page = () => (
  <Frame eyebrow="Appendix C · The agents" title="Five agent steps, with people at the checkpoints" mark="C">
    <div style={{ display: 'flex', gap: 10 }}>
      <AgentCard step="1 · UNDERSTAND" name="Intake" body="Turns a photo and message (English, BM or Manglish) into a structured case." />
      <Chevron />
      <AgentCard step="2 · INVESTIGATE" name="Similar Defect" body="Searches unit, floor, stack and contractor history for related cases." />
      <Chevron />
      <AgentCard step="3 · ACT" name="Triage + Comms" body="Books a free technician with the right skill; sends guardrailed updates." />
      <Chevron />
      <AgentCard step="4 · VERIFY" name="Verification" body="Walks the buyer through a pre-approved check. Fail → the case reopens." />
      <Chevron />
      <AgentCard step="5 · LEARN" name="Recurrence" body="3rd occurrence or 3+ units in one stack → flags it to SDP." />
    </div>
    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.12em', color: blue, marginTop: 44 }}>HUMAN CHECKPOINTS</div>
    <div style={{ display: 'flex', gap: 20, marginTop: 18 }}>
      <Checkpoint dim>Every agent step and email is logged to the case’s audit trail.</Checkpoint>
      <Checkpoint><b>Technician</b> records VALID or INVALID. The AI can’t.</Checkpoint>
      <Checkpoint><b>Buyer</b> confirms it’s fixed; <b>SDP</b> signs off.</Checkpoint>
      <Checkpoint><b>SDP</b> approves an extra inspection → AI brief for the technician.</Checkpoint>
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// D · Target users
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
  <Frame eyebrow="Appendix D · Target users" title="We see the user’s frustration" mark="D">
    <div style={{ display: 'flex', gap: 48, height: '100%' }}>
      <img src={targetUsers} alt="Buyer, developer and contractor with their frustrations" style={{ width: 620, height: 620, objectFit: 'cover', borderRadius: 'var(--osd-radius)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <UserRow who="Buyer / homeowner" pain="“I report defects but lose track. I get kicked between parties.”" gain="Live tracking, a repair I can verify, one trusted record." />
        <UserRow who="SDP staff / developer" pain="Mismatched records, disputes and no view of recurring patterns." gain="An audit trail, early recurrence alerts, control over escalations." />
        <UserRow who="Technician / subcontractor" pain="No defect history, so repeat repairs happen without context." gain="Full case history before the visit, clear verdicts, less rework." />
      </div>
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// E · AI justification and AIGE (4 pages)
// ---------------------------------------------------------------------------

const Question = ({ n, q, a }: { n: string; q: string; a: string }) => (
  <Card style={{ flex: 1, padding: 36 }}>
    <NumBadge n={n} color={blue} />
    <div style={{ fontSize: 32, fontWeight: 800, marginTop: 20 }}>{q}</div>
    <div style={{ fontSize: 25, lineHeight: 1.45, color: muted, marginTop: 14 }}>{a}</div>
  </Card>
);

const AiHowWeDecided: Page = () => (
  <Frame eyebrow="Appendix E · AI justification" title="AI only where it helps" subtitle="We asked the same three questions about every step in the defect flow." bodyTop={340} mark="E">
    <div style={{ display: 'flex', gap: 28 }}>
      <Question n="1" q="Is the input messy?" a="Free text in English, Malay or Manglish, and photos, are hard for fixed rules. AI is good at this." />
      <Question n="2" q="How bad is a mistake?" a="When a mistake is costly, the AI never decides on its own." />
      <Question n="3" q="Must it be explained?" a="A rule can be quoted, e.g. “3rd time in this unit”. A model’s answer can’t, so those decisions use rules." />
    </div>
    <div style={{ display: 'flex', gap: 28, marginTop: 40, alignItems: 'stretch' }}>
      <div style={{ flex: 2, background: ink, color: '#fff', borderRadius: 'var(--osd-radius)', padding: '30px 36px', fontSize: 30, fontWeight: 700, lineHeight: 1.4 }}>
        AI handles the <span style={{ color: '#8FB4E8' }}>messy inputs</span>, rules handle the decisions that must be{' '}
        <span style={{ color: '#F3C26B' }}>consistent</span>, and people make the <span style={{ color: bright }}>final calls</span>.
      </div>
      <Card style={{ flex: 1, padding: '24px 30px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.1em', color: muted }}>RUNS LOCALLY</div>
        <div style={{ fontSize: 23, lineHeight: 1.45, marginTop: 8 }}>
          Ollama: <b>llava-llama3</b> reads photos, <b>qwen2.5:7b</b> handles text. If a model fails, rules take over, so a case never gets stuck.
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
  <Frame eyebrow="Appendix E · AI justification" title="Who decides each step: AI, rules or people" mark="E">
    <div style={{ borderTop: `3px solid ${ink}` }}>
      <div style={{ display: 'flex', borderBottom: `2px solid ${line}` }}>
        <TH w={380}>STEP</TH>
        <TH w={300}>MESSY INPUT?</TH>
        <TH w={170}>MISTAKE COST</TH>
        <TH w={170}>EXPLAIN?</TH>
        <TH>WHO DECIDES</TH>
      </div>
      <SuitRow step="Read the defect report" messy="Yes: 3 languages + photo" cost="Medium" explain="Medium" who="ai" decision="AI (llava) + guardrails + fallback" />
      <SuitRow shade step="Find similar past cases" messy="No: case records" cost="Medium" explain="High" who="rules" decision="Rules; AI writes a one-line reason" />
      <SuitRow step="Urgency" messy="Partly: report text" cost="High" explain="High" who="mixed" decision="AI proposes, must cite a numbered rule" />
      <SuitRow shade step="Trade and repair time" messy="No" cost="High" explain="High" who="rules" decision="Rules (fixed repair plan)" />
      <SuitRow step="Inspection result" messy="No" cost="Very high" explain="Very high" who="people" decision="People (the technician)" />
      <SuitRow shade step="Recurrence and escalation" messy="No: counts" cost="High" explain="High" who="mixed" decision="Rules count, SDP staff decide" />
      <SuitRow step="Systemic match score" messy="No: counts" cost="Medium" explain="High" who="rules" decision="Rules (a formula, labelled as such)" />
      <SuitRow shade step="Check repair photos" messy="Yes: photos" cost="Medium" explain="High" who="mixed" decision="Rule checks → AI suggests → person decides" />
      <SuitRow step="Repair sign-off" messy="No" cost="Very high" explain="Very high" who="people" decision="People (SDP staff, then the buyer)" />
      <SuitRow shade step="Write buyer updates" messy="Yes: wording" cost="Medium" explain="Low" who="ai" decision="AI (qwen) + guardrails + fixed sentences" />
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

const AiAige: Page = () => (
  <Frame
    eyebrow="Appendix E · Malaysia’s AIGE guidelines"
    title="Checked against all seven AIGE principles"
    subtitle="National Guidelines on AI Governance and Ethics (MOSTI, Sept 2024), checked against our code on 9 Nov 2026."
    bodyTop={340}
    mark="E"
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Principle name="Fairness" s="partly" how="Same urgency, repair and escalation rules for every case. Malay and Manglish are read too. Accuracy per language not measured yet." />
      <Principle shade name="Reliability, safety and control" s="covered" how="Tests on the real models, timeouts (45 s text, 90 s photos), rule fallback, guardrails on urgency and messages." />
      <Principle name="Privacy and data security" s="partly" how="Models run locally, so photos stay on the machine. Photo EXIF data isn’t removed yet; login is demo-only." />
      <Principle shade name="Inclusivity" s="partly" how="Malay and Manglish input; bigger buttons and “what happens next” steps. App screens are English-only, no voice input." />
      <Principle name="Transparency" s="covered" how="“Why the AI decided this” panel, AI vs rule results labelled, Agent Trace page, review reasons with confidence." />
      <Principle shade name="Accountability" s="covered" how="The AI never records the inspection result, signs off a repair or approves an escalation." />
      <Principle name="Human benefit" s="partly" how="Built to cut repeat repairs and give clearer updates. Not measured yet: that needs SDP data." />
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
  <Frame eyebrow="Appendix E · AI risks (NIST AI RMF)" title="What could go wrong, how we tested it, what we did" mark="E">
    <div style={{ borderTop: `3px solid ${ink}` }}>
      <div style={{ display: 'flex', borderBottom: `2px solid ${line}` }}>
        <TH w={470}>RISK · MAP</TH>
        <TH>HOW WE TESTED IT · MEASURE</TH>
        <TH>WHAT WE DID · MANAGE</TH>
      </div>
      <RiskRow risk="AI rates an ordinary leak as high urgency" measure="Seen in the 21 Oct live run. A live test now checks three reports; only the leak near a light is high." manage="The model must cite a numbered rule, and a high rule needs matching words." />
      <RiskRow shade risk="AI misreads a Malay room name" measure="qwen read “bilik tidur utama” (master bedroom) as a bathroom." manage="Later agents get the checked English location; intake asks instead of guessing." />
      <RiskRow risk="Photo check passes a photo with no repair" measure="Unit tests with the same file and near-identical photos." manage="Code checks run first, the technician’s note isn’t sent, SDP staff decide." />
      <RiskRow shade risk="A buyer message admits liability" measure="Guardrail unit tests and live wording tests." manage="Guardrails remove the words; a fixed message is sent if the draft still fails." />
      <RiskRow risk="The model is slow or down" measure="Timeouts, and the USE_AI_AGENTS=only test mode." manage="Rule-based fallback; a failed new report is held for SDP review." />
    </div>
    <p style={{ position: 'absolute', left: 0, right: 0, bottom: 0, margin: 0, fontSize: 21, color: soft, lineHeight: 1.5 }}>
      Evidence: tests/integration/test_live_regressions.py (pytest -m live_llm) · scripts/web_flow_live.py · tests/TEST_STATUS.md
    </p>
  </Frame>
);

// ---------------------------------------------------------------------------
// F · Risks and mitigation
// ---------------------------------------------------------------------------

const MitRow = ({ risk, fix, shade }: { risk: string; fix: string; shade?: boolean }) => (
  <div style={{ display: 'flex', fontSize: 23, lineHeight: 1.4, background: shade ? '#F6F0E9' : 'transparent' }}>
    <div style={{ width: 600, padding: '15px 18px', fontWeight: 700 }}>{risk}</div>
    <div style={{ flex: 1, padding: '15px 18px', color: muted }}>{fix}</div>
  </div>
);

const Risks: Page = () => (
  <Frame eyebrow="Appendix F · Risk and mitigation" title="Risks and how we handle them" mark="F">
    <div style={{ borderTop: `3px solid ${ink}` }}>
      <div style={{ display: 'flex', borderBottom: `2px solid ${line}` }}>
        <TH w={600}>RISK</TH>
        <TH>MITIGATION</TH>
      </div>
      <MitRow risk="AI picks the wrong category or verdict" fix="AI only recommends; technicians record every verdict; unclear reports trigger a follow-up question." />
      <MitRow shade risk="An AI message admits liability or gives unsafe advice" fix="A guardrail checks every buyer message and email, with a safe template as fallback." />
      <MitRow risk="A buyer’s verification is wrong or disputed" fix="Reopening needs a new photo within the grace period; disputes go to SDP review." />
      <MitRow shade risk="False “systemic issue” alerts" fix="Configurable threshold with a confidence score; SDP approves before any extra inspection." />
      <MitRow risk="Integration with SDP’s systems" fix="Middleware through APIs and MCP tools; the shadow pilot runs beside the CCC first." />
      <MitRow shade risk="Model outages or rate limits" fix="Retry with backoff, then a backup key or a local model." />
      <MitRow risk="Privacy of photos from inside homes (PDPA)" fix="The AI runs on a local model, so photos stay on SDP’s own infrastructure." />
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// G · Future enhancement (to be filled in)
// ---------------------------------------------------------------------------

const Future: Page = () => (
  <Frame eyebrow="Appendix G · Future enhancement" title="What’s next" mark="G">
    <ul style={{ fontSize: 'var(--osd-size-body)', lineHeight: 1.6, margin: 0, paddingLeft: 40 }}>
      <li>Add a calendar in the app</li>
    </ul>
  </Frame>
);

// ---------------------------------------------------------------------------
// H · Team
// ---------------------------------------------------------------------------

const Member = ({ photo, name, role, children }: { photo?: string; name: string; role: string; children: ReactNode }) => (
  <div style={{ flex: 1 }}>
    {photo ? (
      <img src={photo} alt={name} style={{ width: '100%', height: 380, objectFit: 'cover', objectPosition: 'top', borderRadius: 'var(--osd-radius)', display: 'block' }} />
    ) : (
      <ImagePlaceholder hint={`Photo of ${name}`} height={380} />
    )}
    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--osd-accent)', marginTop: 28 }}>{name}</div>
    <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{role}</div>
    <ul style={{ fontSize: 23, lineHeight: 1.45, color: muted, margin: '14px 0 0', paddingLeft: 28 }}>{children}</ul>
  </div>
);

const Team: Page = () => (
  <Frame eyebrow="Appendix H · Meet the team" title="Group We Hit Token Limit" mark="H">
    <div style={{ display: 'flex', gap: 40 }}>
      <Member name="PHOEBE ANGELINA SURIN" role="Team Leader · Frontend">
        <li>Led the team and product vision</li>
        <li>Built the full user experience</li>
      </Member>
      <Member photo={teamNicol} name="NICOL HENG SI YI" role="AI Developer">
        <li>Multi-agent AI workflow</li>
        <li>Defect intake and photo checks</li>
      </Member>
      <Member name="TAN SYN YEE" role="AI Developer">
        <li>AI reasoning and validation</li>
        <li>Calendar booking and reminders</li>
      </Member>
      <Member photo={teamXiaowen} name="LIM XIAO WEN" role="Backend Developer">
        <li>API and database reliability</li>
        <li>Live Gmail notifications</li>
      </Member>
    </div>
  </Frame>
);

// ---------------------------------------------------------------------------
// Full agent workflow diagram (reference)
// ---------------------------------------------------------------------------

const WorkflowFull: Page = () => (
  <div style={{ ...fill, background: '#fff' }}>
    <img src={agentWorkflow} alt="Full Simephony agent workflow diagram" style={{ position: 'absolute', left: 40, top: 30, width: 1840, height: 1020, objectFit: 'contain' }} />
  </div>
);

// ---------------------------------------------------------------------------
// Transitions and page order
// ---------------------------------------------------------------------------

Cover.transition = settle;
ThankYou.transition = settle;
// Main pitch pages morph into each other (pipeline, motto chips, chapter marker glide across).
Problem.transition = morphCut;
MissingStep.transition = morphCut;
WhyItMatters.transition = morphCut;
Solution.transition = morphCut;
HowItWorks.transition = morphCut;
Innovation.transition = morphCut;
Impact.transition = morphCut;
Feasibility.transition = morphCut;
Scalability.transition = morphCut;

export const meta: SlideMeta = {
  title: 'Simephony · Final pitch',
  createdAt: '2026-11-10T14:48:36.194Z',
};

export default [
  Cover,
  Problem,
  MissingStep,
  WhyItMatters,
  Solution,
  HowItWorks,
  Innovation,
  Impact,
  Feasibility,
  Scalability,
  ThankYou,
  AppendixDivider,
  Testimonials,
  ValueCycle,
  ValueStreams,
  FiveYears,
  Agents,
  TargetUsers,
  AiHowWeDecided,
  AiSuitability,
  AiAige,
  AiRisks,
  Risks,
  Future,
  Team,
  WorkflowFull,
] satisfies Page[];
