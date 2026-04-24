import React from "react";
import type { SupportedLanguage } from "@/i18n";

/**
 * Tiny inline-SVG country flags used by the language switcher.
 *
 * Why inline SVG instead of emoji?
 *   - Country emoji rely on the OS/browser shipping a colour-emoji font that
 *     supports the regional-indicator pairs. Windows (Chrome/Edge), some
 *     enterprise Linux builds, and most "noto-only" embedded browsers render
 *     them as the bare letter pair (e.g. "GB") instead of a flag.
 *   - Inline SVG looks identical everywhere, scales crisply, and never causes
 *     a network request — no risk of a CDN refusing to serve a flag image.
 *
 * The shapes here are intentionally simple/stylised (3 stripes, dots, a
 * crescent…) — they read as the right country at 16–20px, which is the only
 * size the switcher uses. They are NOT pixel-accurate national flags.
 */

interface Props {
  lang: SupportedLanguage;
  className?: string;
  /** px size; defaults to 18 to match a single line of body text. */
  size?: number;
  title?: string;
}

const ROUND = 2;

/** Wraps each flag in a rounded rect with a subtle border so it pops on dark UI. */
const FlagFrame: React.FC<{
  size: number;
  title?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ size, title, children, className }) => {
  // Standard flag aspect is 3:2; we draw to a 24x16 viewBox so simple integer
  // coordinates line up cleanly when the SVG is rasterised at 18–24px.
  const w = size;
  const h = Math.round((size * 16) / 24);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 16"
      width={w}
      height={h}
      role={title ? "img" : "presentation"}
      aria-label={title}
      className={`inline-block align-[-2px] ${className ?? ""}`}
      // Drop-in shadow so the flag stays distinguishable on any background.
      style={{ filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.4))" }}
    >
      <defs>
        <clipPath id={`fc-${title ?? size}`}>
          <rect x="0" y="0" width="24" height="16" rx={ROUND} ry={ROUND} />
        </clipPath>
      </defs>
      <g clipPath={`url(#fc-${title ?? size})`}>{children}</g>
      <rect
        x="0.25"
        y="0.25"
        width="23.5"
        height="15.5"
        rx={ROUND}
        ry={ROUND}
        fill="none"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="0.5"
      />
    </svg>
  );
};

/** Each renderer below paints a 24×16 area; the frame handles the rounding. */
const RENDERERS: Record<SupportedLanguage, () => React.ReactNode> = {
  // Union Jack (stylised — diagonals + cross) for English.
  en: () => (
    <>
      <rect width="24" height="16" fill="#012169" />
      {/* white diagonals */}
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#fff" strokeWidth="3" />
      {/* red diagonals */}
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#C8102E" strokeWidth="1.2" />
      {/* white cross */}
      <path d="M12 0 V16 M0 8 H24" stroke="#fff" strokeWidth="4" />
      {/* red cross */}
      <path d="M12 0 V16 M0 8 H24" stroke="#C8102E" strokeWidth="2" />
    </>
  ),
  // Bulgaria — white / green / red horizontal stripes.
  bg: () => (
    <>
      <rect width="24" height="5.33" y="0" fill="#fff" />
      <rect width="24" height="5.34" y="5.33" fill="#00966E" />
      <rect width="24" height="5.33" y="10.67" fill="#D62612" />
    </>
  ),
  // Spain — red/yellow/red horizontal bands with a small crest hint.
  es: () => (
    <>
      <rect width="24" height="4" y="0" fill="#AA151B" />
      <rect width="24" height="8" y="4" fill="#F1BF00" />
      <rect width="24" height="4" y="12" fill="#AA151B" />
      <rect x="6" y="6.5" width="3" height="3" fill="#AA151B" rx="0.4" />
    </>
  ),
  // India — saffron / white / green with a navy chakra dot.
  hi: () => (
    <>
      <rect width="24" height="5.33" y="0" fill="#FF9933" />
      <rect width="24" height="5.34" y="5.33" fill="#fff" />
      <rect width="24" height="5.33" y="10.67" fill="#138808" />
      <circle cx="12" cy="8" r="1.4" fill="none" stroke="#000080" strokeWidth="0.5" />
    </>
  ),
  // Saudi Arabia — green field (we use it as the Arabic flag, matching the
  // emoji choice in i18n/index.ts; we omit the shahada calligraphy at this
  // size and add a stylised sword for recognisability).
  ar: () => (
    <>
      <rect width="24" height="16" fill="#006C35" />
      <rect x="4" y="11" width="16" height="0.8" fill="#fff" rx="0.4" />
      <rect x="6" y="5" width="12" height="3" fill="none" stroke="#fff" strokeWidth="0.6" rx="0.5" />
    </>
  ),
  // Japan — white field with a red disc.
  ja: () => (
    <>
      <rect width="24" height="16" fill="#fff" />
      <circle cx="12" cy="8" r="4.8" fill="#BC002D" />
    </>
  ),
  // South Korea — white field with the taeguk and four trigram hints.
  ko: () => (
    <>
      <rect width="24" height="16" fill="#fff" />
      {/* Taeguk: red top, blue bottom inside a circle */}
      <circle cx="12" cy="8" r="3.5" fill="#C60C30" />
      <path d="M12 4.5 A3.5 3.5 0 0 0 12 11.5 A1.75 1.75 0 0 1 12 8 A1.75 1.75 0 0 0 12 4.5 Z" fill="#003478" />
      {/* Corner trigrams (simplified to short bars) */}
      <g fill="#000" stroke="#000" strokeWidth="0.4">
        <rect x="3" y="3" width="2.5" height="0.4" />
        <rect x="3" y="3.8" width="2.5" height="0.4" />
        <rect x="3" y="4.6" width="2.5" height="0.4" />
        <rect x="18.5" y="3" width="2.5" height="0.4" />
        <rect x="18.5" y="4.6" width="2.5" height="0.4" />
        <rect x="3" y="11.4" width="2.5" height="0.4" />
        <rect x="3" y="12.2" width="2.5" height="0.4" />
        <rect x="18.5" y="11.4" width="2.5" height="0.4" />
        <rect x="18.5" y="12.2" width="2.5" height="0.4" />
        <rect x="18.5" y="13" width="2.5" height="0.4" />
      </g>
    </>
  ),
  // China — red field with five stylised yellow stars (one large + 4 small).
  zh: () => (
    <>
      <rect width="24" height="16" fill="#DE2910" />
      {/* Large star (single dot for legibility at this size) */}
      <circle cx="6" cy="5" r="1.6" fill="#FFDE00" />
      {/* Four small stars in an arc */}
      <circle cx="10.5" cy="3" r="0.6" fill="#FFDE00" />
      <circle cx="12" cy="5" r="0.6" fill="#FFDE00" />
      <circle cx="12" cy="7.5" r="0.6" fill="#FFDE00" />
      <circle cx="10.5" cy="9.2" r="0.6" fill="#FFDE00" />
    </>
  ),
};

export const FlagIcon: React.FC<Props> = ({ lang, className, size = 18, title }) => {
  const render = RENDERERS[lang];
  if (!render) return null;
  return (
    <FlagFrame size={size} title={title ?? lang} className={className}>
      {render()}
    </FlagFrame>
  );
};

export default FlagIcon;