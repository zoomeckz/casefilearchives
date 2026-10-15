import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AuthUser } from "@/hooks/useAuth";
import type { Chapter } from "@/hooks/useChapters";
import { sessionToken } from "@/lib/commendations";
import "@/components/commendations/commendations.css";

// Remembers how far readers got in each story: in this browser for everyone,
// and in their account (reading_positions) when signed in, so it follows
// them between devices.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const LS_KEY = "cf-reading-positions";
const AUTO_KEY = "cf-autoresume";
/** Below this a story counts as not started, above DONE as finished. */
const MIN = 3;
const DONE = 97;

type Pos = { p: number; t: string };

function readLocal(): Record<string, Pos> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch { return {}; }
}

function writeLocal(id: string, p: number) {
  try {
    const all = readLocal();
    all[id] = { p, t: new Date().toISOString() };
    const newest = Object.entries(all).sort((a, b) => b[1].t.localeCompare(a[1].t)).slice(0, 100);
    localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch { /* storage full or blocked */ }
}

async function fetchServer(): Promise<Record<string, Pos>> {
  const token = sessionToken();
  if (!token) return {};
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/reading_positions?select=chapter_id,progress,updated_at&order=updated_at.desc&limit=100`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};
    const rows: { chapter_id: string; progress: number; updated_at: string }[] = await res.json();
    return Object.fromEntries(rows.map((r) => [r.chapter_id, { p: Number(r.progress) || 0, t: r.updated_at }]));
  } catch {
    return {};
  }
}

async function saveServer(userId: string, chapterId: string, p: number) {
  const token = sessionToken();
  if (!token) return;
  try {
    await fetch(`${SUPA_URL}/rest/v1/reading_positions?on_conflict=user_id,chapter_id`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ user_id: userId, chapter_id: chapterId, progress: Math.round(p * 10) / 10, updated_at: new Date().toISOString() }),
    });
  } catch { /* offline; the browser copy is still saved */ }
}

/** Newest known position per story, from this browser and (signed in) the account. */
export async function loadPositions(user: AuthUser | null): Promise<Record<string, Pos>> {
  const merged = readLocal();
  const server = user ? await fetchServer() : {};
  for (const [id, pos] of Object.entries(server)) {
    if (!merged[id] || merged[id].t < pos.t) merged[id] = pos;
  }
  return merged;
}

function scrollToPercent(pct: number) {
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const y = (pct / 100) * max;
  const lenis = (window as any).__lenis;
  if (lenis && typeof lenis.scrollTo === "function") lenis.scrollTo(y, { duration: 1.4 });
  else window.scrollTo({ top: y, behavior: "smooth" });
}

/**
 * Tracks the reader's position in one story. `progress` is the page's scroll
 * percentage (0–100). Nothing is saved until the reader has scrolled, so
 * opening a story never overwrites an earlier position with 0.
 */
export function useReadingPosition(chapterId: string | undefined, progress: number, enabled: boolean, user: AuthUser | null) {
  const [saved, setSaved] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const armed = useRef(false);
  const latest = useRef(0);
  const lastLocal = useRef(-1);
  const lastServer = useRef(-1);

  useEffect(() => {
    armed.current = false;
    lastLocal.current = -1;
    lastServer.current = -1;
    setDismissed(false);
    setSaved(null);
    if (!enabled || !chapterId) return;
    let cancelled = false;
    loadPositions(user).then((all) => {
      if (cancelled) return;
      const p = all[chapterId]?.p ?? null;
      setSaved(p);
      // Opened from "Continue reading": go straight back to the spot.
      let auto = false;
      try { auto = sessionStorage.getItem(AUTO_KEY) === chapterId; sessionStorage.removeItem(AUTO_KEY); } catch { /* ignore */ }
      if (auto && p != null && p > MIN && p < DONE) {
        window.setTimeout(() => { scrollToPercent(p); armed.current = true; setDismissed(true); }, 700);
      }
    });
    return () => { cancelled = true; };
  }, [chapterId, enabled, user?.id]);

  useEffect(() => {
    if (!enabled || !chapterId) return;
    latest.current = progress;
    if (progress > MIN) armed.current = true;
    if (!armed.current) return;
    const p = progress >= DONE ? 100 : progress;
    if (Math.abs(p - lastLocal.current) >= 1) {
      writeLocal(chapterId, p);
      lastLocal.current = p;
    }
  }, [progress, chapterId, enabled]);

  useEffect(() => {
    if (!enabled || !chapterId || !user) return;
    const flush = () => {
      if (!armed.current) return;
      const p = latest.current >= DONE ? 100 : latest.current;
      if (Math.abs(p - lastServer.current) < 1) return;
      lastServer.current = p;
      void saveServer(user.id, chapterId, p);
    };
    const id = window.setInterval(flush, 15000);
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flush();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [chapterId, enabled, user?.id]);

  const resume = useCallback(() => {
    if (saved == null) return;
    scrollToPercent(saved);
    armed.current = true;
    setDismissed(true);
  }, [saved]);

  const show = enabled && !dismissed && saved != null && saved > MIN && saved < DONE && progress < 2;
  return { saved, show, resume, dismiss: () => setDismissed(true) };
}

export type ReadingPositionState = ReturnType<typeof useReadingPosition>;

/** "You left off at 42%": shown at the top of a story the reader has started. */
export const ResumeBanner: React.FC<{ position: ReadingPositionState }> = ({ position }) => {
  if (!position.show || position.saved == null) return null;
  return (
    <div className="mb-8 case-file p-4 flex flex-wrap items-center justify-between gap-3 cf-rise" role="status">
      <div className="min-w-0">
        <p className="case-label text-[9px]">Bookmark on file</p>
        <p className="text-sm text-foreground mt-1">You left off {Math.round(position.saved)}% of the way through.</p>
        <div className="mt-2 h-1 bg-secondary w-48 max-w-full overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${position.saved}%` }} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={position.resume} className="px-4 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-wider">
          Resume reading
        </button>
        <button type="button" onClick={position.dismiss} className="px-3 py-2 border border-border text-xs uppercase tracking-wider">
          Start over
        </button>
      </div>
    </div>
  );
};

/** Home page row of stories the reader started but did not finish. */
export const ContinueReading: React.FC<{ chapters: Chapter[]; user: AuthUser | null; onOpen: (c: Chapter) => void }> = ({ chapters, user, onOpen }) => {
  const [items, setItems] = useState<{ chapter: Chapter; p: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPositions(user).then((all) => {
      if (cancelled) return;
      const byId = new Map(chapters.map((c) => [c.id, c]));
      setItems(
        Object.entries(all)
          .filter(([id, pos]) => byId.has(id) && pos.p > MIN && pos.p < DONE && byId.get(id)!.storyFormat !== "interactive")
          .sort((a, b) => b[1].t.localeCompare(a[1].t))
          .slice(0, 3)
          .map(([id, pos]) => ({ chapter: byId.get(id)!, p: pos.p })),
      );
    });
    return () => { cancelled = true; };
  }, [chapters, user?.id]);

  if (items.length === 0) return null;

  return (
    <section className="border-b border-border px-4 sm:px-6 py-10 sm:py-12">
      <div className="max-w-6xl mx-auto">
        <p className="case-label text-[10px] mb-2">Open investigations</p>
        <h2 className="font-display text-2xl sm:text-3xl text-foreground uppercase mb-6">Continue reading</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ chapter, p }, i) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => { try { sessionStorage.setItem(AUTO_KEY, chapter.id); } catch { /* ignore */ } onOpen(chapter); }}
              className="case-file p-5 text-left group hover:border-primary transition-colors cf-rise"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="case-label text-[9px]">{Math.round(p)}% read</span>
              <span className="block font-display text-xl text-foreground group-hover:text-primary transition-colors mt-2">{chapter.title}</span>
              <span className="block mt-4 h-1 bg-secondary overflow-hidden">
                <span className="block h-full bg-primary" style={{ width: `${p}%` }} />
              </span>
              <span className="case-label text-[9px] mt-3 inline-block group-hover:!text-primary">Resume →</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
