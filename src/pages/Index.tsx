import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useChapters, Chapter } from "@/hooks/useChapters";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useBookmarks } from "@/hooks/useBookmarks";
import { defaultGlossary, GlossaryEntry } from "@/lib/data";
import { dbFetch } from "@/lib/dbFetch";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { AuthModal } from "@/components/AuthModal";
import { HomePage } from "@/pages/HomePage";
import { StoriesPage } from "@/pages/StoriesPage";
import { ReaderPage } from "@/pages/ReaderPage";
import { CharactersPage } from "@/pages/CharactersPage";
import { ForumPage } from "@/pages/ForumPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { AdminPanel } from "@/pages/AdminPanel";
import { RewardsPage } from "@/pages/RewardsPage";
import { AboutPage } from "@/pages/AboutPage";
import { MangaPage } from "@/pages/MangaPage";
import { usePageTracking } from "@/hooks/usePageTracking";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  // Derive current page from URL
  const currentPage = (() => {
    const path = location.pathname;
    if (path.startsWith("/chapters/")) return "reader";
    if (path === "/chapters") return "chapters";
    if (path === "/characters") return "characters";
    if (path.startsWith("/forum")) return "forum";
    if (path === "/rewards") return "rewards";
    if (path.startsWith("/user/")) return "public-profile";
    if (path === "/profile") return "profile";
    if (path === "/admin") return "admin";
    if (path === "/about") return "about";
    if (path === "/manga") return "manga";
    return "home";
  })();

  const setCurrentPage = (page: string) => {
    if (page === "home") navigate("/");
    else if (page === "chapters") navigate("/chapters");
    else if (page === "characters") navigate("/characters");
    else if (page === "forum") navigate("/forum");
    else if (page === "rewards") navigate("/rewards");
    else if (page === "profile") navigate("/profile");
    else if (page === "admin") navigate("/admin");
    else if (page === "about") navigate("/about");
    else if (page === "manga") navigate("/manga");
    else if (page === "reader" && selectedChapter) {
      navigate(`/chapters/${selectedChapter.chapterNumber}`);
    }
  };

  // Auth hook
  const { user, session, loading: authLoading, signIn, signUp, signOut, refreshUser } = useAuth();

  // Chapters from database
  const { chapters, loading: chaptersLoading, incrementViews } = useChapters();

  // Reading progress
  const { isRead, markAsRead, markAsUnread, readCount } = useReadingProgress(user);

  // Bookmarks
  const { isBookmarked, toggleBookmark, bookmarkCount } = useBookmarks(user);

  // Glossary — load from DB, fall back to defaults
  const [glossary, setGlossary] = useState<Record<string, GlossaryEntry>>(defaultGlossary);

  const fetchGlossary = useCallback(async () => {
    const { data } = await dbFetch<any[]>('glossary', {
      select: 'term,description,type,image_url,parent_term',
      order: 'term.asc',
    });
    if (data && data.length > 0) {
      const mapped: Record<string, GlossaryEntry> = {};
      for (const entry of data) {
        mapped[entry.term] = {
          type: entry.type as GlossaryEntry['type'],
          description: entry.description,
          image: entry.image_url || undefined,
          parentTerm: entry.parent_term || undefined,
        };
      }
      // Merge: DB entries override defaults, but preserve default images if DB has none
      const merged: Record<string, GlossaryEntry> = { ...defaultGlossary };
      for (const [term, entry] of Object.entries(mapped)) {
        merged[term] = {
          ...merged[term],
          ...entry,
          image: entry.image || merged[term]?.image || undefined,
        };
      }
      setGlossary(merged);
    }
  }, []);

  useEffect(() => {
    fetchGlossary();
  }, [fetchGlossary]);

  // Page tracking
  usePageTracking(user, currentPage, selectedChapter);

  // Resolve chapter from URL param
  useEffect(() => {
    const match = location.pathname.match(/^\/chapters\/(\d+)$/);
    if (match && chapters.length > 0) {
      const num = parseInt(match[1]);
      const ch = chapters.find(c => c.chapterNumber === num);
      if (ch) setSelectedChapter(ch);
    }
  }, [location.pathname, chapters]);

  const handleSelectChapter = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    navigate(`/chapters/${chapter.chapterNumber}`);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Don't block rendering — show the page immediately

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
            chapters={chapters}
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
            isRead={isRead}
            markAsUnread={markAsUnread}
            readCount={readCount}
            isBookmarked={isBookmarked}
            toggleBookmark={toggleBookmark}
          />
        )}

        {currentPage === "characters" && (
          <CharactersPage glossary={glossary} />
        )}

        {currentPage === "reader" && (
          <ReaderPage
            chapter={selectedChapter}
            chapters={chapters}
            setSelectedChapter={handleSelectChapter}
            setCurrentPage={setCurrentPage}
            user={user}
            setShowAuthModal={setShowAuthModal}
            glossary={glossary}
            markAsRead={markAsRead}
            incrementViews={incrementViews}
            isBookmarked={isBookmarked}
            toggleBookmark={toggleBookmark}
          />
        )}

        {currentPage === "forum" && (
          <ForumPage
            user={user}
            setShowAuthModal={setShowAuthModal}
          />
        )}

        {currentPage === "profile" && user && (
          <ProfilePage
            user={user}
            onLogout={handleSignOut}
            refreshUser={refreshUser}
            bookmarkCount={bookmarkCount}
          />
        )}

        {currentPage === "admin" && user?.isAdmin && (
          <AdminPanel glossary={glossary} authToken={session?.access_token} onGlossaryChange={fetchGlossary} />
        )}

        {currentPage === "rewards" && user && (
          <RewardsPage user={user} />
        )}

        {currentPage === "about" && <AboutPage />}

        {currentPage === "manga" && (
          <MangaPage user={user} setCurrentPage={setCurrentPage} />
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
