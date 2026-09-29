import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ProfileFrame } from "@/components/ProfileFrame";
import { UserRankBadge, calculateXP } from "@/components/UserRank";

interface LeaderEntry {
  userId: string;
  name: string;
  avatar: string | null;
  frame: string | null;
  chaptersRead: number;
  comments: number;
  forumPosts: number;
  xp: number;
}

type Tab = "xp" | "readers" | "commenters" | "theorists";

export const LeaderboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [tab, setTab] = useState<Tab>("xp");
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<"all" | "monthly" | "weekly">("all");

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      // Get all profiles
      const { data: profiles } = await supabase.rpc("get_public_profiles" as any, {}).select("user_id, name, avatar_url, selected_frame");
      if (!profiles) { setLoading(false); return; }

      const userIds = profiles.map(p => p.user_id);

      // Get counts per user
      const [{ data: readData }, { data: commentData }, { data: postData }] = await Promise.all([
        supabase.from("reading_progress").select("user_id"),
        supabase.from("comments").select("user_id"),
        supabase.from("forum_posts").select("user_id"),
      ]);

      const readCounts: Record<string, number> = {};
      const commentCounts: Record<string, number> = {};
      const postCounts: Record<string, number> = {};

      for (const r of readData || []) readCounts[r.user_id] = (readCounts[r.user_id] || 0) + 1;
      for (const c of commentData || []) commentCounts[c.user_id] = (commentCounts[c.user_id] || 0) + 1;
      for (const p of postData || []) postCounts[p.user_id] = (postCounts[p.user_id] || 0) + 1;

      const mapped: LeaderEntry[] = profiles.map(p => {
        const chaptersRead = readCounts[p.user_id] || 0;
        const comments = commentCounts[p.user_id] || 0;
        const forumPosts = postCounts[p.user_id] || 0;
        return {
          userId: p.user_id,
          name: p.name,
          avatar: p.avatar_url,
          frame: p.selected_frame,
          chaptersRead,
          comments,
          forumPosts,
          xp: calculateXP({ chaptersRead, comments, forumPosts }),
        };
      });

      setEntries(mapped);
      setLoading(false);
    };
    fetch();
  }, []);

  const sorted = [...entries].sort((a, b) => {
    switch (tab) {
      case "xp": return b.xp - a.xp;
      case "readers": return b.chaptersRead - a.chaptersRead;
      case "commenters": return b.comments - a.comments;
      case "theorists": return b.forumPosts - a.forumPosts;
    }
  }).filter(e => e.xp > 0);

  const tabs: { id: Tab; label: string }[] = [
    { id: "xp", label: "Overall XP" },
    { id: "readers", label: "Top Readers" },
    { id: "commenters", label: "Top Commenters" },
    { id: "theorists", label: "Top Contributors" },
  ];

  const getMedal = (i: number) => {
    if (i === 0) return "🥇";
    if (i === 1) return "🥈";
    if (i === 2) return "🥉";
    return `#${i + 1}`;
  };

  const getValue = (entry: LeaderEntry) => {
    switch (tab) {
      case "xp": return `${entry.xp} XP`;
      case "readers": return `${entry.chaptersRead} chapters`;
      case "commenters": return `${entry.comments} comments`;
      case "theorists": return `${entry.forumPosts} posts`;
    }
  };

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl text-accent mb-2">🏆 Leaderboard</h1>
        <p className="text-muted-foreground mb-8">See who's leading the community</p>

        <div className="flex flex-wrap gap-2 mb-8">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-12">Loading...</p>
        ) : sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No activity yet. Start reading to claim the top spot!</p>
        ) : (
          <div className="space-y-2">
            {sorted.slice(0, 50).map((entry, i) => (
              <div
                key={entry.userId}
                onClick={() => navigate(`/user/${entry.userId}`)}
                className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors ${
                  i < 3 ? "bg-card/50 border border-border" : ""
                }`}
              >
                <span className={`w-8 text-center font-display ${i < 3 ? "text-lg" : "text-sm text-muted-foreground"}`}>
                  {getMedal(i)}
                </span>
                <ProfileFrame avatarUrl={entry.avatar} name={entry.name} frame={entry.frame} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium truncate">{entry.name}</span>
                    <UserRankBadge xp={entry.xp} />
                  </div>
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">{getValue(entry)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardPage;
