import React, { useId } from "react";
import type { Commendation } from "@/lib/commendations";
import "./commendations.css";

interface Props {
  commendation: Commendation;
  unlocked: boolean;
  size?: number;
  /** Play the stamp animation when the badge mounts. */
  stamp?: boolean;
  className?: string;
}

/** A rubber-stamp seal: ring text, inner circle and the commendation's glyph. */
export const CommendationBadge: React.FC<Props> = ({ commendation, unlocked, size = 88, stamp = false, className = "" }) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ringId = `cf-ring-${uid}`;
  const inkId = `cf-ink-${uid}`;
  const ringText = unlocked ? `CASE FILES · ${commendation.title.toUpperCase()} · ` : "CLASSIFIED · CLASSIFIED · CLASSIFIED · ";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={unlocked ? commendation.title : "Locked commendation"}
      className={`cf-seal ${unlocked ? "" : "cf-seal--locked"} ${stamp && unlocked ? "cf-stamp-in" : ""} ${className}`}
    >
      <defs>
        <path id={ringId} d="M50 50m-36 0a36 36 0 1 1 72 0a36 36 0 1 1 -72 0" />
        <filter id={inkId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.35" result="mask" />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
      </defs>
      <g filter={unlocked ? `url(#${inkId})` : undefined} fill="none" stroke="currentColor">
        <circle cx="50" cy="50" r="46" strokeWidth="3" />
        <circle cx="50" cy="50" r="41.5" strokeWidth="0.8" strokeDasharray={unlocked ? undefined : "2 2"} />
        <circle cx="50" cy="50" r="28" strokeWidth="1.6" />
        <text fill="currentColor" stroke="none" fontSize="7" letterSpacing="1.4" fontFamily="'IBM Plex Mono', monospace">
          <textPath href={`#${ringId}`} startOffset="0">{ringText.repeat(2)}</textPath>
        </text>
        <g transform="translate(33.2 33.2) scale(1.4)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity={unlocked ? 1 : 0.45}>
          <path d={commendation.glyph} />
        </g>
      </g>
    </svg>
  );
};

export default CommendationBadge;
