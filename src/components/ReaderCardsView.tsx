import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Chapter } from "@/hooks/useChapters";
import type { AuthUser } from "@/hooks/useAuth";

// Cards mode: the story read one short card at a time.
// Cards always end where a paragraph (or, inside a very long paragraph, a sentence) ends,
// a new scene always starts a new card, and back-and-forth dialogue is kept together.
// An admin can arrange the cards by hand ("Edit cards"); readers then get that arrangement.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Props {
  chapter: Chapter;
  /** Kept for the reader page's API; card length is now chosen inside cards mode. */
  wordsPerCard?: number;
  setWordsPerCard?: (n: number) => void;
  user: AuthUser | null;
  onExit: (markUnread: boolean) => void;
}

type Size = "short" | "medium" | "long";
const SIZES: Record<Size, number> = { short: 70, medium: 110, long: 180 };

// ── Splitting ────────────────────────────────────────────────────────────────

interface Block { html: string; text: string; words: number; key: string; scene: number; plain: boolean }
interface Unit { html: string; words: number; dialogue: boolean; scene: number; block: number; first: boolean }
interface Card { html: string; words: number; sceneStart: boolean }

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const countWords = (s: string) => { const t = norm(s); return t ? t.split(" ").length : 0; };
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DIALOGUE = /^["“”‘'«—–-]/;

/** The story's paragraphs, with scene numbers (a scene ends at each <hr>). */
function parseBlocks(html: string): Block[] {
  if (typeof window === "undefined") return [];
  const div = document.createElement("div");
  div.innerHTML = html || "";
  const out: Block[] = [];
  const seen = new Map<string, number>();
  let scene = 0;
  const push = (blockHtml: string, text: string, plain: boolean) => {
    const base = norm(text).slice(0, 80).toLowerCase();
    if (!base) return;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    // The key names the paragraph by its opening words, so hand-made card breaks
    // survive edits elsewhere in the story.
    out.push({ html: blockHtml, text: norm(text), words: countWords(text), key: `${base}#${n}`, scene, plain });
  };
  div.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text.trim()) push(`<p>${escapeHtml(text.trim())}</p>`, text, true);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "hr") {
      if (out.length && out[out.length - 1].scene === scene) scene++;
      return;
    }
    if (tag === "br") return;
    push(el.outerHTML, el.textContent || "", tag === "p" && el.children.length === 0);
  });
  return out;
}

function sentences(text: string): string[] {
  const Seg = (Intl as any).Segmenter;
  if (Seg) {
    return [...new Seg(undefined, { granularity: "sentence" }).segment(text)].map((s: any) => s.segment as string).filter((s) => s.trim());
  }
  return text.match(/[^.!?…]+[.!?…]+["”’)\]]*\s*|[^.!?…]+$/g) || [text];
}

/** Paragraphs as card pieces. A paragraph much longer than a card is shared out between sentences. */
function toUnits(blocks: Block[], target: number | null): Unit[] {
  const units: Unit[] = [];
  blocks.forEach((b, i) => {
    const dialogue = DIALOGUE.test(b.text);
    if (target && b.plain && b.words > target * 1.5) {
      const parts: string[] = [];
      let cur = "";
      for (const s of sentences(b.text)) {
        if (cur && countWords(cur) + countWords(s) > target) { parts.push(cur); cur = ""; }
        cur += s;
      }
      if (cur.trim()) parts.push(cur);
      parts.forEach((p, j) => units.push({ html: `<p>${escapeHtml(p.trim())}</p>`, words: countWords(p), dialogue, scene: b.scene, block: i, first: j === 0 }));
    } else {
      units.push({ html: b.html, words: b.words, dialogue, scene: b.scene, block: i, first: true });
    }
  });
  return units;
}

/** Where each card starts (unit indexes): even cards near the target length, broken at natural pauses. */
function autoStarts(units: Unit[], target: number): number[] {
  if (!units.length) return [];
  const sum = (a: number, b: number) => units.slice(a, b).reduce((n, u) => n + u.words, 0);
  // Scenes, with very short ones joined to their neighbour so no card is a scrap.
  const groups: [number, number][] = [];
  let from = 0;
  for (let i = 1; i <= units.length; i++) {
    if (i === units.length || units[i].scene !== units[i - 1].scene) { groups.push([from, i]); from = i; }
  }
  const merged: [number, number][] = [];
  for (const g of groups) {
    const last = merged[merged.length - 1];
    if (last && (sum(g[0], g[1]) < target * 0.35 || sum(last[0], last[1]) < target * 0.35)) last[1] = g[1];
    else merged.push([g[0], g[1]]);
  }

  const starts: number[] = [];
  for (const [a, b] of merged) {
    const n = b - a;
    const prefix = [0];
    for (let i = a; i < b; i++) prefix.push(prefix[prefix.length - 1] + units[i].words);
    const best = new Array<number>(n + 1).fill(Infinity);
    const prev = new Array<number>(n + 1).fill(0);
    best[0] = 0;
    for (let j = 1; j <= n; j++) {
      for (let i = j - 1; i >= 0; i--) {
        const words = prefix[j] - prefix[i];
        if (words > target * 2.2 && j - i > 1) break;
        const dev = (words - target) / target;
        let cost = dev * dev * (words < target ? 1.6 : 1);
        if (i > 0) {
          const before = units[a + i - 1];
          const after = units[a + i];
          if (before.dialogue && after.dialogue) cost += 0.35; // keep a conversation on one card
          if (!after.first) cost += 0.15;                      // prefer paragraph ends to sentence ends
          if (before.words <= 6) cost += 0.2;                  // a one-line beat belongs with what follows
        }
        const total = best[i] + cost + 0.05;
        if (total < best[j]) { best[j] = total; prev[j] = i; }
      }
    }
    const local: number[] = [];
    for (let j = n; j > 0; j = prev[j]) local.push(prev[j]);
    local.reverse().forEach((i) => starts.push(a + i));
  }
  return starts;
}

function buildCards(units: Unit[], starts: number[]): Card[] {
  const cards: Card[] = [];
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : units.length;
    const slice = units.slice(s, end);
    if (!slice.length) return;
    const html = slice.map((u, i) => (i > 0 && u.scene !== slice[i - 1].scene ? "<hr>" : "") + u.html).join("");
    cards.push({ html, words: slice.reduce((n, u) => n + u.words, 0), sceneStart: s > 0 && units[s].scene !== units[s - 1].scene });
  });
  return cards;
}

/** Hand-made starts, or null if the story changed so much that most no longer match. */
function authorStarts(blocks: Block[], keys: string[] | null): number[] | null {
  if (!keys?.length) return null;
  const set = new Set(keys);
  const starts = [0];
  let matched = 0;
  blocks.forEach((b, i) => {
    if (!set.has(b.key)) return;
    matched++;
    if (i > 0) starts.push(i);
  });
  return matched / keys.length >= 0.6 ? starts : null;
}

// ── Data ─────────────────────────────────────────────────────────────────────

function sessionToken(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem("app-auth-session") || "null");
    return s?.access_token || null;
  } catch { return null; }
}

async function loadBreaks(chapterId: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/chapters?select=card_breaks&id=eq.${chapterId}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${sessionToken() || ANON}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const starts = rows?.[0]?.card_breaks?.starts;
    return Array.isArray(starts) && starts.length ? starts : null;
  } catch { return null; }
}

async function saveBreaks(chapterId: string, keys: string[] | null) {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/admin_set_card_breaks`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${sessionToken() || ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ _chapter_id: chapterId, _starts: keys }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "request_failed");
  }
}

// ── Reader ───────────────────────────────────────────────────────────────────

export const ReaderCardsView: React.FC<Props> = ({ chapter, user, onExit }) => {
  const { t } = useTranslation();
  const [size, setSize] = useState<Size>(() => {
    try { const s = localStorage.getItem("reader-card-size") as Size | null; return s && s in SIZES ? s : "medium"; } catch { return "medium"; }
  });
  const [breaks, setBreaks] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const isAdmin = !!(user as any)?.isAdmin;

  useEffect(() => { try { localStorage.setItem("reader-card-size", size); } catch { /* storage blocked */ } }, [size]);
  useEffect(() => {
    let cancelled = false;
    setBreaks(null);
    loadBreaks(chapter.id).then((b) => { if (!cancelled) setBreaks(b); });
    return () => { cancelled = true; };
  }, [chapter.id]);

  const blocks = useMemo(() => parseBlocks(chapter.content), [chapter.content]);
  const author = useMemo(() => authorStarts(blocks, breaks), [blocks, breaks]);
  const cards = useMemo(() => {
    if (author) return buildCards(toUnits(blocks, null), author);
    const units = toUnits(blocks, SIZES[size]);
    return buildCards(units, autoStarts(units, SIZES[size]));
  }, [blocks, author, size]);

  const storageKey = `cards-progress:${user?.id || "anon"}:${chapter.id}`;
  const [index, setIndex] = useState<number>(() => {
    try { return Math.max(0, Number(localStorage.getItem(storageKey)) || 0); } catch { return 0; }
  });
  useEffect(() => { if (index > cards.length - 1) setIndex(Math.max(0, cards.length - 1)); }, [cards.length, index]);
  useEffect(() => { try { localStorage.setItem(storageKey, String(index)); } catch { /* storage blocked */ } }, [index, storageKey]);

  const last = index >= cards.length - 1;
  const next = () => setIndex((i) => Math.min(i + 1, cards.length - 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const finish = () => {
    try { localStorage.removeItem(storageKey); } catch { /* storage blocked */ }
    onExit(false);
  };

  // A new card starts at its top.
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [index]);

  // ← / → between cards, unless the reader is typing or using another control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) || el.closest("[role=slider],[role=tab],[role=menu],[role=listbox]"))) return;
      e.preventDefault();
      if (e.key === "ArrowRight") next(); else prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, editing]);

  if (editing) {
    const units = toUnits(blocks, SIZES[size]);
    const suggested = autoStarts(units, SIZES[size]).filter((s) => units[s].first).map((s) => units[s].block);
    return (
      <CardEditor
        title={chapter.title}
        blocks={blocks}
        initial={author ?? null}
        suggested={suggested}
        onCancel={() => setEditing(false)}
        onSave={async (starts) => {
          const keys = starts ? [blocks[0], ...starts.filter((s) => s > 0).map((s) => blocks[s])].map((b) => b.key) : null;
          await saveBreaks(chapter.id, keys);
          setBreaks(keys);
          setIndex(0);
          setEditing(false);
        }}
      />
    );
  }

  const card = cards[index];
  const pct = cards.length ? ((index + 1) / cards.length) * 100 : 0;
  const btn = "px-4 py-2.5 rounded-md text-sm transition-colors disabled:opacity-40";

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="case-label text-[9px]">{t("reader.cardsMode")} · {index + 1} / {cards.length}</p>
            <h1 className="font-display text-xl sm:text-2xl text-foreground truncate">{chapter.title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button type="button" onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary">
                {t("reader.editCards", "Edit cards")}
              </button>
            )}
            <button type="button" onClick={() => onExit(false)} aria-label={t("reader.exitCards")} className="px-3 py-1.5 rounded-md surface-maroon text-foreground/80 hover:text-foreground text-sm">
              ✕ <span className="hidden sm:inline">{t("reader.exitCards")}</span>
            </button>
          </div>
        </div>

        <div className="h-1 bg-secondary mb-4 overflow-hidden rounded-full" aria-hidden="true">
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>

        {author ? (
          <p className="text-[11px] text-muted-foreground mb-4">{t("reader.cardsByAuthor", "Cards arranged by the author.")}</p>
        ) : (
          <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground" role="group" aria-label={t("reader.cardLength", "Card length")}>
            <span>{t("reader.cardLength", "Card length")}</span>
            {(["short", "medium", "long"] as Size[]).map((s) => (
              <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s}
                className={`px-2.5 py-1 rounded border transition-colors ${size === s ? "border-primary text-foreground bg-primary/10" : "border-border hover:text-foreground"}`}>
                {s === "short" ? t("reader.cardShort", "Short") : s === "medium" ? t("reader.cardMedium", "Medium") : t("reader.cardLong", "Long")}
              </button>
            ))}
          </div>
        )}

        {card?.sceneStart && <p className="text-center text-muted-foreground/60 tracking-[0.6em] mb-2" aria-label={t("reader.newScene", "New scene")}>· · ·</p>}

        <article
          key={index}
          className="prose-story no-dropcap animate-fade-in rounded-xl border border-border/40 bg-card/40 p-6 sm:p-8 min-h-[40vh]"
          onTouchStart={(e) => { const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY }; }}
          onTouchEnd={(e) => {
            const start = touch.current;
            touch.current = null;
            if (!start) return;
            const p = e.changedTouches[0];
            const dx = p.clientX - start.x;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(p.clientY - start.y) * 1.5) { if (dx < 0) next(); else prev(); }
          }}
          dangerouslySetInnerHTML={{ __html: card?.html || "<p>—</p>" }}
        />

        <div className="flex items-center justify-between gap-3 mt-4">
          <button type="button" onClick={prev} disabled={index === 0} className={`${btn} border border-border/60 text-foreground/80 hover:bg-secondary/40`}>
            ← {t("reader.previous")}
          </button>
          {last ? (
            <button type="button" onClick={finish} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
              {t("reader.finishCards", "Finish")} ✓
            </button>
          ) : (
            <button type="button" onClick={next} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
              {t("reader.next")} →
            </button>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-4 pb-6">
          <span className="sm:hidden">{t("reader.swipeHint", "Swipe to turn the card")}</span>
          <span className="hidden sm:inline">← / → {t("reader.kbHint", "to navigate")}</span>
        </p>
      </div>
    </div>
  );
};

// ── Admin: arrange the cards by hand ─────────────────────────────────────────

const CardEditor: React.FC<{
  title: string;
  blocks: Block[];
  initial: number[] | null;
  suggested: number[];
  onCancel: () => void;
  onSave: (starts: number[] | null) => Promise<void>;
}> = ({ title, blocks, initial, suggested, onCancel, onSave }) => {
  const [starts, setStarts] = useState<Set<number>>(() => new Set((initial ?? suggested).filter((s) => s > 0)));
  const [busy, setBusy] = useState(false);

  const toggle = (i: number) => setStarts((cur) => {
    const next = new Set(cur);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  // Word count and number of each card, for the labels.
  const cardOf: number[] = [];
  const cardWords: number[] = [];
  blocks.forEach((b, i) => {
    const n = i === 0 ? 0 : cardOf[i - 1] + (starts.has(i) ? 1 : 0);
    cardOf.push(n);
    cardWords[n] = (cardWords[n] || 0) + b.words;
  });
  const total = (cardOf[cardOf.length - 1] ?? 0) + 1;

  const save = async (value: number[] | null) => {
    setBusy(true);
    try {
      await onSave(value);
      toast.success(value ? "Cards saved" : "Back to automatic cards");
    } catch (e: any) {
      toast.error(/card_breaks|admin_set_card_breaks/.test(e?.message || "") ? "Apply the latest database migration first." : e?.message || "Could not save the cards.");
    } finally {
      setBusy(false);
    }
  };

  const btn = "px-3 py-1.5 rounded border text-xs transition-colors disabled:opacity-50";

  return (
    <div className="min-h-screen py-6 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border py-3 mb-4">
          <p className="case-label text-[9px]">Edit cards · {total} cards</p>
          <h1 className="font-display text-xl text-foreground truncate">{title}</h1>
          <p className="text-[11px] text-muted-foreground mt-1">Click between two paragraphs to start a new card there. Click a red line to remove it.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" disabled={busy} onClick={() => save([...starts].sort((a, b) => a - b))} className={`${btn} border-primary bg-primary text-primary-foreground`}>
              {busy ? "Saving…" : "Save cards"}
            </button>
            <button type="button" disabled={busy} onClick={() => setStarts(new Set(suggested.filter((s) => s > 0)))} className={`${btn} border-border hover:border-primary`}>Start from automatic</button>
            <button type="button" disabled={busy} onClick={() => setStarts(new Set())} className={`${btn} border-border hover:border-primary`}>Clear all</button>
            {initial && (
              <button type="button" disabled={busy} onClick={() => { if (window.confirm("Remove your arrangement and let the site split the cards automatically?")) void save(null); }} className={`${btn} border-border hover:border-primary`}>
                Use automatic cards
              </button>
            )}
            <button type="button" disabled={busy} onClick={onCancel} className={`${btn} border-border text-muted-foreground`}>Cancel</button>
          </div>
        </div>

        <ol className="space-y-0">
          {blocks.map((b, i) => (
            <li key={b.key}>
              {i > 0 && (
                <button type="button" onClick={() => toggle(i)}
                  className={`group w-full flex items-center gap-2 py-1.5 text-[10px] uppercase tracking-wider ${starts.has(i) ? "text-primary" : "text-transparent hover:text-muted-foreground"}`}
                  aria-label={starts.has(i) ? `Remove the card break before paragraph ${i + 1}` : `Start a new card at paragraph ${i + 1}`}>
                  <span className={`flex-1 h-px ${starts.has(i) ? "bg-primary" : "bg-transparent group-hover:bg-border"}`} />
                  {starts.has(i) ? "New card" : "+ new card here"}
                  <span className={`flex-1 h-px ${starts.has(i) ? "bg-primary" : "bg-transparent group-hover:bg-border"}`} />
                </button>
              )}
              {(i === 0 || starts.has(i)) && (
                <p className="case-label text-[9px] mb-1">Card {cardOf[i] + 1} · {cardWords[cardOf[i]]} words</p>
              )}
              {i > 0 && b.scene !== blocks[i - 1].scene && <p className="text-[10px] text-muted-foreground/70 text-center mb-1">— scene break —</p>}
              <div className="prose-story no-dropcap text-sm opacity-90 [&>*]:my-1" dangerouslySetInnerHTML={{ __html: b.html }} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default ReaderCardsView;
