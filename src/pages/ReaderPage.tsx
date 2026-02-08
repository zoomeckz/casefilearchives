import React, { useEffect } from "react";
import { Icons } from "@/lib/icons";
import { Chapter } from "@/hooks/useChapters";
import { GlossaryEntry } from "@/lib/data";
import { InteractiveContent } from "@/components/InteractiveContent";
import { CommentsSection } from "@/components/CommentsSection";
import { TextToSpeech } from "@/components/TextToSpeech";
import { AuthUser } from "@/hooks/useAuth";
import { BookmarkButton } from "@/components/BookmarkButton";

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

  return (
    <div className="min-h-screen py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => setCurrentPage("chapters")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8"
        >
          <Icons.ChevronLeft />
          Back to chapters
        </button>

        <header className="mb-12">
          <span className="text-primary text-sm font-medium">
            Chapter {chapter.chapterNumber}
          </span>
          <div className="flex items-start justify-between gap-4 mt-2 mb-4">
            <h1 className="font-display text-4xl sm:text-5xl text-accent">
              {chapter.title}
            </h1>
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
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
            <span>{new Date(chapter.publishedAt).toLocaleDateString()}</span>
            <span className="flex items-center gap-1">
              <Icons.Eye className="w-4 h-4" /> {chapter.views} views
            </span>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-4 mb-10 text-sm">
          <TextToSpeech content={chapter.content} />
        </div>

        <p className="text-muted-foreground/60 text-sm mb-6 italic">
          Tip: Click on highlighted character and location names for more info
        </p>

        <article className="mb-12">
          <InteractiveContent content={chapter.content} glossary={glossary} />
        </article>

        <div className="flex items-center justify-between gap-4 py-8 border-t border-b border-border mb-12">
          {prevChapter ? (
            <button
              onClick={() => setSelectedChapter(prevChapter)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Icons.ChevronLeft />
              <div className="text-left">
                <div className="text-xs text-muted-foreground">Previous</div>
                <div className="text-sm">{prevChapter.title}</div>
              </div>
            </button>
          ) : <div />}
          {nextChapter ? (
            <button
              onClick={() => setSelectedChapter(nextChapter)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-right"
            >
              <div>
                <div className="text-xs text-muted-foreground">Next</div>
                <div className="text-sm">{nextChapter.title}</div>
              </div>
              <Icons.ChevronRight />
            </button>
          ) : <div />}
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
