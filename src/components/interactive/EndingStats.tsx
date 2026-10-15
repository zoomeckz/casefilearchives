import React, { useEffect, useState } from "react";
import type { InteractiveGraph } from "@/lib/interactive";
import { sessionToken } from "@/lib/commendations";
import "@/components/commendations/commendations.css";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Stats { readers: number; endings: Record<string, number> }

/**
 * How the reader's outcome compares with everyone else's. The server only
 * answers readers who closed the case, so nothing is spoiled.
 */
export const EndingStats: React.FC<{ chapterId: string; graph: InteractiveGraph; endingNodeId: string }> = ({ chapterId, graph, endingNodeId }) => {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = sessionToken();
    if (!token) return;
    fetch(`${SUPA_URL}/rest/v1/rpc/ic_ending_stats`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _chapter_id: chapterId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (!cancelled && s) setStats({ readers: Number(s.readers) || 0, endings: s.endings || {} }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [chapterId, endingNodeId]);

  if (!stats || stats.readers === 0) return null;

  const readers = stats.readers;
  const mine = stats.endings[endingNodeId] || 1;
  const pct = Math.round((mine / readers) * 100);
  const first = readers === 1;
  const only = !first && mine === 1;
  const rare = !first && !only && readers >= 10 && pct <= 10;
  const endings = graph.nodes.filter((n) => n.type === "ending");

  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      {(first || only || rare) && (
        <span className="cf-stamp-in inline-block border-2 border-primary px-3 py-1 case-label !text-primary text-[11px]">
          {first ? "First to close this case" : only ? "Only you" : "Rare outcome"}
        </span>
      )}
      <p className="text-sm text-muted-foreground max-w-prose">
        {first
          ? "No other reader has closed this case yet."
          : only
            ? `Of ${readers} readers who closed this case, nobody else reached this outcome.`
            : `${pct}% of the ${readers} readers who closed this case reached this outcome.`}
      </p>

      {graph.settings.endingVisibility === "index" && !first && (
        <ul className="w-full max-w-md mt-2 space-y-2 text-left">
          {endings.map((e) => {
            const n = stats.endings[e.id] || 0;
            const share = Math.round((n / readers) * 100);
            const yours = e.id === endingNodeId;
            return (
              <li key={e.id}>
                <div className={`flex justify-between gap-3 text-xs ${yours ? "text-primary" : "text-muted-foreground"}`}>
                  <span className="truncate">{yours ? "■ " : ""}{e.endingTitle || e.id}</span>
                  <span className="tabular-nums shrink-0">{share}%</span>
                </div>
                <div className="mt-1 h-1 bg-secondary overflow-hidden">
                  <div className={`h-full cf-fill ${yours ? "bg-primary" : "bg-foreground/30"}`} style={{ width: `${share}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default EndingStats;
