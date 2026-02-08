import React, { useState, useEffect, useCallback } from "react";
import { Icons } from "@/lib/icons";
import { GlossaryEntry } from "@/lib/data";
import { dbFetch } from "@/lib/dbFetch";
import { downloadAllChapters } from "@/hooks/useChapterDownload";
import { ChapterEditor } from "@/components/ChapterEditor";
import { GlossaryManager } from "@/components/GlossaryManager";
import { toast } from "sonner";

interface AdminPanelProps {
  glossary: Record<string, GlossaryEntry>;
  authToken?: string;
  onGlossaryChange?: () => void;
}

interface AnalyticsData {
  totalViews: number;
  totalReaders: number;
  totalComments: number;
  totalForumPosts: number;
  totalSubscribers: number;
  recentPageViews: Array<{ page: string; count: number; avg_duration: number }>;
  chapterStats: Array<{ id: string; title: string; views: number; chapter_number: number }>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ glossary, authToken, onGlossaryChange }) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Chapter editor state
  const [editorMode, setEditorMode] = useState<'list' | 'new' | 'edit'>('list');
  const [editChapterId, setEditChapterId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [glossaryEntries, setGlossaryEntries] = useState<any[]>([]);

  const fetchGlossaryEntries = useCallback(async () => {
    const { data } = await dbFetch<any[]>('glossary', {
      select: 'id,term,description,type,image_url',
      order: 'term.asc',
      token: authToken,
    });
    setGlossaryEntries(data || []);
    onGlossaryChange?.();
  }, [authToken, onGlossaryChange]);

  const fetchChapters = async () => {
    const { data } = await dbFetch<any[]>('chapters', {
      select: 'id,title,chapter_number,views,published_at',
      order: 'chapter_number.asc',
      token: authToken,
    });
    setChapters(data || []);
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [chaptersRes, readersRes, commentsRes, forumRes, subscribersRes, pageViewsRes] = await Promise.all([
          dbFetch<any[]>('chapters', { select: 'id,title,views,chapter_number', order: 'chapter_number.asc', token: authToken }),
          dbFetch<any[]>('profiles', { select: '*', head: true, token: authToken }),
          dbFetch<any[]>('comments', { select: '*', head: true, token: authToken }),
          dbFetch<any[]>('forum_posts', { select: '*', head: true, token: authToken }),
          dbFetch<any[]>('email_subscriptions', { select: '*', head: true, filters: 'new_chapters=eq.true', token: authToken }),
          dbFetch<any[]>('page_views', { select: 'page,duration_seconds', token: authToken }),
        ]);

        const chapterData = chaptersRes.data || [];
        setChapters(chapterData);
        const totalViews = chapterData.reduce((sum: number, c: any) => sum + c.views, 0);

        const pageViews = pageViewsRes.data || [];
        const pageMap = new Map<string, { count: number; totalDuration: number }>();
        pageViews.forEach((pv: any) => {
          const existing = pageMap.get(pv.page) || { count: 0, totalDuration: 0 };
          existing.count++;
          existing.totalDuration += pv.duration_seconds || 0;
          pageMap.set(pv.page, existing);
        });

        const recentPageViews = Array.from(pageMap.entries()).map(([page, data]) => ({
          page,
          count: data.count,
          avg_duration: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0,
        })).sort((a, b) => b.count - a.count);

        setAnalytics({
          totalViews,
          totalReaders: readersRes.count || 0,
          totalComments: commentsRes.count || 0,
          totalForumPosts: forumRes.count || 0,
          totalSubscribers: subscribersRes.count || 0,
          recentPageViews,
          chapterStats: chapterData,
        });
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      }
      setLoading(false);
    };
    fetchAnalytics();
    fetchGlossaryEntries();
  }, [authToken, fetchGlossaryEntries]);

  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAllChapters();
      toast.success("Chapters downloaded successfully");
    } catch {
      toast.error("Failed to download chapters");
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteChapter = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;
    const { error } = await dbFetch('chapters', {
      method: 'DELETE',
      filters: `id=eq.${id}`,
      token: authToken,
    });
    if (error) {
      toast.error('Failed to delete chapter');
    } else {
      toast.success('Chapter deleted');
      fetchChapters();
    }
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: Icons.Dashboard },
    { id: "chapters", label: "Chapters", icon: Icons.Book },
    { id: "analytics", label: "Analytics", icon: Icons.Eye },
    { id: "glossary", label: "Glossary", icon: Icons.Book },
  ];

  // If in editor mode, render full-screen editor
  if (activeTab === 'chapters' && editorMode !== 'list') {
    return (
      <div className="min-h-screen p-8">
        <ChapterEditor
          authToken={authToken}
          glossary={glossary}
          editChapterId={editorMode === 'edit' ? editChapterId : undefined}
          onBack={() => {
            setEditorMode('list');
            setEditChapterId(null);
            fetchChapters();
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-card border-r border-border p-6">
        <h2 className="font-display text-xl text-accent mb-8">Admin Panel</h2>
        <nav className="space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                activeTab === tab.id
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            {activeTab === "dashboard" && analytics && (
              <div>
                <h1 className="font-display text-3xl text-accent mb-8">Dashboard</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                  <StatCard label="Total Chapter Views" value={analytics.totalViews} />
                  <StatCard label="Registered Readers" value={analytics.totalReaders} />
                  <StatCard label="Email Subscribers" value={analytics.totalSubscribers} />
                  <StatCard label="Comments" value={analytics.totalComments} />
                  <StatCard label="Forum Posts" value={analytics.totalForumPosts} />
                  <StatCard label="Glossary Terms" value={Object.keys(glossary).length} />
                </div>

                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-xl text-accent">Chapter Performance</h2>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    <Icons.Save className="w-4 h-4" />
                    {downloading ? "Downloading..." : "Download All Chapters"}
                  </button>
                </div>
                <div className="space-y-2">
                  {analytics.chapterStats.map(ch => (
                    <div key={ch.chapter_number} className="flex items-center justify-between p-4 bg-card/50 rounded-lg border border-border/50">
                      <span className="text-foreground">Ch. {ch.chapter_number}: {ch.title}</span>
                      <span className="text-muted-foreground text-sm">{ch.views} views</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "chapters" && (
              <div>
                <div className="flex items-center justify-between mb-8">
                  <h1 className="font-display text-3xl text-accent">Chapters</h1>
                  <button
                    onClick={() => setEditorMode('new')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
                  >
                    <Icons.Plus className="w-4 h-4" />
                    New Chapter
                  </button>
                </div>

                {chapters.length === 0 ? (
                  <p className="text-muted-foreground">No chapters yet. Create your first one!</p>
                ) : (
                  <div className="space-y-2">
                    {chapters.map(ch => (
                      <div key={ch.id} className="flex items-center justify-between p-4 bg-card/50 rounded-lg border border-border/50 group">
                        <div>
                          <span className="text-foreground font-medium">Ch. {ch.chapter_number}: {ch.title}</span>
                          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                            <span>{ch.views} views</span>
                            <span>Published: {new Date(ch.published_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => window.open(`/chapters/${ch.chapter_number}`, '_blank')}
                            className="px-3 py-1.5 bg-accent/20 hover:bg-accent/30 text-accent rounded text-sm transition-colors"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => {
                              setEditChapterId(ch.id);
                              setEditorMode('edit');
                            }}
                            className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded text-sm transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteChapter(ch.id, ch.title)}
                            className="px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive rounded text-sm transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "analytics" && analytics && (
              <div>
                <h1 className="font-display text-3xl text-accent mb-8">Page Analytics</h1>
                <div className="space-y-2">
                  {analytics.recentPageViews.length === 0 ? (
                    <p className="text-muted-foreground">No page view data yet.</p>
                  ) : (
                    analytics.recentPageViews.map(pv => (
                      <div key={pv.page} className="flex items-center justify-between p-4 bg-card/50 rounded-lg border border-border/50">
                        <span className="text-foreground">{pv.page}</span>
                        <div className="flex gap-6 text-sm text-muted-foreground">
                          <span>{pv.count} visits</span>
                          <span>~{pv.avg_duration}s avg</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === "glossary" && (
              <GlossaryManager
                authToken={authToken}
                entries={glossaryEntries}
                onRefresh={fetchGlossaryEntries}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="p-6 bg-card/50 rounded-xl border border-border">
    <div className="text-3xl font-display text-foreground">{value.toLocaleString()}</div>
    <div className="text-muted-foreground mt-1">{label}</div>
  </div>
);

export default AdminPanel;
