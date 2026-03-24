import React from "react";

export interface RankInfo {
  title: string;
  icon: string;
  color: string;
  minXp: number;
}

const RANKS: RankInfo[] = [
  { title: "Novice Reader", icon: "📖", color: "text-muted-foreground", minXp: 0 },
  { title: "Apprentice Scholar", icon: "📚", color: "text-foreground", minXp: 50 },
  { title: "Story Seeker", icon: "🔍", color: "text-primary", minXp: 150 },
  { title: "Lore Keeper", icon: "📜", color: "text-amber-400", minXp: 300 },
  { title: "Throne Guardian", icon: "⚔️", color: "text-purple-400", minXp: 500 },
  { title: "Throne Keeper", icon: "👑", color: "text-amber-300", minXp: 1000 },
];

export function calculateXP(stats: { chaptersRead: number; comments: number; forumPosts: number; forumReplies?: number; bookmarks?: number }) {
  return (stats.chaptersRead * 10) + (stats.comments * 5) + (stats.forumPosts * 15) + ((stats.forumReplies || 0) * 5) + ((stats.bookmarks || 0) * 2);
}

export function getRank(xp: number): RankInfo {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (xp >= r.minXp) rank = r;
  }
  return rank;
}

export function getNextRank(xp: number): RankInfo | null {
  for (const r of RANKS) {
    if (r.minXp > xp) return r;
  }
  return null;
}

interface UserRankBadgeProps {
  xp: number;
  showXp?: boolean;
  size?: "sm" | "md";
}

export const UserRankBadge: React.FC<UserRankBadgeProps> = ({ xp, showXp = false, size = "sm" }) => {
  const rank = getRank(xp);
  return (
    <span className={`inline-flex items-center gap-1 ${size === "sm" ? "text-xs" : "text-sm"} ${rank.color}`}>
      <span>{rank.icon}</span>
      <span>{rank.title}</span>
      {showXp && <span className="text-muted-foreground ml-1">({xp} XP)</span>}
    </span>
  );
};
