import React, { useEffect, useState } from "react";
import { Icons } from "@/lib/icons";
import { Chapter } from "@/hooks/useChapters";
import { GlossaryEntry } from "@/lib/data";
import { InteractiveContent } from "@/components/InteractiveContent";
import { CommentsSection } from "@/components/CommentsSection";
import { TextToSpeech } from "@/components/TextToSpeech";
import { AuthUser } from "@/hooks/useAuth";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ChapterReactions } from "@/components/ChapterReactions";
import { ChapterPoll } from "@/components/ChapterPoll";


function estimateReadingTime(content: string): number {
  const words = content.replace(/<[^>]*>/g, "").split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 220));
}

const discussionPrompts = [
  "What do you think will happen next?",
  "Which character stood out most in this chapter?",
  "Did anything surprise you?",
  "What's your theory about the ending?",
  "How did this chapter change your view of the story?",
];

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
  const [randomPrompt] = useState(() => discussionPrompts[Math.floor(Math.random() * discussionPrompts.length)]);

  useEffect(() => {
    if (chapter) {
      incrementViews(chapter.id);
      if (user) markAsRead(chapter.id);
    }
  }, [chapter?.id, user?.id]);

  if (!chapter) return null;

  const currentIndex = chapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const readTime = estimateReadingTime(chapter.content);

  // "Previously on..." — show last chapter title
  const prevSummary = prevChapter ? prevChapter.title : null;

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => setCurrentPage("chapters")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8"
        >
          <Icons.ChevronLeft />
          Back to chapters
        </button>

        <header className="mb-12 text-center">
          <span className="text-primary text-sm font-medium">
            Chapter {chapter.chapterNumber}
          </span>
          <h1 className="font-display text-4xl sm:text-5xl text-accent mt-2 mb-4">
            {chapter.title}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-4 text-muted-foreground text-sm">
            <span>{new Date(chapter.publishedAt).toLocaleDateString()}</span>
            <span className="flex items-center gap-1">
              <Icons.Eye className="w-4 h-4" /> {chapter.views} views
            </span>
            <span>📖 ~{readTime} min read</span>
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

        {/* Previously on... */}
        {prevSummary && (
          <div className="mb-8 p-4 bg-card/30 rounded-lg border border-border/50">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Previously...</p>
            <p className="text-foreground/70 text-sm italic">
              Chapter {prevChapter!.chapterNumber}: {prevSummary}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mb-10 text-sm">
          <TextToSpeech content={chapter.content} />
        </div>

        <p className="text-muted-foreground/60 text-sm mb-6 italic">
          Tip: Click on highlighted character and location names for more info. Use ||spoiler|| tags in comments to hide spoilers.
        </p>

        <article
          className="mb-12 rounded-xl p-6 sm:p-8"
        >
          <InteractiveContent content={chapter.content} glossary={glossary} />
        </article>

        {/* Chapter Reactions */}
        <div className="mb-8">
          <ChapterReactions chapterId={chapter.id} user={user} setShowAuthModal={setShowAuthModal} />
        </div>

        {/* Chapter Poll (if any) */}
        <div className="mb-8">
          <ChapterPoll chapterId={chapter.id} user={user} setShowAuthModal={setShowAuthModal} />
        </div>

        <div className="flex items-center justify-between gap-2 py-8 border-t border-b border-border mb-12">
          {prevChapter ? (
            <button
              onClick={() => setSelectedChapter(prevChapter)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground min-w-0"
            >
              <Icons.ChevronLeft className="shrink-0" />
              <div className="text-left min-w-0">
                <div className="text-xs text-muted-foreground">Previous</div>
                <div className="text-sm truncate">{prevChapter.title}</div>
              </div>
            </button>
          ) : <div />}
          {nextChapter ? (
            <button
              onClick={() => setSelectedChapter(nextChapter)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-right min-w-0"
            >
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Next</div>
                <div className="text-sm truncate">{nextChapter.title}</div>
              </div>
              <Icons.ChevronRight className="shrink-0" />
            </button>
          ) : <div />}
        </div>

        {/* Discussion Prompt */}
        <div className="mb-8 p-4 bg-primary/5 rounded-lg border border-primary/20 text-center">
          <p className="text-primary text-sm font-medium">💬 Discussion Prompt</p>
          <p className="text-foreground/80 mt-1">{randomPrompt}</p>
        </div>

        <CommentsSection
          chapterId={chapter.id}
          user={user}
          setShowAuthModal={setShowAuthModal}
        />
      </div>
    </div>
  );
};

export default ReaderPage;
