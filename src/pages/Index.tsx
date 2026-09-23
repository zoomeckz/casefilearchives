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
    if (path === "/rewards") return "rewards";
    if (path.startsWith("/user/")) return "public-profile";
    if (path === "/profile") return "profile";
    if (path === "/admin") return "admin";
    if (path === "/about") return "about";
    return "home";
  })();

  const setCurrentPage = (page: string) => {
    const go = (path: string) => navigate(path);
    if (page === "home") go("/");
    else if (page === "chapters") go("/chapters");
    else if (page === "rewards") go("/rewards");
    else if (page === "profile") go("/profile");
    else if (page === "admin") go("/admin");
    else if (page === "about") go("/about");
    else if (page === "reader" && selectedChapter) {
      go(`/chapters/${selectedChapter.chapterNumber}`);
    }
  };

  // Auth hook
  const { user, session, loading: authLoading, signIn, signUp, signOut, refreshUser } = useAuth();

  // Chapters from database
  const { chapters, publishedChapters, incrementViews } = useChapters(user?.isAdmin);

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
            readCount={readCount}
            isBookmarked={isBookmarked}
            toggleBookmark={toggleBookmark}
          />
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

        {currentPage === "rewards" && user && (
          <RewardsPage user={user} />
        )}

        {currentPage === "public-profile" && <PublicProfilePage />}

        {currentPage === "about" && <AboutPage />}

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
