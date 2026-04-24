import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://www.thefivethrones.com";

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
      .select("chapter_number, updated_at, published_at, scheduled_at")
      .lte("published_at", nowIso)
      .order("chapter_number", { ascending: true });

    const publishedChapters = (chapters ?? []).filter(
      (c) => !c.scheduled_at || new Date(c.scheduled_at) <= new Date()
    );

    // Static routes — each path is emitted twice (English + Bulgarian) with
    // hreflang alternates so Google indexes both language variants.
    type StaticRoute = { path: string; priority: string; changefreq: string };
    const staticRoutes: StaticRoute[] = [
      { path: "/", priority: "1.0", changefreq: "weekly" },
      { path: "/chapters", priority: "0.9", changefreq: "weekly" },
      { path: "/about", priority: "0.7", changefreq: "monthly" },
      { path: "/characters", priority: "0.8", changefreq: "weekly" },
      { path: "/world-map", priority: "0.7", changefreq: "monthly" },
      { path: "/manga", priority: "0.7", changefreq: "weekly" },
      { path: "/forum", priority: "0.7", changefreq: "daily" },
      { path: "/theories", priority: "0.7", changefreq: "weekly" },
      { path: "/gallery", priority: "0.6", changefreq: "weekly" },
      { path: "/leaderboard", priority: "0.5", changefreq: "daily" },
      { path: "/rewards", priority: "0.5", changefreq: "monthly" },
    ];

    const buildAlternates = (path: string) => {
      const en = `${SITE_URL}${path}`;
      const bgPath = path === "/" ? "/bg" : `/bg${path}`;
      const bg = `${SITE_URL}${bgPath}`;
      return (
        `    <xhtml:link rel="alternate" hreflang="en" href="${en}" />\n` +
        `    <xhtml:link rel="alternate" hreflang="bg" href="${bg}" />\n` +
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />`
      );
    };

    const renderStatic = (r: StaticRoute, lang: "en" | "bg") => {
      const path = r.path;
      const url =
        lang === "en"
          ? `${SITE_URL}${path}`
          : path === "/"
          ? `${SITE_URL}/bg`
          : `${SITE_URL}/bg${path}`;
      return (
        `  <url>\n` +
        `    <loc>${url}</loc>\n` +
        `    <changefreq>${r.changefreq}</changefreq>\n` +
        `    <priority>${r.priority}</priority>\n` +
        buildAlternates(path) +
        `\n  </url>`
      );
    };

    const renderChapter = (
      c: { chapter_number: number; updated_at: string | null; published_at: string | null },
      lang: "en" | "bg",
    ) => {
      const path = `/chapters/${c.chapter_number}`;
      const url = lang === "en" ? `${SITE_URL}${path}` : `${SITE_URL}/bg${path}`;
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
      blocks.push(renderStatic(r, "en"));
      blocks.push(renderStatic(r, "bg"));
    }
    for (const c of publishedChapters) {
      blocks.push(renderChapter(c, "en"));
      blocks.push(renderChapter(c, "bg"));
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
