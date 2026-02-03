import React from "react";
import { Chapter } from "@/lib/data";

interface StoriesPageProps {
  chapters: Chapter[];
  setSelectedChapter: (chapter: Chapter) => void;
  setCurrentPage: (page: string) => void;
}

export const StoriesPage: React.FC<StoriesPageProps> = ({
  chapters,
  setSelectedChapter,
  setCurrentPage,
}) => (
  <div className="min-h-screen py-12 px-6">
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-4xl text-amber-100 mb-12 text-center">
        Chapters
      </h1>

      <div className="divide-y divide-stone-800/50">
        {chapters.map((chapter) => (
          <div
            key={chapter.id}
            onClick={() => {
              setSelectedChapter(chapter);
              setCurrentPage("reader");
            }}
            className="group py-8 cursor-pointer text-center"
          >
            <span className="text-stone-600 text-sm">
              Chapter {chapter.chapterNumber} ·{" "}
              {new Date(chapter.publishedAt).toLocaleDateString()}
            </span>
            <h3 className="font-display text-xl text-stone-100 group-hover:text-sky-400 transition-colors mt-1">
              {chapter.title}
            </h3>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default StoriesPage;
