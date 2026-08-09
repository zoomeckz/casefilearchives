// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
// Chapter entries come from the live database via the dynamic-seo-meta edge
// function, so the sitemap never drifts from what's actually published.

import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://www.thefivethrones.com";
const SEO_META_URL =
  "https://iiezbdlmikvgxjlozwlc.supabase.co/functions/v1/dynamic-seo-meta";

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
  { path: "/characters", changefreq: "weekly", priority: "0.8" },
  { path: "/world", changefreq: "monthly", priority: "0.7" },
  { path: "/manga", changefreq: "weekly", priority: "0.7" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/forum", changefreq: "daily", priority: "0.6" },
  { path: "/leaderboard", changefreq: "weekly", priority: "0.4" },
  { path: "/rewards", changefreq: "monthly", priority: "0.4" },
];

async function fetchChapterEntries(): Promise<SitemapEntry[]> {
  try {
    const res = await fetch(SEO_META_URL);
    if (!res.ok) throw new Error(`dynamic-seo-meta returned ${res.status}`);
    const meta = (await res.json()) as {
      chapters?: Array<{ number: number; publishedAt?: string }>;
    };
    return (meta.chapters ?? []).map((c) => ({
      path: `/chapters/${c.number}`,
      lastmod: c.publishedAt ? c.publishedAt.slice(0, 10) : undefined,
      changefreq: "monthly" as const,
      priority: "0.8",
    }));
  } catch (err) {
    console.warn("sitemap: could not load chapters —", err);
    return [];
  }
}

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

const entries = [...staticEntries, ...(await fetchChapterEntries())];
writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
