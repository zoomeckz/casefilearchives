import React, { useState, useEffect, useMemo } from "react";
import { dbFetch } from "@/lib/dbFetch";
import { Icons } from "@/lib/icons";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface AnalyticsDashboardProps {
  authToken?: string;
}

interface PageView {
  id: string;
  page: string;
  created_at: string;
  duration_seconds: number | null;
  country: string | null;
  user_id: string | null;
  chapter_id: string | null;
}

interface ChapterStat {
  id: string;
  title: string;
  views: number;
  chapter_number: number;
  published_at: string;
  is_archived: boolean;
}

type TimeRange = "7d" | "30d" | "90d" | "all";

const COLORS = [
  "hsl(36, 90%, 55%)", // amber
  "hsl(199, 89%, 48%)", // sky
  "hsl(0, 60%, 50%)",  // maroon
  "hsl(142, 71%, 45%)", // green
  "hsl(280, 60%, 55%)", // purple
  "hsl(25, 95%, 53%)",  // orange
  "hsl(190, 80%, 45%)", // teal
  "hsl(340, 75%, 55%)", // rose
];

const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getTimeRangeStart = (range: TimeRange): Date | null => {
  if (range === "all") return null;
  const now = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
};

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ authToken }) => {
  const [pageViews, setPageViews] = useState<PageView[]>([]);
  const [chapters, setChapters] = useState<ChapterStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [activeChart, setActiveChart] = useState<"overview" | "chapters" | "pages" | "engagement" | "geography">("overview");

  useEffect(() => {
    const fetchData = async () => {
      const [pvRes, chRes] = await Promise.all([
        dbFetch<PageView[]>("page_views", {
          select: "id,page,created_at,duration_seconds,country,user_id,chapter_id",
          order: "created_at.desc",
          token: authToken,
        }),
        dbFetch<ChapterStat[]>("chapters", {
          select: "id,title,views,chapter_number,published_at,is_archived",
          filters: "is_archived=eq.false",
          order: "published_at.desc",
          token: authToken,
        }),
      ]);
      setPageViews(pvRes.data || []);
      setChapters(chRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, [authToken]);

  const filteredViews = useMemo(() => {
    const start = getTimeRangeStart(timeRange);
    if (!start) return pageViews;
    return pageViews.filter((pv) => new Date(pv.created_at) >= start);
  }, [pageViews, timeRange]);

  // ── Computed metrics ──

  const totalViews = filteredViews.length;
  const uniqueVisitors = new Set(filteredViews.filter((pv) => pv.user_id).map((pv) => pv.user_id)).size;
  const anonVisits = filteredViews.filter((pv) => !pv.user_id).length;
  const avgDuration = filteredViews.length > 0
    ? Math.round(filteredViews.reduce((s, pv) => s + (pv.duration_seconds || 0), 0) / filteredViews.length)
    : 0;
  const totalStoryViews = chapters.reduce((s, c) => s + c.views, 0);

  // ── Views over time (line chart) ──
  const viewsOverTime = useMemo(() => {
    const dayMap = new Map<string, number>();
    filteredViews.forEach((pv) => {
      const day = new Date(pv.created_at).toISOString().slice(0, 10);
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    });
    const sorted = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([date, views]) => ({ date: formatDate(date), views, rawDate: date }));
  }, [filteredViews]);

  // ── Views by page (bar chart) ──
  const viewsByPage = useMemo(() => {
    const map = new Map<string, { count: number; totalDuration: number }>();
    filteredViews.forEach((pv) => {
      const existing = map.get(pv.page) || { count: 0, totalDuration: 0 };
      existing.count++;
      existing.totalDuration += pv.duration_seconds || 0;
      map.set(pv.page, existing);
    });
    return Array.from(map.entries())
      .map(([page, data]) => ({
        page,
        visits: data.count,
        avgDuration: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0,
      }))
      .sort((a, b) => b.visits - a.visits);
  }, [filteredViews]);

  // ── Story performance (bar chart) ──
  const storyPerformance = useMemo(() => {
    return chapters.map((ch) => ({
      name: ch.title,
      title: ch.title,
      views: ch.views,
    }));
  }, [chapters]);

  // ── Hourly heatmap data ──
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${i.toString().padStart(2, "0")}:00`, views: 0 }));
    filteredViews.forEach((pv) => {
      const h = new Date(pv.created_at).getHours();
      hours[h].views++;
    });
    return hours;
  }, [filteredViews]);

  // ── Day of week data ──
  const dayOfWeekData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const counts = days.map((d) => ({ day: d, views: 0 }));
    filteredViews.forEach((pv) => {
      const d = new Date(pv.created_at).getDay();
      counts[d].views++;
    });
    return counts;
  }, [filteredViews]);

  // ── Geographic data (pie chart) ──
  const geoData = useMemo(() => {
    const map = new Map<string, number>();
    filteredViews.forEach((pv) => {
      const country = pv.country || "Unknown";
      map.set(country, (map.get(country) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([country, count]) => ({ country, count, percentage: totalViews > 0 ? Math.round((count / totalViews) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [filteredViews, totalViews]);

  // ── New vs returning ──
  const newVsReturning = useMemo(() => {
    const userVisitCount = new Map<string, number>();
    filteredViews.forEach((pv) => {
      const key = pv.user_id || pv.id;
      userVisitCount.set(key, (userVisitCount.get(key) || 0) + 1);
    });
    const returning = Array.from(userVisitCount.values()).filter((c) => c > 1).length;
    const newUsers = userVisitCount.size - returning;
    return [
      { name: "New", value: newUsers },
      { name: "Returning", value: returning },
    ];
  }, [filteredViews]);

  // ── Duration distribution ──
  const durationDistribution = useMemo(() => {
    const buckets = [
      { label: "0-10s", min: 0, max: 10, count: 0 },
      { label: "10-30s", min: 10, max: 30, count: 0 },
      { label: "30-60s", min: 30, max: 60, count: 0 },
      { label: "1-3m", min: 60, max: 180, count: 0 },
      { label: "3-5m", min: 180, max: 300, count: 0 },
      { label: "5-10m", min: 300, max: 600, count: 0 },
      { label: "10m+", min: 600, max: Infinity, count: 0 },
    ];
    filteredViews.forEach((pv) => {
      const dur = pv.duration_seconds || 0;
      const bucket = buckets.find((b) => dur >= b.min && dur < b.max);
      if (bucket) bucket.count++;
    });
    return buckets.map((b) => ({ duration: b.label, count: b.count }));
  }, [filteredViews]);

  const chartTabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "chapters" as const, label: "Stories" },
    { id: "pages" as const, label: "Pages" },
    { id: "engagement" as const, label: "Engagement" },
    { id: "geography" as const, label: "Geography" },
  ];

  const tooltipStyle = {
    contentStyle: { background: "hsl(20, 14%, 10%)", border: "1px solid hsl(20, 6%, 25%)", borderRadius: "8px", color: "#e7e5e4" },
    labelStyle: { color: "#a8a29e" },
  };

  if (loading) return <p className="text-muted-foreground">Loading analytics...</p>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <h1 className="font-display text-3xl text-accent">Analytics</h1>
        <div className="flex gap-1 bg-card/30 p-1 rounded-lg">
          {(["7d", "30d", "90d", "all"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                timeRange === range ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {range === "all" ? "All Time" : range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : "90 Days"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <KPICard label="Page Views" value={totalViews} />
        <KPICard label="Unique Visitors" value={uniqueVisitors} />
        <KPICard label="Anonymous Visits" value={anonVisits} />
        <KPICard label="Avg. Duration" value={`${avgDuration}s`} />
        <KPICard label="Story Views" value={totalStoryViews} />
      </div>

      {/* Chart Tabs */}
      <div className="flex gap-1 mb-6 bg-card/30 p-1 rounded-lg w-fit flex-wrap">
        {chartTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveChart(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeChart === tab.id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeChart === "overview" && (
        <div className="space-y-8">
          <ChartCard title="Views Over Time">
            {viewsOverTime.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={viewsOverTime}>
                  <defs>
                    <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(36, 90%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(36, 90%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(20, 6%, 20%)" />
                  <XAxis dataKey="date" stroke="#a8a29e" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#a8a29e" tick={{ fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="views" stroke="hsl(36, 90%, 55%)" fill="url(#viewsGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartCard title="New vs Returning Visitors">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={newVsReturning} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {newVsReturning.map((_, i) => (
                      <Cell key={i} fill={COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Activity by Day of Week">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dayOfWeekData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(20, 6%, 20%)" />
                  <XAxis dataKey="day" stroke="#a8a29e" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#a8a29e" tick={{ fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="views" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}

      {/* ── Stories Tab ── */}
      {activeChart === "chapters" && (
        <div className="space-y-8">
          <ChartCard title="Story Views Comparison">
            {storyPerformance.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={storyPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(20, 6%, 20%)" />
                  <XAxis type="number" stroke="#a8a29e" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" stroke="#a8a29e" tick={{ fontSize: 12 }} width={60} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value.toLocaleString()} views`,
                      props.payload.title,
                    ]}
                  />
                  <Bar dataKey="views" radius={[0, 4, 4, 0]}>
                    {storyPerformance.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Story Details">
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {chapters.map((ch, i) => {
                const maxViews = Math.max(...chapters.map((c) => c.views), 1);
                const pct = (ch.views / maxViews) * 100;
                return (
                  <div key={ch.id} className="p-4 rounded-lg bg-card/30 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-foreground font-medium text-sm">
                        {ch.title}
                      </span>
                      <span className="text-primary font-display text-lg">{ch.views.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-secondary/30 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Published {new Date(ch.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>
      )}

      {/* ── Pages Tab ── */}
      {activeChart === "pages" && (
        <div className="space-y-8">
          <ChartCard title="Top Pages by Visits">
            {viewsByPage.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={viewsByPage.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(20, 6%, 20%)" />
                  <XAxis dataKey="page" stroke="#a8a29e" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis stroke="#a8a29e" tick={{ fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="visits" fill="hsl(36, 90%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Page Details">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Page</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Visits</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Avg Duration</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewsByPage.map((pv) => (
                    <tr key={pv.page} className="border-b border-border/20 hover:bg-card/30 transition-colors">
                      <td className="py-3 px-4 text-foreground">{pv.page}</td>
                      <td className="py-3 px-4 text-right text-foreground">{pv.visits.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{pv.avgDuration}s</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {totalViews > 0 ? ((pv.visits / totalViews) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      )}

      {/* ── Engagement Tab ── */}
      {activeChart === "engagement" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartCard title="Session Duration Distribution">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={durationDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(20, 6%, 20%)" />
                  <XAxis dataKey="duration" stroke="#a8a29e" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#a8a29e" tick={{ fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Activity by Hour of Day">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={hourlyData}>
                  <defs>
                    <linearGradient id="hourlyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(280, 60%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(280, 60%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(20, 6%, 20%)" />
                  <XAxis dataKey="hour" stroke="#a8a29e" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis stroke="#a8a29e" tick={{ fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="views" stroke="hsl(280, 60%, 55%)" fill="url(#hourlyGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Engagement Summary">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MiniStat label="Avg. Session" value={`${avgDuration}s`} />
              <MiniStat label="Bounce Rate" value={`${totalViews > 0 ? Math.round((filteredViews.filter((pv) => (pv.duration_seconds || 0) < 5).length / totalViews) * 100) : 0}%`} subtitle="< 5s sessions" />
              <MiniStat label="Deep Reads" value={filteredViews.filter((pv) => (pv.duration_seconds || 0) > 120).length} subtitle="> 2 min sessions" />
              <MiniStat label="Peak Hour" value={hourlyData.reduce((max, h) => (h.views > max.views ? h : max), hourlyData[0])?.hour || "N/A"} />
            </div>
          </ChartCard>
        </div>
      )}

      {/* ── Geography Tab ── */}
      {activeChart === "geography" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartCard title="Visitors by Country">
              {geoData.length === 0 || (geoData.length === 1 && geoData[0].country === "Unknown") ? (
                <div className="flex items-center justify-center h-60 text-muted-foreground">
                  <p>No geographic data available yet.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={geoData.slice(0, 8)} cx="50%" cy="50%" outerRadius={100} dataKey="count" label={({ country, percentage }) => `${country} ${percentage}%`}>
                      {geoData.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Country Breakdown">
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {geoData.map((g, i) => (
                  <div key={g.country} className="flex items-center justify-between p-3 rounded-lg bg-card/30 border border-border/20">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-foreground text-sm">{g.country}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground text-sm">{g.count.toLocaleString()} visits</span>
                      <span className="text-primary text-sm font-medium">{g.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-components ──

const KPICard = ({ label, value }: { label: string; value: number | string }) => (
  <div className="p-5 bg-card/50 rounded-xl border border-border">
    <div className="text-2xl font-display text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</div>
    <div className="text-muted-foreground text-sm mt-1">{label}</div>
  </div>
);

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-card/30 rounded-xl border border-border/50 p-6">
    <h3 className="font-display text-lg text-accent mb-4">{title}</h3>
    {children}
  </div>
);

const MiniStat = ({ label, value, subtitle }: { label: string; value: number | string; subtitle?: string }) => (
  <div className="p-4 bg-secondary/20 rounded-lg text-center">
    <div className="text-xl font-display text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</div>
    <div className="text-muted-foreground text-xs mt-1">{label}</div>
    {subtitle && <div className="text-muted-foreground/60 text-xs mt-0.5">{subtitle}</div>}
  </div>
);

const EmptyState = () => (
  <div className="flex items-center justify-center h-60 text-muted-foreground">
    <p>No data available for this time range.</p>
  </div>
);

export default AnalyticsDashboard;
