import { detectLanguageFromPath, stripLanguagePrefix, withLanguagePrefix } from "@/i18n";
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useChapters, Chapter } from "@/hooks/useChapters";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useBookmarks } from "@/hooks/useBookmarks";
import { GlossaryEntry } from "@/lib/data";
import { dbFetch } from "@/lib/dbFetch";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { AuthModal } from "@/components/AuthModal";
import { HomePage } from "@/pages/HomePage";
import { StoriesPage } from "@/pages/StoriesPage";
import { ReaderPage } from "@/pages/ReaderPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { AdminPanel } from "@/pages/AdminPanel";
import { RewardsPage } from "@/pages/RewardsPage";
import { PublicProfilePage } from "@/pages/PublicProfilePage";
import { AboutPage } from "@/pages/AboutPage";
import { ForumPage } from "@/pages/ForumPage";
import { slugify, storyPath } from "@/lib/slug";
import { usePageTracking } from "@/hooks/usePageTracking";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  // Derive current page from URL
  const lang = detectLanguageFromPath(location.pathname);
  const barePath = stripLanguagePrefix(location.pathname);
  const currentPage = (() => {
    const path = barePath;
    if (path.startsWith("/chapters/") || path.startsWith("/stories/")) return "reader";
    if (path === "/chapters") return "chapters";
    if (path === "/rewards") return "rewards";
    if (path.startsWith("/user/")) return "public-profile";
    if (path === "/profile") return "profile";
    if (path === "/admin") return "admin";
    if (path === "/about") return "about";
    if (path === "/forum" || path.startsWith("/forum/")) return "forum";
    return "home";
  })();

  const setCurrentPage = (page: string) => {
    const go = (path: string) => navigate(withLanguagePrefix(path, lang));
    if (page === "home") go("/");
    else if (page === "chapters") go("/chapters");
    else if (page === "rewards") go("/rewards");
    else if (page === "profile") go("/profile");
    else if (page === "admin") go("/admin");
    else if (page === "about") go("/about");
    else if (page === "forum") go("/forum");
    else if (page === "reader" && selectedChapter) {
      go(storyPath(selectedChapter));
    }
  };

  // Auth hook
  const { user, session, loading: authLoading, signIn, signUp, signOut, refreshUser } = useAuth();

  // Chapters from database
  const { chapters: allChapters, publishedChapters, incrementViews, loading: chaptersLoading } = useChapters(user?.isAdmin);
  // Legacy/archived chapters are admin-panel only — never shown on public pages, even to admins.
  const chapters = React.useMemo(() => allChapters.filter((c) => !c.isArchived), [allChapters]);

  // Reading progress
  const { isRead, markAsRead, markAsUnread, readCount } = useReadingProgress(user);

  // Bookmarks
  const { isBookmarked, toggleBookmark, bookmarkCount } = useBookmarks(user);

  // Glossary remains available to the private admin tools only.
  const [glossary, setGlossary] = useState<Record<string, GlossaryEntry>>({});
  const [glossaryLoading, setGlossaryLoading] = useState(true);

  const fetchGlossary = useCallback(async () => {
    setGlossaryLoading(true);
    try {
      const { data } = await dbFetch<any[]>('glossary', {
        select: 'term,description,type,image_url,parent_term,first_chapter,aliases',
        order: 'term.asc',
      });
      if (!data) return;

      const mapped: Record<string, GlossaryEntry> = {};
      for (const entry of data) {
        mapped[entry.term] = {
          type: entry.type as GlossaryEntry['type'],
          description: entry.description,
          image: entry.image_url || undefined,
          parentTerm: entry.parent_term || undefined,
          firstChapter: typeof entry.first_chapter === 'number' ? entry.first_chapter : undefined,
          aliases: Array.isArray(entry.aliases)
            ? entry.aliases.filter((a: unknown): a is string => typeof a === 'string' && a.length > 0)
            : [],
        };
      }

      setGlossary(mapped);
    } finally {
      setGlossaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) fetchGlossary();
  }, [fetchGlossary, user?.isAdmin]);

  // Page tracking
  usePageTracking(user, currentPage, selectedChapter);

  // Resolve chapter from URL param
  useEffect(() => {
    if (chapters.length === 0) return;
    const numMatch = barePath.match(/^\/chapters\/(\d+)$/);
    const slugMatch = barePath.match(/^\/stories\/([^/]+)$/);
    let ch: Chapter | undefined;
    if (numMatch) ch = chapters.find(c => c.chapterNumber === parseInt(numMatch[1]));
    else if (slugMatch) ch = chapters.find(c => slugify(c.title) === decodeURIComponent(slugMatch[1]));
    if (!ch) {
      // Dead, renamed, or still-unknown link: drop any previously selected
      // story so the reader shows the not-found fallback instead of stale text.
      setSelectedChapter(null);
      return;
    }
    setSelectedChapter(ch);
    // Old numeric links and renamed titles move to the current title-based address.
    const canonical = storyPath(ch);
    if (canonical !== barePath) navigate(withLanguagePrefix(canonical, lang) + location.search, { replace: true });
  }, [barePath, chapters]);

  const handleSelectChapter = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    navigate(withLanguagePrefix(storyPath(chapter), lang));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navigation
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        user={user}
        setShowAuthModal={setShowAuthModal}
        onSignOut={handleSignOut}
      />

      <main className="flex-1">
        {currentPage === "home" && (
          <HomePage
            chapters={publishedChapters}
            setCurrentPage={setCurrentPage}
            setSelectedChapter={handleSelectChapter}
          />
        )}

        {currentPage === "chapters" && (
          <StoriesPage
            chapters={chapters}
            setSelectedChapter={handleSelectChapter}
            setCurrentPage={setCurrentPage}
            user={user}
            isAdmin={user?.isAdmin ?? false}
            isRead={isRead}
            markAsUnread={markAsUnread}
            readCount={chapters.filter((c) => isRead(c.id)).length}
            isBookmarked={isBookmarked}
            toggleBookmark={toggleBookmark}
          />
        )}

        {currentPage === "reader" && (selectedChapter ? (
          <ReaderPage
            chapter={selectedChapter}
            chapters={chapters}
            setSelectedChapter={handleSelectChapter}
            setCurrentPage={setCurrentPage}
            user={user}
            setShowAuthModal={setShowAuthModal}
            glossary={glossary}
            markAsRead={markAsRead}
            markAsUnread={markAsUnread}
            isRead={isRead}
            incrementViews={incrementViews}
            isBookmarked={isBookmarked}
            toggleBookmark={toggleBookmark}
          />
        ) : chaptersLoading ? null : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
            <p className="case-label text-[10px] mb-3">CASE FILES</p>
            <h1 className="font-display text-3xl sm:text-4xl uppercase text-foreground mb-4">
              Story not found
            </h1>
            <p className="text-muted-foreground mb-8 max-w-md">
              This link doesn't match any published story. It may have been renamed or removed.
            </p>
            <button
              onClick={() => setCurrentPage("chapters")}
              className="px-6 py-2 border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors text-xs uppercase tracking-wider"
            >
              Browse all stories
            </button>
          </div>
        ))}

        {currentPage === "profile" && user && (
          <ProfilePage
            user={user}
            onLogout={handleSignOut}
            refreshUser={refreshUser}
            bookmarkCount={bookmarkCount}
          />
        )}

        {currentPage === "admin" && user?.isAdmin && (
          <AdminPanel glossary={glossary} authToken={session?.access_token} userId={session?.user?.id} onGlossaryChange={fetchGlossary} />
        )}

        {false && currentPage === "rewards" && user && (
          <RewardsPage user={user} />
        )}

        {currentPage === "public-profile" && <PublicProfilePage />}

        {currentPage === "about" && <AboutPage />}

        {currentPage === "forum" && (
          <ForumPage user={user} authToken={session?.access_token} stories={publishedChapters.filter((c) => !c.isArchived)} setShowAuthModal={setShowAuthModal} />
        )}

      </main>

      {currentPage !== "admin" && <Footer setCurrentPage={setCurrentPage} />}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={refreshUser}
        onSignIn={signIn}
        onSignUp={signUp}
      />
    </div>
  );
};

export default Index;
