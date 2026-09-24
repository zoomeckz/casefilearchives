import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://www.thefivethrones.com";
const AUTHOR = "AnyoneButSam";
const TITLE_BASE = "Sedorium";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();
    const { data: chaptersRaw } = await supabase
      .from("chapters")
      .select("chapter_number, title, published_at, scheduled_at, updated_at, is_archived")
      .eq("is_archived", false)
      .lte("published_at", nowIso)
      .order("chapter_number", { ascending: true });

    const chapters = (chaptersRaw ?? []).filter(
      (c) => !c.scheduled_at || new Date(c.scheduled_at) <= new Date()
    );

    const total = chapters.length;
    const latest = chapters[chapters.length - 1];

    const description = "Random situations put into story form. Read standalone fiction by AnyoneButSam.";
    const title = "Sedorium — Standalone Stories by AnyoneButSam";

    const keywords = [
      "standalone stories",
      "short fiction",
      "AnyoneButSam",
      "Sedorium",
      "indie author",
    ];

    // JSON-LD: Book + WebSite + BreadcrumbList
    const bookSchema = {
      "@context": "https://schema.org",
      "@type": "CreativeWorkSeries",
      name: TITLE_BASE,
      author: { "@type": "Person", name: AUTHOR },
      url: SITE_URL,
      description,
      inLanguage: "en",
      isAccessibleForFree: true,
      datePublished: chapters[0]?.published_at,
      dateModified: latest?.updated_at || latest?.published_at,
      hasPart: chapters.map((ch) => ({
        "@type": "ShortStory",
        name: ch.title,
        url: `${SITE_URL}/chapters/${ch.chapter_number}`,
        datePublished: ch.published_at,
      })),
    };

    const webSiteSchema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: TITLE_BASE,
      url: SITE_URL,
      description,
      author: { "@type": "Person", name: AUTHOR },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    };

    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Stories", item: `${SITE_URL}/chapters` },
      ],
    };

    return new Response(
      JSON.stringify({
        title,
        description,
        keywords,
        totalChapters: total,
        latestChapter: latest
          ? { number: latest.chapter_number, title: latest.title, publishedAt: latest.published_at }
          : null,
        chapters: chapters.map((ch) => ({
          number: ch.chapter_number,
          title: ch.title,
          url: `${SITE_URL}/chapters/${ch.chapter_number}`,
          publishedAt: ch.published_at,
        })),
        schemas: {
          book: bookSchema,
          website: webSiteSchema,
          breadcrumb: breadcrumbSchema,
        },
        generatedAt: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=1800",
        },
      }
    );
  } catch (err) {
    console.error("dynamic-seo-meta error:", err);
    return new Response(JSON.stringify({ error: "SEO meta generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
