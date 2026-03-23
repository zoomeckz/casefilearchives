import React from "react";

interface ProfileFrameProps {
  avatarUrl: string | null;
  name: string;
  frame: string | null;
  size?: number;
  className?: string;
}

const frameStyles: Record<string, { border: string; shadow: string; ribbon?: { color: string; position: string } }> = {
  'bookworm': {
    border: '3px solid hsl(var(--primary))',
    shadow: '0 0 12px hsl(var(--primary) / 0.4)',
  },
  'flame': {
    border: '3px solid #f97316',
    shadow: '0 0 16px rgba(249, 115, 22, 0.5)',
  },
  'gold-crown': {
    border: '3px solid #eab308',
    shadow: '0 0 20px rgba(234, 179, 8, 0.5)',
  },
  'speech': {
    border: '3px solid #06b6d4',
    shadow: '0 0 12px rgba(6, 182, 212, 0.4)',
  },
  'star': {
    border: '3px solid #a855f7',
    shadow: '0 0 14px rgba(168, 85, 247, 0.4)',
  },
  'pillar': {
    border: '3px solid #f59e0b',
    shadow: '0 0 18px rgba(245, 158, 11, 0.5), inset 0 0 8px rgba(245, 158, 11, 0.1)',
  },
  'ribbon-blue': {
    border: '3px solid #3b82f6',
    shadow: '0 0 12px rgba(59, 130, 246, 0.4)',
    ribbon: { color: '#3b82f6', position: 'top-right' },
  },
  'ribbon-pink': {
    border: '3px solid #ec4899',
    shadow: '0 0 14px rgba(236, 72, 153, 0.5)',
    ribbon: { color: '#ec4899', position: 'top-right' },
  },
  'diamond': {
    border: '3px solid #8b5cf6',
    shadow: '0 0 20px rgba(139, 92, 246, 0.5), 0 0 40px rgba(139, 92, 246, 0.2)',
  },
};

const frameIcons: Record<string, string> = {
  'gold-crown': '👑',
  'ribbon-pink': '🎀',
  'ribbon-blue': '🔖',
  'star': '⭐',
  'diamond': '💎',
  'flame': '🔥',
};

export const ProfileFrame: React.FC<ProfileFrameProps> = ({ avatarUrl, name, frame, size = 96, className = "" }) => {
  const style = frame ? frameStyles[frame] : null;
  const icon = frame ? frameIcons[frame] : null;

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-primary to-destructive flex items-center justify-center"
        style={{
          border: style?.border || '2px solid transparent',
          boxShadow: style?.shadow || 'none',
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
      {icon && (
        <span
          className="absolute flex items-center justify-center"
          style={{
            top: -2,
            right: -2,
            fontSize: size * 0.25,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
          }}
        >
          {icon}
        </span>
      )}
    </div>
  );
};

export const frameOptions = Object.keys(frameStyles);
export { frameStyles };
