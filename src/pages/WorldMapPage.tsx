import React, { useState } from "react";
import { GlossaryEntry } from "@/lib/data";

interface WorldMapPageProps {
  glossary: Record<string, GlossaryEntry>;
}

export const WorldMapPage: React.FC<WorldMapPageProps> = ({ glossary }) => {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const types = ["all", "location", "character", "creature", "concept"];

  const entries = Object.entries(glossary)
    .filter(([term, v]) => selectedType === "all" || v.type === selectedType)
    .filter(([term, v]) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return term.toLowerCase().includes(q) || v.description.toLowerCase().includes(q);
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

  // Build relationship data
  const relationships: { from: string; to: string; type: string }[] = [];
  for (const [term, entry] of Object.entries(glossary)) {
    if (entry.parentTerm) {
      relationships.push({ from: entry.parentTerm, to: term, type: "parent" });
    }
    // Find mentions of other terms in descriptions
    for (const [otherTerm] of Object.entries(glossary)) {
      if (otherTerm !== term && entry.description.includes(otherTerm)) {
        relationships.push({ from: term, to: otherTerm, type: "mentions" });
      }
    }
  }

  const selected = selectedTerm ? glossary[selectedTerm] : null;
  const relatedTerms = selectedTerm
    ? [...new Set(
        relationships
          .filter(r => r.from === selectedTerm || r.to === selectedTerm)
          .map(r => r.from === selectedTerm ? r.to : r.from)
      )]
    : [];

  const typeColors: Record<string, string> = {
    character: "bg-primary/20 text-primary border-primary/30",
    location: "bg-accent/20 text-accent border-accent/30",
    creature: "bg-destructive/20 text-destructive border-destructive/30",
    concept: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  };

  const typeIcons: Record<string, string> = {
    character: "👤",
    location: "📍",
    creature: "🐉",
    concept: "✨",
  };

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl text-accent mb-2">🗺️ World Atlas</h1>
        <p className="text-muted-foreground mb-8">Explore the world of Sedorium and its connections</p>

        <div className="flex flex-wrap gap-2 mb-8">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors capitalize ${
                selectedType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? "All" : `${typeIcons[t]} ${t}s`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Term list */}
          <div className="lg:col-span-1 space-y-1 max-h-[70vh] overflow-y-auto pr-2">
            {entries.map(([term, entry]) => (
              <button
                key={term}
                onClick={() => setSelectedTerm(term)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  selectedTerm === term
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-secondary/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{typeIcons[entry.type]}</span>
                  <span className="text-foreground font-medium">{term}</span>
                </div>
                <p className="text-muted-foreground text-xs mt-0.5 line-clamp-1">{entry.description}</p>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selected && selectedTerm ? (
              <div className="bg-card/30 rounded-xl border border-border p-6">
                <div className="flex items-start gap-4 mb-6">
                  {selected.image && (
                    <img src={selected.image} alt={selectedTerm} className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg object-cover" />
                  )}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded border ${typeColors[selected.type]}`}>
                        {typeIcons[selected.type]} {selected.type}
                      </span>
                    </div>
                    <h2 className="font-display text-2xl text-accent">{selectedTerm}</h2>
                  </div>
                </div>

                <p className="text-foreground/80 leading-relaxed mb-6">{selected.description}</p>

                {relatedTerms.length > 0 && (
                  <div>
                    <h3 className="text-sm text-muted-foreground mb-3">Connected to:</h3>
                    <div className="flex flex-wrap gap-2">
                      {relatedTerms.map(term => {
                        const entry = glossary[term];
                        if (!entry) return null;
                        return (
                          <button
                            key={term}
                            onClick={() => setSelectedTerm(term)}
                            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors hover:scale-105 ${typeColors[entry.type]}`}
                          >
                            {typeIcons[entry.type]} {term}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-card/30 rounded-xl border border-border p-12 text-center">
                <p className="text-4xl mb-4">🗺️</p>
                <p className="text-muted-foreground">Select a term to explore its connections</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldMapPage;
