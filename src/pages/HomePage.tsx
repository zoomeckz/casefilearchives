import React from "react";
import { Chapter } from "@/hooks/useChapters";
import heroImage from "@/assets/hero-bg.jpg";

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
      {/* Hero Section with Background Image */}
      <section 
        className="relative py-32 px-6 text-center overflow-hidden"
        style={{
          backgroundImage: `url(${heroImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950/70 via-stone-950/50 to-stone-950" />
        
        <div className="relative max-w-2xl mx-auto z-10">
          <h1 className="font-display text-5xl sm:text-7xl text-amber-100 mb-6 drop-shadow-lg">
            Sedorium
          </h1>
          <button
            onClick={() => {
              if (chapters[0]) {
                setSelectedChapter(chapters[0]);
                setCurrentPage("reader");
              }
            }}
            className="mt-8 px-8 py-3 bg-sky-600/90 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors shadow-lg backdrop-blur-sm"
          >
            Start Reading →
          </button>
        </div>
      </section>

      {/* Latest Chapter */}
      <section className="py-20 px-6 border-t border-stone-800/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-sm uppercase tracking-[0.2em] text-stone-500 mb-10">
            Latest Chapter
          </h2>

          {latestChapter && (
            <div
              className="group cursor-pointer p-8 rounded-xl border border-stone-800/40 bg-stone-900/30 hover:border-sky-600/30 hover:bg-stone-900/60 transition-all duration-300"
              onClick={() => {
                setSelectedChapter(latestChapter);
                setCurrentPage("reader");
              }}
            >
              <span className="text-sky-500/70 text-xs font-medium uppercase tracking-wider">
                Chapter {latestChapter.chapterNumber}
              </span>
              <h3 className="font-display text-3xl text-stone-100 group-hover:text-sky-400 transition-colors mt-3 mb-4">
                {latestChapter.title}
              </h3>
              <p className="text-stone-600 text-sm">
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
      <section className="py-20 px-6 border-t border-stone-800/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-sm uppercase tracking-[0.2em] text-stone-500 mb-14">
            Chapters
          </h2>

          <div className="space-y-2">
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
                  className="group cursor-pointer py-5 px-6 rounded-lg hover:bg-stone-800/30 transition-all duration-200"
                >
                  <span className="text-stone-600 text-xs uppercase tracking-wider">
                    Chapter {chapter.chapterNumber}
                  </span>
                  <h3 className="font-display text-lg text-stone-300 group-hover:text-sky-400 transition-colors mt-1">
                    {chapter.title}
                  </h3>
                </div>
              ))}
          </div>

          {chapters.length > 5 && (
            <button
              onClick={() => setCurrentPage("stories")}
              className="mt-10 text-stone-500 hover:text-sky-400 text-sm transition-colors duration-200"
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
