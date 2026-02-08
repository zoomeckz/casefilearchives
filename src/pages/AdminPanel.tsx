import React, { useState, useEffect } from "react";
import { Icons } from "@/lib/icons";
import { GlossaryEntry } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";

interface AdminPanelProps {
  glossary: Record<string, GlossaryEntry>;
}

interface AnalyticsData {
  totalViews: number;
  totalReaders: number;
  totalComments: number;
  totalForumPosts: number;
  totalSubscribers: number;
  recentPageViews: Array<{ page: string; count: number; avg_duration: number }>;
  chapterStats: Array<{ title: string; views: number; chapter_number: number }>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ glossary }) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      const [
        { data: chapters },
        { count: totalReaders },
        { count: totalComments },
        { count: totalForumPosts },
        { count: totalSubscribers },
        { data: pageViews },
      ] = await Promise.all([
        supabase.from('chapters').select('title, views, chapter_number').order('chapter_number'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('comments').select('*', { count: 'exact', head: true }),
        supabase.from('forum_posts').select('*', { count: 'exact', head: true }),
        supabase.from('email_subscriptions').select('*', { count: 'exact', head: true }).eq('new_chapters', true),
        supabase.from('page_views').select('page, duration_seconds').limit(500),
      ]);

      const totalViews = chapters?.reduce((sum, c) => sum + c.views, 0) || 0;

      // Aggregate page views by page
      const pageMap = new Map<string, { count: number; totalDuration: number }>();
      pageViews?.forEach(pv => {
        const existing = pageMap.get(pv.page) || { count: 0, totalDuration: 0 };
        existing.count++;
        existing.totalDuration += pv.duration_seconds || 0;
        pageMap.set(pv.page, existing);
      });

      const recentPageViews = Array.from(pageMap.entries()).map(([page, data]) => ({
        page,
        count: data.count,
        avg_duration: Math.round(data.totalDuration / data.count),
      })).sort((a, b) => b.count - a.count);

      setAnalytics({
        totalViews,
        totalReaders: totalReaders || 0,
        totalComments: totalComments || 0,
        totalForumPosts: totalForumPosts || 0,
        totalSubscribers: totalSubscribers || 0,
        recentPageViews,
        chapterStats: chapters || [],
      });
      setLoading(false);
    };
    fetchAnalytics();
  }, []);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: Icons.Dashboard },
    { id: "analytics", label: "Analytics", icon: Icons.Eye },
    { id: "glossary", label: "Glossary", icon: Icons.Book },
  ];

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
          <p className="text-muted-foreground">Loading analytics...</p>
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

                <h2 className="font-display text-xl text-accent mb-4">Chapter Performance</h2>
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

            {activeTab === "analytics" && analytics && (
              <div>
                <h1 className="font-display text-3xl text-accent mb-8">Page Analytics</h1>
                <div className="space-y-2">
                  {analytics.recentPageViews.length === 0 ? (
                    <p className="text-muted-foreground">No page view data yet. Data will populate as readers visit.</p>
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
              <div>
                <div className="flex items-center justify-between mb-8">
                  <h1 className="font-display text-3xl text-accent">Glossary</h1>
                  <p className="text-muted-foreground text-sm">Characters, locations, and concepts</p>
                </div>
                <div className="space-y-2">
                  {Object.entries(glossary).map(([term, entry]) => (
                    <div key={term} className="p-4 bg-card/30 rounded-lg border border-border/50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-foreground font-medium">{term}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          entry.type === "character" ? "bg-primary/10 text-primary"
                          : entry.type === "location" ? "bg-accent/10 text-accent"
                          : entry.type === "creature" ? "bg-destructive/10 text-destructive"
                          : "bg-purple-400/10 text-purple-400"
                        }`}>
                          {entry.type}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm">{entry.description}</p>
                    </div>
                  ))}
                </div>
              </div>
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
