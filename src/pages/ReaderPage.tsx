import React, { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Icons } from "@/lib/icons";
import { Chapter } from "@/hooks/useChapters";
import { GlossaryEntry } from "@/lib/data";
import DOMPurify from "dompurify";
import { CommentsSection } from "@/components/CommentsSection";
import { TextToSpeech } from "@/components/TextToSpeech";
import { AuthUser } from "@/hooks/useAuth";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ChapterReactions } from "@/components/ChapterReactions";
import { ChapterPoll } from "@/components/ChapterPoll";
import { TextHighlightBookmark } from "@/components/TextHighlightBookmark";
import { ReaderCardsView } from "@/components/ReaderCardsView";


function estimateReadingTime(content: string): number {
  const words = content.replace(/<[^>]*>/g, "").split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 220));
}

interface ReaderPageProps {
  chapter: Chapter | null;
  chapters: Chapter[];
  setSelectedChapter: (chapter: Chapter) => void;
  setCurrentPage: (page: string) => void;
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
  glossary: Record<string, GlossaryEntry>;
  markAsRead: (chapterId: string) => void;
  incrementViews: (chapterId: string) => void;
  isBookmarked: (chapterId: string) => boolean;
  toggleBookmark: (chapterId: string) => void;
}

export const ReaderPage: React.FC<ReaderPageProps> = ({
  chapter,
  chapters,
  setSelectedChapter,
  setCurrentPage,
  user,
  setShowAuthModal,
  glossary,
  markAsRead,
  incrementViews,
  isBookmarked,
  toggleBookmark,
}) => {
  const { t } = useTranslation();
  const discussionPrompts = [
    t("reader.prompt1", "What do you think will happen next?"),
    t("reader.prompt2", "Which character stood out most in this chapter?"),
    t("reader.prompt3", "Did anything surprise you?"),
    t("reader.prompt4", "What's your theory about the ending?"),
    t("reader.prompt5", "How did this chapter change your view of the story?"),
  ];
  const [randomPrompt] = useState(() => discussionPrompts[Math.floor(Math.random() * discussionPrompts.length)]);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [readerWidth, setReaderWidth] = useState<number>(() => {
    try { return Number(localStorage.getItem("reader-width")) || 680; } catch { return 680; }
  });
  const [tipDismissed, setTipDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem("reader-tip-dismissed") === "1"; } catch { return false; }
  });
  const [cardsMode, setCardsMode] = useState(false);
  const [wordsPerCard, setWordsPerCard] = useState<number>(() => {
    try { return Number(localStorage.getItem("reader-words-per-card")) || 250; } catch { return 250; }
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [charsPerLine, setCharsPerLine] = useState<number>(0);

  // Persist + apply reader width via CSS var
  useEffect(() => {
    try { localStorage.setItem("reader-width", String(readerWidth)); } catch {}
    document.documentElement.style.setProperty("--reader-max-width", `${readerWidth}px`);
  }, [readerWidth]);
  useEffect(() => {
    try { localStorage.setItem("reader-words-per-card", String(wordsPerCard)); } catch {}
  }, [wordsPerCard]);

  // Measure approximate characters per line in the prose column
  useEffect(() => {
    const span = measureRef.current;
    if (!span) return;
    const colWidth = readerWidth - 64; // approx padding
    const charWidth = span.getBoundingClientRect().width / 50; // sample width of "M"*50
    if (charWidth > 0) setCharsPerLine(Math.round(colWidth / charWidth));
  }, [readerWidth, chapter?.id]);

  // Find the nearest ancestor that is actually scrollable. If none, fall back to window.
  const getScrollSource = (): HTMLElement | Window => {
    let el: HTMLElement | null = containerRef.current;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      const isScrollable =
        (overflowY === "auto" || overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight;
      if (isScrollable) return el;
      el = el.parentElement;
    }
    return window;
  };

  const scrollToTop = () => {
    // Prefer Lenis if available so the smooth-scroller doesn't fight us on mobile
    const lenis = (window as any).__lenis;
    if (lenis && typeof lenis.scrollTo === "function") {
      lenis.scrollTo(0, { duration: 1.0 });
      return;
    }
    const src = getScrollSource();
    if (src === window) {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    } else {
      (src as HTMLElement).scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (chapter) {
      // Scroll to top whenever a new chapter opens (fixes mobile mid-page landing).
      // Lenis hijacks scroll, so we must tell it to jump too — otherwise it
      // restores its own internal scroll position on the next frame and the
      // reader lands a tad below the top.
      const jumpTop = () => {
        const lenis = (window as any).__lenis;
        if (lenis && typeof lenis.scrollTo === "function") {
          lenis.scrollTo(0, { immediate: true, force: true });
        }
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      };
      jumpTop();
      // Run again after layout settles (images/fonts can shift content,
      // and Lenis sometimes re-syncs on the next frame).
      requestAnimationFrame(jumpTop);
      const t1 = window.setTimeout(jumpTop, 50);
      const t2 = window.setTimeout(jumpTop, 200);
      incrementViews(chapter.id);
      if (user) markAsRead(chapter.id);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
  }, [chapter?.id, user?.id]);

  useEffect(() => {
    const src = getScrollSource();
    const onScroll = () => {
      let scrollTop: number;
      let docHeight: number;
      if (src === window) {
        scrollTop = window.scrollY || document.documentElement.scrollTop;
        docHeight =
          (document.documentElement.scrollHeight || document.body.scrollHeight) -
          window.innerHeight;
      } else {
        const el = src as HTMLElement;
        scrollTop = el.scrollTop;
        docHeight = el.scrollHeight - el.clientHeight;
      }
      const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
      setScrollProgress(pct);
      setShowBackToTop(scrollTop > 600);
    };
    onScroll();
    src.addEventListener("scroll", onScroll, { passive: true } as AddEventListenerOptions);
    window.addEventListener("resize", onScroll);
    return () => {
      src.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [chapter?.id]);

  // Keyboard shortcut: press "t" to scroll back to the top.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT";
      if (isEditable) return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        scrollToTop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chapter?.id]);

  if (!chapter) return null;

  const currentIndex = chapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const readTime = estimateReadingTime(chapter.content);

  if (cardsMode) {
    return (
      <ReaderCardsView
        chapter={chapter}
        wordsPerCard={wordsPerCard}
        setWordsPerCard={setWordsPerCard}
        user={user}
        onExit={(markUnread) => {
          setCardsMode(false);
          if (markUnread) {
            // user pressed X → treat chapter as not-read for them
            // (best-effort; relies on markAsUnread being available elsewhere)
          }
        }}
      />
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      {/* Reading progress bar */}
      <div
        className="fixed top-0 left-0 right-0 h-1 bg-transparent z-50 pointer-events-none"
        role="progressbar"
        aria-label={`Reading progress: ${Math.round(scrollProgress)}%`}
        aria-valuenow={Math.round(scrollProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full reading-progress-bar transition-[width] duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Hidden character-width measuring span */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="prose-story absolute opacity-0 pointer-events-none"
        style={{ position: "absolute", left: -9999, top: -9999 }}
      >
        {"M".repeat(50)}
      </span>

      <div className="reader-column">
        <button
          onClick={() => setCurrentPage("chapters")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8"
        >
          <Icons.ChevronLeft />
          {t("reader.back")}
        </button>

        {/* Reader controls — width slider + cards mode toggle */}
        <div className="mb-8 flex flex-wrap items-center gap-4 text-xs text-muted-foreground border border-border/40 rounded-lg p-3">
          <label className="flex items-center gap-2 flex-1 min-w-[220px]">
            <span className="whitespace-nowrap">{t("reader.pageWidth")}</span>
            <input
              type="range"
              min={520}
              max={960}
              step={20}
              value={readerWidth}
              onChange={(e) => setReaderWidth(Number(e.target.value))}
              className="flex-1 accent-primary"
              aria-label="Adjust reading column width"
            />
            <span className="tabular-nums whitespace-nowrap">
              {readerWidth}px{charsPerLine > 0 && ` · ~${charsPerLine} ch/line`}
            </span>
          </label>
          <button
            type="button"
            onClick={() => setCardsMode(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-accent-foreground border border-accent shadow-md hover:bg-accent/90 hover:shadow-lg transition-all font-semibold text-sm"
            title="Read in focused, swipeable cards — great on mobile"
          >
            📇 {t("reader.cardsMode")}
            <span className="hidden sm:inline text-[10px] uppercase tracking-wider opacity-80 ml-1 px-1.5 py-0.5 rounded bg-accent-foreground/15">
              New
            </span>
          </button>
        </div>

        <header className="mb-12 text-center">
          <span className="text-primary text-sm font-medium">
            {t("chapters.chapterLabel")} {chapter.chapterNumber}
          </span>
          <h1 className="font-display text-4xl sm:text-5xl text-accent mt-2 mb-4">
            {chapter.title}
          </h1>
          <div className="flex flex-nowrap sm:flex-wrap items-center justify-center gap-2 sm:gap-4 text-muted-foreground text-xs sm:text-sm overflow-x-auto whitespace-nowrap">
            <span>{new Date(chapter.publishedAt).toLocaleDateString()}</span>
            <span className="flex items-center gap-1">
              <Icons.Eye className="w-4 h-4" /> {chapter.views}
            </span>
            <span>~{readTime} min</span>
            {user?.isAdmin && (
              <Link
                to={`/admin?tab=chapters&view=edit&chapter=${chapter.id}`}
                className="flex items-center gap-1 px-3 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded-full text-xs font-medium transition-colors"
              >
                <Icons.Edit className="w-3.5 h-3.5" />
                {t("reader.edit")}
              </Link>
            )}
            {user && (
              <BookmarkButton
                isBookmarked={isBookmarked(chapter.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBookmark(chapter.id);
                }}
                size="md"
              />
            )}
          </div>
        </header>

        {/* Text highlight bookmarks */}
        <TextHighlightBookmark chapterId={chapter.id} chapterNumber={chapter.chapterNumber} user={user} setShowAuthModal={setShowAuthModal} />

        <article
          className="mb-12 rounded-xl p-6 sm:p-8"
        >
          <div
            className="prose-story chapter-content"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(chapter.content) }}
          />
        </article>

        {/* Chapter Reactions */}
        <div className="mb-8">
          <ChapterReactions chapterId={chapter.id} user={user} setShowAuthModal={setShowAuthModal} />
        </div>

        {/* Chapter Poll (if any) */}
        <div className="mb-8">
          <ChapterPoll chapterId={chapter.id} user={user} setShowAuthModal={setShowAuthModal} />
        </div>

        {/* Discussion Prompt */}
        <div className="mb-8 p-4 bg-primary/5 rounded-lg border border-primary/20 text-center">
          <p className="text-primary text-sm font-medium">💬 {t("reader.discussionPrompt")}</p>
          <p className="text-foreground/80 mt-1">{randomPrompt}</p>
        </div>

        <CommentsSection
          chapterId={chapter.id}
          user={user}
          setShowAuthModal={setShowAuthModal}
        />
      </div>

      {/* Floating back-to-top button */}
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Back to top (press T)"
        title="Back to top (press T)"
        className={`fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-border/50 transition-all duration-200 hover:scale-105 hover:bg-primary/90 ${
          showBackToTop
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <Icons.ChevronLeft className="rotate-90" />
      </button>
    </div>
  );
};

export default ReaderPage;
