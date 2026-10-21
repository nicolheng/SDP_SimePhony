import { PROJECT_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Drawn stand-in for a property photo (condo blocks at dusk). Replace with a real project image. */
export function BuildingBanner({ className }: { className?: string }) {
  const windows = (x: number, cols: number, rows: number, top: number) =>
    Array.from({ length: rows * cols }, (_, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const lit = (r * 7 + c * 3 + x) % 5 === 0;
      return <rect key={`${x}-${i}`} x={x + 6 + c * 12} y={top + 8 + r * 14} width="7" height="8" rx="1" fill={lit ? "#fde68a" : "#dbe4ee"} opacity={lit ? 1 : 0.85} />;
    });
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className={cn("block h-full w-full", className)} role="img" aria-label={PROJECT_NAME}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8c9a3" />
          <stop offset="0.6" stopColor="#fbe3cf" />
          <stop offset="1" stopColor="#eef3f6" />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#sky)" />
      <circle cx="320" cy="58" r="22" fill="#fff4e0" opacity="0.9" />
      <rect x="60" y="40" width="96" height="140" rx="3" fill="#8a97a8" />
      {windows(60, 7, 9, 40)}
      <rect x="170" y="20" width="110" height="160" rx="3" fill="#6f7d90" />
      {windows(170, 8, 10, 20)}
      <rect x="292" y="70" width="70" height="110" rx="3" fill="#9aa6b5" />
      {windows(292, 5, 7, 70)}
      <rect x="170" y="14" width="110" height="8" rx="2" fill="#d71920" />
      <rect y="176" width="400" height="24" fill="#7fb069" />
      {[30, 165, 290, 380].map((x) => (
        <g key={x}>
          <rect x={x - 2} y="160" width="4" height="18" fill="#6b4f3a" />
          <circle cx={x} cy="154" r="14" fill="#4f8a4b" />
        </g>
      ))}
    </svg>
  );
}
