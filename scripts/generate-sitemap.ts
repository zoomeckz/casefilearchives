// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.

import { writeFileSync } from "fs";
import { resolve } from "path";
const slugify = (t: string) => (t || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const BASE_URL = "https://thecasefiles.org";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// Mirrors APP_ROUTES in src/App.tsx, minus auth-gated and internal routes
// (/profile, /admin, /user/:id) and dev-only surfaces.
const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/chapters", changefreq: "daily", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/series", changefreq: "weekly", priority: "0.6" },
  { path: "/forum", changefreq: "daily", priority: "0.5" },
  { path: "/dispatches", changefreq: "weekly", priority: "0.7" },
];

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

const SUPABASE_URL = "https://iiezbdlmikvgxjlozwlc.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZXpiZGxtaWt2Z3hqbG96d2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNTg5NjcsImV4cCI6MjA4NTczNDk2N30.y344r25H1VH0f2RBvfEt_RHWBWb0yjGAvKqLE5qLFGU";

/** Dispatch chapters by chapter number → their address. Empty before the dispatches migration. */
async function dispatchPaths(): Promise<Map<number, string>> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/chapters?select=chapter_number,dispatch_part,dispatch:dispatches(slug)&story_format=eq.dispatch`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
    );
    if (!res.ok) return new Map();
    const rows = (await res.json()) as { chapter_number: number; dispatch_part: number | null; dispatch: { slug: string } | null }[];
    return new Map(rows.filter((r) => r.dispatch?.slug && r.dispatch_part).map((r) => [r.chapter_number, `/dispatches/${r.dispatch!.slug}/${r.dispatch_part}`]));
  } catch {
    return new Map();
  }
}

async function storyEntries(): Promise<SitemapEntry[]> {
  const dispatches = await dispatchPaths();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/chapters?select=chapter_number,title,published_at,scheduled_at,updated_at&is_archived=eq.false&order=published_at.desc`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
    );
    if (!res.ok) return [];
    const now = Date.now();
    const rows = (await res.json()) as { chapter_number: number; title: string; published_at: string | null; scheduled_at: string | null; updated_at: string | null }[];
    const live = rows.filter((r) => r.published_at && new Date(r.published_at).getTime() <= now && (!r.scheduled_at || new Date(r.scheduled_at).getTime() <= now));
    // Each dispatch with a live chapter also has its own page.
    const serials = [...new Set(live.map((r) => dispatches.get(r.chapter_number)?.split("/").slice(0, 3).join("/")).filter(Boolean))] as string[];
    return [
      ...serials.map((path) => ({ path, changefreq: "weekly" as const, priority: "0.7" })),
      ...live.map((r) => ({
        path: dispatches.get(r.chapter_number) ?? `/stories/${slugify(r.title)}`,
        lastmod: (r.updated_at || r.published_at || "").slice(0, 10) || undefined,
        changefreq: "monthly" as const,
        priority: "0.8",
      })),
    ];
  } catch {
    return [];
  }
}

const base = [...staticEntries, ...(await storyEntries())];
const LANGS = ["bg", "ja"];
const entries = [...base, ...LANGS.flatMap((l) => base.map((e) => ({ ...e, path: `/${l}${e.path === "/" ? "" : e.path}` })))];
writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
