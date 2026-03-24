import React, { useState } from "react";
import { GlossaryEntry } from "@/lib/data";

interface CharacterRelationshipMapProps {
  glossary: Record<string, GlossaryEntry>;
}

interface Relationship {
  from: string;
  to: string;
  label: string;
}

// Known relationships extracted from lore
const knownRelationships: Relationship[] = [
  { from: "Mira", to: "Rashad", label: "married" },
  { from: "Mira", to: "Ayel", label: "mother" },
  { from: "Mira", to: "Rathel", label: "mother" },
  { from: "Rashad", to: "Ayel", label: "father" },
  { from: "Rashad", to: "Rathel", label: "father" },
  { from: "Sam", to: "Fendo", label: "tamed" },
  { from: "Maelle", to: "Ignius", label: "married" },
  { from: "Maelle", to: "Beam", label: "mother" },
  { from: "Ignius", to: "Beam", label: "father" },
  { from: "Agatha", to: "Daria", label: "mother" },
  { from: "Grebby", to: "Kassandra", label: "childhood friends" },
  { from: "Sam", to: "Ayel", label: "connected" },
  { from: "Felm", to: "Sam", label: "guardian" },
];

export const CharacterRelationshipMap: React.FC<CharacterRelationshipMapProps> = ({ glossary }) => {
  const [selectedChar, setSelectedChar] = useState<string | null>(null);

  const characters = Object.entries(glossary)
    .filter(([_, e]) => e.type === "character")
    .map(([name]) => name);

  const getRelationships = (name: string) => {
    return knownRelationships.filter(r => r.from === name || r.to === name);
  };

  const getConnectedCharacters = (name: string) => {
    const rels = getRelationships(name);
    return rels.map(r => ({
      name: r.from === name ? r.to : r.from,
      label: r.label,
    }));
  };

  // Group characters by family clusters
  const familyClusters = [
    { name: "Royal Family", members: ["Mira", "Rashad", "Ayel", "Rathel"] },
    { name: "Oathbreaker Lineage", members: ["Maelle", "Ignius", "Beam"] },
    { name: "Companions", members: ["Sam", "Fendo", "Felm"] },
    { name: "Beambreak Citizens", members: ["Agatha", "Daria", "Grebby", "Kassandra", "Bertrand"] },
  ];

  const clusteredNames = familyClusters.flatMap(c => c.members);
  const unclusteredChars = characters.filter(c => !clusteredNames.includes(c));

  const selected = selectedChar ? glossary[selectedChar] : null;
  const connections = selectedChar ? getConnectedCharacters(selectedChar) : [];

  return (
    <div className="mb-16">
      <h2 className="font-display text-2xl text-accent mb-2 text-center">Character Relationships</h2>
      <p className="text-muted-foreground text-sm text-center mb-8">Click a character to see their connections</p>

      <div className="space-y-6">
        {familyClusters.map(cluster => {
          const validMembers = cluster.members.filter(m => glossary[m]);
          if (validMembers.length === 0) return null;
          return (
            <div key={cluster.name}>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-3">{cluster.name}</h3>
              <div className="flex flex-wrap gap-2">
                {validMembers.map(name => {
                  const isSelected = selectedChar === name;
                  const isConnected = connections.some(c => c.name === name);
                  return (
                    <button
                      key={name}
                      onClick={() => setSelectedChar(isSelected ? null : name)}
                      className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                          : isConnected
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-secondary/50 text-foreground/70 border-border hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {glossary[name]?.image && (
                        <img src={glossary[name].image} alt="" className="w-6 h-6 rounded-full inline-block mr-1.5 object-cover" />
                      )}
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {unclusteredChars.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-3">Others</h3>
            <div className="flex flex-wrap gap-2">
              {unclusteredChars.map(name => {
                const isSelected = selectedChar === name;
                const isConnected = connections.some(c => c.name === name);
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedChar(isSelected ? null : name)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : isConnected
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-secondary/50 text-foreground/70 border-border hover:border-primary/30"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected character detail */}
      {selectedChar && selected && (
        <div className="mt-8 p-5 bg-card/30 rounded-xl border border-primary/20 animate-fade-in">
          <div className="flex items-start gap-4 mb-4">
            {selected.image && (
              <img src={selected.image} alt={selectedChar} className="w-16 h-16 rounded-lg object-cover object-top" />
            )}
            <div>
              <h3 className="font-display text-xl text-accent">{selectedChar}</h3>
              <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{selected.description}</p>
            </div>
          </div>

          {connections.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Connections</h4>
              <div className="space-y-2">
                {connections.map(conn => (
                  <button
                    key={conn.name}
                    onClick={() => setSelectedChar(conn.name)}
                    className="flex items-center gap-3 w-full text-left p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <span className="text-primary/60">→</span>
                    <div>
                      <span className="text-foreground text-sm font-medium">{conn.name}</span>
                      <span className="text-muted-foreground text-xs ml-2 italic">{conn.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
