import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/hooks/useAuth";

interface ReadingStreakProps {
  user: AuthUser;
}

export const ReadingStreak: React.FC<ReadingStreakProps> = ({ user }) => {
  const [streak, setStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [readToday, setReadToday] = useState(false);

  useEffect(() => {
    const calc = async () => {
      const { data } = await supabase
        .from("reading_progress")
        .select("read_at")
        .eq("user_id", user.id)
        .order("read_at", { ascending: false });

      if (!data || data.length === 0) return;

      // Group by day
      const days = new Set<string>();
      for (const d of data) {
        days.add(new Date(d.read_at).toISOString().slice(0, 10));
      }
      const sortedDays = [...days].sort().reverse();

      const today = new Date().toISOString().slice(0, 10);
      setReadToday(sortedDays[0] === today);

      // Calculate current streak
      let current = 0;
      let d = new Date();
      // If didn't read today, start from yesterday
      if (sortedDays[0] !== today) {
        d.setDate(d.getDate() - 1);
      }
      for (let i = 0; i < 365; i++) {
        const key = d.toISOString().slice(0, 10);
        if (days.has(key)) {
          current++;
          d.setDate(d.getDate() - 1);
        } else break;
      }
      setStreak(current);

      // Calculate longest streak
      let longest = 0;
      let cur = 1;
      for (let i = 1; i < sortedDays.length; i++) {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
        if (Math.abs(diff - 1) < 0.5) {
          cur++;
        } else {
          longest = Math.max(longest, cur);
          cur = 1;
        }
      }
      longest = Math.max(longest, cur);
      setLongestStreak(longest);
    };
    calc();
  }, [user.id]);

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className={`text-2xl ${streak > 0 ? "animate-pulse" : ""}`}>🔥</span>
        <div>
          <div className="text-lg font-display text-foreground">{streak} day{streak !== 1 ? "s" : ""}</div>
          <div className="text-xs text-muted-foreground">Current streak</div>
        </div>
      </div>
      <div className="text-center">
        <div className="text-lg font-display text-foreground">{longestStreak}</div>
        <div className="text-xs text-muted-foreground">Best streak</div>
      </div>
      {readToday && (
        <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">✓ Read today</span>
      )}
    </div>
  );
};
