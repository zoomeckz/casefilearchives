import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://www.thefivethrones.com";

/**
 * Single source of truth for languages this sitemap covers.
 * The FIRST entry is the default language (no URL prefix). Every other entry
 * is served at `/<code>/...`. To add a new language, append its code here —
 * no other changes needed in this file.
 *
 * Keep this in sync with `SUPPORTED_LANGUAGES` in `src/i18n/index.ts`.
 * Listing every supported locale here lets Google index the localised
 * variants (each URL gets a `<xhtml:link rel="alternate" hreflang="...">`
 * pointing at every other language plus an `x-default`), which is the
 * canonical way to tell search engines about translated content.
 */
const SUPPORTED_LANGUAGES = ["en"] as const;
type Lang = (typeof SUPPORTED_LANGUAGES)[number];
const DEFAULT_LANG: Lang = SUPPORTED_LANGUAGES[0];
const langPath = (path: string, lang: Lang) =>
  lang === DEFAULT_LANG
    ? path
    : path === "/"
    ? `/${lang}`
    : `/${lang}${path}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Only published chapters (published_at <= now AND scheduled_at IS NULL or in past)
    const nowIso = new Date().toISOString();
    const { data: chapters } = await supabase
      .from("chapters")
      .select("chapter_number, updated_at, published_at, scheduled_at, is_archived")
      .eq("is_archived", false)
      .lte("published_at", nowIso)
      .order("chapter_number", { ascending: true });

    const publishedChapters = (chapters ?? []).filter(
      (c) => !c.scheduled_at || new Date(c.scheduled_at) <= new Date()
    );

    // Static routes — each path is emitted once per supported language with
    // hreflang alternates so Google indexes every language variant.
    type StaticRoute = { path: string; priority: string; changefreq: string };
    const staticRoutes: StaticRoute[] = [
      { path: "/", priority: "1.0", changefreq: "weekly" },
      { path: "/chapters", priority: "0.9", changefreq: "weekly" },
      { path: "/about", priority: "0.7", changefreq: "monthly" },
    ];

    const buildAlternates = (path: string) => {
      const lines = SUPPORTED_LANGUAGES.map(
        (l) =>
          `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL}${langPath(path, l)}" />`,
      );
      // x-default points at the default-language version.
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${path}" />`,
      );
      return lines.join("\n");
    };

    const renderStatic = (r: StaticRoute, lang: Lang) => {
      const url = `${SITE_URL}${langPath(r.path, lang)}`;
      return (
        `  <url>\n` +
        `    <loc>${url}</loc>\n` +
        `    <changefreq>${r.changefreq}</changefreq>\n` +
        `    <priority>${r.priority}</priority>\n` +
        buildAlternates(r.path) +
        `\n  </url>`
      );
    };

    const renderChapter = (
      c: { chapter_number: number; updated_at: string | null; published_at: string | null },
      lang: Lang,
    ) => {
      const path = `/chapters/${c.chapter_number}`;
      const url = `${SITE_URL}${langPath(path, lang)}`;
      const lastmod = (c.updated_at || c.published_at || "").slice(0, 10);
      return (
        `  <url>\n` +
        `    <loc>${url}</loc>\n` +
        (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
        `    <changefreq>monthly</changefreq>\n` +
        `    <priority>0.8</priority>\n` +
        buildAlternates(path) +
        `\n  </url>`
      );
    };

    const blocks: string[] = [];
    for (const r of staticRoutes) {
      for (const l of SUPPORTED_LANGUAGES) blocks.push(renderStatic(r, l));
    }
    for (const c of publishedChapters) {
      for (const l of SUPPORTED_LANGUAGES) blocks.push(renderChapter(c, l));
    }

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
      blocks.join("\n") +
      `\n</urlset>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("dynamic-sitemap error:", err);
    return new Response("<?xml version=\"1.0\"?><error/>", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  }
});
