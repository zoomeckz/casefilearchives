import React, { useState, useMemo, useEffect } from "react";
import { GlossaryEntry } from "@/lib/data";
import { CharacterRelationshipMap } from "@/components/CharacterRelationshipMap";
import { Search, Menu, X, EyeOff, Eye, ChevronRight, ChevronLeft, Users, MapPin, Sparkles, BookOpen, Skull, Loader2, Heart, Link2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type EntryType = GlossaryEntry["type"];

interface NamedEntry extends GlossaryEntry {
  name: string;
}

interface CharactersPageProps {
  glossary: Record<string, GlossaryEntry>;
  glossaryLoading?: boolean;
  chapters?: Array<{ id: string; chapterNumber: number }>;
  readChapterIds?: Set<string>;
  isLoggedIn?: boolean;
}

const CATEGORY_ORDER: Array<{ key: EntryType; label: string; icon: React.ComponentType<{ className?: string }>; accent: string }> = [
  { key: "character", label: "Characters", icon: Users, accent: "text-amber-300" },
  { key: "location", label: "Locations", icon: MapPin, accent: "text-emerald-300" },
  { key: "creature", label: "Creatures", icon: Skull, accent: "text-rose-300" },
  { key: "concept", label: "Concepts & Lore", icon: Sparkles, accent: "text-violet-300" },
];

const VISIBLE_FOR_GUESTS = 3; // ch 1–3 visible to logged-out visitors

export const CharactersPage: React.FC<CharactersPageProps> = ({
  glossary,
  glossaryLoading = false,
  chapters = [],
  readChapterIds,
  isLoggedIn = false,
}) => {
  const [activeCategory, setActiveCategory] = useState<EntryType>("character");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [showRelationshipMap, setShowRelationshipMap] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("codex.favorites");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [modalName, setModalName] = useState<string | null>(null);

  // Persist favorites
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "codex.favorites",
        JSON.stringify(Array.from(favorites)),
      );
    } catch {
      // ignore
    }
  }, [favorites]);

  const toggleFavorite = (name: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Compute the highest chapter number the reader has finished.
  // Logged-out visitors get a default of VISIBLE_FOR_GUESTS so early entries stay visible.
  const maxRead = useMemo(() => {
    if (!isLoggedIn) return VISIBLE_FOR_GUESTS;
    if (!readChapterIds || readChapterIds.size === 0) return VISIBLE_FOR_GUESTS;
    let max = VISIBLE_FOR_GUESTS;
    for (const ch of chapters) {
      if (readChapterIds.has(ch.id) && typeof ch.chapterNumber === "number" && ch.chapterNumber > max) {
        max = ch.chapterNumber;
      }
    }
    return max;
  }, [isLoggedIn, readChapterIds, chapters]);

  const allEntries: NamedEntry[] = useMemo(() => {
    return Object.entries(glossary)
      .map(([name, entry]) => ({ name, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [glossary]);

  const counts = useMemo(() => {
    const c: Record<EntryType, number> = { character: 0, location: 0, creature: 0, concept: 0 };
    for (const e of allEntries) c[e.type]++;
    return c;
  }, [allEntries]);

  const filteredByCategory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEntries.filter((e) => {
      if (e.type !== activeCategory) return false;
      if (favoritesOnly && !favorites.has(e.name)) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
        (e.parentTerm ?? "").toLowerCase().includes(q)
      );
    });
  }, [allEntries, activeCategory, search, favoritesOnly, favorites]);

  // Auto-pick the first non-spoiler entry in a category if none selected
  useEffect(() => {
    if (selectedName) return;
    const first = filteredByCategory.find((e) => isUnlocked(e, maxRead, revealedSpoilers));
    if (first) setSelectedName(first.name);
  }, [filteredByCategory, selectedName, maxRead, revealedSpoilers]);

  const selected: NamedEntry | null = selectedName ? { name: selectedName, ...glossary[selectedName] } : null;

  const handlePick = (name: string) => {
    setSelectedName(name);
    setDrawerOpen(false);
    setModalName(name);
  };

  const revealEntry = (name: string) =>
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });

  // Children of the selected location (for hierarchy display)
  const childEntries = useMemo(() => {
    if (!selected || selected.type !== "location") return [];
    return allEntries.filter((e) => e.type === "location" && e.parentTerm === selected.name);
  }, [selected, allEntries]);

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-8 pb-6 border-b border-stone-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl text-amber-100">Codex</h1>
              <p className="text-stone-500 text-sm mt-1">
                Characters, places, creatures, and lore of Sedorium
              </p>
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-900 border border-stone-800 text-stone-200 text-sm"
              aria-label="Browse codex"
            >
              <Menu className="w-4 h-4" /> Browse
            </button>
          </div>

          {/* Spoiler-progress hint */}
          {isLoggedIn ? (
            <p className="text-stone-600 text-xs mt-3">
              Showing entries safe through chapter {maxRead}. Later entries are blurred — click to reveal.
            </p>
          ) : (
            <p className="text-stone-600 text-xs mt-3">
              You're browsing as a guest. Entries from chapters {VISIBLE_FOR_GUESTS + 1}+ are blurred to avoid spoilers.
            </p>
          )}

          <button
            onClick={() => setShowRelationshipMap((v) => !v)}
            className="mt-3 inline-flex items-center gap-2 text-xs text-amber-400/80 hover:text-amber-300"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${showRelationshipMap ? "rotate-90" : ""}`} />
            {showRelationshipMap ? "Hide" : "Show"} character relationship map
          </button>

          {showRelationshipMap && (
            <div className="mt-4">
              <CharacterRelationshipMap glossary={glossary} />
            </div>
          )}

          {/* Reveal / Hide all spoilers */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setRevealedSpoilers(new Set(allEntries.map((e) => e.name)))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] uppercase tracking-wider bg-stone-900 border border-stone-800 text-stone-300 hover:text-amber-200 hover:border-amber-500/40 transition-colors"
              aria-label="Reveal all codex entries"
            >
              <Eye className="w-3 h-3" /> Reveal all
            </button>
            <button
              onClick={() => setRevealedSpoilers(new Set())}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] uppercase tracking-wider bg-stone-900 border border-stone-800 text-stone-300 hover:text-amber-200 hover:border-amber-500/40 transition-colors"
              aria-label="Hide all codex entries"
            >
              <EyeOff className="w-3 h-3" /> Hide all
            </button>
            <button
              onClick={() => setFavoritesOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] uppercase tracking-wider border transition-colors ${
                favoritesOnly
                  ? "bg-rose-500/15 border-rose-400/50 text-rose-200"
                  : "bg-stone-900 border-stone-800 text-stone-300 hover:text-rose-200 hover:border-rose-400/40"
              }`}
              aria-pressed={favoritesOnly}
              aria-label="Show only favorites"
            >
              <Heart className={`w-3 h-3 ${favoritesOnly ? "fill-rose-400 text-rose-300" : ""}`} />
              Favorites {favorites.size > 0 && <span className="opacity-70">({favorites.size})</span>}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-0 md:px-6">
        <div className="flex">
          {/* Sidebar — desktop */}
          <aside
            data-lenis-prevent
            className="hidden md:block w-72 lg:w-80 shrink-0 border-r border-stone-800/50 sticky top-0 h-[calc(100vh-0px)] overflow-y-auto py-6 pr-4 overscroll-contain"
          >
            <SidebarContent
              activeCategory={activeCategory}
              setActiveCategory={(c) => {
                setActiveCategory(c);
                setSelectedName(null);
              }}
              counts={counts}
              search={search}
              setSearch={setSearch}
              entries={filteredByCategory}
              selectedName={selectedName}
              onPick={handlePick}
              maxRead={maxRead}
              revealedSpoilers={revealedSpoilers}
              loading={glossaryLoading}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          </aside>

          {/* Mobile drawer */}
          {drawerOpen && (
            <div className="md:hidden fixed inset-0 z-50 flex">
              <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => setDrawerOpen(false)}
              />
              <div data-lenis-prevent className="relative ml-auto w-[88%] max-w-sm h-full bg-stone-950 border-l border-stone-800 overflow-y-auto overscroll-contain p-5 animate-in slide-in-from-right">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg text-amber-100">Browse</h2>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Close browse"
                    className="p-2 text-stone-400 hover:text-stone-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <SidebarContent
                  activeCategory={activeCategory}
                  setActiveCategory={(c) => {
                    setActiveCategory(c);
                    setSelectedName(null);
                  }}
                  counts={counts}
                  search={search}
                  setSearch={setSearch}
                  entries={filteredByCategory}
                  selectedName={selectedName}
                  onPick={handlePick}
                  maxRead={maxRead}
                  revealedSpoilers={revealedSpoilers}
                  loading={glossaryLoading}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            </div>
          )}

          {/* Reading pane */}
          <main className="flex-1 min-w-0 px-4 sm:px-6 md:pl-8 py-6 md:py-8">
            {!selected ? (
              <EmptyState />
            ) : (
              <ReadingPane
                entry={selected}
                isUnlockedNow={isUnlocked(selected, maxRead, revealedSpoilers)}
                onReveal={() => revealEntry(selected.name)}
                relatedChildren={childEntries}
                onPickRelated={handlePick}
                glossary={glossary}
                allEntries={allEntries}
                maxRead={maxRead}
                revealedSpoilers={revealedSpoilers}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

// ---------- helpers ----------

function isUnlocked(
  entry: NamedEntry,
  maxRead: number,
  revealed: Set<string>
): boolean {
  if (revealed.has(entry.name)) return true;
  if (typeof entry.firstChapter !== "number") return true;
  return entry.firstChapter <= maxRead;
}

function categoryAccent(type: EntryType) {
  return CATEGORY_ORDER.find((c) => c.key === type)?.accent ?? "text-stone-200";
}

// ---------- sidebar content ----------

interface SidebarProps {
  activeCategory: EntryType;
  setActiveCategory: (c: EntryType) => void;
  counts: Record<EntryType, number>;
  search: string;
  setSearch: (s: string) => void;
  entries: NamedEntry[];
  selectedName: string | null;
  onPick: (name: string) => void;
  maxRead: number;
  revealedSpoilers: Set<string>;
  loading?: boolean;
  favorites: Set<string>;
  onToggleFavorite: (name: string) => void;
}

const SidebarContent: React.FC<SidebarProps> = ({
  activeCategory,
  setActiveCategory,
  counts,
  search,
  setSearch,
  entries,
  selectedName,
  onPick,
  maxRead,
  revealedSpoilers,
  loading = false,
  favorites,
  onToggleFavorite,
}) => {
  const PAGE_SIZE = 30;
  const [page, setPage] = useState(1);

  // Reset to first page whenever the visible list changes (search or category switch)
  useEffect(() => {
    setPage(1);
  }, [activeCategory, search, entries.length]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(pageStart, pageStart + PAGE_SIZE);
  const query = search.trim();

  return (
  <div className="space-y-5">
    {/* Search */}
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search the codex…"
        className="w-full pl-9 pr-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 text-sm placeholder:text-stone-600 focus:outline-none focus:border-amber-500/50"
      />
    </div>

    {/* Category tabs */}
    <nav className="space-y-1">
      {CATEGORY_ORDER.map((cat) => {
        const Icon = cat.icon;
        const active = activeCategory === cat.key;
        return (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
              active
                ? "bg-amber-500/10 text-amber-200 border border-amber-500/30"
                : "text-stone-400 hover:text-stone-200 hover:bg-stone-900/50 border border-transparent"
            }`}
          >
            <span className="flex items-center gap-2 text-sm">
              <Icon className={`w-4 h-4 ${active ? cat.accent : ""}`} />
              {cat.label}
            </span>
            <span className="text-xs text-stone-500">{counts[cat.key]}</span>
          </button>
        );
      })}
    </nav>

    {/* Entry list */}
    <div className="border-t border-stone-800/60 pt-4">
      <p className="text-[10px] uppercase tracking-wider text-stone-600 mb-2 px-1">
        {loading && entries.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-stone-500">
            <Loader2 className="w-3 h-3 animate-spin" /> loading codex…
          </span>
        ) : (
          <>{entries.length} entr{entries.length === 1 ? "y" : "ies"}</>
        )}
        {!loading && totalPages > 1 && (
          <span className="ml-1 normal-case tracking-normal text-stone-600">
            · page {safePage}/{totalPages}
          </span>
        )}
      </p>
      {loading && entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400/70" aria-hidden="true" />
          <span className="text-xs">Fetching latest entries…</span>
        </div>
      ) : (
      <ul data-lenis-prevent className="space-y-0.5 max-h-[60vh] md:max-h-none overflow-y-auto overscroll-contain pr-1">
        {pageEntries.map((e) => {
          const unlocked = isUnlocked(e, maxRead, revealedSpoilers);
          const active = selectedName === e.name;
          return (
            <li key={e.name}>
              <button
                onClick={() => onPick(e.name)}
                className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between gap-2 ${
                  active
                    ? "bg-stone-800 text-amber-100"
                    : "text-stone-400 hover:text-stone-100 hover:bg-stone-900/60"
                }`}
              >
                <span className={unlocked ? "truncate" : "blur-[3px] select-none truncate"}>
                  {unlocked ? <Highlight text={e.name} query={query} /> : "███████"}
                </span>
                {!unlocked && <EyeOff className="w-3 h-3 text-stone-600 shrink-0" />}
              </button>
            </li>
          );
        })}
        {entries.length === 0 && (
          <li className="px-3 py-4 text-xs text-stone-600 italic">No entries match.</li>
        )}
      </ul>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-stone-400 hover:text-stone-100 hover:bg-stone-900/60 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3 h-3" /> Prev
          </button>
          <span className="text-[11px] text-stone-600">
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, entries.length)} of {entries.length}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-stone-400 hover:text-stone-100 hover:bg-stone-900/60 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-label="Next page"
          >
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  </div>
  );
};

// Renders text with the matching query substring highlighted. Case-insensitive.
const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  const lower = query.toLowerCase();
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lower ? (
          <mark key={i} className="bg-amber-500/30 text-amber-100 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

// ---------- reading pane ----------

interface ReadingPaneProps {
  entry: NamedEntry;
  isUnlockedNow: boolean;
  onReveal: () => void;
  relatedChildren: NamedEntry[];
  onPickRelated: (name: string) => void;
  glossary: Record<string, GlossaryEntry>;
  allEntries: NamedEntry[];
  maxRead: number;
  revealedSpoilers: Set<string>;
}

const ReadingPane: React.FC<ReadingPaneProps> = ({
  entry,
  isUnlockedNow,
  onReveal,
  relatedChildren,
  onPickRelated,
  glossary,
  allEntries,
  maxRead,
  revealedSpoilers,
}) => {
  const accent = categoryAccent(entry.type);
  const parent = entry.parentTerm && glossary[entry.parentTerm]
    ? { name: entry.parentTerm, ...glossary[entry.parentTerm] }
    : null;

  return (
    <article className="max-w-3xl">
      {/* Title row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="font-display text-3xl md:text-4xl text-amber-100">{entry.name}</h2>
        <span className={`text-xs px-2.5 py-1 rounded-full bg-stone-900 border border-stone-800 ${accent}`}>
          {entry.type}
        </span>
        {typeof entry.firstChapter === "number" && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-stone-900 border border-stone-800 text-stone-400 inline-flex items-center gap-1">
            <BookOpen className="w-3 h-3" /> Ch {entry.firstChapter}
          </span>
        )}
      </div>

      {/* Parent location breadcrumb */}
      {parent && (
        <p className="text-xs text-stone-500 mb-4">
          Within{" "}
          <button
            onClick={() => onPickRelated(parent.name)}
            className="text-amber-400/80 hover:text-amber-300 underline decoration-dotted"
          >
            {parent.name}
          </button>
        </p>
      )}

      {/* Body */}
      {isUnlockedNow ? (
        <div className="prose prose-invert max-w-none">
          <p className="text-stone-300 leading-relaxed whitespace-pre-line">{entry.description}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <EyeOff className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-amber-200 text-sm font-medium">
                This entry first appears in chapter {entry.firstChapter}.
              </p>
              <p className="text-stone-400 text-xs mt-1">
                You haven't reached it yet — revealing may spoil what's ahead.
              </p>
              <button
                onClick={onReveal}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-xs border border-amber-500/40"
              >
                <Eye className="w-3 h-3" /> Reveal anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero image — shown after the text */}
      {entry.image && isUnlockedNow && (
        <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl border border-stone-800 mt-6">
          <img src={entry.image} alt={entry.name} className="w-full h-full object-cover object-top" />
        </div>
      )}

      {/* Children (sub-locations) */}
      {isUnlockedNow && relatedChildren.length > 0 && (
        <section className="mt-8 pt-6 border-t border-stone-800/60">
          <h3 className="font-display text-lg text-amber-100/90 mb-3">Within {entry.name}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedChildren.map((child) => {
              const unlocked = isUnlocked(child, maxRead, revealedSpoilers);
              return (
                <button
                  key={child.name}
                  onClick={() => onPickRelated(child.name)}
                  className="text-left p-3 bg-stone-900/40 hover:bg-stone-900/70 border border-stone-800 hover:border-amber-500/40 rounded-lg transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-sm font-medium ${unlocked ? "text-stone-100" : "blur-[3px] text-stone-500 select-none"}`}>
                      {unlocked ? child.name : "███████"}
                    </span>
                    {!unlocked && <EyeOff className="w-3 h-3 text-stone-600" />}
                  </div>
                  {unlocked && (
                    <p className="text-xs text-stone-500 line-clamp-2">{child.description}</p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </article>
  );
};

const EmptyState: React.FC = () => (
  <div className="h-full flex items-center justify-center py-20">
    <p className="text-stone-500 text-sm">Select an entry from the left to begin reading.</p>
  </div>
);

export default CharactersPage;