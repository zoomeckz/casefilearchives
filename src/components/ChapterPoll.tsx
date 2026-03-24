import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/hooks/useAuth";

interface PollOption {
  id: string;
  option_text: string;
  votes: number;
}

interface ChapterPollProps {
  chapterId: string;
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
}

export const ChapterPoll: React.FC<ChapterPollProps> = ({ chapterId, user, setShowAuthModal }) => {
  const [poll, setPoll] = useState<{ id: string; question: string } | null>(null);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [totalVotes, setTotalVotes] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      const { data: polls } = await supabase
        .from("chapter_polls")
        .select("id, question")
        .eq("chapter_id", chapterId)
        .limit(1);

      if (!polls || polls.length === 0) return;
      const p = polls[0];
      setPoll(p);

      const { data: opts } = await supabase
        .from("poll_options")
        .select("id, option_text, sort_order")
        .eq("poll_id", p.id)
        .order("sort_order");

      const { data: votes } = await supabase
        .from("poll_votes")
        .select("option_id, user_id")
        .eq("poll_id", p.id);

      const voteCounts: Record<string, number> = {};
      let uv: string | null = null;
      for (const v of votes || []) {
        voteCounts[v.option_id] = (voteCounts[v.option_id] || 0) + 1;
        if (user && v.user_id === user.id) uv = v.option_id;
      }

      setOptions((opts || []).map(o => ({
        id: o.id,
        option_text: o.option_text,
        votes: voteCounts[o.id] || 0,
      })));
      setUserVote(uv);
      setTotalVotes(Object.values(voteCounts).reduce((a, b) => a + b, 0));
    };
    fetch();
  }, [chapterId, user?.id]);

  const handleVote = async (optionId: string) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!poll) return;

    if (userVote) {
      // Change vote
      await supabase.from("poll_votes").delete().eq("poll_id", poll.id).eq("user_id", user.id);
    }

    await supabase.from("poll_votes").insert({ poll_id: poll.id, option_id: optionId, user_id: user.id });
    
    setOptions(prev => prev.map(o => ({
      ...o,
      votes: o.id === optionId ? o.votes + 1 : (o.id === userVote ? o.votes - 1 : o.votes),
    })));
    setTotalVotes(prev => userVote ? prev : prev + 1);
    setUserVote(optionId);
  };

  if (!poll) return null;

  const hasVoted = !!userVote;

  return (
    <div className="p-6 bg-card/50 rounded-xl border border-border">
      <h4 className="font-display text-lg text-accent mb-4">📊 {poll.question}</h4>
      <div className="space-y-2">
        {options.map(opt => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
          const isSelected = userVote === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              className={`w-full text-left p-3 rounded-lg transition-all relative overflow-hidden ${
                isSelected ? "border-2 border-primary" : "border border-border hover:border-primary/50"
              }`}
            >
              {hasVoted && (
                <div
                  className="absolute inset-0 bg-primary/10 transition-all"
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex justify-between items-center">
                <span className="text-foreground text-sm">{opt.option_text}</span>
                {hasVoted && <span className="text-muted-foreground text-xs">{pct}%</span>}
              </div>
            </button>
          );
        })}
      </div>
      {totalVotes > 0 && (
        <p className="text-muted-foreground/60 text-xs mt-3">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
};
