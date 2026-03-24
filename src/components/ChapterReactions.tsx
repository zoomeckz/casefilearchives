import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/hooks/useAuth";

const REACTIONS = ["🤯", "😭", "🔥", "❤️", "😂", "😱"];

interface ChapterReactionsProps {
  chapterId: string;
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
}

export const ChapterReactions: React.FC<ChapterReactionsProps> = ({ chapterId, user, setShowAuthModal }) => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [userReactions, setUserReactions] = useState<Set<string>>(new Set());

  const fetchReactions = useCallback(async () => {
    const { data } = await supabase
      .from("chapter_reactions")
      .select("reaction, user_id")
      .eq("chapter_id", chapterId);
    if (!data) return;

    const c: Record<string, number> = {};
    const ur = new Set<string>();
    for (const r of data) {
      c[r.reaction] = (c[r.reaction] || 0) + 1;
      if (user && r.user_id === user.id) ur.add(r.reaction);
    }
    setCounts(c);
    setUserReactions(ur);
  }, [chapterId, user?.id]);

  useEffect(() => { fetchReactions(); }, [fetchReactions]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${chapterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chapter_reactions", filter: `chapter_id=eq.${chapterId}` }, () => {
        fetchReactions();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chapterId, fetchReactions]);

  const toggleReaction = async (reaction: string) => {
    if (!user) { setShowAuthModal(true); return; }

    if (userReactions.has(reaction)) {
      await supabase.from("chapter_reactions").delete().eq("chapter_id", chapterId).eq("user_id", user.id).eq("reaction", reaction);
      setUserReactions(prev => { const n = new Set(prev); n.delete(reaction); return n; });
      setCounts(prev => ({ ...prev, [reaction]: Math.max(0, (prev[reaction] || 1) - 1) }));
    } else {
      await supabase.from("chapter_reactions").insert({ chapter_id: chapterId, user_id: user.id, reaction });
      setUserReactions(prev => new Set(prev).add(reaction));
      setCounts(prev => ({ ...prev, [reaction]: (prev[reaction] || 0) + 1 }));
    }
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">How did this chapter make you feel?</p>
      <div className="flex flex-wrap gap-2">
        {REACTIONS.map(r => {
          const active = userReactions.has(r);
          const count = counts[r] || 0;
          return (
            <button
              key={r}
              onClick={() => toggleReaction(r)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
                active
                  ? "bg-primary/20 border border-primary/50 scale-105"
                  : "bg-secondary border border-border hover:border-primary/30"
              }`}
            >
              <span className="text-lg">{r}</span>
              {count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
            </button>
          );
        })}
      </div>
      {total > 0 && <p className="text-muted-foreground/60 text-xs">{total} reactions</p>}
    </div>
  );
};
