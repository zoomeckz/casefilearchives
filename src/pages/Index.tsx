import React, { useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  Chapter,
  ForumPost,
  GlossaryEntry,
  User,
  sampleChapters,
  defaultGlossary,
} from "@/lib/data";
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
  const [user, setUser] = useLocalStorage<User | null>("storysite_user", null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [chapters, setChapters] = useLocalStorage<Chapter[]>(
    "storysite_chapters",
    sampleChapters
  );
  const [forumPosts, setForumPosts] = useLocalStorage<ForumPost[]>(
    "storysite_posts",
    []
  );
  const [glossary, setGlossary] = useLocalStorage<Record<string, GlossaryEntry>>(
    "storysite_glossary",
    defaultGlossary
  );
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  const handleLogin = (userData: User) => {
    setUser(userData);
  };

  const handleUpdateChapter = (updatedChapter: Chapter) => {
    setChapters(
      chapters.map((c) => (c.id === updatedChapter.id ? updatedChapter : c))
    );
    setSelectedChapter(updatedChapter);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navigation
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        user={user}
        setShowAuthModal={setShowAuthModal}
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
            onUpdateChapter={handleUpdateChapter}
            glossary={glossary}
          />
        )}

        {currentPage === "forum" && (
          <ForumPage
            posts={forumPosts}
            setPosts={setForumPosts}
            user={user}
            setShowAuthModal={setShowAuthModal}
          />
        )}

        {currentPage === "profile" && user && (
          <ProfilePage
            user={user}
            setUser={setUser}
            onLogout={() => {
              setUser(null);
              setCurrentPage("home");
            }}
          />
        )}

        {currentPage === "admin" && user?.isAdmin && (
          <AdminPanel
            chapters={chapters}
            setChapters={setChapters}
            posts={forumPosts}
            setPosts={setForumPosts}
            users={user ? [user] : []}
            glossary={glossary}
            setGlossary={setGlossary}
          />
        )}
      </main>

      {currentPage !== "admin" && <Footer />}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={handleLogin}
      />
    </div>
  );
};

export default Index;
