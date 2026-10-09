import React from "react";

interface ProfileFrameProps {
  avatarUrl: string | null;
  name: string;
  frame: string | null;
  size?: number;
  className?: string;
}

interface FrameStyle {
  border: string;
  shadow: string;
  /** Small seal in the bottom-right corner. */
  corner?: { text: string; bg: string; fg: string; pulse?: boolean };
}

const ring = (inner: string, outer: string, glow = "") =>
  `0 0 0 3px hsl(var(--background)), 0 0 0 5px ${outer}${glow ? `, ${glow}` : ""}${inner ? `, ${inner}` : ""}`;

const frameStyles: Record<string, FrameStyle> = {
  // Commendation frames
  manila: { border: "4px solid #cfae73", shadow: ring("", "#a8875a") },
  brass: { border: "4px solid #b08d3c", shadow: ring("", "#7a5f22", "0 0 14px rgba(176, 141, 60, 0.45)") },
  "gold-seal": {
    border: "4px solid #d4a72c",
    shadow: ring("", "#9c7a1c", "0 0 22px rgba(212, 167, 44, 0.55)"),
    corner: { text: "★", bg: "#d4a72c", fg: "#3b2a05" },
  },
  "red-string": { border: "3px dashed #b3261e", shadow: ring("", "#b3261e") },
  surveillance: {
    border: "3px solid hsl(var(--foreground))",
    shadow: ring("", "hsl(var(--foreground) / 0.5)"),
    corner: { text: "●", bg: "hsl(var(--foreground))", fg: "#e5372b", pulse: true },
  },
  founding: {
    border: "5px double hsl(var(--primary))",
    shadow: ring("", "hsl(var(--primary) / 0.6)"),
    corner: { text: "F", bg: "hsl(var(--primary))", fg: "hsl(var(--primary-foreground))" },
  },
  recruiter: {
    border: "3px solid #3a6ea5",
    shadow: ring("", "#2a5079"),
    corner: { text: "+", bg: "#3a6ea5", fg: "#ffffff" },
  },

  // Legacy frames (kept so older selections still render)
  bookworm: { border: "3px solid hsl(var(--primary))", shadow: "0 0 12px hsl(var(--primary) / 0.4)" },
  flame: { border: "3px solid #f97316", shadow: "0 0 16px rgba(249, 115, 22, 0.5)" },
  "gold-crown": { border: "3px solid #eab308", shadow: "0 0 20px rgba(234, 179, 8, 0.5)" },
  speech: { border: "3px solid #06b6d4", shadow: "0 0 12px rgba(6, 182, 212, 0.4)" },
  star: { border: "3px solid #a855f7", shadow: "0 0 14px rgba(168, 85, 247, 0.4)" },
  pillar: { border: "3px solid #f59e0b", shadow: "0 0 18px rgba(245, 158, 11, 0.5), inset 0 0 8px rgba(245, 158, 11, 0.1)" },
  "ribbon-blue": { border: "3px solid #3b82f6", shadow: "0 0 12px rgba(59, 130, 246, 0.4)" },
  "ribbon-pink": { border: "3px solid #ec4899", shadow: "0 0 14px rgba(236, 72, 153, 0.5)" },
  diamond: { border: "3px solid #8b5cf6", shadow: "0 0 20px rgba(139, 92, 246, 0.5), 0 0 40px rgba(139, 92, 246, 0.2)" },
};

export const ProfileFrame: React.FC<ProfileFrameProps> = ({ avatarUrl, name, frame, size = 96, className = "" }) => {
  const style = frame ? frameStyles[frame] : null;
  const corner = style?.corner;
  const cornerSize = Math.max(14, Math.round(size * 0.26));

  return (
    <div className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-primary to-destructive flex items-center justify-center"
        style={{
          border: style?.border || "2px solid transparent",
          boxShadow: style?.shadow || "none",
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-primary-foreground font-display" style={{ fontSize: size * 0.35 }}>
            {name?.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      {corner && (
        <span
          aria-hidden="true"
          className={`absolute flex items-center justify-center rounded-full font-bold ${corner.pulse ? "animate-pulse" : ""}`}
          style={{
            right: -1,
            bottom: -1,
            width: cornerSize,
            height: cornerSize,
            fontSize: cornerSize * 0.55,
            background: corner.bg,
            color: corner.fg,
            border: "2px solid hsl(var(--background))",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {corner.text}
        </span>
      )}
    </div>
  );
};

export const frameOptions = Object.keys(frameStyles);
export { frameStyles };
