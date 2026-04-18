import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Icons } from "@/lib/icons";
import { GlossaryEntry } from "@/lib/data";
import { dbFetch } from "@/lib/dbFetch";
import { downloadAllChapters, downloadSingleChapter } from "@/hooks/useChapterDownload";
import { ChapterEditor, getAllDrafts, deleteDraft, type ChapterDraft } from "@/components/ChapterEditor";
import { GlossaryManager } from "@/components/GlossaryManager";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { ContentSearch } from "@/components/ContentSearch";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Menu, X, Search, ArrowUpDown, Globe, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";

interface AdminPanelProps {
  glossary: Record<string, GlossaryEntry>;
  authToken?: string;
  userId?: string;
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

type ChapterSortKey = 'number-asc' | 'number-desc' | 'views-desc' | 'views-asc' | 'newest' | 'oldest';

export const AdminPanel: React.FC<AdminPanelProps> = ({ glossary, authToken, userId, onGlossaryChange }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // Search & sort
  const [chapterSearch, setChapterSearch] = useState("");
  const [chapterSort, setChapterSort] = useState<ChapterSortKey>('number-desc');
  const [dashboardSearch, setDashboardSearch] = useState("");

  // Chapter editor state
  const [editorMode, setEditorMode] = useState<'list' | 'new' | 'edit' | 'draft'>('list');
  const [editChapterId, setEditChapterId] = useState<string | null>(null);
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null);
  const [searchSentence, setSearchSentence] = useState<string | null>(null);
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);
  const [chapterSubTab, setChapterSubTab] = useState<'published' | 'drafts'>('published');
  const [drafts, setDrafts] = useState<ChapterDraft[]>([]);
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
      select: 'id,title,chapter_number,views,published_at,scheduled_at',
      order: 'chapter_number.asc',
      token: authToken,
    });
    setChapters(data || []);
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [chaptersRes, readersRes, commentsRes, forumRes, subscribersRes, pageViewsRes] = await Promise.all([
          dbFetch<any[]>('chapters', { select: 'id,title,views,chapter_number,published_at,scheduled_at', order: 'chapter_number.asc', token: authToken }),
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

  // SEO Sync state
  const [seoSyncing, setSeoSyncing] = useState(false);
  const [seoProgress, setSeoProgress] = useState(0);
  const [seoResult, setSeoResult] = useState<any>(null);
  const [seoStep, setSeoStep] = useState('');

  // Live SEO + cron status state
  const [seoStatus, setSeoStatus] = useState<any>(null);
  const [seoStatusLoading, setSeoStatusLoading] = useState(false);
  const [seoRefreshing, setSeoRefreshing] = useState(false);

  const fetchSeoStatus = useCallback(async (refresh = false) => {
    if (refresh) setSeoRefreshing(true);
    else setSeoStatusLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/seo-status`, {
        method: refresh ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: refresh ? JSON.stringify({ action: 'refresh' }) : undefined,
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setSeoStatus(data);
      if (refresh) toast.success('SEO endpoints refreshed');
    } catch (err: any) {
      toast.error('Failed to load SEO status: ' + (err.message || 'Unknown error'));
    } finally {
      setSeoStatusLoading(false);
      setSeoRefreshing(false);
    }
  }, [authToken]);

  // Auto-load SEO status when entering the SEO tab
  useEffect(() => {
    if (activeTab === 'seo' && !seoStatus && authToken) {
      fetchSeoStatus(false);
    }
  }, [activeTab, seoStatus, authToken, fetchSeoStatus]);

  const handleSeoSync = async () => {
    setSeoSyncing(true);
    setSeoProgress(0);
    setSeoResult(null);

    const steps = [
      { label: 'Scanning chapters...', progress: 15 },
      { label: 'Indexing glossary entries...', progress: 30 },
      { label: 'Syncing community content...', progress: 50 },
      { label: 'Verifying content feed...', progress: 70 },
      { label: 'Running SEO checklist...', progress: 85 },
    ];

    for (const step of steps) {
      setSeoStep(step.label);
      setSeoProgress(step.progress);
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/seo-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setSeoResult(data);
      setSeoProgress(100);
      setSeoStep('SEO sync complete!');
      toast.success('SEO sync completed successfully');
    } catch (err: any) {
      toast.error('SEO sync failed: ' + (err.message || 'Unknown error'));
      setSeoStep('Sync failed');
    } finally {
      setTimeout(() => setSeoSyncing(false), 1000);
    }
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: Icons.Dashboard },
    { id: "chapters", label: "Chapters", icon: Icons.Book },
    { id: "search", label: "Search Content", icon: Search },
    { id: "analytics", label: "Analytics", icon: Icons.Eye },
    { id: "glossary", label: "Glossary", icon: Icons.Book },
    { id: "seo", label: "SEO", icon: Globe },
  ];

  const refreshDrafts = useCallback(async () => {
    const d = await getAllDrafts(authToken);
    setDrafts(d);
  }, [authToken]);

  const updateAdminRoute = useCallback((updates: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });

    setSearchParams(next, { replace });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    refreshDrafts();
  }, [refreshDrafts]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const nextTab = ['dashboard', 'chapters', 'search', 'analytics', 'glossary', 'seo'].includes(tabParam || '')
      ? (tabParam as string)
      : 'dashboard';
    const nextSubTab = searchParams.get('subtab') === 'drafts' ? 'drafts' : 'published';
    const viewParam = searchParams.get('view');
    const nextView = viewParam === 'new' || viewParam === 'edit' || viewParam === 'draft' ? viewParam : 'list';
    const nextChapterId = searchParams.get('chapter');
    const nextDraftId = searchParams.get('draft');
    const nextSearchHighlight = searchParams.get('term');
    const nextSearchSentence = searchParams.get('sentence');

    setActiveTab(nextTab);
    setChapterSubTab(nextSubTab);

    if (nextSubTab === 'drafts') {
      refreshDrafts();
    }

    if (nextTab === 'chapters' && nextView !== 'list') {
      setEditorMode(nextView);
      setEditChapterId(nextView === 'edit' ? nextChapterId : null);
      setResumeDraftId(nextView === 'draft' ? nextDraftId : null);
      setSearchHighlight(nextView === 'edit' ? nextSearchHighlight : null);
      setSearchSentence(nextView === 'edit' ? nextSearchSentence : null);
      return;
    }

    setEditorMode('list');
    setEditChapterId(null);
    setResumeDraftId(null);
    setSearchHighlight(null);
    setSearchSentence(null);
  }, [searchParams, refreshDrafts]);

  // Filtered & sorted chapters
  const filteredChapters = useMemo(() => {
    let list = [...chapters];
    if (chapterSearch.trim()) {
      const q = chapterSearch.toLowerCase();
      list = list.filter(ch => ch.title?.toLowerCase().includes(q) || String(ch.chapter_number).includes(q));
    }
    switch (chapterSort) {
      case 'number-asc': return list.sort((a, b) => a.chapter_number - b.chapter_number);
      case 'number-desc': return list.sort((a, b) => b.chapter_number - a.chapter_number);
      case 'views-desc': return list.sort((a, b) => b.views - a.views);
      case 'views-asc': return list.sort((a, b) => a.views - b.views);
      case 'newest': return list.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
      case 'oldest': return list.sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
      default: return list;
    }
  }, [chapters, chapterSearch, chapterSort]);

  // Filtered dashboard chapter stats
  const filteredDashboardStats = useMemo(() => {
    if (!analytics) return [];
    if (!dashboardSearch.trim()) return analytics.chapterStats;
    const q = dashboardSearch.toLowerCase();
    return analytics.chapterStats.filter(ch => ch.title?.toLowerCase().includes(q) || String(ch.chapter_number).includes(q));
  }, [analytics, dashboardSearch]);

  // Filtered drafts
  const filteredDrafts = useMemo(() => {
    if (!chapterSearch.trim()) return drafts;
    const q = chapterSearch.toLowerCase();
    return drafts.filter(d => (d.title || 'Untitled Draft').toLowerCase().includes(q));
  }, [drafts, chapterSearch]);

  // If in editor mode, render full-screen editor
  if (activeTab === 'chapters' && editorMode !== 'list') {
    return (
      <div className="min-h-screen p-4 md:p-8">
        <ChapterEditor
          authToken={authToken}
          userId={userId}
          glossary={glossary}
          editChapterId={editorMode === 'edit' ? editChapterId : undefined}
          resumeDraftId={editorMode === 'draft' ? resumeDraftId : undefined}
          searchHighlight={editorMode === 'edit' ? searchHighlight : undefined}
          searchSentence={editorMode === 'edit' ? searchSentence : undefined}
          onBack={() => {
            updateAdminRoute({ view: null, chapter: null, draft: null, term: null, sentence: null });
            fetchChapters();
            refreshDrafts();
          }}
        />
      </div>
    );
  }

  const handleTabClick = (tabId: string) => {
    updateAdminRoute({
      tab: tabId,
      subtab: tabId === 'chapters' ? chapterSubTab : null,
      view: null,
      chapter: null,
      draft: null,
      term: null,
      sentence: null,
    });
    if (isMobile) setSidebarOpen(false);
  };

  const sortOptions: { value: ChapterSortKey; label: string }[] = [
    { value: 'number-asc', label: 'Ch. # ↑' },
    { value: 'number-desc', label: 'Ch. # ↓' },
    { value: 'views-desc', label: 'Most Viewed' },
    { value: 'views-asc', label: 'Least Viewed' },
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile header */}
      {isMobile && (
        <div className="flex items-center justify-between p-4 bg-card border-b border-border sticky top-0 z-30">
          <h2 className="font-display text-lg text-accent">Admin Panel</h2>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      )}

      {/* Sidebar / Mobile drawer */}
      {(sidebarOpen || !isMobile) && (
        <>
          {isMobile && <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />}
          <aside className={`${isMobile ? 'fixed top-0 left-0 h-full z-40 w-64 animate-in slide-in-from-left' : 'w-64 sticky top-0 h-screen'} bg-card border-r border-border p-6 overflow-y-auto`}>
            <h2 className="font-display text-xl text-accent mb-8">{isMobile ? '' : 'Admin Panel'}</h2>
            <nav className="space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
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
        </>
      )}

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            {activeTab === "dashboard" && analytics && (
              <div>
                <h1 className="font-display text-2xl md:text-3xl text-accent mb-6 md:mb-8">Dashboard</h1>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-8 md:mb-12">
                  <StatCard label="Total Chapter Views" value={analytics.totalViews} />
                  <StatCard label="Registered Readers" value={analytics.totalReaders} />
                  <StatCard label="Email Subscribers" value={analytics.totalSubscribers} />
                  <StatCard label="Comments" value={analytics.totalComments} />
                  <StatCard label="Forum Posts" value={analytics.totalForumPosts} />
                  <StatCard label="Glossary Terms" value={Object.keys(glossary).length} />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <h2 className="font-display text-xl text-accent">Chapter Performance</h2>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial sm:w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search chapters..."
                        value={dashboardSearch}
                        onChange={(e) => setDashboardSearch(e.target.value)}
                        className="pl-9 h-9 text-sm"
                      />
                    </div>
                    <button
                      onClick={handleDownload}
                      disabled={downloading}
                      className="flex items-center gap-2 px-3 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <Icons.Save className="w-4 h-4" />
                      <span className="hidden sm:inline">{downloading ? "Downloading..." : "Download All"}</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {filteredDashboardStats.map(ch => (
                    <div key={ch.chapter_number} className="flex items-center justify-between p-3 md:p-4 bg-card/50 rounded-lg border border-border/50">
                      <span className="text-foreground text-sm md:text-base truncate mr-2">Ch. {ch.chapter_number}: {ch.title}</span>
                      <span className="text-muted-foreground text-xs md:text-sm whitespace-nowrap">{ch.views} views</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "chapters" && (
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <h1 className="font-display text-2xl md:text-3xl text-accent">Chapters</h1>
                  <button
                    onClick={() => updateAdminRoute({ tab: 'chapters', view: 'new', chapter: null, draft: null, term: null, sentence: null })}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors text-sm"
                  >
                    <Icons.Plus className="w-4 h-4" />
                    New Chapter
                  </button>
                </div>

                {/* Search & Sort bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by title or chapter number..."
                      value={chapterSearch}
                      onChange={(e) => setChapterSearch(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    <select
                      value={chapterSort}
                      onChange={(e) => setChapterSort(e.target.value as ChapterSortKey)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {sortOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-1 mb-4 bg-card/30 p-1 rounded-lg w-fit">
                  {(['published', 'drafts'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => {
                        updateAdminRoute({ tab: 'chapters', subtab: tab, view: null, chapter: null, draft: null, term: null, sentence: null });
                        if (tab === 'drafts') refreshDrafts();
                      }}
                      className={`px-3 md:px-4 py-2 rounded-md text-xs md:text-sm font-medium transition-colors ${
                        chapterSubTab === tab
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab === 'published' ? `Published (${filteredChapters.length})` : `Drafts (${filteredDrafts.length})`}
                    </button>
                  ))}
                </div>

                {chapterSubTab === 'published' && (
                  <>
                    {filteredChapters.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        {chapterSearch ? 'No chapters match your search.' : 'No chapters yet. Create your first one!'}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {filteredChapters.map(ch => (
                          <div key={ch.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-card/50 rounded-lg border border-border/50 gap-2 group">
                            <div className="min-w-0">
                              <span className="text-foreground font-medium text-sm md:text-base block truncate">Ch. {ch.chapter_number}: {ch.title}</span>
                              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                <span>{ch.views} views</span>
                                <span>{ch.published_at ? new Date(ch.published_at).toLocaleDateString() : 'No date'}</span>
                                {ch.scheduled_at && (
                                  <span className={`font-medium ${new Date(ch.scheduled_at) > new Date() ? 'text-accent' : 'text-muted-foreground'}`}>
                                    📅 {new Date(ch.scheduled_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })} {new Date(ch.scheduled_at).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={() => downloadSingleChapter(ch.chapter_number, ch.title)}
                                className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs transition-colors"
                                title="Download this chapter"
                              >
                                Download
                              </button>
                              <a
                                href={`/chapters/${ch.chapter_number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-accent/20 hover:bg-accent/30 text-accent rounded text-xs transition-colors inline-block"
                              >
                                Preview
                              </a>
                              <button
                                onClick={() => updateAdminRoute({ tab: 'chapters', view: 'edit', chapter: ch.id, draft: null, term: null, sentence: null })}
                                className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded text-xs transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteChapter(ch.id, ch.title)}
                                className="px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive rounded text-xs transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {chapterSubTab === 'drafts' && (
                  <>
                    {filteredDrafts.length > 0 && (
                      <div className="flex justify-end mb-3">
                        <button
                          onClick={() => {
                            if (drafts.length === 0) { toast.error('No drafts to download'); return; }
                            const separator = '═'.repeat(60);
                            const lines: string[] = [
                              'SEDORIUM — DRAFTS',
                              separator,
                              `Exported: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
                              `Total Drafts: ${drafts.length}`,
                              separator, '', '',
                            ];
                            for (const d of [...drafts].sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0))) {
                              lines.push(separator);
                              lines.push(`DRAFT — ${d.title || 'Untitled'} (Ch. ${d.chapterNumber || '?'})`);
                              lines.push(`Last saved: ${new Date(d.lastSaved).toLocaleString()}`);
                              lines.push(separator, '');
                              const div = document.createElement('div');
                              div.innerHTML = d.content || '';
                              ['p','div','h1','h2','h3','h4','h5','h6','li','blockquote'].forEach(tag => {
                                div.querySelectorAll(tag).forEach(el => { el.insertAdjacentText('beforebegin', '\n'); el.insertAdjacentText('afterend', '\n'); });
                              });
                              div.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
                              const text = (div.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
                              lines.push(text, '', '');
                            }
                            lines.push(separator, 'END OF DRAFTS', separator);
                            const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'Sedorium_Drafts.txt';
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 3000);
                            toast.success('Drafts downloaded');
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-xs transition-colors"
                        >
                          <Icons.Save className="w-3.5 h-3.5" />
                          Download All Drafts
                        </button>
                      </div>
                    )}
                    {filteredDrafts.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        {chapterSearch ? 'No drafts match your search.' : 'No drafts saved. Drafts auto-save every 10 seconds while editing.'}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {filteredDrafts.sort((a, b) => new Date(b.lastSaved).getTime() - new Date(a.lastSaved).getTime()).map(draft => (
                          <div key={draft.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-card/50 rounded-lg border border-border/50 gap-2 group">
                            <div className="min-w-0">
                              <span className="text-foreground font-medium text-sm block truncate">
                                {draft.title || 'Untitled Draft'}
                              </span>
                              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                <span>Saved: {new Date(draft.lastSaved).toLocaleString()}</span>
                                <span>{draft.content.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length} words</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={() => updateAdminRoute({ tab: 'chapters', subtab: 'drafts', view: 'draft', draft: draft.id, chapter: null, term: null, sentence: null })}
                                className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs transition-colors"
                              >
                                Resume
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Delete this draft?')) {
                                    deleteDraft(draft.id, authToken).then(() => {
                                      refreshDrafts();
                                    });
                                    toast.success('Draft deleted');
                                  }
                                }}
                                className="px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive rounded text-xs transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === "search" && (
              <ContentSearch
                authToken={authToken}
                onEditChapter={(chapterId, searchTerm, sentence) => {
                  updateAdminRoute({
                    tab: 'chapters',
                    subtab: 'published',
                    view: 'edit',
                    chapter: chapterId,
                    draft: null,
                    term: searchTerm || null,
                    sentence: sentence || null,
                  });
                }}
              />
            )}

            {activeTab === "analytics" && (
              <AnalyticsDashboard authToken={authToken} />
            )}

            {activeTab === "glossary" && (
              <GlossaryManager
                authToken={authToken}
                entries={glossaryEntries}
                onRefresh={fetchGlossaryEntries}
              />
            )}

            {activeTab === "seo" && (
              <div>
                <h1 className="font-display text-2xl md:text-3xl text-accent mb-6">SEO & Content Sync</h1>
                <p className="text-muted-foreground text-sm mb-6">
                  Sync all chapters, glossary, forum posts, theories, and fan art to the AI content feed. This makes your content fully discoverable by Google, ChatGPT, Claude, Perplexity, and other AI crawlers.
                </p>

                <button
                  onClick={handleSeoSync}
                  disabled={seoSyncing}
                  className="flex items-center gap-3 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors disabled:opacity-50 mb-6"
                >
                  {seoSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                  {seoSyncing ? 'Syncing...' : 'Run SEO Sync'}
                </button>

                {/* Progress bar */}
                {(seoSyncing || seoProgress > 0) && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-foreground">{seoStep}</span>
                      <span className="text-sm text-muted-foreground">{seoProgress}%</span>
                    </div>
                    <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${seoProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Results */}
                {seoResult && (
                  <div className="space-y-4">
                    {/* Content feed status */}
                    <div className="p-4 bg-card/50 rounded-xl border border-border">
                      <div className="flex items-center gap-2 mb-3">
                        {seoResult.contentFeedStatus === 'online' ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-destructive" />
                        )}
                        <h3 className="font-medium text-foreground">Content Feed</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          seoResult.contentFeedStatus === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-destructive/20 text-destructive'
                        }`}>
                          {seoResult.contentFeedStatus}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 text-xs">
                        <a href={seoResult.contentFeedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="w-3 h-3" /> HTML Feed
                        </a>
                        <a href={seoResult.contentFeedJsonUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="w-3 h-3" /> JSON Feed
                        </a>
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-4 bg-card/50 rounded-xl border border-border text-center">
                        <div className="text-2xl font-display text-foreground">{seoResult.stats.chapters.total}</div>
                        <div className="text-xs text-muted-foreground mt-1">Chapters Indexed</div>
                      </div>
                      <div className="p-4 bg-card/50 rounded-xl border border-border text-center">
                        <div className="text-2xl font-display text-foreground">{seoResult.stats.glossary.total}</div>
                        <div className="text-xs text-muted-foreground mt-1">Glossary Terms</div>
                      </div>
                      <div className="p-4 bg-card/50 rounded-xl border border-border text-center">
                        <div className="text-2xl font-display text-foreground">{seoResult.stats.community.forumPosts}</div>
                        <div className="text-xs text-muted-foreground mt-1">Forum Posts</div>
                      </div>
                      <div className="p-4 bg-card/50 rounded-xl border border-border text-center">
                        <div className="text-2xl font-display text-foreground">{seoResult.stats.community.theories}</div>
                        <div className="text-xs text-muted-foreground mt-1">Theories</div>
                      </div>
                      <div className="p-4 bg-card/50 rounded-xl border border-border text-center">
                        <div className="text-2xl font-display text-foreground">{seoResult.stats.community.fanArt}</div>
                        <div className="text-xs text-muted-foreground mt-1">Fan Art</div>
                      </div>
                      <div className="p-4 bg-card/50 rounded-xl border border-border text-center">
                        <div className="text-2xl font-display text-foreground">{seoResult.stats.community.registeredUsers}</div>
                        <div className="text-xs text-muted-foreground mt-1">Users</div>
                      </div>
                      <div className="p-4 bg-card/50 rounded-xl border border-border text-center">
                        <div className="text-2xl font-display text-foreground">{seoResult.stats.community.comments}</div>
                        <div className="text-xs text-muted-foreground mt-1">Comments</div>
                      </div>
                      <div className="p-4 bg-card/50 rounded-xl border border-border text-center">
                        <div className="text-2xl font-display text-foreground">{seoResult.stats.chapters.totalViews.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground mt-1">Total Views</div>
                      </div>
                    </div>

                    {/* Glossary breakdown */}
                    {seoResult.stats.glossary.byType && (
                      <div className="p-4 bg-card/50 rounded-xl border border-border">
                        <h3 className="font-medium text-foreground mb-3">Glossary Breakdown</h3>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(seoResult.stats.glossary.byType).map(([type, count]) => (
                            <span key={type} className="px-3 py-1 bg-secondary rounded-full text-xs text-foreground">
                              {type}: {count as number}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SEO Checklist */}
                    <div className="p-4 bg-card/50 rounded-xl border border-border">
                      <h3 className="font-medium text-foreground mb-3">SEO Checklist</h3>
                      <div className="space-y-2">
                        {[
                          { label: `${seoResult.seoChecklist.structuredDataChapters} chapters in structured data`, ok: seoResult.seoChecklist.structuredDataChapters > 0 },
                          { label: 'Content feed serving', ok: seoResult.seoChecklist.contentFeedServing },
                          { label: `${seoResult.seoChecklist.glossaryTermsIndexed} glossary terms indexed`, ok: seoResult.seoChecklist.glossaryTermsIndexed > 0 },
                          { label: `${seoResult.seoChecklist.communityContentIndexed} community items indexed`, ok: seoResult.seoChecklist.communityContentIndexed > 0 },
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            {item.ok ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <span className="text-foreground">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Last synced: {new Date(seoResult.timestamp).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="p-4 md:p-6 bg-card/50 rounded-xl border border-border">
    <div className="text-2xl md:text-3xl font-display text-foreground">{value.toLocaleString()}</div>
    <div className="text-muted-foreground text-xs md:text-sm mt-1">{label}</div>
  </div>
);

export default AdminPanel;
