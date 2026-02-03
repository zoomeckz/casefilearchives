import React from "react";
import { Chapter } from "@/lib/data";

interface HomePageProps {
  chapters: Chapter[];
  setCurrentPage: (page: string) => void;
  setSelectedChapter: (chapter: Chapter) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  chapters,
  setCurrentPage,
  setSelectedChapter,
}) => {
  const latestChapter = chapters[chapters.length - 1];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-32 px-6 text-center gradient-hero">
        <div className="max-w-2xl mx-auto">
          <h1 className="font-display text-5xl sm:text-7xl text-amber-100 mb-6">
            Sedorium
          </h1>
          <p className="text-stone-400 text-lg mb-12 max-w-lg mx-auto">
            A fantasy epic of druids, kingdoms, and ancient power
          </p>
          <button
            onClick={() => {
              setSelectedChapter(chapters[0]);
              setCurrentPage("reader");
            }}
            className="text-sky-400 hover:text-sky-300 transition-colors text-lg"
          >
            Start Reading →
          </button>
        </div>
      </section>

      {/* Latest Chapter */}
      <section className="py-16 px-6 border-t border-stone-800/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-xl text-stone-500 mb-8">
            Latest Chapter
          </h2>

          {latestChapter && (
            <div
              className="group cursor-pointer"
              onClick={() => {
                setSelectedChapter(latestChapter);
                setCurrentPage("reader");
              }}
            >
              <span className="text-stone-600 text-sm">
                Chapter {latestChapter.chapterNumber}
              </span>
              <h3 className="font-display text-3xl text-stone-100 group-hover:text-sky-400 transition-colors mt-2 mb-4">
                {latestChapter.title}
              </h3>
              <p className="text-stone-500 text-sm">
                {new Date(latestChapter.publishedAt).toLocaleDateString(
                  "en-US",
                  { year: "numeric", month: "long", day: "numeric" }
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* All Chapters Preview */}
      <section className="py-16 px-6 border-t border-stone-800/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-xl text-stone-500 mb-12">
            Chapters
          </h2>

          <div className="space-y-6">
            {chapters
              .slice()
              .reverse()
              .slice(0, 5)
              .map((chapter) => (
                <div
                  key={chapter.id}
                  onClick={() => {
                    setSelectedChapter(chapter);
                    setCurrentPage("reader");
                  }}
                  className="group cursor-pointer py-2"
                >
                  <span className="text-stone-600 text-sm">
                    Chapter {chapter.chapterNumber}
                  </span>
                  <h3 className="font-display text-lg text-stone-300 group-hover:text-sky-400 transition-colors">
                    {chapter.title}
                  </h3>
                </div>
              ))}
          </div>

          {chapters.length > 5 && (
            <button
              onClick={() => setCurrentPage("stories")}
              className="mt-8 text-stone-500 hover:text-sky-400 text-sm transition-colors"
            >
              View all {chapters.length} chapters →
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
