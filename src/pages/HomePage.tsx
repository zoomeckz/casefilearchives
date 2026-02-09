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
      {/* Hero Section */}
      <section 
        className="relative py-32 px-6 text-center overflow-hidden"
      >
        <img
          src={heroImage}
          alt="Sedorium — a dark fantasy world of ancient kingdoms, druids, and mystical creatures by Sam Nowroozi Larki"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950/70 via-stone-950/50 to-stone-950" />
        <div className="relative max-w-2xl mx-auto z-10">
          <h1 className="font-display text-5xl sm:text-7xl text-accent mb-6 tracking-wider" style={{ WebkitTextStroke: '4px black', paintOrder: 'stroke fill', textShadow: '0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)' }}>
            SEDORIUM
          </h1>
          <button
            onClick={() => {
              if (chapters[0]) {
                setSelectedChapter(chapters[0]);
              }
            }}
            className="mt-8 px-8 py-3 bg-primary/90 hover:bg-primary text-primary-foreground rounded-lg font-medium transition-colors shadow-lg backdrop-blur-sm"
          >
            Start Reading →
          </button>
        </div>
      </section>

      {/* Latest Chapter */}
      <section className="py-20 px-6 border-t border-border/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground mb-10">
            Latest Chapter
          </h2>
          {chapters.length === 0 ? (
            <p className="text-muted-foreground">No chapters yet.</p>
          ) : latestChapter && (
            <div
              className="group cursor-pointer p-8 rounded-xl border border-border/40 bg-card/30 hover:border-primary/30 hover:bg-card/60 transition-all duration-300"
              onClick={() => setSelectedChapter(latestChapter)}
            >
              <span className="text-primary/70 text-xs font-medium uppercase tracking-wider">
                Chapter {latestChapter.chapterNumber}
              </span>
              <h3 className="font-display text-3xl text-foreground group-hover:text-primary transition-colors mt-3 mb-4">
                {latestChapter.title}
              </h3>
              <p className="text-muted-foreground text-sm">
                {new Date(latestChapter.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* All Chapters Preview */}
      <section className="py-20 px-6 border-t border-border/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground mb-14">
            Chapters
          </h2>
          <div className="space-y-2">
            {chapters.length === 0 ? (
              <p className="text-muted-foreground">No chapters yet.</p>
            ) : (
              chapters.slice().reverse().slice(0, 5).map((chapter) => (
                <div
                  key={chapter.id}
                  onClick={() => setSelectedChapter(chapter)}
                  className="group cursor-pointer py-5 px-6 rounded-lg hover:bg-secondary/30 transition-all duration-200"
                >
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">
                    Chapter {chapter.chapterNumber}
                  </span>
                  <h3 className="font-display text-lg text-foreground/80 group-hover:text-primary transition-colors mt-1">
                    {chapter.title}
                  </h3>
                </div>
              ))
            )}
          </div>
          {chapters.length > 5 && (
            <button
              onClick={() => setCurrentPage("chapters")}
              className="mt-10 text-muted-foreground hover:text-primary text-sm transition-colors duration-200"
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
