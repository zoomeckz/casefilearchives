import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Chapter } from "@/hooks/useChapters";
import { dbFetch } from "@/lib/dbFetch";
import { ProfileFrame } from "@/components/ProfileFrame";

interface ForumPostPreview {
  id: string;
  title: string;
  category: string;
  author: string;
  authorId: string;
  authorAvatar: string | null;
  authorFrame: string | null;
  replies: number;
  createdAt: string;
  isPinned: boolean;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

interface HomePageProps {
  chapters: Chapter[];
  setCurrentPage: (page: string) => void;
  setSelectedChapter: (chapter: Chapter) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  chapters,
  setCurrentPage,
  setSelectedChapter,
}) => {
  const navigate = useNavigate();
  const latestChapter = chapters[chapters.length - 1];
  const [forumPosts, setForumPosts] = useState<ForumPostPreview[]>([]);

  useEffect(() => {
    const fetchPosts = async () => {
      const { data: allPosts } = await dbFetch<any[]>('forum_posts', {
        select: 'id,title,category,created_at,user_id,is_pinned',
        order: 'created_at.desc',
      });
      const postsData = allPosts?.slice(0, 5) || null;
      if (!postsData) return;

      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const profilePromises = userIds.map(uid =>
        dbFetch<any[]>('profiles', { select: 'user_id,name,avatar_url,selected_frame', filters: `user_id=eq.${uid}` })
      );
      const profileResults = await Promise.all(profilePromises);
      const profileMap: Record<string, { name: string; avatar: string | null; frame: string | null }> = {};
      profileResults.forEach(r => {
        if (r.data && r.data[0]) {
          profileMap[r.data[0].user_id] = { name: r.data[0].name, avatar: r.data[0].avatar_url, frame: r.data[0].selected_frame };
        }
      });

      const replyCountPromises = postsData.map(post =>
        dbFetch('forum_replies', { filters: `post_id=eq.${post.id}`, head: true })
      );
      const replyCounts = await Promise.all(replyCountPromises);

      setForumPosts(postsData.map((post, i) => ({
        id: post.id,
        title: post.title,
        category: post.category,
        author: profileMap[post.user_id]?.name || 'Anonymous',
        authorId: post.user_id,
        authorAvatar: profileMap[post.user_id]?.avatar || null,
        authorFrame: profileMap[post.user_id]?.frame || null,
        replies: replyCounts[i].count || 0,
        createdAt: post.created_at,
        isPinned: post.is_pinned || false,
      })));
    };
    fetchPosts();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 sm:py-32 px-4 sm:px-6 text-center overflow-hidden bg-stone-950">
        <div className="absolute inset-0 bg-gradient-to-b from-stone-900/50 via-stone-950/80 to-stone-950" />
        <div className="relative max-w-2xl mx-auto z-10">
          <h1 className="font-display text-4xl sm:text-5xl md:text-7xl text-accent mb-6 tracking-wider" style={{ WebkitTextStroke: '4px black', paintOrder: 'stroke fill', textShadow: '0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)' }}>
            SEDORIUM
          </h1>
          <button
            onClick={() => {
              if (chapters[0]) {
                setSelectedChapter(chapters[0]);
              }
            }}
            className="mt-8 px-8 py-3 bg-primary/90 hover:bg-primary text-primary-foreground rounded-lg font-medium transition-colors shadow-lg backdrop-blur-sm"
          >
            Start Reading →
          </button>
        </div>
      </section>

      {/* Two-column: Latest Chapters + Latest Forum Posts */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 border-t border-border/50">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Latest Chapters */}
          <div>
            <h2 className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground mb-8 text-center lg:text-left">
              Latest Chapters
            </h2>

            {chapters.length === 0 ? (
              <p className="text-muted-foreground text-center">No chapters yet.</p>
            ) : (
              <div className="space-y-1">
                {chapters.slice().reverse().slice(0, 5).map((chapter) => (
                  <div
                    key={chapter.id}
                    onClick={() => setSelectedChapter(chapter)}
                    className="group cursor-pointer py-4 px-4 rounded-lg hover:bg-secondary/30 transition-all duration-200"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">
                          Chapter {chapter.chapterNumber}
                        </span>
                        <h3 className="font-display text-lg text-foreground/80 group-hover:text-primary transition-colors mt-0.5 truncate">
                          {chapter.title}
                        </h3>
                      </div>
                      <span className="text-muted-foreground/60 text-xs whitespace-nowrap flex-shrink-0">
                        {new Date(chapter.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {chapters.length > 5 && (
              <div className="text-center lg:text-left mt-6">
                <button
                  onClick={() => setCurrentPage("chapters")}
                  className="text-muted-foreground hover:text-primary text-sm transition-colors"
                >
                  View all {chapters.length} chapters →
                </button>
              </div>
            )}
          </div>

          {/* Latest Forum Posts */}
          <div>
            <h2 className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground mb-8 text-center lg:text-left">
              Latest Discussions
            </h2>

            {forumPosts.length === 0 ? (
              <p className="text-muted-foreground text-center">No discussions yet.</p>
            ) : (
              <div className="space-y-1">
                {forumPosts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => navigate(`/forum/${slugify(post.title)}--${post.id.slice(0, 8)}`)}
                    className="group cursor-pointer py-4 px-4 rounded-lg hover:bg-secondary/30 transition-all duration-200"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      {post.isPinned && <span className="text-accent">📌</span>}
                      <span>{post.category}</span>
                      <span>·</span>
                      <span>{post.replies} replies</span>
                    </div>
                    <h3 className="font-display text-base text-foreground/80 group-hover:text-primary transition-colors truncate">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <ProfileFrame avatarUrl={post.authorAvatar} name={post.author} frame={post.authorFrame} size={20} />
                      <span className="text-muted-foreground/60 text-xs">{post.author}</span>
                      <span className="text-muted-foreground/40 text-xs">·</span>
                      <span className="text-muted-foreground/60 text-xs">
                        {new Date(post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-center lg:text-left mt-6">
              <button
                onClick={() => setCurrentPage("forum")}
                className="text-muted-foreground hover:text-primary text-sm transition-colors"
              >
                View all discussions →
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
