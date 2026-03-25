import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all chapters
    const { data: chapters, error } = await supabase
      .from("chapters")
      .select("title, content, chapter_number, published_at")
      .order("chapter_number", { ascending: true });

    if (error) throw error;

    // Fetch glossary
    const { data: glossary } = await supabase
      .from("glossary")
      .select("term, type, description")
      .order("term", { ascending: true });

    // Check for format query param
    const url = new URL(req.url);
    const format = url.searchParams.get("format");

    if (format === "json") {
      return new Response(
        JSON.stringify({
          title: "Sedorium",
          author: "Sam Nowroozi Larki",
          description:
            "A dark fantasy web novel — druids, ancient kingdoms, oathbreakers, and creatures that defy imagination.",
          url: "https://sedorium.lovable.app",
          totalChapters: chapters?.length ?? 0,
          chapters: (chapters ?? []).map((ch) => ({
            number: ch.chapter_number,
            title: ch.title,
            publishedAt: ch.published_at,
            content: stripHtml(ch.content),
          })),
          glossary: (glossary ?? []).map((g) => ({
            term: g.term,
            type: g.type,
            description: g.description,
          })),
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }
      );
    }

    // Default: return clean HTML
    const chaptersHtml = (chapters ?? [])
      .map(
        (ch) => `
      <article id="chapter-${ch.chapter_number}">
        <h2>Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</h2>
        <time datetime="${ch.published_at}">${new Date(ch.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</time>
        <div>${ch.content}</div>
      </article>
      <hr />`
      )
      .join("\n");

    const glossaryHtml = (glossary ?? [])
      .map(
        (g) =>
          `<dt><strong>${escapeHtml(g.term)}</strong> <em>(${escapeHtml(g.type)})</em></dt><dd>${escapeHtml(g.description)}</dd>`
      )
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sedorium — Full Content | Dark Fantasy Web Novel by Sam Nowroozi Larki</title>
  <meta name="description" content="Complete text of Sedorium, a free dark fantasy web novel with ${chapters?.length ?? 0} chapters by Sam Nowroozi Larki. All chapters, characters, and lore." />
  <meta name="author" content="Sam Nowroozi Larki" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://sedorium.lovable.app" />
  <style>
    body { max-width: 800px; margin: 0 auto; padding: 40px 20px; font-family: Georgia, serif; line-height: 1.8; color: #333; background: #fafafa; }
    h1 { text-align: center; font-size: 2.5em; letter-spacing: 0.1em; }
    h2 { margin-top: 3em; color: #1a1a2e; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
    article { margin-bottom: 4em; }
    time { display: block; color: #888; font-size: 0.9em; margin-bottom: 1em; }
    hr { border: none; border-top: 1px solid #ddd; margin: 3em 0; }
    dt { margin-top: 1em; }
    dd { margin-left: 1em; color: #555; }
    a { color: #2563eb; }
    .nav { text-align: center; margin: 2em 0; }
    .nav a { margin: 0 1em; }
  </style>
</head>
<body>
  <header>
    <h1>SEDORIUM</h1>
    <p style="text-align:center;">A Dark Fantasy Web Novel by <strong>Sam Nowroozi Larki</strong></p>
    <p style="text-align:center;">${chapters?.length ?? 0} Chapters — Free to Read at <a href="https://sedorium.lovable.app">sedorium.lovable.app</a></p>
    <p style="text-align:center;color:#888;font-size:0.85em;">This page is a machine-readable version of the full story content. <a href="https://sedorium.lovable.app">Visit the interactive site →</a></p>
    <nav class="nav">
      <a href="#chapters">Chapters</a>
      <a href="#glossary">Glossary</a>
      <a href="#about">About</a>
    </nav>
  </header>

  <section id="chapters">
    <h2>Table of Contents</h2>
    <ol>
      ${(chapters ?? []).map((ch) => `<li><a href="#chapter-${ch.chapter_number}">${escapeHtml(ch.title)}</a></li>`).join("\n      ")}
    </ol>

    ${chaptersHtml}
  </section>

  <section id="glossary">
    <h2>Glossary — Characters, Locations & Lore</h2>
    <dl>
      ${glossaryHtml}
    </dl>
  </section>

  <section id="about">
    <h2>About the Author</h2>
    <p>Sam Nowroozi Larki is a writer who draws from real life experiences, anime, music, and other mediums to create vivid fantasy worlds. Follow on <a href="https://instagram.com/anyonebutsam">Instagram</a> and <a href="https://tiktok.com/@anyonebutsam">TikTok</a> (@anyonebutsam).</p>
  </section>

  <footer style="text-align:center;margin-top:4em;color:#aaa;font-size:0.85em;">
    <p>© ${new Date().getFullYear()} Sam Nowroozi Larki. All rights reserved.</p>
    <p>Read at <a href="https://sedorium.lovable.app">sedorium.lovable.app</a> | JSON version: <a href="?format=json">content-feed?format=json</a></p>
  </footer>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("content-feed error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to generate content feed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
