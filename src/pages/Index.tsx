import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useChapters, Chapter } from "@/hooks/useChapters";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useBookmarks } from "@/hooks/useBookmarks";
import { defaultGlossary, GlossaryEntry } from "@/lib/data";
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
    if (path === "/characters") return "characters";
    if (path === "/forum") return "forum";
    if (path === "/profile") return "profile";
    if (path === "/admin") return "admin";
    if (path === "/about") return "about";
    return "home";
  })();

  const setCurrentPage = (page: string) => {
    if (page === "home") navigate("/");
    else if (page === "chapters") navigate("/chapters");
    else if (page === "characters") navigate("/characters");
    else if (page === "forum") navigate("/forum");
    else if (page === "profile") navigate("/profile");
    else if (page === "admin") navigate("/admin");
    else if (page === "about") navigate("/about");
    else if (page === "reader" && selectedChapter) {
      navigate(`/chapters/${selectedChapter.chapterNumber}`);
    }
  };

  // Auth hook
  const { user, loading: authLoading, signOut, refreshUser } = useAuth();

  // Chapters from database
  const { chapters, loading: chaptersLoading, incrementViews } = useChapters();

  // Reading progress
  const { isRead, markAsRead, markAsUnread, readCount } = useReadingProgress(user);

  // Bookmarks
  const { isBookmarked, toggleBookmark, bookmarkCount } = useBookmarks(user);

  // Glossary
  const [glossary] = useState<Record<string, GlossaryEntry>>(defaultGlossary);

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

  if (authLoading || chaptersLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

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
          <AdminPanel glossary={glossary} />
        )}

        {currentPage === "about" && <AboutPage />}
      </main>

      {currentPage !== "admin" && <Footer setCurrentPage={setCurrentPage} />}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={refreshUser}
      />
    </div>
  );
};

export default Index;
