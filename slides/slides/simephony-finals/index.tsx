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
// Motion system (one cohesive DNA across every cut, morph, and camera beat)
// ---------------------------------------------------------------------------

const EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
const SPRING = 'cubic-bezier(0.34, 1.45, 0.64, 1)';
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
const MORPH_MS = 860;
const morphCut: SlideTransition = {
  duration: 300,
  exit: { duration: 300, easing: EASE_IN, keyframes: HOLD },
  enter: { duration: 300, easing: EASE_OUT, keyframes: [{ opacity: 0 }, { opacity: 1 }] },
  morph: { duration: MORPH_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
};

/** Style for an element that enters when `on` turns true (spring rise by default). */
const reveal = (on: boolean, delay = 0, from = 'translateY(34px)'): CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : from,
  transition: `opacity 440ms ${EASE_OUT} ${delay}ms, transform 720ms ${SPRING} ${delay}ms`,
});

/** CSS keyframe animation, gated to the active audience instance. */
const anim = (live: boolean, name: string, ms: number, delay = 0, easing = EASE_OUT): CSSProperties =>
  live ? { animation: `${name} ${ms}ms ${easing} ${delay}ms both` } : {};

/**
 * Beats: each click (→) advances one beat before moving to the next page.
 * Entering forward starts at beat 0; jumping in or coming back shows the final settled beat.
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

/** A camera over the page body: zooms to scale `s` around point (x, y), clamped to canvas edges. */
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
 * `mark` is the architectural watermark numeral; `chapter` renders the chapter rail.
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
      <div style={{ position: 'absolute', left: PAD_X, right: PAD_X, top: 92 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Title>{title}</Title>
        {subtitle ? (
          <p style={{ fontSize: 28, color: muted, margin: '12px 0 0', lineHeight: 1.4 }}>{subtitle}</p>
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
      <div style={{ position: 'absolute', left: PAD_X, top: 96, fontSize: 24, letterSpacing: '0.16em', opacity: 0.82, ...anim(live, 'sf-fade', 700, 150) }}>
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
          ...anim(live, 'sf-wipe', 1600, 260, 'cubic-bezier(0.5, 0, 0.3, 1)'),
        }}
      >
        Simephony
      </div>
      <div style={{ position: 'absolute', left: PAD_X, bottom: 185, width: 1320 }}>
        <div style={anim(live, 'sf-rise', 650, 750)}>
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
        <span style={{ fontWeight: 600, color: '#fff' }}>Group We Hit Token Limit</span>
        <span>Image: Sime Darby Property, official website</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 02 · The problem (camera visits each stat as it counts up, then dual-track journey)
// ---------------------------------------------------------------------------

const Stat = ({ on, value, label }: { on: boolean; value: ReactNode; label: string }) => (
  <div style={{ flex: 1, display: 'flex', ...reveal(on, 0, 'translateY(50px) scale(0.96)') }}>
    <Card style={{ flex: 1, padding: '28px 32px 32px' }}>
      <div style={{ fontSize: 88, fontWeight: 800, color: 'var(--osd-accent)', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 25, lineHeight: 1.4, marginTop: 16, color: muted }}>{label}</div>
    </Card>
  </div>
);

/** Shared pipeline pill styles (Problem page and Missing-step page morph between them). */
const pillStyle = (size: number, bg: string, color: string): CSSProperties => ({
  padding: `${Math.round(size * 0.36)}px ${Math.round(size * 0.84)}px`,
  borderRadius: 999,
  background: bg,
  color,
  fontSize: size,
  fontWeight: 600,
  border: `2px solid ${line}`,
  whiteSpace: 'nowrap',
});

const PipeArrow = ({ id, size, on = true, delay = 0 }: { id: string; size: number; on?: boolean; delay?: number }) => (
  <span style={reveal(on, delay, 'translateX(-12px)')}>
    <MorphElement id={id}>
      <span style={{ color: soft, fontSize: size * 1.2, fontWeight: 600 }}>→</span>
    </MorphElement>
  </span>
);

const PipePill = ({ id, size, on = true, delay = 0, children }: { id: string; size: number; on?: boolean; delay?: number; children: ReactNode }) => (
  <span style={reveal(on, delay, 'translateY(20px)')}>
    <MorphElement id={id}>
      <div style={pillStyle(size, card, ink)}>{children}</div>
    </MorphElement>
  </span>
);

const BlindPill = ({ on, delay, children }: { on: boolean; delay: number; children: ReactNode }) => (
  <span style={reveal(on, delay, 'translateY(20px)')}>
    <div style={pillStyle(22, card, ink)}>{children}</div>
  </span>
);

/** The four steps every defect goes through today. */
const Pipeline = ({ size, on = true }: { size: number; on?: boolean }) => (
  <>
    <PipePill id="pipe-reported" size={size} on={on} delay={0}>Reported</PipePill>
    <PipeArrow id="pipe-arrow-1" size={size} on={on} delay={110} />
    <PipePill id="pipe-assigned" size={size} on={on} delay={170}>Assigned</PipePill>
    <PipeArrow id="pipe-arrow-2" size={size} on={on} delay={280} />
    <PipePill id="pipe-repaired" size={size} on={on} delay={340}>Marked “repaired”</PipePill>
    <PipeArrow id="pipe-arrow-3" size={size} on={on} delay={450} />
    <PipePill id="pipe-closed" size={size} on={on} delay={510}>Closed</PipePill>
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
  children,
}: {
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
        padding: `${Math.round(size * 0.36)}px ${Math.round(size * 0.84)}px`,
        border: '2px solid transparent',
        color,
        fontSize: size,
        fontWeight: glow ? 800 : 700,
        whiteSpace: 'nowrap',
        ...textStyle,
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
  const focus = beat < 4 ? { x: STAT_X[beat], y: 145, s: 1.56 } : OVERVIEW;
  const piped = beat >= 4;
  return (
    <Frame eyebrow="01 · The problem" title="House defects get closed but don’t always get resolved." bodyTop={266} focus={focus} mark="01" chapter={0}>
      {cues}
      <div style={{ display: 'flex', gap: 32 }}>
        <Stat on={beat >= 0} value={<CountUp to={95} suffix="%" go={beat >= 0} />} label="of homebuyers faced problems with how complaints were handled" />
        <Stat on={beat >= 1} value={<CountUp to={70} suffix="%" go={beat >= 1} />} label="faced the same defect issues more than once" />
        <Stat on={beat >= 2} value={<CountUp to={50} suffix="%" go={beat >= 2} />} label="were unsatisfied with the developer’s response and speed" />
        <Stat on={beat >= 3} value={<>1 in <CountUp to={2} go={beat >= 3} /></>} label="were never asked to sign off a repair after it was done" />
      </div>
      <div style={{ marginTop: 42, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ width: 224, flexShrink: 0, fontSize: 22, fontWeight: 700, color: ink, lineHeight: 1.25, ...reveal(piped, 0, 'translateX(-16px)') }}>
            The Buyer’s Journey:
          </span>
          <Pipeline size={22} on={piped} />
          <PipeArrow id="pipe-arrow-4" size={22} on={piped} delay={620} />
          <span style={reveal(piped, 700, 'scale(0.8)')}>
            <GapPill size={22} bg={orangeSoft} color="#C64A1F" borderColor="#C64A1F" dashed pulse={live && piped}>
              Actually fixed? Nobody checks.
            </GapPill>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ width: 224, flexShrink: 0, fontSize: 22, fontWeight: 700, color: muted, lineHeight: 1.25, ...reveal(piped, 540, 'translateX(-16px)') }}>
            The Developer’s Blindspot:
          </span>
          <BlindPill on={piped} delay={600}>Isolated Ticket</BlindPill>
          <span style={{ color: soft, fontSize: 26, fontWeight: 600, ...reveal(piped, 680) }}>→</span>
          <BlindPill on={piped} delay={740}>No History</BlindPill>
          <span style={{ color: soft, fontSize: 26, fontWeight: 600, ...reveal(piped, 820) }}>→</span>
          <BlindPill on={piped} delay={880}>Repeat Repair</BlindPill>
          <span style={{ color: soft, fontSize: 26, fontWeight: 600, ...reveal(piped, 960) }}>→</span>
          <BlindPill on={piped} delay={1020}>Systemic Risk</BlindPill>
          <span style={{ color: soft, fontSize: 26, fontWeight: 600, ...reveal(piped, 1100) }}>→</span>
          <span style={reveal(piped, 1180, 'scale(0.85)')}>
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
      </div>
      <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 20, color: soft, lineHeight: 1.45, margin: 0, ...reveal(piped, 1300, 'none') }}>
        Sources: Yusof et al. (2025), <i>Journal of Engineering, Design and Technology</i>, study of 104 Malaysian
        homebuyers; National House Buyers Association (HBA) via iProperty Malaysia, 2021.
      </p>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 02b · The missing step (morph from the Problem Buyer's Journey pipeline)
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

const MissingStep: Page = () => {
  const live = useIsActivePage();
  return (
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
        <GapPill size={32} bg={green} color="#FFFFFF" borderColor={green} glow textStyle={anim(live, 'sf-fade', 340, 560)}>
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
};

// ---------------------------------------------------------------------------
// 03 · Why it matters (PDF Page 3: latent defects beyond 24-month DLP + connecting invisible dots)
// ---------------------------------------------------------------------------

const DotCase = ({ unit, issue, on, delay }: { unit: string; issue: string; on: boolean; delay: number }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 18px',
      borderRadius: 12,
      background: on ? orangeSoft : '#F4EFE9',
      border: `2px solid ${on ? '#C64A1F' : line}`,
      transition: `background 500ms ${EASE_OUT} ${delay}ms, border-color 500ms ${EASE_OUT} ${delay}ms`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          background: on ? '#C64A1F' : soft,
          transition: `background 400ms ${EASE_OUT} ${delay}ms`,
        }}
      />
      <span style={{ fontSize: 22, fontWeight: 700, color: ink }}>{issue}</span>
    </div>
    <span style={{ fontSize: 19, fontWeight: 700, color: on ? '#C64A1F' : muted }}>{unit}</span>
  </div>
);

const WhyItMatters: Page = () => {
  const { beat, cues } = useBeats(1);
  const focus = beat === 0 ? { x: PAD_X + 490, y: 310, s: 1.15 } : OVERVIEW;
  const connected = beat >= 1;
  return (
    <Frame
      eyebrow="02 · Why it matters"
      title="Incomplete defect records: consequences can last for years."
      bodyTop={276}
      focus={focus}
      mark="02"
      chapter={1}
    >
      {cues}
      <div style={{ display: 'flex', gap: 48, alignItems: 'stretch', height: 610 }}>
        <Card style={{ flex: 1.25, padding: '36px 42px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderColor: ink }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.12em', color: ink }}>
              REAL-WORLD SIGNAL · COURT OF APPEAL, 30 JAN 2026
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--osd-accent)', marginTop: 12, lineHeight: 1.28 }}>
              Sime Darby Property (Bukit Jelutong) Sdn Bhd v Ooi Cheng Huat &amp; Ors
            </div>
            <p style={{ fontSize: 25, lineHeight: 1.5, margin: '20px 0 0', color: ink }}>
              The Court of Appeal upheld the ruling that{' '}
              <span style={{ textDecoration: 'underline', textDecorationColor: '#C64A1F', textUnderlineOffset: 6, fontWeight: 700 }}>
                developers may remain liable for latent defects
              </span>{' '}
              even beyond the 24-month Defect Liability Period (DLP).
            </p>
            <p style={{ fontSize: 24, lineHeight: 1.5, margin: '16px 0 0', color: muted }}>
              The case involved water leakage, structural cracks, plumbing and electrical issues — highlighting the
              importance of proper defect rectification, evidence and long-term accountability.
            </p>
          </div>
          <div style={{ borderTop: `2px solid ${line}`, paddingTop: 22, marginTop: 22, ...reveal(connected, 150) }}>
            <div style={{ fontSize: 25, fontWeight: 800, color: 'var(--osd-accent)' }}>
              Simephony helps developers know the unknown.
            </div>
            <p style={{ fontSize: 23, lineHeight: 1.5, margin: '10px 0 0', color: muted }}>
              Behind every isolated complaint could be a bigger problem waiting to surface. Simephony connects the
              invisible dots across defect reports, repair outcomes and historical patterns to verify resolutions and
              prevent escalation.
            </p>
          </div>
        </Card>

        <div style={{ width: 610, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 20 }}>
          <Card style={{ padding: '26px 30px' }}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.12em', color: soft }}>LIABILITY HORIZON</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <div style={{ flex: 1, background: '#F4EFE9', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: ink }}>0–24 Months</div>
                <div style={{ fontSize: 18, color: muted, marginTop: 4 }}>Statutory DLP</div>
              </div>
              <Arrow color="#C64A1F" size={26} />
              <div style={{ flex: 1.15, background: orangeSoft, border: '2px solid #C64A1F', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#C64A1F' }}>Beyond 24 Months</div>
                <div style={{ fontSize: 18, color: ink, marginTop: 4 }}>Latent risk remains</div>
              </div>
            </div>
          </Card>

          <Card style={{ flex: 1, padding: '26px 30px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.12em', color: connected ? '#C64A1F' : soft }}>
                {connected ? 'DOTS CONNECTED EARLY' : 'SEPARATE TICKETS TODAY'}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: connected ? green : muted }}>
                {connected ? '● Pattern flagged' : '○ Unlinked'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              <DotCase unit="Unit A-12-08" issue="Water leakage · Ceiling" on={connected} delay={150} />
              <DotCase unit="Unit A-11-08" issue="Plumbing · Pipe joint" on={connected} delay={300} />
              <DotCase unit="Unit A-10-08" issue="Wall dampness · Riser" on={connected} delay={450} />
            </div>
            <div
              style={{
                marginTop: 16,
                background: ink,
                color: '#fff',
                borderRadius: 12,
                padding: '16px 20px',
                fontSize: 21,
                fontWeight: 700,
                lineHeight: 1.35,
                ...reveal(connected, 550),
              }}
            >
              Verified evidence + historical pattern = <span style={{ color: bright }}>long-term proof.</span>
            </div>
          </Card>
        </div>
      </div>
      <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 20, color: soft, margin: 0 }}>
        Source: Free Malaysia Today, 30 Jan 2026
      </p>
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
  <p style={{ fontSize: 25, lineHeight: 1.45, color: muted, margin: '18px 0 0', textAlign: 'center' }}>{children}</p>
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

/** The three-part motto. Same ids on Solution and How it works so chips glide and recolour. */
const Motto = ({ id, bg, color, children }: { id: string; bg: string; color: string; children: ReactNode }) => (
  <MorphElement id={id}>
    <div style={{ background: bg, color, fontSize: 27, fontWeight: 700, padding: '15px 32px', borderRadius: 12, whiteSpace: 'nowrap' }}>
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
      overlay={
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 16 }}>
          <span style={reveal(done, 180)}>
            <Motto id="motto-ai" bg={ink} color="#FFFFFF">AI recommends.</Motto>
          </span>
          <span style={reveal(done, 340)}>
            <Motto id="motto-people" bg={ink} color="#FFFFFF">Humans decide.</Motto>
          </span>
          <span style={reveal(done, 500)}>
            <Motto id="motto-system" bg={ink} color="#FFFFFF">The system records.</Motto>
          </span>
        </div>
      }
    >
      {cues}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 60 }}>
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, ...reveal(beat >= 0, 0, 'translateY(70px)') }}>
          <RoleLabel>BUYER</RoleLabel>
          <Phone src={appBuyer} alt="Buyer app: check and sign off screen" />
          <RoleCaption>Track repairs, verify fixes and stay informed throughout the process.</RoleCaption>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, ...reveal(beat >= 1, 0, 'translateY(70px)') }}>
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
          <RoleCaption>Monitor all cases, approvals and recurring defects with explainable AI recommendations.</RoleCaption>
        </div>
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, ...reveal(beat >= 2, 0, 'translateY(70px)') }}>
          <RoleLabel>TECHNICIAN</RoleLabel>
          <Phone src={appTechnician} alt="Technician app: case history" />
          <RoleCaption>Review unit history before arrival to deliver verified repairs.</RoleCaption>
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
    <div style={{ background: orangeSoft, border: '2px solid #E9B9A3', borderRadius: 16, padding: '20px 24px', height: 150, boxSizing: 'border-box', ...reveal(on, 180) }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>PEOPLE</div>
      <div style={{ fontSize: 25, lineHeight: 1.4, marginTop: 8 }}>{people}</div>
    </div>
    <div style={{ background: blueSoft, border: '2px solid #B8CBE6', borderRadius: 16, padding: '20px 24px', height: 170, boxSizing: 'border-box', ...reveal(on, 360) }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.12em', color: blue }}>AI AGENTS</div>
      <div style={{ fontSize: 25, lineHeight: 1.4, marginTop: 8 }}>{ai}</div>
    </div>
    <div style={{ fontSize: 21, fontWeight: 700, color: muted, letterSpacing: '0.06em', ...reveal(on, 520) }}>{status}</div>
  </div>
);

const STAGE_X = [318, 746, 1174, 1602];

const HowItWorks: Page = () => {
  const { beat, cues } = useBeats(4);
  const at = Math.min(beat, 3);
  const focus = beat < 4 ? { x: STAGE_X[beat], y: 322, s: 1.25 } : OVERVIEW;
  const tokenX = STAGE_X[at] - PAD_X;
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
          <Motto id="motto-ai" bg={blueSoft} color={blue}>AI recommends.</Motto>
          <Arrow />
          <Motto id="motto-people" bg={orangeSoft} color="#A63A14">Humans decide.</Motto>
          <Arrow />
          <Motto id="motto-system" bg="#ECE8E3" color={ink}>The system records.</Motto>
        </div>
      }
    >
      {cues}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 44, height: 60 }}>
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
      <div style={{ position: 'absolute', left: 0, right: 0, top: 118, display: 'flex', gap: 32 }}>
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
// 06 · Innovation (PDF Page 6: 4 updated pillars, 4-row comparison, L8–L13 stack map)
// ---------------------------------------------------------------------------

type Tone = 'base' | 'hit' | 'hot';

const Cell = ({ tone, on, delay }: { tone: Tone; on: boolean; delay: number }) => {
  const lit = tone !== 'base' && on;
  return (
    <div style={{ position: 'relative', width: 108, height: 50 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: '#EFE4D8' }} />
      {tone !== 'base' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 10,
            background: tone === 'hot' ? '#C64A1F' : '#F0A35E',
            color: '#fff',
            fontSize: 24,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: lit ? 1 : 0,
            transform: lit ? 'scale(1)' : 'scale(0.45)',
            transition: `opacity 300ms ${EASE_OUT} ${delay}ms, transform 560ms ${SPRING} ${delay}ms`,
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
  <div style={{ width: 108, fontSize: 21, color: muted, textAlign: 'center', fontWeight: 700 }}>{children}</div>
);

/** One floor of the stack. Leak cells light with the row's delay; the 3× cell waits for `hot`. */
const FloorRow = ({ floor, a, b, c, d, e, on, hot = false }: { floor: string; a: Tone; b: Tone; c: Tone; d: Tone; e: Tone; on: [boolean, number]; hot?: boolean }) => {
  const lit = (t: Tone) => (t === 'hot' ? hot : on[0]);
  const wait = (t: Tone) => (t === 'hot' ? 0 : on[1]);
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 64, fontSize: 21, color: muted, fontWeight: 700 }}>{floor}</div>
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

const Innovation: Page = () => {
  const { beat, cues } = useBeats(3);
  const arrived = useArrived();
  const focus = beat === 0 ? { x: 460, y: 270, s: 1.45 } : beat === 1 ? { x: 460, y: 370, s: 1.2 } : OVERVIEW;
  const leaks = arrived && beat >= 0;
  const hot = beat >= 1;
  return (
    <Frame
      eyebrow="05 · Innovation"
      title="What a normal ticket system can’t do"
      subtitle="From tracking complaints to detecting systemic risks."
      bodyTop={322}
      focus={focus}
      mark="05"
      chapter={3}
    >
      {cues}
      <div style={{ display: 'flex', gap: 60, height: '100%' }}>
        <Card style={{ width: 716, padding: '26px 32px', flexShrink: 0, height: 636 }}>
          <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '0.12em' }}>BLOCK A · STACK VIEW</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 64 }} />
              <GridLabel>06</GridLabel>
              <GridLabel>07</GridLabel>
              <GridLabel>08</GridLabel>
              <GridLabel>09</GridLabel>
              <GridLabel>10</GridLabel>
            </div>
            <FloorRow floor="L13" a="base" b="base" c="base" d="base" e="base" on={[leaks, 0]} />
            <FloorRow floor="L12" a="base" b="hit" c="hot" d="base" e="base" on={[leaks, 1350]} hot={hot} />
            <FloorRow floor="L11" a="base" b="base" c="hit" d="base" e="base" on={[leaks, 1000]} />
            <FloorRow floor="L10" a="base" b="base" c="hit" d="base" e="base" on={[leaks, 650]} />
            <FloorRow floor="L9" a="base" b="base" c="hit" d="base" e="base" on={[leaks, 300]} />
            <FloorRow floor="L8" a="base" b="base" c="base" d="base" e="base" on={[leaks, 0]} />
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 20, color: muted, marginTop: 16 }}>
            <span><b style={{ color: 'var(--osd-accent)' }}>■</b> 3 leaks in A-12-08</span>
            <span><b style={{ color: '#F0A35E' }}>■</b> related leaks nearby</span>
          </div>
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: ink,
              color: '#fff',
              borderRadius: 14,
              padding: '14px 20px',
              ...reveal(hot, 400, 'translateY(24px)'),
            }}
          >
            <Icon name="alert" color={bright} size={32} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Auto-escalated to SDP</div>
              <div style={{ fontSize: 19, opacity: 0.82, marginTop: 2 }}>3rd occurrence · 4 units in stack 08 · extra inspection proposed</div>
            </div>
          </div>
        </Card>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 636 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 36, rowGap: 20 }}>
            <Feature
              on={beat >= 2}
              delay={0}
              n="01"
              title="Similar-Defect Linking"
              body="Connects related defects across units, stacks and contractors to identify potential systemic issues."
            />
            <Feature
              on={beat >= 2}
              delay={130}
              n="02"
              title="Recurrence Detection"
              body="Triggers automatic escalation when recurring defects or multiple affected units meet defined thresholds."
            />
            <Feature
              on={beat >= 2}
              delay={260}
              n="03"
              title="Human-in-the-Loop"
              body="AI investigates and recommends. Humans approve verdicts, repair sign-offs and escalations."
            />
            <Feature
              on={beat >= 2}
              delay={390}
              n="04"
              title="Evidence & Guardrails"
              body="Maintains traceable records, detects duplicate repair photos and restricts unsafe AI responses."
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ border: `2px solid ${ink}`, borderRadius: 16, overflow: 'hidden', background: card, ...reveal(beat >= 3, 0, 'translateY(24px)') }}>
              <div style={{ display: 'flex', background: '#F2EBE3', borderBottom: `2px solid ${line}` }}>
                <div style={{ flex: 1, padding: '10px 20px', fontSize: 18, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--osd-accent)' }}>NORMAL SYSTEM</div>
                <div style={{ flex: 1, padding: '10px 20px', fontSize: 18, fontWeight: 800, letterSpacing: '0.1em', color: green, borderLeft: `2px solid ${line}` }}>SIMEPHONY</div>
              </div>
              <CompareRow on={beat >= 3} delay={80} left="3rd complaint = New ticket" right="3rd occurrence = Auto-escalation" />
              <CompareRow on={beat >= 3} delay={180} left="Contractor marks repaired = Closed" right="Failed verification = Case reopens" />
              <CompareRow on={beat >= 3} delay={280} left="30 days to identify pattern" right="< 24 hours to flag systemic issue" />
              <CompareRow on={beat >= 3} delay={380} left="Separate reports" right="Connected defect patterns" last />
            </div>
            <div
              style={{
                background: ink,
                color: '#fff',
                borderRadius: 12,
                padding: '13px 24px',
                textAlign: 'center',
                fontSize: 23,
                fontWeight: 700,
                ...reveal(beat >= 3, 480),
              }}
            >
              AI investigates. <span style={{ color: '#FBE3D3' }}>Rules enforce.</span> <span style={{ color: bright }}>Humans decide.</span>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 06b · Systemic stack example (NEW from PDF Page 7: 5-floor vertical leak trace)
// ---------------------------------------------------------------------------

const StackFloorTag = ({
  top,
  left,
  floor,
  label,
  linked,
  delay,
}: {
  top: number;
  left: number;
  floor: string;
  label: string;
  linked: boolean;
  delay: number;
}) => (
  <div
    style={{
      position: 'absolute',
      top,
      left,
      padding: '8px 14px',
      borderRadius: 10,
      background: linked ? orangeSoft : '#FFF8EE',
      border: `2px solid ${linked ? '#C64A1F' : '#E9B9A3'}`,
      boxShadow: '0 8px 18px -12px rgba(28,24,20,0.28)',
      transition: `background 420ms ${EASE_OUT} ${delay}ms, border-color 420ms ${EASE_OUT} ${delay}ms`,
    }}
  >
    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.08em', color: linked ? '#C64A1F' : amber }}>{floor}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: ink, whiteSpace: 'nowrap' }}>{label}</div>
  </div>
);

const StackExample: Page = () => {
  const { beat, cues } = useBeats(1);
  const linked = beat >= 1;
  const focus = beat === 0 ? { x: 1260, y: 352, s: 1.14 } : OVERVIEW;
  return (
    <Frame
      eyebrow="05b · Pattern in action"
      title="One stack leak explains why linking matters"
      bodyTop={276}
      focus={focus}
      mark="05"
      chapter={3}
    >
      {cues}
      <div style={{ display: 'flex', gap: 56, alignItems: 'stretch', height: 620 }}>
        <div style={{ width: 610, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Card style={{ padding: '32px 36px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>
              CROSS-UNIT TRACEABILITY
            </div>
            <p style={{ fontSize: 27, lineHeight: 1.5, color: ink, margin: '18px 0 0' }}>
              Three apartments in the same vertical stack report water leakage. A normal ticketing system sees three
              separate complaints.
            </p>
            <p style={{ fontSize: 26, lineHeight: 1.5, color: muted, margin: '20px 0 0' }}>
              Simephony connects them across floors and trades, detects the recurring pattern, and alerts the developer
              to investigate a potential systemic defect.
            </p>
          </Card>

          <div
            style={{
              background: ink,
              color: '#fff',
              borderRadius: 'var(--osd-radius)',
              padding: '28px 34px',
              ...reveal(linked, 250),
            }}
          >
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.12em', color: bright }}>WHY THIS MATTERS</div>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.45, marginTop: 10 }}>
              One vertical example demonstrates both <span style={{ color: '#FBE3D3' }}>Similar-Defect Linking</span>{' '}
              and <span style={{ color: bright }}>Recurrence Detection</span> without repairing symptoms floor by floor.
            </div>
          </div>
        </div>

        <Card style={{ flex: 1, padding: '26px 32px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: '0.1em', color: ink }}>
              VERTICAL STACK SECTION · FLOORS 1–5 + LOBBY
            </span>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                fontSize: 18,
                fontWeight: 800,
                background: linked ? '#C64A1F' : '#EFE4D8',
                color: linked ? '#fff' : muted,
                transition: `background 400ms ${EASE_OUT}`,
              }}
            >
              {linked ? 'Systemic Riser Alert · Stack 08' : '3 Isolated Complaints'}
            </span>
          </div>

          <div style={{ position: 'relative', height: 516, marginTop: 14 }}>
            <svg viewBox="0 0 920 530" style={{ width: '100%', height: '100%' }}>
              {/* Building cutaway shell */}
              <rect x="60" y="18" width="800" height="492" rx="14" fill="#F8F3EC" stroke={ink} strokeWidth="3" />
              {/* 6 horizontal levels (L5 down to Ground Lobby) */}
              <line x1="60" y1="100" x2="860" y2="100" stroke={line} strokeWidth="2.5" />
              <line x1="60" y1="182" x2="860" y2="182" stroke={line} strokeWidth="2.5" />
              <line x1="60" y1="264" x2="860" y2="264" stroke={line} strokeWidth="2.5" />
              <line x1="60" y1="346" x2="860" y2="346" stroke={line} strokeWidth="2.5" />
              <line x1="60" y1="428" x2="860" y2="428" stroke={line} strokeWidth="2.5" />

              {/* Left & right vertical apartment columns */}
              <line x1="330" y1="18" x2="330" y2="428" stroke={line} strokeWidth="2.5" />
              <line x1="600" y1="18" x2="600" y2="510" stroke={line} strokeWidth="2.5" />

              {/* Highlighted affected stack shaft */}
              <rect
                x="336"
                y="24"
                width="258"
                height="480"
                rx="10"
                fill={linked ? 'rgba(198,74,31,0.08)' : 'rgba(227,215,202,0.22)'}
                stroke={linked ? '#C64A1F' : 'transparent'}
                strokeWidth="3"
                strokeDasharray="10 8"
                style={{ transition: `fill 500ms ${EASE_OUT}, stroke 500ms ${EASE_OUT}` }}
              />

              {/* Floor labels */}
              <text x="84" y="66" fontSize="18" fontWeight="800" fill={muted}>FLOOR 5</text>
              <text x="84" y="148" fontSize="18" fontWeight="800" fill={muted}>FLOOR 4</text>
              <text x="84" y="230" fontSize="18" fontWeight="800" fill={muted}>FLOOR 3</text>
              <text x="84" y="312" fontSize="18" fontWeight="800" fill={muted}>FLOOR 2</text>
              <text x="84" y="394" fontSize="18" fontWeight="800" fill={muted}>FLOOR 1</text>
              <text x="84" y="476" fontSize="18" fontWeight="800" fill={muted}>LOBBY</text>

              {/* Water leak origin spots on F5, F4, F3 */}
              <circle cx="465" cy="76" r="14" fill="#E06D3B" />
              <circle cx="420" cy="156" r="14" fill="#E06D3B" />
              <circle cx="510" cy="236" r="14" fill="#E06D3B" />

              {/* Animated cascading water path when linked */}
              <path
                d="M465 76 C 465 112, 420 120, 420 156 C 420 198, 510 198, 510 236 C 510 290, 465 292, 465 340 L 465 468"
                fill="none"
                stroke="#24589E"
                strokeWidth="6"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={linked ? 0 : 1}
                style={{ transition: `stroke-dashoffset 1100ms ${CAM_EASE} 120ms` }}
              />
              {/* Downward pool in Lobby */}
              <ellipse
                cx="465"
                cy="474"
                rx="64"
                ry="14"
                fill="rgba(36,88,158,0.22)"
                opacity={linked ? 1 : 0}
                style={{ transition: `opacity 500ms ${EASE_OUT} 850ms` }}
              />
            </svg>

            <StackFloorTag top={24} left={622} floor="TICKET #1 · FLOOR 5" label="Kitchen pipe leak" linked={linked} delay={120} />
            <StackFloorTag top={110} left={120} floor="TICKET #2 · FLOOR 4" label="Laundry ceiling drip" linked={linked} delay={240} />
            <StackFloorTag top={196} left={622} floor="TICKET #3 · FLOOR 3" label="Bathroom wall dampness" linked={linked} delay={360} />

            <div
              style={{
                position: 'absolute',
                left: 622,
                top: 316,
                width: 268,
                padding: '14px 16px',
                borderRadius: 12,
                background: blueSoft,
                border: `2px solid ${blue}`,
                ...reveal(linked, 650),
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.08em', color: blue }}>SIMEPHONY DETECTION</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: ink, marginTop: 4, lineHeight: 1.35 }}>
                Shared riser path flagged → 1 root-cause inspection instead of 5 repeat visits.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 07 · Impact (PDF Page 8: updated copy, camera visits each card)
// ---------------------------------------------------------------------------

const ImpactCard = ({ n, icon, title, on, children }: { n: string; icon: 'camera' | 'link' | 'alert'; title: string; on: boolean; children: ReactNode }) => (
  <div style={{ flex: 1, display: 'flex', ...reveal(on, 0, 'translateY(60px) scale(0.96)') }}>
    <Card style={{ flex: 1, padding: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 70, height: 70, borderRadius: 20, background: orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={38} />
        </div>
        <span style={{ fontSize: 44, fontWeight: 900, color: '#EADFD3' }}>{n}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, marginTop: 20 }}>{title}</div>
      <ul style={{ fontSize: 24, lineHeight: 1.45, color: muted, margin: '14px 0 0', paddingLeft: 26 }}>{children}</ul>
    </Card>
  </div>
);

const ValueTile = ({ who, what, on, delay }: { who: string; what: string; on: boolean; delay: number }) => (
  <div style={{ flex: 1, padding: '0 32px', ...reveal(on, delay) }}>
    <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--osd-accent)' }}>{who}</div>
    <div style={{ fontSize: 26, fontWeight: 600, marginTop: 8, lineHeight: 1.35 }}>{what}</div>
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
      bodyTop={332}
      focus={focus}
      mark="06"
      chapter={4}
    >
      {cues}
      <div style={{ display: 'flex', gap: 32 }}>
        <ImpactCard on={beat >= 0} n="01" icon="camera" title="Verify actual resolution">
          <li style={{ marginBottom: 8 }}>AI compares the repair photo with the original and flags any mismatch for SDP</li>
          <li style={{ marginBottom: 8 }}>Closes only after SDP and the buyer both sign off</li>
          <li>Unresolved defects stay visible</li>
        </ImpactCard>
        <ImpactCard on={beat >= 1} n="02" icon="link" title="Connect the pattern">
          <li style={{ marginBottom: 10 }}>Connect related cases across units, floors, stacks and repair histories</li>
          <li>A returning defect counts as a recurrence, not a new ticket</li>
        </ImpactCard>
        <ImpactCard on={beat >= 2} n="03" icon="alert" title="Escalate early">
          <li style={{ marginBottom: 10 }}>Repeated occurrence or units with defects in a stack → flagged as systemic</li>
          <li>Route suspected systemic issues for Sime Darby Property approval before arranging an extra inspection</li>
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
          padding: '26px 0',
          ...reveal(done, 0, 'translateY(34px)'),
        }}
      >
        <div style={{ padding: '0 40px', fontSize: 30, fontWeight: 800, color: bright }}>Values</div>
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
      background: tone === 'dark' ? ink : tone === 'warm' ? orangeSoft : card,
      color: tone === 'dark' ? '#fff' : ink,
      border: tone === 'dark' ? `2px solid ${ink}` : tone === 'warm' ? '2px solid #E9B9A3' : `2px solid ${line}`,
      opacity: state === 'off' ? 0.3 : 1,
      transform: state === 'active' ? 'translateY(-8px) scale(1.03)' : 'none',
      boxShadow: state === 'active' ? '0 26px 46px -22px rgba(198,74,31,0.52)' : '0 18px 40px -26px rgba(28,24,20,0.2)',
      transition: `opacity 440ms ${EASE_OUT}, transform 650ms ${SPRING}, box-shadow 440ms`,
    }}
  >
    <Icon name={icon} color={tone === 'dark' ? bright : '#C64A1F'} size={34} />
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
    <ul style={{ fontSize: 22, lineHeight: 1.45, color: muted, margin: '14px 0 0', paddingLeft: 26 }}>{children}</ul>
  </div>
);

const Feasibility: Page = () => {
  const { beat, cues } = useBeats(4);
  const at = Math.min(beat, 3);
  const st = (i: number): 'off' | 'active' | 'done' => (beat >= 4 ? 'done' : i === at ? 'active' : i < at ? 'done' : 'off');
  return (
    <Frame eyebrow="07 · Feasibility" title="How it fits alongside SDP’s systems" mark="07" chapter={5}>
      {cues}
      <div style={{ position: 'relative', height: 284 }}>
        <ArchBox x={ARCH_X[0]} icon="link" state={st(0)} tone="light" title="Core Data & Storage" body="SQLite, photo uploads and a full event log as the audit trail" />
        <ArchArrow x={288} on={at >= 1} />
        <ArchBox x={ARCH_X[1]} icon="plug" state={st(1)} tone="warm" title="Backend & FastMCP Tools" body="Business rules, bookings and case statuses in one rules layer" />
        <ArchArrow x={616} on={at >= 2} />
        <ArchBox x={ARCH_X[2]} icon="shield" state={st(2)} tone="dark" title="Simephony AI Agents" body="Intake · Similar Defect · Triage · Booking · Repair Estimate · Verification · Recurrence · Brief · Comms" />
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
            background: ink,
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 22px 44px -22px rgba(28,24,20,0.45)',
            opacity: beat >= 3 ? 1 : 0.35,
            transition: `opacity 500ms ${EASE_OUT}`,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, color: bright, lineHeight: 1.2 }}>
            Human accountability stays built in.
          </div>
          <div style={{ fontSize: 19, lineHeight: 1.4, color: 'rgba(255,255,255,0.9)' }}>
            <span style={{ color: '#6EE7B7', fontWeight: 800 }}>✓</span> Technicians record technical verdicts
          </div>
          <div style={{ fontSize: 19, lineHeight: 1.4, color: 'rgba(255,255,255,0.9)' }}>
            <span style={{ color: '#6EE7B7', fontWeight: 800 }}>✓</span> SDP approves extra inspections
          </div>
          <div style={{ fontSize: 19, lineHeight: 1.4, color: 'rgba(255,255,255,0.9)' }}>
            <span style={{ color: '#6EE7B7', fontWeight: 800 }}>✓</span> Backend enforces statuses &amp; permissions
          </div>
        </div>

        {/* Travelling data packet across the 4 system boxes */}
        <div style={{ position: 'absolute', left: 144, width: 984, top: 256, height: 4, background: line, borderRadius: 2 }} />
        <div
          style={{
            position: 'absolute',
            left: ARCH_X[at] + 144 - 13,
            top: 245,
            width: 26,
            height: 26,
            borderRadius: 13,
            background: '#C64A1F',
            boxShadow: '0 0 0 8px rgba(198,74,31,0.18), 0 0 26px rgba(198,74,31,0.55)',
            transition: `left 850ms ${CAM_EASE}`,
            opacity: beat >= 4 ? 0 : 1,
          }}
        />
      </div>

      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.12em', color: ink, marginTop: 14, ...reveal(beat >= 4, 0) }}>
        WHY IT’S FEASIBLE
      </div>
      <div style={{ display: 'flex', gap: 48, marginTop: 18 }}>
        <WhyCol on={beat >= 4} delay={60} n="01" title="Built on an achievable technology stack">
          <li style={{ marginBottom: 8 }}>Prototype: LangGraph, FastAPI / FastMCP, Next.js, SQLite. Local Ollama (Qwen2.5, LLaVA) or cloud Gemini via config.</li>
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
          ...reveal(on, 160),
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

const RoadSegment = ({ d, on }: { d: string; on: boolean }) => (
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
      style={{ transition: `stroke-dashoffset ${CAM_MS}ms ${CAM_EASE}` }}
    />
  </>
);

const Scalability: Page = () => {
  const { beat, cues } = useBeats(5);
  const at = Math.min(beat, 4);
  const focus = beat < 5 ? { x: PAD_X + NODE_X[beat], y: beat % 2 === 0 ? 190 : 485, s: 1.44 } : OVERVIEW;
  return (
    <Frame eyebrow="08 · Scalability & implementation" title="Prove on one handover phase, then scale across townships" focus={focus} mark="08" chapter={6}>
      {cues}
      <svg viewBox="0 0 1680 690" style={{ position: 'absolute', left: 0, top: 0, width: 1680, height: 690, pointerEvents: 'none' }}>
        <RoadSegment d="M 148 308 C 285 308, 359 378, 496 378" on={at >= 1} />
        <RoadSegment d="M 496 378 C 633 378, 707 308, 844 308" on={at >= 2} />
        <RoadSegment d="M 844 308 C 981 308, 1055 378, 1192 378" on={at >= 3} />
        <RoadSegment d="M 1192 378 C 1329 378, 1395 308, 1532 308" on={at >= 4} />
      </svg>

      <WindingPhase
        n="0"
        x={NODE_X[0]}
        y={NODE_Y[0]}
        above
        here
        on={beat >= 0}
        current={at === 0 && beat < 5}
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
        current={at === 1 && beat < 5}
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
        current={at === 2 && beat < 5}
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
        current={at === 3 && beat < 5}
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
        current={at === 4 && beat < 5}
        name="Portfolio Expansion"
        when="Year 2+"
        body="Extends to SDP’s Investment & Asset Management portfolio (retail malls, KL East, industrial) post-DLP."
        checks={['Recurring-income property workflows']}
      />
    </Frame>
  );
};

// ---------------------------------------------------------------------------
// 09b · Built to scale (NEW from PDF Page 11: one engine, multiple developments)
// ---------------------------------------------------------------------------

const DevNode = ({ x, y, label, kind, on, delay }: { x: number; y: number; label: string; kind: string; on: boolean; delay: number }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: 210,
      padding: '12px 16px',
      borderRadius: 14,
      background: card,
      border: `2px solid ${on ? '#C64A1F' : line}`,
      boxShadow: '0 14px 28px -18px rgba(28,24,20,0.22)',
      textAlign: 'center',
      ...reveal(on, delay, 'scale(0.92)'),
    }}
  >
    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--osd-accent)' }}>{kind}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: ink, marginTop: 4 }}>{label}</div>
  </div>
);

const PropertyRow = ({ name, badge, on, delay }: { name: string; badge: string; on: boolean; delay: number }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 20px',
      borderRadius: 12,
      background: '#F7F2EC',
      border: `2px solid ${line}`,
      ...reveal(on, delay),
    }}
  >
    <span style={{ fontSize: 23, fontWeight: 800, color: ink }}>{name}</span>
    <span style={{ fontSize: 18, fontWeight: 700, padding: '6px 14px', borderRadius: 999, background: blueSoft, color: blue }}>
      {badge}
    </span>
  </div>
);

const ScaleArchitecture: Page = () => {
  const { beat, cues } = useBeats(1);
  const arrived = useArrived();
  const expanded = beat >= 1;
  return (
    <Frame
      eyebrow="08b · Built to scale"
      title="One engine, multiple developments"
      mark="08"
      chapter={6}
    >
      {cues}
      <div style={{ display: 'flex', gap: 56, alignItems: 'stretch', height: 636 }}>
        <Card style={{ width: 820, flexShrink: 0, position: 'relative', padding: 28 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.12em', color: soft }}>
            MULTI-PROPERTY ORCHESTRATION
          </div>
          <div style={{ position: 'relative', height: 540, marginTop: 14 }}>
            <svg viewBox="0 0 760 540" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              {/* Spokes from central hub (380, 270) */}
              <path d="M380 270 L165 100" stroke={expanded ? '#C64A1F' : line} strokeWidth="3.5" strokeDasharray="7 6" style={{ transition: 'stroke 450ms' }} />
              <path d="M380 270 L595 100" stroke={expanded ? '#24589E' : line} strokeWidth="3.5" strokeDasharray="7 6" style={{ transition: 'stroke 450ms' }} />
              <path d="M380 270 L145 270" stroke={expanded ? '#2E7D4F' : line} strokeWidth="3.5" strokeDasharray="7 6" style={{ transition: 'stroke 450ms' }} />
              <path d="M380 270 L615 270" stroke={expanded ? '#C64A1F' : line} strokeWidth="3.5" strokeDasharray="7 6" style={{ transition: 'stroke 450ms' }} />
              <path d="M380 270 L165 440" stroke={expanded ? '#24589E' : line} strokeWidth="3.5" strokeDasharray="7 6" style={{ transition: 'stroke 450ms' }} />
              <path d="M380 270 L595 440" stroke={expanded ? '#2E7D4F' : line} strokeWidth="3.5" strokeDasharray="7 6" style={{ transition: 'stroke 450ms' }} />
            </svg>

            {/* Central Core Hub */}
            <div
              style={{
                position: 'absolute',
                left: 250,
                top: 194,
                width: 260,
                height: 152,
                borderRadius: 22,
                background: ink,
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '0 20px',
                boxSizing: 'border-box',
                boxShadow: '0 24px 50px -18px rgba(28,24,20,0.55)',
                ...reveal(arrived, 0, 'scale(0.92)'),
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.14em', color: bright }}>CORE ENGINE</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>Simephony</div>
              <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>Rules + Modular Agents</div>
            </div>

            <DevNode x={45} y={40} kind="HIGH-RISE" label="Jendela Residences" on={arrived} delay={120} />
            <DevNode x={505} y={40} kind="TOWNSHIP" label="City of Elmina" on={arrived} delay={220} />
            <DevNode x={10} y={226} kind="LANDED" label="Ara Damansara" on={arrived} delay={320} />
            <DevNode x={540} y={226} kind="RETAIL / IAM" label="KL East Mall" on={arrived} delay={420} />
            <DevNode x={45} y={412} kind="INDUSTRIAL" label="Elmina Business Park" on={arrived} delay={520} />
            <DevNode x={505} y={412} kind="MIXED-USE" label="New Handover Phases" on={arrived} delay={620} />
          </div>
        </Card>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <Card style={{ flex: 1, padding: '26px 28px', ...reveal(expanded, 80) }}>
              <Icon name="layers" color="#C64A1F" size={34} />
              <div style={{ fontSize: 25, fontWeight: 800, marginTop: 12 }}>Configurable Rules</div>
              <div style={{ fontSize: 21, lineHeight: 1.45, color: muted, marginTop: 8 }}>
                Adapt defect categories, escalation thresholds and workflows through <code>rules.yaml</code>.
              </div>
            </Card>
            <Card style={{ flex: 1, padding: '26px 28px', ...reveal(expanded, 220) }}>
              <Icon name="plug" color={blue} size={34} />
              <div style={{ fontSize: 25, fontWeight: 800, marginTop: 12 }}>Modular Agents</div>
              <div style={{ fontSize: 21, lineHeight: 1.45, color: muted, marginTop: 8 }}>
                Extend the workflow cleanly with trade-specific agents and CCC / Procore integrations.
              </div>
            </Card>
          </div>

          <Card style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.12em', color: soft }}>
              SAME CORE ENGINE · DIFFERENT PROPERTY REQUIREMENTS
            </div>
            <PropertyRow name="Jendela Residences" badge="High-rise" on={expanded} delay={300} />
            <PropertyRow name="City of Elmina" badge="Landed" on={expanded} delay={420} />
            <PropertyRow name="Industrial Developments" badge="Industrial" on={expanded} delay={540} />
          </Card>
        </div>
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
        <p style={{ fontSize: 25, margin: '52px 0 0', color: 'rgba(255,255,255,0.62)', ...anim(live, 'sf-fade', 700, 1500) }}>Group We Hit Token Limit · Questions welcome</p>
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
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.16em', color: bright }}>FOR Q&amp;A</div>
      <h1 style={{ fontSize: 140, fontWeight: 800, letterSpacing: '-0.03em', margin: '20px 0 0', lineHeight: 1 }}>Appendix</h1>
    </div>
    <div style={{ position: 'absolute', left: 1000, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
      <AppendixRow k="A" label="Testimonials &amp; homeowner voices" />
      <AppendixRow k="B" label="Value-added model &amp; sources" />
      <AppendixRow k="C" label="The agents and their jobs" />
      <AppendixRow k="D" label="Target users" />
      <AppendixRow k="E" label="AI justification, AIGE &amp; NIST risks" />
      <AppendixRow k="F" label="Risks and mitigation" />
      <AppendixRow k="G" label="Future enhancements" />
      <AppendixRow k="H" label="Meet the team &amp; workflow" />
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
  <div style={{ background: ink, color: '#fff', borderRadius: 16, padding: '20px 26px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
    <div style={{ fontSize: 44, fontWeight: 900, color: bright, lineHeight: 1.05 }}>{metric}</div>
    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{label}</div>
    <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.74)', marginTop: 4, lineHeight: 1.35 }}>{sub}</div>
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
      <div style={{ display: 'flex', gap: 28, height: 486 }}>
        <div style={{ width: 470, display: 'flex', flexDirection: 'column', gap: 16, ...reveal(arrived, 60) }}>
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

      <div style={{ marginTop: 22, background: ink, color: '#fff', borderRadius: 14, padding: '15px 28px', textAlign: 'center', fontSize: 25, fontWeight: 800, ...reveal(arrived, 400) }}>
        AI handles the repetitive work. <span style={{ color: bright }}>People make the decisions.</span>
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
          <CycleStep n="1" color="#C64A1F" title="Hand over a phase" body="Every new unit enters Simephony on day one." />
          <CycleStep n="2" color="#C64A1F" title="Verify repairs (24-month DLP)" body="Buyer-verified repairs cut repeat visits, disputes and rework." />
          <CycleStep n="3" color={ink} title="Build trust and data" body="Every verified case sharpens recurrence detection." />
          <CycleStep n="4" color={blue} title="Paid plans after the DLP" body="Homes, strata buildings and SDP assets move onto recurring plans." />
          <CycleStep n="5" color={ink} title="Better next phase" body="Recurrence patterns improve designs and contractor choice, then the loop repeats." />
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
        <Stream k="A" color="#C64A1F" title="Fewer repeat visits" body="Repeat visits avoided × RM350, plus admin hours saved" value="RM669k" />
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

const SourceLine = ({ label, refs }: { label: string; refs: string }) => (
  <li style={{ marginBottom: 10 }}>
    <b style={{ color: ink }}>{label}:</b> <span style={{ color: muted }}>{refs}</span>
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
          <SourceLine label="Home-care subscriptions" refs="Handibee (FMT) · PRISM+ Care" />
          <SourceLine label="Strata & defect platforms" refs="SpeedHome · Bernama · MHub · ProFix" />
        </ul>
      </Card>
    </div>
    <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 20, color: soft, lineHeight: 1.45, margin: 0 }}>
      Illustrative model baselines (internal estimates): 45–60 min manual handling per case, ~25k input / 5k output tokens per case, RM350 per visit, RM30/month Home Care plan, and projected RM stream totals.
    </p>
  </Frame>
);

// ---------------------------------------------------------------------------
// C · Agents (PDF Page 19: 5 steps + horizontal Comms Agent bar + 4 Human Checkpoints)
// ---------------------------------------------------------------------------

const AgentCard = ({ step, name, body }: { step: string; name: string; body: string }) => (
  <Card style={{ flex: 1, padding: '24px 24px', height: 274 }}>
    <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--osd-accent)' }}>{step}</div>
    <div style={{ fontSize: 26, fontWeight: 800, marginTop: 10, lineHeight: 1.2 }}>{name}</div>
    <div style={{ fontSize: 21, lineHeight: 1.42, color: muted, marginTop: 12 }}>{body}</div>
  </Card>
);

const Chevron = () => <div style={{ alignSelf: 'center', fontSize: 28, fontWeight: 800, color: '#D9C9B8' }}>›</div>;

const Checkpoint = ({ children, dim }: { children: ReactNode; dim?: boolean }) => (
  <div style={{ flex: 1, borderRadius: 16, padding: '20px 22px', background: dim ? '#ECE5DD' : blueSoft, fontSize: 21, lineHeight: 1.4, color: dim ? muted : '#1C3F70' }}>
    {children}
  </div>
);

const Agents: Page = () => (
  <Frame eyebrow="Appendix C · Agents & functions" title="Five agent steps with humans in the loop" mark="C">
    <div style={{ display: 'flex', gap: 10 }}>
      <AgentCard step="1 · UNDERSTAND" name="Intake Agent" body="Turns a photo and message (English, BM or Manglish) into a structured case." />
      <Chevron />
      <AgentCard step="2 · INVESTIGATE" name="Similar-Defect Agent" body="Searches unit, floor, stack and contractor history for related cases." />
      <Chevron />
      <AgentCard step="3 · ACT" name="Triage · Booking · Repair Estimate" body="Sets urgency, auto-books the earliest qualified technician and estimates repair duration." />
      <Chevron />
      <AgentCard step="4 · VERIFY" name="Verification Agent" body="Checks the repair photo, then gives the buyer a safe checklist. Fail → the same case reopens." />
      <Chevron />
      <AgentCard step="5 · LEARN" name="Recurrence + Inspection Brief" body="3rd occurrence or 3+ units in one stack → flags it to Sime Darby Property." />
    </div>
    <Card style={{ marginTop: 20, padding: '18px 28px', display: 'flex', alignItems: 'center', gap: 28 }}>
      <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--osd-accent)', whiteSpace: 'nowrap' }}>
        INFORM
      </span>
      <span style={{ fontSize: 24, fontWeight: 800, color: ink, whiteSpace: 'nowrap' }}>Comms Agent</span>
      <span style={{ fontSize: 22, color: muted }}>Sends guardrailed updates to the buyer and technician at every step.</span>
    </Card>
    <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '0.12em', color: blue, marginTop: 28 }}>HUMAN CHECKPOINTS</div>
    <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
      <Checkpoint dim>Every agent step and email is logged to the case’s audit trail.</Checkpoint>
      <Checkpoint><b>Technician</b> records VALID or INVALID. The AI can’t.</Checkpoint>
      <Checkpoint><b>Developer</b> approves the repair, then the <b>buyer</b> checks and signs off the unit.</Checkpoint>
      <Checkpoint><b>Developer</b> approves an extra inspection → AI brief for the technician.</Checkpoint>
    </div>
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
  <Frame eyebrow="Appendix D · Target users" title="We see the user’s frustration" mark="D">
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

const AigeCol = ({ name, impl, shade }: { name: string; impl: string; shade?: boolean }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: `2px solid ${line}`, background: shade ? '#F6F0E9' : card }}>
    <div style={{ padding: '16px 14px', fontSize: 19, fontWeight: 800, color: ink, borderBottom: `2px solid ${line}`, textAlign: 'center', minHeight: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {name}
    </div>
    <div style={{ padding: '20px 14px', fontSize: 20, lineHeight: 1.4, color: muted, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {impl}
    </div>
  </div>
);

const AiAigeSummary: Page = () => (
  <Frame
    eyebrow="Appendix E · AI Governance & Ethics (AIGE)"
    title="AI with boundaries. Humans with accountability."
    subtitle="Designed around Malaysia’s National Guidelines on AI Governance and Ethics (AIGE)."
    bodyTop={332}
    mark="E"
  >
    <div style={{ display: 'flex', gap: 32 }}>
      <Card style={{ flex: 1, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Icon name="alert" color="#C64A1F" size={32} />
          <div style={{ fontSize: 26, fontWeight: 800 }}>AI Risks</div>
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.45, color: muted, marginTop: 10 }}>
          Misclassification, photo errors, unsafe messages and model failure.
        </div>
      </Card>
      <Card style={{ flex: 1, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Icon name="shield" color={green} size={32} />
          <div style={{ fontSize: 26, fontWeight: 800 }}>Mitigation</div>
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.45, color: muted, marginTop: 10 }}>
          Rules, guardrails, local processing, testing and fallback mechanisms.
        </div>
      </Card>
      <Card style={{ flex: 1, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Icon name="layers" color={blue} size={32} />
          <div style={{ fontSize: 26, fontWeight: 800 }}>Human Oversight</div>
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.45, color: muted, marginTop: 10 }}>
          Technicians, SDP staff and buyers retain final authority.
        </div>
      </Card>
    </div>

    <div style={{ display: 'flex', gap: 40, marginTop: 22, alignItems: 'center' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ padding: '6px 18px', borderRadius: 999, background: greenSoft, color: green, fontSize: 20, fontWeight: 800 }}>
          ● Covered
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: ink }}>
          Reliability · Privacy · Transparency · Accountability
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ padding: '6px 18px', borderRadius: 999, background: '#FDE8E8', color: '#A63A14', fontSize: 20, fontWeight: 800 }}>
          ◐ Partly covered
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: ink }}>
          Fairness · Inclusivity · Human Benefit
        </span>
      </div>
    </div>

    <div style={{ display: 'flex', marginTop: 22, border: `2px solid ${ink}`, borderRadius: 16, overflow: 'hidden', height: 274 }}>
      <AigeCol name="Fairness" impl="Consistent rules; Malay / Manglish support" />
      <AigeCol shade name="Reliability & Safety" impl="AI guardrails; rule-based fallback" />
      <AigeCol name="Privacy & Security" impl="Local processing; PII masking" />
      <AigeCol shade name="Inclusivity" impl="Accessible interface; multilingual support" />
      <AigeCol name="Transparency" impl="AI reasoning and decision traces" />
      <AigeCol shade name="Accountability" impl="Human approval for critical decisions" />
      <AigeCol name="Human Benefit" impl="Early detection; fewer repeat repairs" />
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
    eyebrow="Appendix E · AIGE code-level audit"
    title="Checked against all seven AIGE principles"
    subtitle="National Guidelines on AI Governance and Ethics (MOSTI, Sept 2024), checked against our code on 9 Nov 2026."
    bodyTop={340}
    mark="E"
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Principle name="Fairness" s="partly" how="Same urgency, repair and escalation rules for every case. Malay and Manglish are read too. Accuracy per language not measured yet." />
      <Principle shade name="Reliability, safety and control" s="covered" how="Tests on the real models, timeouts (45 s text, 90 s photos), rule fallback, guardrails on urgency and messages." />
      <Principle name="Privacy and data security" s="partly" how="Local Ollama models + PII masking before cloud calls. Photo EXIF stripping and production auth remain next." />
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
// F · Risks and mitigation (PDF Page 22)
// ---------------------------------------------------------------------------

const MitRow = ({ risk, fix, shade }: { risk: string; fix: string; shade?: boolean }) => (
  <div style={{ display: 'flex', fontSize: 22, lineHeight: 1.4, background: shade ? '#F6F0E9' : 'transparent' }}>
    <div style={{ width: 540, padding: '14px 18px', fontWeight: 700 }}>{risk}</div>
    <div style={{ flex: 1, padding: '14px 18px', color: muted }}>{fix}</div>
  </div>
);

const Risks: Page = () => (
  <Frame eyebrow="Appendix F · Risk and mitigation" title="Risks and how we handle them" mark="F">
    <div style={{ borderTop: `3px solid ${ink}` }}>
      <div style={{ display: 'flex', borderBottom: `2px solid ${line}` }}>
        <TH w={540}>RISK</TH>
        <TH>MITIGATION</TH>
      </div>
      <MitRow risk="AI picks the wrong category or urgency" fix="AI only recommends; technicians record every verdict; unclear reports trigger a follow-up question, and low-confidence results are held for SDP review." />
      <MitRow shade risk="An AI message admits liability or gives unsafe advice" fix="Guardrail checks every buyer message and email, with a safe template as fallback." />
      <MitRow risk="A buyer’s verification is wrong or disputed" fix="SDP approves every repair first, and the AI flags repair photos that don’t match the original. Reopening needs a new photo within grace period." />
      <MitRow shade risk="False “systemic issue” alerts" fix="Thresholds are configurable. SDP sees the evidence (reasons and stack map) and approves before any extra inspection." />
      <MitRow risk="Integration with SDP’s systems" fix="Middleware through APIs and MCP tools; the shadow pilot runs beside the Command & Contact Centre first." />
      <MitRow shade risk="Model outages or rate limits" fix="Retry with backoff, then rule-based fallback or a hold for SDP review. Cloud and local models are interchangeable through config." />
      <MitRow risk="Privacy of photos from inside homes (PDPA)" fix="The default local model keeps photos on SDP’s own infrastructure. With a cloud model, names, contact details and unit numbers are masked first." />
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
  <Frame eyebrow="Appendix G · Future enhancement" title="What’s next for Simephony" mark="G">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: 616 }}>
      <div style={{ display: 'flex', gap: 24, flex: 1 }}>
        <FutureCard n="01" icon="calendar" title="Integrated Technician Calendar">
          <li>Built-in calendar for technicians to manage appointments, track assigned jobs and avoid scheduling conflicts.</li>
        </FutureCard>
        <FutureCard n="02" icon="map" title="Interactive Floor Plan">
          <li>Display building floor plans with defect locations marked, allowing users and SDP staff to visualise where each issue occurs.</li>
        </FutureCard>
        <FutureCard n="03" icon="chat" title="Centralised Communication">
          <li>Introduce an in-app chat for buyers, developers and technicians/contractors to communicate, share updates and provide additional instructions.</li>
        </FutureCard>
      </div>
      <div style={{ display: 'flex', gap: 24, flex: 1 }}>
        <FutureCard n="04" icon="chart" title="AI-Powered Quality Insights">
          <li style={{ marginBottom: 6 }}>Generate reports from historical defect data to identify recurring construction issues and contractor performance patterns.</li>
          <li>Use these insights to improve future inspection checklists, construction quality reviews and contractor evaluations.</li>
        </FutureCard>
        <FutureCard n="05" icon="camera" title="Real-Time AI Photo Guidance">
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
      <Member name="PHOEBE ANGELINA SURIN" role="Team Leader · Frontend Developer">
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
AppendixDivider.transition = settle;

// Main pitch pages morph into each other (chapter marker, pipeline, motto chips glide continuously).
Problem.transition = morphCut;
MissingStep.transition = morphCut;
WhyItMatters.transition = morphCut;
Solution.transition = morphCut;
HowItWorks.transition = morphCut;
Innovation.transition = morphCut;
StackExample.transition = morphCut;
Impact.transition = morphCut;
Feasibility.transition = morphCut;
Scalability.transition = morphCut;
ScaleArchitecture.transition = morphCut;

export const meta: SlideMeta = {
  title: 'Simephony · Final pitch',
  createdAt: '2026-11-10T14:48:36.194Z',
  theme: 'heritage-editorial',
};

export const notes: (string | undefined)[] = [
  'Open with the hook: closing a ticket is not the same as fixing the root cause. Introduce Simephony as an agentic resolution layer across buyers, SDP, and contractors.',
  'Walk through the four Malaysian homebuyer pain stats one click at a time, then pull back to reveal both sides of the gap: the Buyer’s Journey and the Developer’s Blindspot.',
  'Pause as the pipeline morphs into Verified: click once to show our three proof pillars — Photo-checked, Signed off, and Watched.',
  'Highlight the Jan 2026 Court of Appeal ruling: latent defect liability extends beyond the 24-month DLP. Click to show how Simephony connects invisible dots early.',
  'Tour the three role views (Buyer, SDP Console, Technician), then pull back to lock in the motto: AI recommends, Humans decide, The system records.',
  'Follow the Ceiling leak · A-12-08 ticket across all four stages while the motto chips move into place below.',
  'Let the stack map light up floor by floor, click to escalate A-12-08 (3×), then reveal the four core innovations and the 4-row comparison table.',
  'Concrete example: three separate leaks in one vertical stack are really one shared riser defect. Click to show Similar-Defect Linking + Recurrence Detection in action.',
  'Step through the three operational impacts (Verify, Connect, Escalate), then pull back to show the value delivered to Residents, Operations, and Quality.',
  'Trace a case through Data → FastMCP Rules → AI Agents → Portals with human accountability built in, then reveal the three feasibility pillars.',
  'Ride the roadmap from our working prototype (750+ automated tests) through Shadow Pilot (>90% staff alignment) to Live Pilot, Township Scale, and Portfolio Expansion.',
  'Show how one configurable core engine (rules.yaml + modular agents) adapts cleanly across high-rise, landed, and industrial developments.',
  'Close strong: Don’t just close the defect. Prove the root cause is fixed. Open the floor for Q&A.',
  'Q&A Appendix directory — jump directly to any supporting deep-dive.',
  'Appendix A1: User feedback from Kimberly and Lim and the exact product changes we shipped (plus next steps).',
  'Appendix A2: Real Malaysian homeowner quotes from Lowyat Forum showing why audit trails, verification, and systemic alerts matter.',
  'Appendix B1: Operational ROI — 100×+ cheaper AI first pass frees 375–500 staff hours per month for high-judgement work.',
  'Appendix B2: Compounding handover value cycle across the 24-month DLP and post-DLP services.',
  'Appendix B3: Seven value streams balancing DLP cost savings (RM0.93m/yr by Y5) and post-DLP recurring revenue (RM2.06m/yr).',
  'Appendix B4: Five-year outlook showing recurring earnings growing from 33% to 69% with Year 1 payback.',
  'Appendix B5: Model pricing, salary, DLP, and industry benchmark sources behind the ROI and value model.',
  'Appendix C: Five specialist agent steps, cross-cutting guardrailed Comms Agent, and the four non-negotiable human checkpoints.',
  'Appendix D: Buyer, SDP staff, and Technician pains and gains.',
  'Appendix E1: Why we split messy inputs (AI), deterministic thresholds (rules), and final accountability (people).',
  'Appendix E2: Step-by-step suitability matrix showing who decides every action.',
  'Appendix E3: Summary alignment with Malaysia’s AIGE seven governance principles.',
  'Appendix E4: Code-level AIGE audit status checked on 9 Nov 2026.',
  'Appendix E5: NIST AI RMF failure modes we tested and the technical safeguards we built.',
  'Appendix F: Operational, privacy (PDPA), verification, and integration risks and mitigations.',
  'Appendix G: Five concrete post-hackathon enhancements (calendar, floor plan, in-app chat, quality insights, live photo guidance).',
  'Appendix H: Meet Group We Hit Token Limit.',
  'Full reference LangGraph & event-driven workflow architecture.',
];

export default [
  Cover,
  Problem,
  MissingStep,
  WhyItMatters,
  Solution,
  HowItWorks,
  Innovation,
  StackExample,
  Impact,
  Feasibility,
  Scalability,
  ScaleArchitecture,
  ThankYou,
  AppendixDivider,
  Testimonials,
  HomeownerVoices,
  ValueAdmin,
  ValueCycle,
  ValueStreams,
  FiveYears,
  ValueSources,
  Agents,
  TargetUsers,
  AiHowWeDecided,
  AiSuitability,
  AiAigeSummary,
  AiAige,
  AiRisks,
  Risks,
  Future,
  Team,
  WorkflowFull,
] satisfies Page[];
