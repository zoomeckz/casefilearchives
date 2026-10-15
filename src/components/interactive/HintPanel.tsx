import React, { useEffect, useState } from "react";
import type { AuthUser } from "@/hooks/useAuth";
import { sessionToken } from "@/lib/commendations";

// Hint tokens: readers earn them by reading, closing cases, commenting and
// writing credible theories, and spend one to reveal a decision's hint.
// At most two hints per attempt; each costs 15 points of the case score.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const HINTS_PER_CASE = 2;
export const HINT_PENALTY = 15;

interface HintStatus { tokens: number; max: number; used: { node_id: string; hint: string | null }[] }

async function rpc(fn: string, body: unknown): Promise<HintStatus> {
  const token = sessionToken();
  if (!token) throw new Error("auth_required");
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "request_failed");
  return { tokens: Number(data?.tokens) || 0, max: Number(data?.max) || HINTS_PER_CASE, used: Array.isArray(data?.used) ? data.used : [] };
}

const ERRORS: Record<string, string> = {
  no_tokens: "No hint tokens left. You earn them by reading files, closing cases, commenting and writing credible theories.",
  hint_limit: `You have used both hints for this case (${HINTS_PER_CASE} per attempt).`,
  decision_not_reached: "This decision has already been filed.",
};

interface Props {
  chapterId: string;
  nodeId: string;
  /** The hint text from the case (used directly in previews). */
  hint: string;
  user: AuthUser | null;
  /** Admin preview or on-device play: reveal without tokens. */
  preview?: boolean;
}

export const HintPanel: React.FC<Props> = ({ chapterId, nodeId, hint, user, preview = false }) => {
  const [status, setStatus] = useState<HintStatus | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRevealed(null);
    setConfirming(false);
    setError(null);
    if (!user || preview) return;
    let cancelled = false;
    rpc("ic_hint_status", { _chapter_id: chapterId })
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        const mine = s.used.find((u) => u.node_id === nodeId);
        if (mine?.hint) setRevealed(mine.hint);
      })
      .catch(() => { /* hints not available yet */ });
    return () => { cancelled = true; };
  }, [chapterId, nodeId, user?.id, preview]);

  const use = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await rpc("ic_use_hint", { _chapter_id: chapterId, _node_id: nodeId });
      setStatus(s);
      setRevealed(s.used.find((u) => u.node_id === nodeId)?.hint || hint);
      setConfirming(false);
    } catch (e: any) {
      setError(ERRORS[e.message] || "The hint could not be retrieved.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const shell = "mt-4 border border-dashed border-border p-3 text-sm";

  if (revealed) {
    return (
      <div className={`${shell} border-solid border-primary/50`}>
        <p className="case-label text-[9px] !text-primary">Hint · −{HINT_PENALTY} case score</p>
        <p className="text-foreground/90 mt-1">{revealed}</p>
      </div>
    );
  }

  if (preview) {
    return (
      <div className={shell}>
        <button type="button" onClick={() => setRevealed(hint)} className="case-label text-[9px] hover:!text-primary">Reveal hint (preview)</button>
      </div>
    );
  }

  if (!user) {
    return <div className={shell}><p className="text-xs text-muted-foreground">A hint is available. Sign in to spend a hint token on it.</p></div>;
  }

  const usedCount = status?.used.length ?? 0;
  const left = Math.max(0, HINTS_PER_CASE - usedCount);
  const tokens = status?.tokens ?? 0;
  const blocked = !status || tokens < 1 || left < 1;

  return (
    <div className={shell}>
      {confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-foreground">Spend 1 hint token? This case's score drops by {HINT_PENALTY}.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={use} className="px-3 py-1.5 bg-primary text-primary-foreground text-[10px] uppercase tracking-wider disabled:opacity-50">
              {busy ? "…" : "Reveal hint"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="px-3 py-1.5 border border-border text-[10px] uppercase tracking-wider">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            💡 A hint is on file · {left} of {HINTS_PER_CASE} left in this case · {tokens} token{tokens === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            disabled={blocked}
            onClick={() => setConfirming(true)}
            title={tokens < 1 ? ERRORS.no_tokens : left < 1 ? ERRORS.hint_limit : undefined}
            className="px-3 py-1.5 border border-border text-[10px] uppercase tracking-wider hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Use a hint token
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
};

/** "Case score 85 · 1 hint used", shown with the outcome. */
export const HintScore: React.FC<{ chapterId: string }> = ({ chapterId }) => {
  const [used, setUsed] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    rpc("ic_hint_status", { _chapter_id: chapterId })
      .then((s) => { if (!cancelled) setUsed(s.used.length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [chapterId]);
  if (used == null) return null;
  return (
    <p className="case-label text-[9px] mt-3">
      Case score {Math.max(0, 100 - used * HINT_PENALTY)} · {used === 0 ? "no hints used" : `${used} hint${used === 1 ? "" : "s"} used`}
    </p>
  );
};

export default HintPanel;
