import { type DesignSystem, type Page, useSlidePageNumber } from '@open-slide/core';
import type { ReactNode } from 'react';

export const design: DesignSystem = {
  palette: { bg: '#FAF6F1', text: '#1C1814', accent: '#C64A1F' },
  fonts: {
    display: '"Inter", system-ui, -apple-system, sans-serif',
    body: '"Inter", system-ui, -apple-system, sans-serif',
  },
  typeScale: { hero: 104, body: 30 },
  radius: 20,
};

const muted = '#5E554D';
const soft = '#8A7F75';
const card = '#FFFDFA';
const line = '#E3D7CA';
const blue = '#24589E';
const blueSoft = '#E8EFF8';
const green = '#2E7D4F';
const greenSoft = '#E6F2EA';
const bright = '#FF7A00';
const watermark = '#F4ECE3';

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
        color: soft,
      }}
    >
      <span style={{ letterSpacing: '0.1em', fontWeight: 600 }}>HERITAGE EDITORIAL</span>
      <span style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
        {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
    </div>
  );
};

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

const FontLoader = () => (
  <style>{`@import url('https://fonts.googleapis.com/css2?family=Allura&family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>
);

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
      position: 'relative',
      fontFamily: 'var(--osd-font-body)',
    }}
  >
    <FontLoader />
    <div
      style={{
        position: 'absolute',
        right: 120,
        top: 84,
        fontFamily: '"Allura", cursive',
        fontSize: 160,
        color: '#FBE3D3',
        lineHeight: 1,
      }}
    >
      Simephony
    </div>
    <Eyebrow>Heritage Editorial · 2026</Eyebrow>
    <h1
      style={{
        fontFamily: 'var(--osd-font-display)',
        fontSize: 'var(--osd-size-hero)',
        fontWeight: 800,
        lineHeight: 1.06,
        letterSpacing: '-0.025em',
        margin: '24px 0 0',
        maxWidth: 1280,
      }}
    >
      Warm architectural clarity.
      <br />
      <span style={{ color: bright }}>Built for high-stakes pitches.</span>
    </h1>
    <p
      style={{
        fontSize: 'var(--osd-size-body)',
        color: 'rgba(250,246,241,0.8)',
        maxWidth: 1120,
        marginTop: 32,
        lineHeight: 1.5,
      }}
    >
      Cream paper surfaces, espresso typography, and semantic color accents for systems, evidence, and human decisions.
    </p>
  </div>
);

const DemoCard = ({ badge, badgeBg, badgeColor, headline, body }: { badge: string; badgeBg: string; badgeColor: string; headline: string; body: string }) => (
  <div
    style={{
      flex: 1,
      background: card,
      border: `2px solid ${line}`,
      borderRadius: 'var(--osd-radius)',
      padding: 36,
      boxShadow: '0 1px 0 rgba(28,24,20,0.03), 0 18px 40px -24px rgba(28,24,20,0.18)',
    }}
  >
    <span
      style={{
        display: 'inline-block',
        padding: '6px 16px',
        borderRadius: 999,
        fontSize: 20,
        fontWeight: 800,
        letterSpacing: '0.08em',
        background: badgeBg,
        color: badgeColor,
      }}
    >
      {badge}
    </span>
    <div style={{ fontSize: 34, fontWeight: 800, marginTop: 22, color: 'var(--osd-text)' }}>{headline}</div>
    <div style={{ fontSize: 25, lineHeight: 1.5, color: muted, marginTop: 14 }}>{body}</div>
  </div>
);

const Content: Page = () => (
  <div
    style={{
      width: '100%',
      height: '100%',
      background: 'var(--osd-bg)',
      color: 'var(--osd-text)',
      position: 'relative',
      fontFamily: 'var(--osd-font-body)',
      overflow: 'hidden',
    }}
  >
    <FontLoader />
    <div
      aria-hidden
      style={{
        position: 'absolute',
        right: 50,
        bottom: 70,
        fontSize: 340,
        fontWeight: 900,
        lineHeight: 0.85,
        letterSpacing: '-0.05em',
        color: watermark,
        fontFamily: 'var(--osd-font-display)',
      }}
    >
      01
    </div>
    <div style={{ position: 'absolute', left: 120, right: 120, top: 96 }}>
      <Eyebrow>01 · Visual Hierarchy</Eyebrow>
      <Title>Hairline paper cards with semantic signals</Title>
    </div>
    <div style={{ position: 'absolute', left: 120, right: 120, top: 310, display: 'flex', gap: 36 }}>
      <DemoCard
        badge="AI AGENTS"
        badgeBg={blueSoft}
        badgeColor={blue}
        headline="Cobalt for analysis"
        body="Model classifications, reasoning traces, and pattern matches stay visually distinct from human actions."
      />
      <DemoCard
        badge="ESCALATION"
        badgeBg="#FBEDE6"
        badgeColor="#C64A1F"
        headline="Terracotta for urgency"
        body="Recurring defects, risk thresholds, and primary metrics anchor the viewer’s eye without visual noise."
      />
      <DemoCard
        badge="VERIFIED"
        badgeBg={greenSoft}
        badgeColor={green}
        headline="Forest green for proof"
        body="Completed inspections and dual-party sign-offs settle into a calm, unmistakable confirmation state."
      />
    </div>
    <Footer />
  </div>
);

const Closer: Page = () => (
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
      position: 'relative',
      fontFamily: 'var(--osd-font-body)',
    }}
  >
    <FontLoader />
    <div style={{ fontFamily: '"Allura", cursive', fontSize: 130, color: '#FBE3D3', lineHeight: 1 }}>
      Simephony
    </div>
    <h1
      style={{
        fontFamily: 'var(--osd-font-display)',
        fontSize: 112,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        margin: '32px 0 0',
        lineHeight: 1.05,
      }}
    >
      Ready to present.
    </h1>
    <p style={{ fontSize: 32, color: 'rgba(250,246,241,0.78)', marginTop: 28, lineHeight: 1.5 }}>
      Consistent palette, balanced typography, and smooth morph continuity across every chapter.
    </p>
    <Footer />
  </div>
);

export default [Cover, Content, Closer];
