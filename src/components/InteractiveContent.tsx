import React, { useState, useMemo } from "react";
import { GlossaryEntry } from "@/lib/data";

interface GlossaryPopupProps {
  term: string;
  entry: GlossaryEntry;
  position: { x: number; y: number };
  onClose: () => void;
}

const GlossaryPopup: React.FC<GlossaryPopupProps> = ({
  term,
  entry,
  position,
  onClose,
}) => {
  const typeColors = {
    character: "bg-sky-400/10 text-sky-400 border-sky-400/30",
    location: "bg-amber-400/10 text-amber-400 border-amber-400/30",
    creature: "bg-red-400/10 text-red-400 border-red-400/30",
    concept: "bg-purple-400/10 text-purple-400 border-purple-400/30",
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-80 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl p-4 animate-fade-in"
        style={{
          left: Math.min(position.x, window.innerWidth - 340),
          top: position.y + 10,
        }}
      >
        <div className="flex items-start gap-3">
          {entry.image && (
            <img
              src={entry.image}
              alt={term}
              className="w-16 h-16 rounded-lg object-cover object-top"
            />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-stone-100 font-medium">{term}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded border ${typeColors[entry.type]}`}
              >
                {entry.type}
              </span>
            </div>
            <p className="text-stone-400 text-sm leading-relaxed">
              {entry.description}
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

interface InteractiveContentProps {
  content: string;
  glossary: Record<string, GlossaryEntry>;
}

export const InteractiveContent: React.FC<InteractiveContentProps> = ({
  content,
  glossary,
}) => {
  const [popup, setPopup] = useState<{
    term: string;
    entry: GlossaryEntry;
    position: { x: number; y: number };
  } | null>(null);

  const processedContent = useMemo(() => {
    const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
    let processed = content;

    terms.forEach((term) => {
      const regex = new RegExp(`\\b(${term})\\b(?![^<]*>)`, "gi");
      processed = processed.replace(
        regex,
        `<span class="glossary-term" data-term="${term}">$1</span>`
      );
    });

    return processed;
  }, [content, glossary]);

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("glossary-term")) {
      const term = target.getAttribute("data-term");
      if (term && glossary[term]) {
        setPopup({
          term,
          entry: glossary[term],
          position: { x: e.clientX, y: e.clientY },
        });
      }
    }
  };

  return (
    <>
      <div
        className="prose-story chapter-content"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
      {popup && (
        <GlossaryPopup
          term={popup.term}
          entry={popup.entry}
          position={popup.position}
          onClose={() => setPopup(null)}
        />
      )}
    </>
  );
};

export default InteractiveContent;
