import React from "react";
import { Link } from "react-router-dom";
import type { Chapter } from "@/hooks/useChapters";
import { useSeries } from "@/lib/series";

interface Props {
  chapterId: string;
  chapters: Chapter[];
  onOpen: (c: Chapter) => void;
  /** "top": one line under the back button. "bottom": previous / next files. */
  placement: "top" | "bottom";
}

/** Where this file sits in its series, with links to the files around it. */
export const SeriesNav: React.FC<Props> = ({ chapterId, chapters, onOpen, placement }) => {
  const list = useSeries();
  if (!list) return null;
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const memberships = list
    .map((s) => {
      const files = s.entries.map((e) => byId.get(e.chapter_id)).filter(Boolean) as Chapter[];
      const index = files.findIndex((f) => f.id === chapterId);
      return { s, files, index };
    })
    .filter((m) => m.index >= 0);
  if (memberships.length === 0) return null;

  if (placement === "top") {
    return (
      <div className="mb-6 space-y-1">
        {memberships.map(({ s, files, index }) => (
          <p key={s.id} className="case-label text-[9px] flex flex-wrap items-center gap-x-2">
            <span>Series</span>
            <Link to={`/series/${s.slug}`} className="!text-primary hover:underline">{s.title}</Link>
            <span>· File {index + 1} of {files.length}</span>
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-10 space-y-4">
      {memberships.map(({ s, files, index }) => {
        const prev = files[index - 1];
        const next = files[index + 1];
        return (
          <nav key={s.id} className="case-file p-5" aria-label={`Series: ${s.title}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <p className="case-label text-[9px]">Series · File {index + 1} of {files.length}</p>
              <Link to={`/series/${s.slug}`} className="case-label text-[9px] hover:!text-primary">{s.title} →</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {prev ? (
                <button type="button" onClick={() => onOpen(prev)} className="text-left border border-border p-3 hover:border-primary transition-colors">
                  <span className="case-label text-[8px]">← Previous file</span>
                  <span className="block font-display text-foreground mt-1">{prev.title}</span>
                </button>
              ) : <span className="hidden sm:block" />}
              {next ? (
                <button type="button" onClick={() => onOpen(next)} className="text-left sm:text-right border border-border p-3 hover:border-primary transition-colors">
                  <span className="case-label text-[8px]">Next file →</span>
                  <span className="block font-display text-foreground mt-1">{next.title}</span>
                </button>
              ) : (
                <p className="text-sm text-muted-foreground sm:text-right self-center">Last file in this series.</p>
              )}
            </div>
          </nav>
        );
      })}
    </div>
  );
};

export default SeriesNav;
