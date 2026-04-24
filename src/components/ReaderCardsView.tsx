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

/**
 * Count actual words (whitespace-separated tokens) in a paragraph's plain text.
 * Strips HTML so embedded <span>/<a> wrapping (glossary terms) doesn't inflate the count.
 */
function countWords(text: string): number {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return 0;
  return clean.split(" ").length;
}

/**
 * Split chapter HTML into cards of approx N WORDS while preserving the original
 * paragraph structure. We never break mid-paragraph — paragraphs are kept whole
 * and grouped until the target word count is reached. Each card therefore renders
 * exactly the same paragraph spacing/line-height as the standard reader.
 *
 * Returns an array of card payloads, each containing the inner HTML for one or
 * more paragraphs separated by their original block boundaries.
 */
function splitIntoCards(html: string, targetWords: number): string[] {
  if (typeof window === "undefined") return [];
  const div = document.createElement("div");
  div.innerHTML = html;

  // Collect block-level chunks so paragraph breaks survive into the card.
  // We treat <p>, <h*>, <blockquote>, <hr>, <ul>, <ol>, <pre> as block atoms.
  const blocks: { html: string; words: number; isBreak: boolean }[] = [];
  div.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || "").trim();
      if (t) {
        blocks.push({ html: `<p>${t}</p>`, words: countWords(t), isBreak: false });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "hr") {
      blocks.push({ html: el.outerHTML, words: 0, isBreak: true });
      return;
    }
    const text = el.textContent || "";
    blocks.push({
      html: el.outerHTML,
      words: countWords(text),
      isBreak: false,
    });
  });

  // Fallback: if the chapter has no recognised blocks (rare — pure text) wrap
  // the whole thing as a single paragraph so we still produce cards.
  if (blocks.length === 0) {
    const t = (div.textContent || "").trim();
    if (t) blocks.push({ html: `<p>${t}</p>`, words: countWords(t), isBreak: false });
  }

  const cards: string[] = [];
  let bufHtml: string[] = [];
  let bufWords = 0;

  const flush = () => {
    if (bufHtml.length === 0) return;
    cards.push(bufHtml.join(""));
    bufHtml = [];
    bufWords = 0;
  };

  for (const b of blocks) {
    bufHtml.push(b.html);
    bufWords += b.words;
    // Once we've reached the target, close the card after this whole paragraph.
    // Scene-break <hr> always closes the current card too — it's a natural beat.
    if (b.isBreak || bufWords >= targetWords) {
      flush();
    }
  }
  flush();
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

  // Resetting wordsPerCard regenerates cards. Clamp the index so we don't land
  // past the end after the user enlarges the card size.
  useEffect(() => {
    if (index > cards.length - 1) setIndex(Math.max(0, cards.length - 1));
  }, [cards.length, index]);

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
        <div className="flex items-center justify-between gap-3 mb-4">
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

        {/* Words-per-card slider — kept compact in the header bar so its position
            never shifts as the card grows. */}
        <label className="flex items-center gap-2 mb-3 text-xs text-muted-foreground border border-border/40 rounded-lg px-3 py-2">
          <span className="whitespace-nowrap">Words per card</span>
          <input
            type="range" min={100} max={800} step={20}
            value={wordsPerCard}
            onChange={e => setWordsPerCard(Number(e.target.value))}
            className="flex-1 accent-primary"
            aria-label="Adjust words per card"
          />
          <span className="tabular-nums whitespace-nowrap">{wordsPerCard}</span>
        </label>

        {/* Progress dots */}
        <div className="flex flex-wrap gap-1.5 mb-3">
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

        {/* Controls — pinned ABOVE the card so they don't shift as content grows. */}
        <div className="flex items-center justify-between gap-3 mb-4">
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

        {/* Card — uses the same prose-story rules as the main reader so paragraph
            spacing, line-height, and font size all match. The drop-cap is
            suppressed via `no-dropcap` because per-card big initials are noisy. */}
        <article
          className="prose-story no-dropcap flex-1 p-6 sm:p-8 rounded-xl border border-border/40 bg-card/40 mb-4 overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: cards[index] || "<p>—</p>" }}
        />

        <p className="text-center text-xs text-muted-foreground pb-6">
          Card {index + 1} of {cards.length} · {doneSet.size} marked done
        </p>
      </div>
    </div>
  );
};

export default ReaderCardsView;
