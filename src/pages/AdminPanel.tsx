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
import { EditAuditPanel } from "@/components/EditAuditPanel";
import { ChapterTranslationsManager } from "@/components/ChapterTranslationsManager";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import {
  Menu, X, Search, ArrowUpDown, Globe, CheckCircle2, AlertCircle, Loader2, ExternalLink, History,
  ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal, Edit3, Trash2, Eye, Download, FileText,
  Calendar, AlertTriangle, BookOpen, Sparkles, BarChart3, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NON_DEFAULT_LANGUAGES, LANGUAGE_LABELS, type SupportedLanguage } from "@/i18n";
import { FlagIcon } from "@/components/FlagIcon";

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

// Moment the old connected-world content was archived; activity before this counts as legacy.
const LEGACY_CUTOFF = '2026-09-23T13:49:55Z';

export const AdminPanel: React.FC<AdminPanelProps> = ({ glossary, authToken, userId, onGlossaryChange }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // Search & sort
  const [chapterSearch, setChapterSearch] = useState("");
  const [chapterSort, setChapterSort] = useState<ChapterSortKey>('newest');
  const [dashboardSearch, setDashboardSearch] = useState("");

  // Chapter editor state
  const [editorMode, setEditorMode] = useState<'list' | 'new' | 'new-legacy' | 'edit' | 'draft'>('list');
  const [editChapterId, setEditChapterId] = useState<string | null>(null);
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null);
  const [searchSentence, setSearchSentence] = useState<string | null>(null);
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);
  const [chapterSubTab, setChapterSubTab] = useState<'published' | 'drafts'>('published');
  const [drafts, setDrafts] = useState<ChapterDraft[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [legacyStats, setLegacyStats] = useState<{ views: number; readers: number; comments: number; subscribers: number; forumPosts: number; chapterStats: any[] } | null>(null);
  const [glossaryEntries, setGlossaryEntries] = useState<any[]>([]);
  // Per-chapter translations modal — open when admin clicks "Translate" on a row.
  const [translatingChapter, setTranslatingChapter] = useState<{
    id: string;
    chapter_number: number;
    title: string;
    content: string;
    is_archived: boolean;
  } | null>(null);

  // Bulk-selection state for the Chapters table.
  //   - `selectedChapters`     : the set of selected chapter ids.
  //   - `translationQueue`     : ordered list of chapter ids to walk the
  //     translation editor through. When the editor closes we pop the next
  //     id and reopen, giving a "Translate all selected" UX without building
  //     a separate batch screen.
  //   - `bulkBusy`             : disables the bar while a network bulk op runs.
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [translationQueue, setTranslationQueue] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Sidebar collapse state — persisted across page reloads via localStorage so
  // power users keep the layout they prefer. Mobile uses the off-canvas drawer
  // controlled by `sidebarOpen` instead.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("admin.sidebar.collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("admin.sidebar.collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  // Translation coverage map: { [chapter_id]: count of non-English translations }.
  // We fetch chapter_id only and count client-side so we don't need a custom RPC.
  const [translationCounts, setTranslationCounts] = useState<Record<string, number>>({});
  const refreshTranslationCounts = useCallback(async () => {
    const { data } = await dbFetch<Array<{ chapter_id: string }>>("chapter_translations", {
      select: "chapter_id",
      token: authToken,
    });
    const counts: Record<string, number> = {};
    (data ?? []).forEach((r) => {
      counts[r.chapter_id] = (counts[r.chapter_id] ?? 0) + 1;
    });
    setTranslationCounts(counts);
  }, [authToken]);
  useEffect(() => {
    refreshTranslationCounts();
  }, [refreshTranslationCounts]);
  const totalTranslationLanguages = NON_DEFAULT_LANGUAGES.length;

  // ---- Bulk selection helpers ---------------------------------------------
  // Toggle one chapter in/out of the selection set. Memoised so the table
  // doesn't re-render every row on each keystroke elsewhere.
  const toggleChapterSelection = useCallback((id: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearChapterSelection = useCallback(() => setSelectedChapters(new Set()), []);

  // Open the translation editor for the first selected chapter; remaining ids
  // are queued and consumed automatically as the editor is closed.
  const openChapterForTranslation = useCallback(
    async (id: string) => {
      const { data, error } = await dbFetch<any[]>("chapters", {
        select: "id,chapter_number,title,content,is_archived",
        filters: `id=eq.${id}`,
        token: authToken,
      });
      if (error || !data?.[0]) {
        toast.error("Could not load chapter content for translation.");
        return false;
      }
      setTranslatingChapter({
        id: data[0].id,
        chapter_number: data[0].chapter_number,
        title: data[0].title,
        content: data[0].content || "",
        is_archived: data[0].is_archived === true,
      });
      return true;
    },
    [authToken],
  );
  const startTranslationQueue = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const ordered = [...ids];
      const first = ordered.shift()!;
      setTranslationQueue(ordered);
      const ok = await openChapterForTranslation(first);
      if (!ok) setTranslationQueue([]);
    },
    [openChapterForTranslation],
  );
  // Called when the translation modal closes. If there are queued chapters
  // left we transparently advance to the next one; otherwise just close.
  const handleTranslationModalClose = useCallback(async () => {
    setTranslatingChapter(null);
    refreshTranslationCounts();
    if (translationQueue.length === 0) return;
    const [nextId, ...rest] = translationQueue;
    setTranslationQueue(rest);
    // Small delay so the modal unmount finishes cleanly before the next opens.
    await new Promise((r) => setTimeout(r, 50));
    const ok = await openChapterForTranslation(nextId);
    if (!ok) setTranslationQueue([]);
  }, [translationQueue, openChapterForTranslation, refreshTranslationCounts]);

  // Bulk "Seed from English": for every selected chapter, insert a
  // chapter_translations row in `lang` populated with the English title +
  // content IF none exists yet. Existing rows are left alone — admins should
  // open the editor to overwrite intentionally.
  const bulkSeedFromEnglish = useCallback(
    async (lang: SupportedLanguage) => {
      const ids = Array.from(selectedChapters);
      if (ids.length === 0 || !authToken) return;
      if (!confirm(
        `Create ${LANGUAGE_LABELS[lang]} translation drafts for ${ids.length} chapter(s) using the English source as a starting point? Chapters that already have a ${LANGUAGE_LABELS[lang]} translation will be skipped.`,
      )) return;
      setBulkBusy(true);
      try {
        // 1. Find which selected chapters already have this language.
        const { data: existing } = await dbFetch<Array<{ chapter_id: string }>>(
          "chapter_translations",
          {
            select: "chapter_id",
            filters: `language_code=eq.${lang}&chapter_id=in.(${ids.join(",")})`,
            token: authToken,
          },
        );
        const taken = new Set((existing ?? []).map((r) => r.chapter_id));
        const todo = ids.filter((id) => !taken.has(id));
        if (todo.length === 0) {
          toast.message(`All selected chapters already have ${LANGUAGE_LABELS[lang]} translations.`);
          return;
        }
        // 2. Pull the English source for the chapters that still need seeding.
        const { data: src, error: srcErr } = await dbFetch<Array<{ id: string; title: string; content: string }>>(
          "chapters",
          {
            select: "id,title,content",
            filters: `id=in.(${todo.join(",")})`,
            token: authToken,
          },
        );
        if (srcErr || !src) throw new Error(srcErr || "Failed to load source chapters.");
        // 3. One POST per chapter — tolerable batch sizes here, and we still get
        //    a per-row error if anything goes wrong instead of a partial commit.
        let inserted = 0;
        for (const chap of src) {
          const { error } = await dbFetch("chapter_translations", {
            method: "POST",
            body: {
              chapter_id: chap.id,
              language_code: lang,
              title: chap.title,
              content: chap.content || "",
            },
            token: authToken,
          });
          if (!error) inserted++;
        }
        toast.success(
          `Seeded ${inserted}/${todo.length} ${LANGUAGE_LABELS[lang]} draft(s). ${taken.size} skipped (already exist).`,
        );
        await refreshTranslationCounts();
      } catch (err: any) {
        toast.error(`Bulk seed failed: ${err.message ?? err}`);
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedChapters, authToken, refreshTranslationCounts],
  );

  // Bulk "Delete language": destructive — drops every chapter_translations
  // row matching the selection + language.
  const bulkDeleteLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      const ids = Array.from(selectedChapters);
      if (ids.length === 0 || !authToken) return;
      if (!confirm(
        `Delete the ${LANGUAGE_LABELS[lang]} translation for ${ids.length} chapter(s)? Readers will fall back to English. This cannot be undone.`,
      )) return;
      setBulkBusy(true);
      try {
        const { error } = await dbFetch("chapter_translations", {
          method: "DELETE",
          filters: `language_code=eq.${lang}&chapter_id=in.(${ids.join(",")})`,
          token: authToken,
        });
        if (error) throw new Error(error);
        toast.success(`Removed ${LANGUAGE_LABELS[lang]} translations from selected chapters.`);
        await refreshTranslationCounts();
      } catch (err: any) {
        toast.error(`Bulk delete failed: ${err.message ?? err}`);
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedChapters, authToken, refreshTranslationCounts],
  );

  const fetchGlossaryEntries = useCallback(async () => {
    const { data } = await dbFetch<any[]>('glossary', {
      select: 'id,term,description,type,image_url,aliases',
      order: 'term.asc',
      token: authToken,
    });
    setGlossaryEntries(data || []);
    onGlossaryChange?.();
  }, [authToken, onGlossaryChange]);

  const fetchChapters = async () => {
    const { data } = await dbFetch<any[]>('chapters', {
      select: 'id,title,chapter_number,views,published_at,scheduled_at,is_archived,tags',
      order: 'chapter_number.asc',
      token: authToken,
    });
    setChapters(data || []);
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const after = `created_at=gte.${LEGACY_CUTOFF}`;
        const before = `created_at=lt.${LEGACY_CUTOFF}`;
        const [chaptersRes, readersRes, commentsRes, forumRes, subscribersRes, pageViewsRes, oldReadersRes, oldCommentsRes, oldSubsRes] = await Promise.all([
          dbFetch<any[]>('chapters', { select: 'id,title,views,chapter_number,published_at,scheduled_at,is_archived,tags', order: 'chapter_number.asc', token: authToken }),
          dbFetch<any[]>('profiles', { select: '*', head: true, filters: after, token: authToken }),
          dbFetch<any[]>('comments', { select: '*', head: true, filters: after, token: authToken }),
          dbFetch<any[]>('forum_posts', { select: '*', head: true, token: authToken }),
          dbFetch<any[]>('email_subscriptions', { select: '*', head: true, filters: `new_chapters=eq.true&${after}`, token: authToken }),
          dbFetch<any[]>('page_views', { select: 'page,duration_seconds', filters: after, token: authToken }),
          dbFetch<any[]>('profiles', { select: '*', head: true, filters: before, token: authToken }),
          dbFetch<any[]>('comments', { select: '*', head: true, filters: before, token: authToken }),
          dbFetch<any[]>('email_subscriptions', { select: '*', head: true, filters: `new_chapters=eq.true&${before}`, token: authToken }),
        ]);

        const chapterData = chaptersRes.data || [];
        setChapters(chapterData);
        const newChapters = chapterData.filter((c: any) => !c.is_archived);
        const oldChapters = chapterData.filter((c: any) => c.is_archived);
        const totalViews = newChapters.reduce((sum: number, c: any) => sum + c.views, 0);
        setLegacyStats({
          views: oldChapters.reduce((sum: number, c: any) => sum + c.views, 0),
          readers: oldReadersRes.count || 0,
          comments: oldCommentsRes.count || 0,
          subscribers: oldSubsRes.count || 0,
          forumPosts: forumRes.count || 0,
          chapterStats: oldChapters,
        });

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
          totalForumPosts: 0,
          totalSubscribers: subscribersRes.count || 0,
          recentPageViews,
          chapterStats: newChapters,
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
      toast.success("Stories downloaded successfully");
    } catch {
      toast.error("Failed to download stories");
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteChapter = async (id: string, title: string) => {
    const isLegacy = chapters.find((item) => item.id === id)?.is_archived === true;
    const itemType = isLegacy ? 'legacy chapter' : 'story';
    if (!confirm(`Are you sure you want to delete the ${itemType} "${title}"? This cannot be undone.`)) return;
    const { error } = await dbFetch('chapters', {
      method: 'DELETE',
      filters: `id=eq.${id}`,
      token: authToken,
    });
    if (error) {
      toast.error(`Failed to delete ${itemType}`);
    } else {
      toast.success(`${isLegacy ? 'Legacy chapter' : 'Story'} deleted`);
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

  // Sidebar navigation grouped by job-to-be-done.
  // - CONTENT: things you write or edit day-to-day.
  // - INSIGHTS: read-only views into how the site is doing.
  // - SYSTEM: rare, technical, "set and forget" controls.
  // The flat `tabs` list is preserved (derived) for the URL-routing effect that
  // validates the `?tab=` parameter, so no routing logic needs to change.
  const navGroups: Array<{
    label: string;
    items: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
  }> = [
    {
      label: "Content",
      items: [
        { id: "chapters", label: "Stories", icon: BookOpen },
        { id: "search", label: "Search & replace", icon: Search },
      ],
    },
    {
      label: "Insights",
      items: [
        { id: "dashboard", label: "Dashboard", icon: Icons.Dashboard },
        { id: "analytics", label: "Analytics", icon: BarChart3 },
      ],
    },
    {
      label: "Legacy",
      items: [
        { id: "legacy", label: "Old chapters & stats", icon: History },
        { id: "glossary", label: "Glossary", icon: Sparkles },
      ],
    },
    {
      label: "System",
      items: [
        { id: "seo", label: "SEO & feeds", icon: Globe },
        { id: "audit", label: "Edit audit", icon: History },
      ],
    },
  ];
  const tabs = navGroups.flatMap((g) => g.items);

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
    const nextTab = ['dashboard', 'chapters', 'search', 'analytics', 'legacy', 'glossary', 'seo', 'audit'].includes(tabParam || '')
      ? (tabParam as string)
      : 'dashboard';
    const nextSubTab = searchParams.get('subtab') === 'drafts' ? 'drafts' : 'published';
    const viewParam = searchParams.get('view');
    const nextView = viewParam === 'new' || viewParam === 'new-legacy' || viewParam === 'edit' || viewParam === 'draft' ? viewParam : 'list';
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
      setEditorMode(nextView as any);
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
      list = list.filter(ch => ch.title?.toLowerCase().includes(q) || (ch.is_archived && String(ch.chapter_number).includes(q)));
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
  const activeChapters = filteredChapters.filter((chapter) => !chapter.is_archived);
  const archivedChapters = filteredChapters.filter((chapter) => chapter.is_archived);

  // Filtered dashboard chapter stats
  const filteredDashboardStats = useMemo(() => {
    if (!analytics) return [];
    if (!dashboardSearch.trim()) return analytics.chapterStats;
    const q = dashboardSearch.toLowerCase();
    return analytics.chapterStats.filter(ch => ch.title?.toLowerCase().includes(q));
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
          legacy={editorMode === 'new-legacy'}
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


  // Width tokens for the sidebar in each state. The main content uses a matching
  // left margin, not left padding, so its own page padding still creates visible
  // breathing room between the fixed sidebar and the dashboard content.
  //
  // IMPORTANT: we drive desktop-vs-mobile layout with Tailwind responsive
  // classes (`hidden md:block`, `md:pl-*`) rather than the JS `isMobile`
  // flag, because `useIsMobile()` returns `false` on the very first render
  // (state initialised to `undefined`). Reading it for layout caused the
  // desktop fixed sidebar to flash — and on real mobile to stay rendered
  // until hydration — pushing the main column off-screen.
  const sidebarWidthClass = sidebarCollapsed ? "md:w-16" : "md:w-64";
  const sidebarOffsetClass = sidebarCollapsed ? "md:ml-16" : "md:ml-64";
  const showLabels = !sidebarCollapsed;

  const renderNav = (onPick: (id: string) => void, compact: boolean) => (
    <nav className="space-y-6">
      {navGroups.map((group) => (
        <div key={group.label}>
          {!compact && (
            <div className="px-3 mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-medium">
              {group.label}
            </div>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onPick(item.id)}
                  title={compact ? item.label : undefined}
                  className={`w-full flex items-center gap-3 ${compact ? "justify-center px-0" : "px-3"} py-2.5 rounded-lg text-left text-sm transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!compact && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar — visible only below md. */}
      <div className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              aria-label="Toggle navigation"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h2 className="font-display text-lg text-foreground uppercase">Case File Admin</h2>
          </div>
          <span className="text-xs text-muted-foreground capitalize">{activeTab}</span>
      </div>

      {/* Mobile off-canvas drawer */}
      {sidebarOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="md:hidden fixed top-0 left-0 h-full z-40 w-64 bg-card border-r border-border p-4 overflow-y-auto animate-in slide-in-from-left">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-lg text-foreground uppercase">Case File Admin</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded hover:bg-secondary"
                aria-label="Close navigation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderNav(handleTabClick, false)}
          </aside>
        </>
      )}

      {/* Desktop fixed sidebar */}
      <aside
        className={`hidden md:block fixed inset-y-0 left-0 z-30 ${sidebarWidthClass} bg-card border-r border-border p-3 overflow-y-auto transition-all duration-200`}
      >
          <div className={`flex items-center ${showLabels ? "justify-between" : "justify-center"} mb-6 px-2`}>
            {showLabels && (
              <div>
                <h2 className="font-display text-base text-foreground leading-none">CASE FILE</h2>
                <p className="case-label text-[9px] mt-1">Admin archive</p>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>
          {renderNav(handleTabClick, sidebarCollapsed)}
      </aside>

      <main className={`flex-1 p-4 md:p-8 overflow-y-auto transition-all duration-200 ${sidebarOffsetClass}`}>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            {activeTab === "dashboard" && analytics && (
              <div>
                <h1 className="font-display text-2xl md:text-3xl text-accent mb-6 md:mb-8">Dashboard</h1>
                <NeedsAttentionPanel
                  chapters={chapters}
                  glossaryEntries={glossaryEntries}
                  translationCounts={translationCounts}
                  totalLanguages={totalTranslationLanguages}
                  draftsCount={drafts.length}
                  onJump={(tab) => updateAdminRoute({ tab, view: null, chapter: null, draft: null, term: null, sentence: null })}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 auto-rows-fr gap-3 mb-8 md:mb-12">
                   <StatCard label="Total Story Views" value={analytics.totalViews} />
                  <StatCard label="Registered Readers" value={analytics.totalReaders} />
                  <StatCard label="Email Subscribers" value={analytics.totalSubscribers} />
                  <StatCard label="Comments" value={analytics.totalComments} />
                  <StatCard label="Stories" value={analytics.chapterStats.length} />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                   <h2 className="font-display text-xl text-accent">Story Performance</h2>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial sm:w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                         placeholder="Search stories..."
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
                     <div key={ch.id} className="flex items-center justify-between p-3 md:p-4 bg-card/50 rounded-lg border border-border/50">
                       <span className="text-foreground text-sm md:text-base truncate mr-2">{ch.title}</span>
                      <span className="text-muted-foreground text-xs md:text-sm whitespace-nowrap">{ch.views} views</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "chapters" && (
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <h1 className="font-display text-2xl md:text-3xl text-accent">Stories</h1>
                  <button
                    onClick={() => updateAdminRoute({ tab: 'chapters', view: 'new', chapter: null, draft: null, term: null, sentence: null })}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors text-sm"
                  >
                    <Icons.Plus className="w-4 h-4" />
                    New Story
                  </button>
                </div>

                {/* Search & Sort bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                       placeholder="Search stories by title..."
                      value={chapterSearch}
                      onChange={(e) => setChapterSearch(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
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
                      {tab === 'published' ? `Published (${activeChapters.length})` : `Drafts (${filteredDrafts.length})`}
                    </button>
                  ))}
                </div>

                {chapterSubTab === 'published' && (
                  <>
                    {activeChapters.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        {chapterSearch ? 'No active stories match your search.' : 'No active stories yet. Create your first one!'}
                      </p>
                    ) : (
                      <>
                        <ChapterBulkActionsBar
                          selectedCount={selectedChapters.size}
                          busy={bulkBusy}
                          onClear={clearChapterSelection}
                          onTranslate={() => startTranslationQueue(Array.from(selectedChapters))}
                          onSeedFromEnglish={bulkSeedFromEnglish}
                          onDeleteLanguage={bulkDeleteLanguage}
                        />
                        <ChapterTable
                          chapters={activeChapters}
                        translationCounts={translationCounts}
                        totalLanguages={totalTranslationLanguages}
                        chapterSort={chapterSort}
                        onSortChange={setChapterSort}
                        selectedIds={selectedChapters}
                        onToggleSelect={toggleChapterSelection}
                        onSelectAll={(ids, all) => {
                          setSelectedChapters((prev) => {
                            const next = new Set(prev);
                            if (all) ids.forEach((id) => next.add(id));
                            else ids.forEach((id) => next.delete(id));
                            return next;
                          });
                        }}
                        onEdit={(id) => updateAdminRoute({ tab: 'chapters', view: 'edit', chapter: id, draft: null, term: null, sentence: null })}
                        onDelete={handleDeleteChapter}
                        onDownload={(num, title) => downloadSingleChapter(num, title, false)}
                        onTranslate={openChapterForTranslation}
                         legacy={false}
                        />
                      </>
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
                              'CASE FILE — DRAFTS',
                              separator,
                              `Exported: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
                              `Total Drafts: ${drafts.length}`,
                              separator, '', '',
                            ];
                            for (const d of [...drafts].sort((a, b) => new Date(b.lastSaved).getTime() - new Date(a.lastSaved).getTime())) {
                              lines.push(separator);
                              lines.push(`DRAFT — ${d.title || 'Untitled'}`);
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
                            a.download = 'Case_File_Drafts.txt';
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

            {activeTab === "legacy" && (
              <div>
                <h1 className="font-display text-2xl md:text-3xl text-accent mb-2">Legacy Archive</h1>
                <p className="text-sm text-muted-foreground mb-6">Everything from the previous connected world, kept hidden from readers. Numbers here only count activity from before the reset.</p>
                {legacyStats && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 auto-rows-fr gap-3 mb-8">
                    <StatCard label="Chapter Views" value={legacyStats.views} />
                    <StatCard label="Registered Readers" value={legacyStats.readers} />
                    <StatCard label="Email Subscribers" value={legacyStats.subscribers} />
                    <StatCard label="Comments" value={legacyStats.comments} />
                    <StatCard label="Forum Posts" value={legacyStats.forumPosts} />
                    <StatCard label="Glossary Terms" value={Object.keys(glossary).length} />
                  </div>
                )}
                <div className="relative mb-4 sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search legacy chapters..." value={chapterSearch} onChange={(e) => setChapterSearch(e.target.value)} className="pl-9 h-9 text-sm" />
                </div>
                <div className="flex items-center justify-between mb-3 gap-3">
                  <h2 className="font-display text-xl text-accent">Legacy Chapters ({archivedChapters.length})</h2>
                  <button
                    onClick={() => updateAdminRoute({ tab: 'chapters', view: 'new-legacy', chapter: null, draft: null, term: null, sentence: null })}
                    className="flex items-center gap-2 px-3 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm"
                  >
                    <Icons.Plus className="w-4 h-4" /> Add legacy chapter
                  </button>
                </div>
                {archivedChapters.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No legacy chapters match.</p>
                ) : (
                  <ChapterTable
                    chapters={archivedChapters}
                    translationCounts={translationCounts}
                    totalLanguages={totalTranslationLanguages}
                    chapterSort={chapterSort}
                    onSortChange={setChapterSort}
                    selectedIds={selectedChapters}
                    onToggleSelect={toggleChapterSelection}
                    onSelectAll={(ids, all) => {
                      setSelectedChapters((prev) => {
                        const next = new Set(prev);
                        if (all) ids.forEach((id) => next.add(id));
                        else ids.forEach((id) => next.delete(id));
                        return next;
                      });
                    }}
                    onEdit={(id) => updateAdminRoute({ tab: 'chapters', view: 'edit', chapter: id, draft: null, term: null, sentence: null })}
                    onDelete={handleDeleteChapter}
                    onDownload={(num, title) => downloadSingleChapter(num, title, true)}
                    onTranslate={openChapterForTranslation}
                    legacy
                  />
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
                   Sync published stories to the searchable content feeds used by Google and other discovery services.
                </p>

                {/* === Live SEO + Cron Status Widget === */}
                <div className="p-4 md:p-5 bg-card/50 rounded-xl border border-border mb-6">
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div>
                      <h3 className="font-medium text-foreground flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Live SEO & Weekly Cron
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Auto-refreshes every Friday at 09:05 UTC, just after the 10:00 Stockholm chapter publish.
                      </p>
                    </div>
                    <button
                      onClick={() => fetchSeoStatus(true)}
                      disabled={seoRefreshing || seoStatusLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {seoRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      {seoRefreshing ? 'Refreshing…' : 'Refresh now'}
                    </button>
                  </div>

                  {seoStatusLoading && !seoStatus && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading SEO status…
                    </div>
                  )}

                  {seoStatus && (
                    <div className="space-y-4">
                      {/* Live snapshot */}
                      {seoStatus.live && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-3 bg-background/50 rounded-lg border border-border">
                            <div className="text-2xl font-display text-foreground">{seoStatus.live.totalChapters}</div>
                             <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">Stories exposed to crawlers</div>
                          </div>
                          <div className="p-3 bg-background/50 rounded-lg border border-border">
                            <div className="text-sm font-medium text-foreground truncate" title={seoStatus.live.latestChapter?.title}>
                               {seoStatus.live.latestChapter?.title || '—'}
                            </div>
                             <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">Latest story</div>
                          </div>
                          <div className="p-3 bg-background/50 rounded-lg border border-border">
                            <div className="text-sm font-medium text-foreground">{seoStatus.live.schemas?.length ?? 0}</div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">JSON-LD schemas</div>
                            <div className="text-xs text-muted-foreground truncate">{(seoStatus.live.schemas || []).join(', ')}</div>
                          </div>
                          <div className="p-3 bg-background/50 rounded-lg border border-border">
                            <div className="text-xs text-foreground">
                              {seoStatus.live.generatedAt ? new Date(seoStatus.live.generatedAt).toLocaleString() : '—'}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">Last generated</div>
                          </div>
                        </div>
                      )}

                      {/* Endpoint health */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {seoStatus.endpoints && (
                          <>
                            <a
                              href={seoStatus.endpoints.dynamicSitemap.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 px-3 py-2 bg-background/50 rounded-lg border border-border hover:border-primary/50 transition-colors"
                            >
                              <span className="flex items-center gap-2 text-foreground">
                                <ExternalLink className="w-3 h-3" /> Dynamic sitemap
                              </span>
                              <span className={`px-2 py-0.5 rounded-full ${seoStatus.endpoints.dynamicSitemap.status === 200 ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
                                {seoStatus.endpoints.dynamicSitemap.status}
                              </span>
                            </a>
                            <a
                              href={seoStatus.endpoints.dynamicSeoMeta.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 px-3 py-2 bg-background/50 rounded-lg border border-border hover:border-primary/50 transition-colors"
                            >
                              <span className="flex items-center gap-2 text-foreground">
                                <ExternalLink className="w-3 h-3" /> Dynamic SEO meta
                              </span>
                              <span className={`px-2 py-0.5 rounded-full ${seoStatus.endpoints.dynamicSeoMeta.status === 200 ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
                                {seoStatus.endpoints.dynamicSeoMeta.status}
                              </span>
                            </a>
                          </>
                        )}
                      </div>

                      {/* Cron status */}
                      <div className="p-3 bg-background/50 rounded-lg border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-foreground">Weekly cron job</span>
                          {seoStatus.cron?.active === true && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">active</span>
                          )}
                          {seoStatus.cron?.active === false && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">inactive</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <div><span className="text-foreground">Job:</span> {seoStatus.cron?.jobName || 'weekly-seo-refresh'}</div>
                          <div><span className="text-foreground">Schedule:</span> {seoStatus.cron?.schedule || '5 9 * * 5 (Fri 09:05 UTC)'}</div>
                        </div>
                        {Array.isArray(seoStatus.cron?.lastRuns) && seoStatus.cron.lastRuns.length > 0 ? (
                          <div className="mt-3 space-y-1">
                            <div className="text-xs font-medium text-foreground">Recent runs:</div>
                            {seoStatus.cron.lastRuns.slice(0, 3).map((r: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                {r.status === 'succeeded' ? (
                                  <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                                ) : (
                                  <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
                                )}
                                <span>{r.startTime ? new Date(r.startTime).toLocaleString() : '—'}</span>
                                <span>·</span>
                                <span>{r.status}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-muted-foreground">
                            No runs yet. Next run: next Friday 09:05 UTC.
                          </div>
                        )}
                      </div>

                      {seoStatus.refreshResult && (
                        <div className="text-xs text-muted-foreground">
                          Last manual refresh: sitemap {seoStatus.refreshResult.sitemap},
                          meta {seoStatus.refreshResult.seoMeta},
                          feed {seoStatus.refreshResult.contentFeed} ({seoStatus.refreshResult.durationMs}ms)
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* === End Live SEO + Cron Status Widget === */}


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
                        <div className="text-xs text-muted-foreground mt-1">Stories Indexed</div>
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
                           { label: `${seoResult.seoChecklist.structuredDataChapters} stories in structured data`, ok: seoResult.seoChecklist.structuredDataChapters > 0 },
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

            {activeTab === "audit" && (
              <EditAuditPanel authToken={authToken} />
            )}
          </>
        )}
      </main>
      {translatingChapter && (
        <ChapterTranslationsManager
          chapterId={translatingChapter.id}
          chapterNumber={translatingChapter.chapter_number}
          englishTitle={translatingChapter.title}
          englishContent={translatingChapter.content}
          authToken={authToken}
          onClose={handleTranslationModalClose}
          queueRemaining={translationQueue.length}
          legacy={translatingChapter.is_archived}
        />
      )}
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="h-full px-3 py-3 bg-card/50 rounded-lg border border-border flex flex-col items-center justify-center text-center">
    <div className="text-xl md:text-2xl font-display text-foreground leading-none">
      {value.toLocaleString()}
    </div>
    <div className="text-muted-foreground text-[11px] md:text-xs mt-1.5 leading-tight">
      {label}
    </div>
  </div>
);

export default AdminPanel;

// ===========================================================================
// ChapterTable — sortable, hover-action table for the published chapters list.
// Lifted out of AdminPanel to keep the main component readable.
// ===========================================================================

// ===========================================================================
// ChapterBulkActionsBar — appears above the chapters table when one or more
// chapters are selected. Provides:
//   - "Translate selected" → queues the chapters through the translation
//     editor; closing one auto-opens the next.
//   - "Seed from English"  → bulk-creates chapter_translations rows in the
//     chosen language using the English source as a starting draft (skips
//     chapters that already have that language).
//   - "Delete language"    → removes the selected language from every
//     selected chapter so the reader falls back to English.
// All actions confirm before running and show a toast with the result count.
// ===========================================================================
interface ChapterBulkActionsBarProps {
  selectedCount: number;
  busy: boolean;
  onClear: () => void;
  onTranslate: () => void;
  onSeedFromEnglish: (lang: SupportedLanguage) => void;
  onDeleteLanguage: (lang: SupportedLanguage) => void;
}

const ChapterBulkActionsBar: React.FC<ChapterBulkActionsBarProps> = ({
  selectedCount,
  busy,
  onClear,
  onTranslate,
  onSeedFromEnglish,
  onDeleteLanguage,
}) => {
  if (selectedCount === 0) return null;
  return (
    <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 backdrop-blur px-3 py-2 shadow-sm">
      <span className="text-sm font-medium text-foreground">
        {selectedCount} selected
      </span>
      <button
        onClick={onClear}
        disabled={busy}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        Clear
      </button>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          onClick={onTranslate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          title="Open the translation editor for each selected chapter, one after another"
        >
          <Globe className="w-3.5 h-3.5" /> Translate selected
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" /> Seed from English
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Create draft in…</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NON_DEFAULT_LANGUAGES.map((lang) => (
              <DropdownMenuItem key={lang} onClick={() => onSeedFromEnglish(lang)}>
                <FlagIcon lang={lang} size={14} />
                <span className="ml-2">{LANGUAGE_LABELS[lang]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-destructive/15 hover:bg-destructive/25 text-destructive disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete language
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Remove translation in…</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NON_DEFAULT_LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang}
                onClick={() => onDeleteLanguage(lang)}
                className="text-destructive focus:text-destructive"
              >
                <FlagIcon lang={lang} size={14} />
                <span className="ml-2">{LANGUAGE_LABELS[lang]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
};

// ===========================================================================
// ChapterTable — sortable, hover-action table for the published chapters list.
// ===========================================================================

type ChapterRow = {
  id: string;
  title: string;
  chapter_number: number;
  views: number;
  published_at: string | null;
  scheduled_at: string | null;
  is_archived?: boolean;
  tags?: string[];
};

type SortKey = 'number-asc' | 'number-desc' | 'views-desc' | 'views-asc' | 'newest' | 'oldest';

interface ChapterTableProps {
  chapters: ChapterRow[];
  translationCounts: Record<string, number>;
  totalLanguages: number;
  chapterSort: SortKey;
  onSortChange: (s: SortKey) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onDownload: (num: number, title: string) => void;
  onTranslate: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[], all: boolean) => void;
  legacy?: boolean;
}

const ChapterTable: React.FC<ChapterTableProps> = ({
  chapters,
  translationCounts,
  totalLanguages,
  chapterSort,
  onSortChange,
  onEdit,
  onDelete,
  onDownload,
  onTranslate,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  legacy = false,
}) => {
  // Each header maps a column to its (asc, desc) sort keys. Clicking a header
  // toggles between the two; the active one shows a directional caret.
  type Column = { key: 'number' | 'title' | 'tags' | 'views' | 'date'; label: string; ascKey?: SortKey; descKey?: SortKey; align?: string; hideOnMobile?: boolean };
  const columns: Column[] = [
    ...(legacy ? [{ key: 'number' as const, label: '#', ascKey: 'number-asc' as SortKey, descKey: 'number-desc' as SortKey }] : []),
    { key: 'title', label: 'Title' },
    ...(!legacy ? [{ key: 'tags' as const, label: 'Tags', hideOnMobile: true }] : []),
    { key: 'views', label: 'Views', ascKey: 'views-asc', descKey: 'views-desc', align: 'text-right', hideOnMobile: true },
    { key: 'date', label: 'Published', ascKey: 'oldest', descKey: 'newest', hideOnMobile: true },
  ];

  const cycle = (col: Column) => {
    if (!col.ascKey || !col.descKey) return;
    onSortChange(chapterSort === col.descKey ? col.ascKey : col.descKey);
  };

  const caretFor = (col: Column) => {
    if (chapterSort === col.ascKey) return <ChevronDown className="w-3 h-3 rotate-180 inline-block" />;
    if (chapterSort === col.descKey) return <ChevronDown className="w-3 h-3 inline-block" />;
    return <ArrowUpDown className="w-3 h-3 inline-block opacity-30" />;
  };

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden bg-card/30">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-card/60 border-b border-border/60">
              <th className="pl-3 md:pl-4 pr-1 py-2.5 w-8">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                   aria-label={`Select all ${legacy ? 'chapters' : 'stories'}`}
                  checked={chapters.length > 0 && chapters.every((c) => selectedIds.has(c.id))}
                  ref={(el) => {
                    if (!el) return;
                    const some = chapters.some((c) => selectedIds.has(c.id));
                    const all = chapters.every((c) => selectedIds.has(c.id));
                    el.indeterminate = some && !all;
                  }}
                  onChange={(e) =>
                    onSelectAll(chapters.map((c) => c.id), e.target.checked)
                  }
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 md:px-4 py-2.5 font-medium ${col.align ?? ''} ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}
                >
                  {col.ascKey ? (
                    <button
                      onClick={() => cycle(col)}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {col.label} {caretFor(col)}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
              <th className="px-3 md:px-4 py-2.5 font-medium hidden lg:table-cell">Translations</th>
              <th className="px-3 md:px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((ch) => {
              const count = translationCounts[ch.id] ?? 0;
              const isScheduled = ch.scheduled_at && new Date(ch.scheduled_at) > new Date();
              const isSelected = selectedIds.has(ch.id);
              return (
                <tr
                  key={ch.id}
                  className={`border-b border-border/40 last:border-b-0 group transition-colors ${
                    isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-card/60'
                  }`}
                >
                  <td className="pl-3 md:pl-4 pr-1 py-3 w-8">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                       aria-label={`Select ${legacy ? `chapter ${ch.chapter_number}` : `story ${ch.title}`}`}
                      checked={isSelected}
                      onChange={() => onToggleSelect(ch.id)}
                    />
                  </td>
                   {legacy && <td className="px-3 md:px-4 py-3 text-muted-foreground tabular-nums">{ch.chapter_number}</td>}
                  <td className="px-3 md:px-4 py-3 min-w-0">
                    <div className="text-foreground font-medium truncate">{ch.title}</div>
                    <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                      {ch.views} views · {ch.published_at ? new Date(ch.published_at).toLocaleDateString() : 'No date'}
                    </div>
                  </td>
                   {!legacy && (
                     <td className="px-3 md:px-4 py-3 hidden md:table-cell">
                       <div className="flex flex-wrap gap-1">
                         {(ch.tags || []).length > 0 ? (ch.tags || []).map((tag) => (
                           <span key={tag} className="px-1.5 py-0.5 rounded border border-border text-[10px] text-muted-foreground">{tag}</span>
                         )) : <span className="text-xs text-muted-foreground">—</span>}
                       </div>
                     </td>
                   )}
                  <td className="px-3 md:px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                    {ch.views.toLocaleString()}
                  </td>
                  <td className="px-3 md:px-4 py-3 hidden md:table-cell">
                    {isScheduled ? (
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <Calendar className="w-3 h-3" />
                        {new Date(ch.scheduled_at!).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {ch.published_at ? new Date(ch.published_at).toLocaleDateString() : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 md:px-4 py-3 hidden lg:table-cell">
                    <TranslationBadge count={count} total={totalLanguages} />
                  </td>
                  <td className="px-3 md:px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                           aria-label={`Actions for ${legacy ? `chapter ${ch.chapter_number}` : `story ${ch.title}`}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                         <DropdownMenuLabel>{legacy ? `Ch. ${ch.chapter_number}` : ch.title}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onEdit(ch.id)}>
                          <Edit3 className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onTranslate(ch.id)}>
                          <Globe className="w-4 h-4 mr-2" /> Translations
                          <span className="ml-auto text-xs text-muted-foreground">{count}/{totalLanguages}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/chapters/${ch.chapter_number}`} target="_blank" rel="noopener noreferrer">
                            <Eye className="w-4 h-4 mr-2" /> Preview
                          </a>
                        </DropdownMenuItem>
                         <DropdownMenuItem onClick={() => onDownload(ch.chapter_number, ch.title)}>
                          <Download className="w-4 h-4 mr-2" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(ch.id, ch.title)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TranslationBadge: React.FC<{ count: number; total: number }> = ({ count, total }) => {
  const ratio = total === 0 ? 0 : count / total;
  const tone =
    ratio === 0 ? "text-muted-foreground border-border" :
    ratio < 1 ? "text-accent border-accent/40" :
    "text-primary border-primary/40";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border bg-background/40 ${tone}`}>
      <Globe className="w-3 h-3" />
      {count}/{total}
    </span>
  );
};

// ===========================================================================
// NeedsAttentionPanel — surfaces actionable work on the dashboard so opening
// the admin doesn't dump you on a wall of stats. Each item has a one-click
// jump to the relevant tab.
// ===========================================================================

interface NeedsAttentionProps {
  chapters: ChapterRow[];
  glossaryEntries: Array<{ id: string; term: string; description: string | null }>;
  translationCounts: Record<string, number>;
  totalLanguages: number;
  draftsCount: number;
  onJump: (tab: string) => void;
}

const NeedsAttentionPanel: React.FC<NeedsAttentionProps> = ({
  chapters,
  glossaryEntries,
  translationCounts,
  totalLanguages,
  draftsCount,
  onJump,
}) => {
  const now = Date.now();
  // Surface stories publishing in the next six days.
  const CADENCE_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;
   const activeStories = chapters.filter((chapter) => !chapter.is_archived);
   const upcoming = activeStories.filter(
    (c) =>
      c.scheduled_at &&
      new Date(c.scheduled_at).getTime() > now &&
      new Date(c.scheduled_at).getTime() - now < CADENCE_WINDOW_MS,
  );

  // Chapters with at least one missing translation. We only surface the count;
  // clicking jumps to the chapter tab where they can hover the row to translate.
   const missingTranslations = activeStories.filter(
    (c) => (translationCounts[c.id] ?? 0) < totalLanguages,
  );

  // Glossary terms without a description (or only whitespace) — common after
  // bulk-imports.
  const emptyGlossary = glossaryEntries.filter(
    (g) => !g.description || g.description.trim().length === 0,
  );

  const items = [
    upcoming.length > 0 && {
      key: "upcoming",
      icon: Calendar,
      tone: "accent" as const,
       title: `${upcoming.length} stor${upcoming.length === 1 ? "y" : "ies"} on the 3-day cadence`,
      detail: upcoming
        .slice(0, 3)
         .map((c) => c.title)
        .join(", ") + (upcoming.length > 3 ? "…" : ""),
      action: { label: "Review", tab: "chapters" },
    },
    missingTranslations.length > 0 && {
      key: "translations",
      icon: Globe,
      tone: "muted" as const,
       title: `${missingTranslations.length} stor${missingTranslations.length === 1 ? "y" : "ies"} missing translations`,
      detail: `Across ${totalLanguages} non-English languages.`,
      action: { label: "Translate", tab: "chapters" },
    },
    emptyGlossary.length > 0 && {
      key: "glossary",
      icon: FileText,
      tone: "destructive" as const,
      title: `${emptyGlossary.length} glossary term${emptyGlossary.length === 1 ? "" : "s"} without descriptions`,
      detail: emptyGlossary
        .slice(0, 4)
        .map((g) => g.term)
        .join(", ") + (emptyGlossary.length > 4 ? "…" : ""),
      action: { label: "Fix", tab: "glossary" },
    },
    draftsCount > 0 && {
      key: "drafts",
      icon: Edit3,
      tone: "muted" as const,
      title: `${draftsCount} unpublished draft${draftsCount === 1 ? "" : "s"}`,
      detail: "Auto-saved while editing. Resume any time.",
      action: { label: "Open", tab: "chapters" },
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: "accent" | "muted" | "destructive";
    title: string;
    detail: string;
    action: { label: string; tab: string };
  }>;

  if (items.length === 0) {
    return (
      <div className="mb-6 md:mb-8 p-4 md:p-5 rounded-xl border border-primary/20 bg-primary/5 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
        <div>
          <div className="text-sm font-medium text-foreground">All clear</div>
           <div className="text-xs text-muted-foreground">No scheduled stories this week, no missing translations or empty glossary entries.</div>
        </div>
      </div>
    );
  }

  const toneClasses: Record<NonNullable<typeof items[number]>["tone"], string> = {
    accent: "border-accent/30 bg-accent/5 text-accent",
    muted: "border-border bg-card/40 text-muted-foreground",
    destructive: "border-destructive/30 bg-destructive/5 text-destructive",
  };

  return (
    <div className="mb-6 md:mb-8">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-accent" />
        <h2 className="font-display text-base text-accent">Needs attention</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.key} className={`flex items-start gap-3 p-3 md:p-4 rounded-xl border ${toneClasses[item.tone]}`}>
            <item.icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{item.title}</div>
              <div className="text-xs text-muted-foreground truncate">{item.detail}</div>
            </div>
            <button
              onClick={() => item.action && onJump(item.action.tab)}
              className="text-xs px-2.5 py-1 rounded bg-background/60 hover:bg-background border border-border text-foreground shrink-0"
            >
              {item.action.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
