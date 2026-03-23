import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { GlossaryEntry } from "@/lib/data";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface CharactersPageProps {
  glossary: Record<string, GlossaryEntry>;
}

export const CharactersPage: React.FC<CharactersPageProps> = ({ glossary }) => {
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(
    null
  );

  // Get characters with images from glossary
  const charactersWithArt = Object.entries(glossary)
    .filter(([_, entry]) => entry.type === "character" && entry.image)
    .map(([name, entry]) => ({ name, ...entry }));

  // Get all characters
  const allCharacters = Object.entries(glossary)
    .filter(([_, entry]) => entry.type === "character")
    .map(([name, entry]) => ({ name, ...entry }));

  // Get locations with hierarchy
  const allLocations = Object.entries(glossary)
    .filter(([_, entry]) => entry.type === "location")
    .map(([name, entry]) => ({ name, ...entry }));

  // Group: parent locations (no parentTerm) and children
  const parentLocations = allLocations.filter((loc) => !loc.parentTerm);
  const childLocations = allLocations.filter((loc) => !!loc.parentTerm);

  const locationsByParent: Record<string, typeof allLocations> = {};
  for (const child of childLocations) {
    const parent = child.parentTerm!;
    if (!locationsByParent[parent]) locationsByParent[parent] = [];
    locationsByParent[parent].push(child);
  }

  // Get creatures
  const creatures = Object.entries(glossary)
    .filter(([_, entry]) => entry.type === "creature")
    .map(([name, entry]) => ({ name, ...entry }));

  // Get concepts
  const concepts = Object.entries(glossary)
    .filter(([_, entry]) => entry.type === "concept")
    .map(([name, entry]) => ({ name, ...entry }));

  const selected = selectedCharacter
    ? { name: selectedCharacter, ...glossary[selectedCharacter] }
    : null;

  return (
    <div className="min-h-screen py-12 px-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="font-display text-4xl text-amber-100 mb-4 text-center">
          Codex
        </h1>
        <p className="text-stone-500 text-center mb-12">
          Characters, creatures, locations, and lore of Sedorium
        </p>

        {/* Featured Characters with Art */}
        {charactersWithArt.length > 0 && (
          <section className="mb-16">
            <h2 className="font-display text-2xl text-amber-100 mb-8 text-center">
              Featured Characters
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {charactersWithArt.map((char) => (
                <div
                  key={char.name}
                  onClick={() => setSelectedCharacter(char.name)}
                  className="group cursor-pointer bg-stone-900/50 rounded-xl border border-stone-800 overflow-hidden hover:border-sky-500/50 transition-all"
                >
                  <div className="aspect-[4/3] overflow-hidden">
                    <img
                      src={char.image}
                      alt={char.name}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-xl text-stone-100 group-hover:text-sky-400 transition-colors">
                      {char.name}
                    </h3>
                    <p className="text-stone-500 text-sm mt-2 line-clamp-2">
                      {char.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Character Detail Modal */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setSelectedCharacter(null)}
            />
            <div className="relative bg-stone-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-stone-700 animate-fade-in">
          <button
            onClick={() => setSelectedCharacter(null)}
            className="absolute top-4 right-4 z-10 text-stone-400 hover:text-stone-200 bg-stone-800/80 rounded-full p-2"
          >
            <Icons.Close />
          </button>

          {selected.image && (
            <div className="aspect-[16/9] overflow-hidden rounded-t-2xl">
              <img
                src={selected.image}
                alt={selected.name}
                className="w-full h-full object-cover object-top"
              />
            </div>
          )}

              <div className="p-8">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="font-display text-3xl text-amber-100">
                    {selected.name}
                  </h2>
                  <span className="text-xs px-3 py-1 rounded-full bg-sky-400/10 text-sky-400 border border-sky-400/30">
                    {selected.type}
                  </span>
                </div>
                <p className="text-stone-300 leading-relaxed">
                  {selected.description}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* All Characters List */}
        <section className="mb-16">
          <h2 className="font-display text-xl text-stone-500 mb-6">
            All Characters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allCharacters.map((char) => (
              <div
                key={char.name}
                onClick={() => setSelectedCharacter(char.name)}
                className="group cursor-pointer p-4 bg-stone-900/30 rounded-lg border border-stone-800/50 hover:border-sky-500/30 transition-all"
              >
                <div className="flex items-start gap-3">
                  {char.image && (
                    <img
                      src={char.image}
                      alt={char.name}
                      className="w-12 h-12 rounded-lg object-cover object-top"
                    />
                  )}
                  <div>
                    <h3 className="text-stone-100 group-hover:text-sky-400 transition-colors font-medium">
                      {char.name}
                    </h3>
                    <p className="text-stone-500 text-sm mt-1 line-clamp-2">
                      {char.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Locations — Hierarchical */}
        <section className="mb-16">
          <h2 className="font-display text-xl text-stone-500 mb-6">
            Locations
          </h2>
          <Accordion type="multiple" className="space-y-2">
            {parentLocations.map((loc) => {
              const children = locationsByParent[loc.name];
              if (children && children.length > 0) {
                return (
                  <AccordionItem
                    key={loc.name}
                    value={loc.name}
                    className="border-stone-800/50 bg-stone-900/30 rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="text-left">
                        <h3 className="text-amber-400 font-medium">
                          {loc.name}
                        </h3>
                        <p className="text-stone-500 text-sm mt-1">
                          {loc.description}
                        </p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pl-4 border-l border-stone-700/50">
                        {children.map((child) => (
                          <div
                            key={child.name}
                            className="p-3 bg-stone-900/50 rounded-lg"
                          >
                            <h4 className="text-amber-300/80 font-medium text-sm">
                              {child.name}
                            </h4>
                            <p className="text-stone-500 text-xs mt-1">
                              {child.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              }
              return (
                <div
                  key={loc.name}
                  className="p-4 bg-stone-900/30 rounded-lg border border-stone-800/50"
                >
                  <h3 className="text-amber-400 font-medium">{loc.name}</h3>
                  <p className="text-stone-500 text-sm mt-1">
                    {loc.description}
                  </p>
                </div>
              );
            })}
          </Accordion>
        </section>

        {/* Creatures */}
        <section className="mb-16">
          <h2 className="font-display text-xl text-stone-500 mb-6">
            Creatures
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {creatures.map((creature) => (
              <div
                key={creature.name}
                className="p-4 bg-stone-900/30 rounded-lg border border-stone-800/50"
              >
                <h3 className="text-red-400 font-medium">{creature.name}</h3>
                <p className="text-stone-500 text-sm mt-1">
                  {creature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Concepts & Lore */}
        {concepts.length > 0 && (
          <section>
            <h2 className="font-display text-xl text-stone-500 mb-6">
              Concepts & Lore
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {concepts.map((concept) => (
                <div
                  key={concept.name}
                  className="p-4 bg-stone-900/30 rounded-lg border border-stone-800/50"
                >
                  <h3 className="text-purple-400 font-medium">
                    {concept.name}
                  </h3>
                  <p className="text-stone-500 text-sm mt-1">
                    {concept.description}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default CharactersPage;
