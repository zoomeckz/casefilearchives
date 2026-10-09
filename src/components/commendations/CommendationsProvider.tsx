import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AuthUser } from "@/hooks/useAuth";
import { COMMENDATION_MAP, FRAME_LABELS, cfApi, type CommendationStats } from "@/lib/commendations";
import { CommendationBadge } from "./CommendationBadge";
import "./commendations.css";

interface Ctx {
  /** key → unlocked_at */
  unlocked: Map<string, string>;
  stats: CommendationStats | null;
  ready: boolean;
  refresh: () => Promise<void>;
}

const CommendationsContext = createContext<Ctx>({
  unlocked: new Map(),
  stats: null,
  ready: false,
  refresh: async () => {},
});

export const useCommendations = () => useContext(CommendationsContext);

const REF_KEY = "cf-ref";
const MIN_GAP_MS = 4000;
const TOAST_MS = 5600;

/**
 * Keeps the signed-in reader's commendations in sync with the server and
 * announces new ones. Syncs on sign-in, page changes, tab focus, after
 * activity events (`cf:activity`) and every two minutes.
 */
export const CommendationsProvider: React.FC<{ user: AuthUser | null; children: React.ReactNode }> = ({ user, children }) => {
  const location = useLocation();
  const [unlocked, setUnlocked] = useState<Map<string, string>>(new Map());
  const [stats, setStats] = useState<CommendationStats | null>(null);
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const busy = useRef(false);
  const last = useRef(0);
  const announced = useRef<Set<string>>(new Set());

  // Remember a referral code from ?ref=CODE until the visitor signs in.
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get("ref");
      if (code) localStorage.setItem(REF_KEY, code.trim().slice(0, 32));
    } catch { /* ignore */ }
  }, []);

  const sync = useCallback(async (force = false) => {
    if (!user) return;
    const now = Date.now();
    if (busy.current || (!force && now - last.current < MIN_GAP_MS)) return;
    busy.current = true;
    last.current = now;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await cfApi.sync(tz);
      setStats(res.stats);
      setUnlocked(new Map(res.unlocked.map((u) => [u.key, u.unlocked_at])));
      const unseen = res.unlocked
        .filter((u) => !u.seen && COMMENDATION_MAP[u.key] && !announced.current.has(u.key))
        .map((u) => u.key);
      if (unseen.length) {
        unseen.forEach((k) => announced.current.add(k));
        setQueue((q) => [...q, ...unseen]);
      }
      setReady(true);
    } catch {
      // The commendations tables may not exist yet, or the session expired; try again later.
    } finally {
      busy.current = false;
    }
  }, [user?.id]);

  // Sign-in: redeem a stored referral code, then sync.
  useEffect(() => {
    setUnlocked(new Map());
    setStats(null);
    setReady(false);
    setQueue([]);
    announced.current = new Set();
    if (!user) return;
    (async () => {
      let code: string | null = null;
      try { code = localStorage.getItem(REF_KEY); } catch { /* ignore */ }
      if (code) {
        try { await cfApi.redeemReferral(code); } catch { /* ignore */ }
        try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
      }
      await sync(true);
    })();
  }, [user?.id, sync]);

  useEffect(() => { void sync(); }, [location.pathname, sync]);

  useEffect(() => {
    if (!user) return;
    let timer: number | undefined;
    const onActivity = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void sync(true), 900);
    };
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void sync(); }, 120_000);
    window.addEventListener("cf:activity", onActivity);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("cf:activity", onActivity);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, sync]);

  const value = useMemo<Ctx>(() => ({ unlocked, stats, ready, refresh: () => sync(true) }), [unlocked, stats, ready, sync]);

  const current = queue[0];
  const done = useCallback(() => setQueue((q) => q.slice(1)), []);

  return (
    <CommendationsContext.Provider value={value}>
      {children}
      {current && <CommendationToast key={current} commendationKey={current} onDone={done} />}
    </CommendationsContext.Provider>
  );
};

const CommendationToast: React.FC<{ commendationKey: string; onDone: () => void }> = ({ commendationKey, onDone }) => {
  const navigate = useNavigate();
  const c = COMMENDATION_MAP[commendationKey];
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    cfApi.markSeen([commendationKey]).catch(() => {});
    const t1 = window.setTimeout(() => setLeaving(true), TOAST_MS);
    const t2 = window.setTimeout(onDone, TOAST_MS + 340);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [commendationKey, onDone]);

  if (!c) return null;
  const rewards = [c.frame && `${FRAME_LABELS[c.frame] || c.frame} frame`, c.rewardTitle && `title “${c.rewardTitle}”`].filter(Boolean);

  return (
    <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:w-[380px]" role="status" aria-live="polite">
      <button
        type="button"
        onClick={() => { setLeaving(true); window.setTimeout(onDone, 320); navigate("/commendations"); }}
        className={`cf-toast ${leaving ? "cf-toast--leaving" : ""} case-file w-full text-left p-4 pr-5 flex items-center gap-4 overflow-hidden`}
      >
        <div className="relative shrink-0">
          <CommendationBadge commendation={c} unlocked size={72} stamp />
        </div>
        <div className="min-w-0 flex-1">
          <p className="case-label text-[9px] text-primary">Commendation declassified</p>
          <p className="font-display text-xl text-foreground mt-1 leading-tight">
            <span className="cf-declassify">{c.title}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
          {rewards.length > 0 && (
            <p className="case-label text-[9px] mt-2 text-foreground/80">Issued: {rewards.join(" · ")}</p>
          )}
        </div>
        <span className="absolute left-0 bottom-0 h-[3px] w-full bg-primary cf-toast__timer" style={{ animationDuration: `${TOAST_MS}ms` }} />
      </button>
    </div>
  );
};

export default CommendationsProvider;
