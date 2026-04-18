import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://sedorium.lovable.app";

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

    const staticUrls: Array<{ loc: string; priority: string; changefreq: string }> = [
      { loc: `${SITE_URL}/`, priority: "1.0", changefreq: "weekly" },
      { loc: `${SITE_URL}/chapters`, priority: "0.9", changefreq: "weekly" },
      { loc: `${SITE_URL}/about`, priority: "0.7", changefreq: "monthly" },
      { loc: `${SITE_URL}/characters`, priority: "0.8", changefreq: "weekly" },
      { loc: `${SITE_URL}/world-map`, priority: "0.7", changefreq: "monthly" },
      { loc: `${SITE_URL}/manga`, priority: "0.7", changefreq: "weekly" },
      { loc: `${SITE_URL}/forum`, priority: "0.7", changefreq: "daily" },
      { loc: `${SITE_URL}/theories`, priority: "0.7", changefreq: "weekly" },
      { loc: `${SITE_URL}/gallery`, priority: "0.6", changefreq: "weekly" },
      { loc: `${SITE_URL}/leaderboard`, priority: "0.5", changefreq: "daily" },
      { loc: `${SITE_URL}/rewards`, priority: "0.5", changefreq: "monthly" },
      {
        loc: `${supabaseUrl}/functions/v1/content-feed`,
        priority: "0.95",
        changefreq: "weekly",
      },
    ];

    const chapterUrls = publishedChapters.map((c) => ({
      loc: `${SITE_URL}/chapters/${c.chapter_number}`,
      priority: "0.8",
      changefreq: "monthly",
      lastmod: (c.updated_at || c.published_at || "").slice(0, 10),
    }));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join("\n")}
${chapterUrls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join("\n")}
</urlset>`;

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
