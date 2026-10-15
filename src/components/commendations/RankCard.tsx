import React, { useEffect, useState } from "react";
import { sessionToken } from "@/lib/commendations";
import "./commendations.css";

// Detective rank: an XP ladder alongside the clearance levels.
// XP is calculated by the database (cf_rank) from reading, decisions,
// outcomes (rare ones count extra), credible theories and comments,
// minus 10 per hint used.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const DETECTIVE_RANKS = [
  { name: "Rookie", min: 0 },
  { name: "Constable", min: 200 },
  { name: "Sergeant", min: 600 },
  { name: "Inspector", min: 1500 },
  { name: "Chief Inspector", min: 3000 },
];

export function rankFor(xp: number) {
  let index = 0;
  DETECTIVE_RANKS.forEach((r, i) => { if (xp >= r.min) index = i; });
  const current = DETECTIVE_RANKS[index];
  const next = DETECTIVE_RANKS[index + 1] || null;
  const pct = next ? ((xp - current.min) / (next.min - current.min)) * 100 : 100;
  return { ...current, index, next, pct: Math.max(0, Math.min(100, pct)) };
}

export interface RankData {
  xp: number;
  reading: number; decisions: number; outcomes: number; rare: number;
  theories: number; comments: number; hints: number;
}

export function useRank(userId: string | null | undefined): RankData | null {
  const [data, setData] = useState<RankData | null>(null);
  useEffect(() => {
    setData(null);
    if (!userId) return;
    let cancelled = false;
    fetch(`${SUPA_URL}/rest/v1/rpc/cf_rank`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${sessionToken() || ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _user_id: userId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);
  return data;
}

/** One line for profile headers: "Detective rank · Sergeant · 740 XP" with a thin bar. */
export const RankLine: React.FC<{ userId: string }> = ({ userId }) => {
  const data = useRank(userId);
  if (!data) return null;
  const r = rankFor(data.xp);
  return (
    <div className="mt-3 max-w-xs mx-auto sm:mx-0">
      <p className="case-label text-[9px]">
        Detective rank · <span className="!text-primary">{r.name}</span> · {data.xp} XP
      </p>
      <div className="mt-1 h-1 bg-secondary overflow-hidden">
        <div className="h-full bg-primary cf-fill" style={{ width: `${r.pct}%` }} />
      </div>
      {r.next && <p className="case-label text-[8px] mt-1">{r.next.min - data.xp} XP to {r.next.name}</p>}
    </div>
  );
};

/** Full card for the Commendations page: the ladder, XP bar and where the XP came from. */
export const RankCard: React.FC<{ userId: string }> = ({ userId }) => {
  const data = useRank(userId);
  if (!data) return null;
  const r = rankFor(data.xp);
  const parts: [string, number][] = [
    ["Reading", data.reading],
    ["Decisions", data.decisions],
    ["Outcomes", data.outcomes],
    ["Rare outcomes", data.rare],
    ["Theories", data.theories],
    ["Comments", data.comments],
    ["Hints", data.hints],
  ];

  return (
    <section className="case-file p-5 sm:p-7 mb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="case-label text-[9px]">Detective rank</p>
          <p className="font-display text-2xl sm:text-3xl text-foreground uppercase">{r.name}</p>
        </div>
        <p className="case-label text-[10px]">{data.xp} XP</p>
      </div>

      <div className="mt-3 h-2 bg-secondary overflow-hidden">
        <div className="h-full bg-primary cf-fill" style={{ width: `${r.pct}%` }} />
      </div>
      <p className="case-label text-[9px] mt-2">{r.next ? `${r.next.min - data.xp} XP to ${r.next.name}` : "Highest rank"}</p>

      <ol className="mt-5 grid grid-cols-5 gap-1">
        {DETECTIVE_RANKS.map((rank, i) => (
          <li key={rank.name} className="text-center">
            <div className={`h-1.5 ${i <= r.index ? "bg-primary" : "bg-secondary"}`} />
            <p className={`case-label text-[8px] mt-1 leading-tight ${i === r.index ? "!text-primary" : ""}`}>{rank.name}</p>
            <p className="case-label text-[7px] opacity-70">{rank.min}</p>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-wrap gap-2">
        {parts.filter(([, v]) => v !== 0).map(([label, v]) => (
          <span key={label} className={`case-label text-[9px] border px-2 py-1 ${v < 0 ? "border-destructive/50" : "border-border"}`}>
            {label} {v > 0 ? "+" : ""}{v}
          </span>
        ))}
      </div>
    </section>
  );
};

export default RankCard;
