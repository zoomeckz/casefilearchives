import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { Chapter, Comment, GlossaryEntry, User } from "@/lib/data";
import { InteractiveContent } from "@/components/InteractiveContent";
import { Comments } from "@/components/Comments";
import { TextToSpeech } from "@/components/TextToSpeech";

interface ReaderPageProps {
  chapter: Chapter | null;
  chapters: Chapter[];
  setSelectedChapter: (chapter: Chapter) => void;
  setCurrentPage: (page: string) => void;
  user: User | null;
  setShowAuthModal: (show: boolean) => void;
  onUpdateChapter: (chapter: Chapter) => void;
  glossary: Record<string, GlossaryEntry>;
}

export const ReaderPage: React.FC<ReaderPageProps> = ({
  chapter,
  chapters,
  setSelectedChapter,
  setCurrentPage,
  user,
  setShowAuthModal,
  onUpdateChapter,
  glossary,
}) => {
  if (!chapter) return null;

  const currentIndex = chapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  const handleAddComment = (comment: Comment) => {
    const updatedChapter = {
      ...chapter,
      comments: [...(chapter.comments || []), comment],
    };
    onUpdateChapter(updatedChapter);
  };

  return (
    <div className="min-h-screen py-12 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => setCurrentPage("stories")}
          className="flex items-center gap-2 text-stone-400 hover:text-stone-200 mb-8"
        >
          <Icons.ChevronLeft />
          Back to chapters
        </button>

        {/* Chapter header */}
        <header className="mb-12">
          <span className="text-sky-400 text-sm font-medium">
            Chapter {chapter.chapterNumber}
          </span>
          <h1 className="font-display text-4xl sm:text-5xl text-amber-100 mt-2 mb-4">
            {chapter.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-stone-500 text-sm">
            <span>{new Date(chapter.publishedAt).toLocaleDateString()}</span>
            <span className="flex items-center gap-1">
              <Icons.Eye className="w-4 h-4" /> {chapter.views} views
            </span>
          </div>
        </header>

        {/* Reading tools */}
        <div className="flex flex-wrap items-center gap-4 mb-10 text-sm">
          <TextToSpeech content={chapter.content} />
        </div>

        {/* Glossary hint */}
        <p className="text-stone-600 text-sm mb-6 italic">
          Tip: Click on highlighted character and location names for more info
        </p>

        {/* Content with interactive glossary */}
        <article className="mb-12">
          <InteractiveContent content={chapter.content} glossary={glossary} />
        </article>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-4 py-8 border-t border-b border-stone-800 mb-12">
          {prevChapter ? (
            <button
              onClick={() => setSelectedChapter(prevChapter)}
              className="flex items-center gap-2 text-stone-400 hover:text-stone-200"
            >
              <Icons.ChevronLeft />
              <div className="text-left">
                <div className="text-xs text-stone-500">Previous</div>
                <div className="text-sm">{prevChapter.title}</div>
              </div>
            </button>
          ) : (
            <div />
          )}

          {nextChapter ? (
            <button
              onClick={() => setSelectedChapter(nextChapter)}
              className="flex items-center gap-2 text-stone-400 hover:text-stone-200 text-right"
            >
              <div>
                <div className="text-xs text-stone-500">Next</div>
                <div className="text-sm">{nextChapter.title}</div>
              </div>
              <Icons.ChevronRight />
            </button>
          ) : (
            <div />
          )}
        </div>

        {/* Comments */}
        <Comments
          comments={chapter.comments || []}
          onAddComment={handleAddComment}
          user={user}
          setShowAuthModal={setShowAuthModal}
        />
      </div>
    </div>
  );
};

export default ReaderPage;
