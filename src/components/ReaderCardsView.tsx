import React, { useEffect, useMemo, useState } from "react";
import { Chapter } from "@/hooks/useChapters";
import type { AuthUser } from "@/hooks/useAuth";

interface Props {
  chapter: Chapter;
  wordsPerCard: number;
  setWordsPerCard: (n: number) => void;
  user: AuthUser | null;
  onExit: (markUnread: boolean) => void;
}

/** Split chapter content into cards of approx N words, never breaking mid-sentence. */
function splitIntoCards(html: string, targetWords: number): string[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  // Convert <hr> and block elements to delimiters / sentences
  const text = (div.textContent || "").replace(/\s+/g, " ").trim();
  // Split into sentences (keep punctuation)
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*/g) || [text];
  const cards: string[] = [];
  let buf: string[] = [];
  let count = 0;
  for (const s of sentences) {
    const w = s.split(/\s+/).length;
    buf.push(s.trim());
    count += w;
    if (count >= targetWords) {
      cards.push(buf.join(" "));
      buf = [];
      count = 0;
    }
  }
  if (buf.length) cards.push(buf.join(" "));
  return cards.filter(Boolean);
}

export const ReaderCardsView: React.FC<Props> = ({ chapter, wordsPerCard, setWordsPerCard, user, onExit }) => {
  const cards = useMemo(() => splitIntoCards(chapter.content, wordsPerCard), [chapter.content, wordsPerCard]);
  const storageKey = `cards-progress:${user?.id || "anon"}:${chapter.id}`;
  const doneKey = `cards-done:${user?.id || "anon"}:${chapter.id}`;

  const [index, setIndex] = useState<number>(() => {
    try { return Math.min(Number(localStorage.getItem(storageKey)) || 0, cards.length - 1); } catch { return 0; }
  });
  const [doneSet, setDoneSet] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(doneKey) || "[]")); } catch { return new Set(); }
  });

  useEffect(() => { try { localStorage.setItem(storageKey, String(index)); } catch {} }, [index, storageKey]);
  useEffect(() => {
    try { localStorage.setItem(doneKey, JSON.stringify([...doneSet])); } catch {}
  }, [doneSet, doneKey]);

  const markDone = (i: number, done: boolean) => {
    setDoneSet(prev => {
      const next = new Set(prev);
      if (done) next.add(i); else next.delete(i);
      return next;
    });
  };

  const next = () => {
    markDone(index, true);
    setIndex(i => Math.min(i + 1, cards.length - 1));
  };
  const prev = () => setIndex(i => Math.max(0, i - 1));
  const notRead = () => markDone(index, false);

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 flex flex-col">
      <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Cards Mode · Chapter {chapter.chapterNumber}</p>
            <h1 className="font-display text-2xl text-accent">{chapter.title}</h1>
          </div>
          <button
            onClick={() => onExit(true)}
            aria-label="Exit Cards mode and mark as not read"
            className="px-3 py-1.5 rounded-md surface-maroon text-foreground/80 hover:text-foreground text-sm"
          >
            ✕ Exit
          </button>
        </div>

        {/* Words-per-card slider */}
        <label className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
          <span>Words per card</span>
          <input
            type="range" min={80} max={600} step={20}
            value={wordsPerCard}
            onChange={e => setWordsPerCard(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="tabular-nums">{wordsPerCard}</span>
        </label>

        {/* Progress dots */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to card ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-primary"
                : doneSet.has(i) ? "w-2 bg-emerald-500"
                : "w-2 bg-stone-700"
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <article className="prose-story flex-1 p-6 sm:p-8 rounded-xl border border-border/40 bg-card/40 mb-6 overflow-y-auto">
          <p className="leading-relaxed">{cards[index] || "—"}</p>
        </article>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3 pb-6">
          <button
            onClick={prev}
            disabled={index === 0}
            className="px-4 py-2 rounded-md border border-border/50 text-sm text-foreground/80 hover:bg-secondary/40 disabled:opacity-40 transition-colors"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={notRead}
              className="px-3 py-2 rounded-md surface-maroon text-foreground/80 text-xs hover:text-foreground transition-colors"
              title="Mark this card as not read"
            >
              Not read
            </button>
            <button
              onClick={() => markDone(index, true)}
              className="px-3 py-2 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs transition-colors"
              title="Save (mark this card as done)"
            >
              ✓ Save
            </button>
          </div>
          <button
            onClick={next}
            disabled={index >= cards.length - 1}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            Next →
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Card {index + 1} of {cards.length} · {doneSet.size} marked done
        </p>
      </div>
    </div>
  );
};

export default ReaderCardsView;
