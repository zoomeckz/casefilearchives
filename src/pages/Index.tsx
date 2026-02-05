import React, { useState } from "react";
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

const Index = () => {
  const [currentPage, setCurrentPage] = useState("home");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  
  // Auth hook
  const { user, loading: authLoading, signOut, refreshUser } = useAuth();
  
  // Chapters from database
  const { chapters, loading: chaptersLoading, incrementViews } = useChapters();
  
  // Reading progress
  const { isRead, markAsRead, markAsUnread, readCount } = useReadingProgress(user);
  
  // Bookmarks
  const { isBookmarked, toggleBookmark, bookmarkCount } = useBookmarks(user);
  
  // Glossary (keeping local for now, can migrate later)
  const [glossary] = useState<Record<string, GlossaryEntry>>(defaultGlossary);

  const handleSignOut = async () => {
    await signOut();
    setCurrentPage("home");
  };

  if (authLoading || chaptersLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-stone-400">Loading...</div>
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
            setSelectedChapter={setSelectedChapter}
          />
        )}

        {currentPage === "stories" && (
          <StoriesPage
            chapters={chapters}
            setSelectedChapter={setSelectedChapter}
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
            setSelectedChapter={setSelectedChapter}
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
          <AdminPanel
            glossary={glossary}
          />
        )}
      </main>

      {currentPage !== "admin" && <Footer />}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={refreshUser}
      />
    </div>
  );
};

export default Index;
