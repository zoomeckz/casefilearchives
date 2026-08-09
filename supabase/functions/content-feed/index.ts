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

    // Fetch ALL data in parallel
    const [
      { data: chapters },
      { data: glossary },
      { data: forumPosts },
      { data: theories },
      { data: fanArt },
      { data: profiles },
    ] = await Promise.all([
      supabase.from("chapters").select("title, content, chapter_number, published_at, views").order("chapter_number", { ascending: true }),
      supabase.from("glossary").select("term, type, description, image_url, parent_term").order("term", { ascending: true }),
      supabase.from("forum_posts").select("title, content, category, created_at, is_pinned").order("created_at", { ascending: false }),
      supabase.from("theories").select("title, content, status, created_at").order("created_at", { ascending: false }),
      supabase.from("fan_art").select("title, description, image_url, created_at").order("created_at", { ascending: false }),
      supabase.from("profiles").select("name, bio, avatar_url").order("name", { ascending: true }),
    ]);

    const url = new URL(req.url);
    const format = url.searchParams.get("format");

    if (format === "json") {
      return new Response(
        JSON.stringify({
          title: "Sedorium — The Five Thrones",
          author: "Sam Nowroozi Larki",
          description: "A free dark fantasy web novel — epic worldbuilding with druids, shapeshifters, ancient kingdoms, political intrigue, and mythical creatures. Read all 28 chapters free online.",
          url: "https://www.thefivethrones.com",
          keywords: ["dark fantasy", "web novel", "free fantasy book", "druids", "shapeshifters", "epic fantasy", "serial fiction", "fantasy worldbuilding", "indie author", "Sam Nowroozi Larki", "read free online"],
          totalChapters: chapters?.length ?? 0,
          chapters: (chapters ?? []).map((ch) => ({
            number: ch.chapter_number,
            title: ch.title,
            publishedAt: ch.published_at,
            views: ch.views,
            content: stripHtml(ch.content),
          })),
          glossary: (glossary ?? []).map((g) => ({
            term: g.term,
            type: g.type,
            description: g.description,
            imageUrl: g.image_url,
            parentTerm: g.parent_term,
          })),
          communityTheories: (theories ?? []).map((t) => ({
            title: t.title,
            content: stripHtml(t.content),
            status: t.status,
            createdAt: t.created_at,
          })),
          forumDiscussions: (forumPosts ?? []).map((p) => ({
            title: p.title,
            category: p.category,
            content: stripHtml(p.content),
            isPinned: p.is_pinned,
            createdAt: p.created_at,
          })),
          fanArt: (fanArt ?? []).map((a) => ({
            title: a.title,
            description: a.description,
            imageUrl: a.image_url,
            createdAt: a.created_at,
          })),
          community: {
            totalMembers: profiles?.length ?? 0,
            totalTheories: theories?.length ?? 0,
            totalForumPosts: forumPosts?.length ?? 0,
            totalFanArt: fanArt?.length ?? 0,
          },
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

    // Default: return rich SEO HTML
    const chaptersHtml = (chapters ?? [])
      .map(
        (ch) => `
      <article id="chapter-${ch.chapter_number}" itemscope itemtype="https://schema.org/Chapter">
        <h2 itemprop="name">Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</h2>
        <time datetime="${ch.published_at}" itemprop="datePublished">${new Date(ch.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</time>
        <span style="color:#888;margin-left:1em;">${ch.views} reads</span>
        <div itemprop="text">${ch.content}</div>
      </article>
      <hr />`
      )
      .join("\n");

    const glossaryByType: Record<string, typeof glossary> = {};
    for (const g of glossary ?? []) {
      if (!glossaryByType[g.type]) glossaryByType[g.type] = [];
      glossaryByType[g.type].push(g);
    }

    const glossaryHtml = Object.entries(glossaryByType)
      .map(([type, entries]) => `
        <h3>${type.charAt(0).toUpperCase() + type.slice(1)}s</h3>
        <dl>
          ${(entries ?? []).map(
            (g) =>
              `<dt><strong>${escapeHtml(g.term)}</strong>${g.parent_term ? ` <span style="color:#888;">(${escapeHtml(g.parent_term)})</span>` : ""}</dt><dd>${escapeHtml(g.description)}</dd>`
          ).join("\n")}
        </dl>`)
      .join("\n");

    const theoriesHtml = (theories ?? []).length > 0
      ? `<section id="theories">
          <h2>Fan Theories & Predictions</h2>
          ${(theories ?? []).map(t => `
            <article>
              <h3>${escapeHtml(t.title)} <span style="color:#888;font-size:0.8em;">[${t.status}]</span></h3>
              <div>${t.content}</div>
            </article>`).join("\n")}
        </section>`
      : "";

    const forumHtml = (forumPosts ?? []).length > 0
      ? `<section id="forum">
          <h2>Community Forum Discussions</h2>
          ${(forumPosts ?? []).map(p => `
            <article>
              <h3>${p.is_pinned ? "📌 " : ""}${escapeHtml(p.title)} <em>(${escapeHtml(p.category)})</em></h3>
              <div>${p.content}</div>
            </article>`).join("\n")}
        </section>`
      : "";

    const fanArtHtml = (fanArt ?? []).length > 0
      ? `<section id="fan-art">
          <h2>Fan Art Gallery</h2>
          ${(fanArt ?? []).map(a => `
            <figure>
              <img src="${escapeHtml(a.image_url)}" alt="${escapeHtml(a.title)}" loading="lazy" style="max-width:100%;" />
              <figcaption><strong>${escapeHtml(a.title)}</strong>${a.description ? ` — ${escapeHtml(a.description)}` : ""}</figcaption>
            </figure>`).join("\n")}
        </section>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sedorium — Free Dark Fantasy Web Novel | Read ${chapters?.length ?? 0} Chapters Online | Sam Nowroozi Larki</title>
  <meta name="description" content="Read Sedorium free online — an epic dark fantasy web novel with ${chapters?.length ?? 0} chapters. Druids, shapeshifters, ancient kingdoms, political intrigue, and mythical creatures. By Sam Nowroozi Larki." />
  <meta name="keywords" content="dark fantasy web novel, free fantasy book online, read fantasy free, epic fantasy series, druids shapeshifters, fantasy worldbuilding, indie fantasy author, serial fiction, web fiction 2026, Sam Nowroozi Larki, Sedorium, Beambreak, Oathbreaker, druid transformation, lycan, fantasy kingdoms, DND style novel, anime inspired fantasy, best free web novels, online fantasy story" />
  <meta name="author" content="Sam Nowroozi Larki" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
  <link rel="canonical" href="https://www.thefivethrones.com" />
  <meta property="og:title" content="Sedorium — Free Dark Fantasy Web Novel | ${chapters?.length ?? 0} Chapters" />
  <meta property="og:description" content="Read Sedorium free — an epic dark fantasy saga of druids, shapeshifters, and ancient kingdoms. ${chapters?.length ?? 0} chapters by Sam Nowroozi Larki." />
  <meta property="og:type" content="book" />
  <meta property="og:url" content="https://www.thefivethrones.com" />
  <style>
    body { max-width: 800px; margin: 0 auto; padding: 40px 20px; font-family: Georgia, serif; line-height: 1.8; color: #333; background: #fafafa; }
    h1 { text-align: center; font-size: 2.5em; letter-spacing: 0.1em; }
    h2 { margin-top: 3em; color: #1a1a2e; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
    article { margin-bottom: 4em; }
    time { display: inline-block; color: #888; font-size: 0.9em; margin-bottom: 1em; }
    hr { border: none; border-top: 1px solid #ddd; margin: 3em 0; }
    dt { margin-top: 1em; }
    dd { margin-left: 1em; color: #555; }
    a { color: #2563eb; }
    .nav { text-align: center; margin: 2em 0; }
    .nav a { margin: 0 0.8em; }
    figure { margin: 2em 0; }
    figcaption { font-size: 0.9em; color: #666; margin-top: 0.5em; }
  </style>
</head>
<body itemscope itemtype="https://schema.org/Book">
  <header>
    <h1 itemprop="name">SEDORIUM</h1>
    <p style="text-align:center;" itemprop="description">A Dark Fantasy Web Novel by <strong itemprop="author">Sam Nowroozi Larki</strong> — Epic saga of druids, shapeshifters, oathbreakers, and ancient kingdoms</p>
    <p style="text-align:center;">${chapters?.length ?? 0} Chapters — Free to Read at <a href="https://www.thefivethrones.com" itemprop="url">www.thefivethrones.com</a></p>
    <p style="text-align:center;color:#888;font-size:0.85em;">Complete story content, community theories, fan art, and lore encyclopedia. <a href="https://www.thefivethrones.com">Visit the interactive site →</a></p>
    <nav class="nav">
      <a href="#chapters">Chapters</a>
      <a href="#glossary">Glossary</a>
      <a href="#theories">Theories</a>
      <a href="#forum">Forum</a>
      <a href="#fan-art">Fan Art</a>
      <a href="#about">About</a>
    </nav>
  </header>

  <section id="chapters">
    <h2>All Chapters — Table of Contents</h2>
    <ol>
      ${(chapters ?? []).map((ch) => `<li><a href="#chapter-${ch.chapter_number}">${escapeHtml(ch.title)}</a></li>`).join("\n      ")}
    </ol>

    ${chaptersHtml}
  </section>

  <section id="glossary">
    <h2>Lore Encyclopedia — Characters, Locations, Creatures & Concepts</h2>
    ${glossaryHtml}
  </section>

  ${theoriesHtml}
  ${forumHtml}
  ${fanArtHtml}

  <section id="about">
    <h2>About the Author — Sam Nowroozi Larki</h2>
    <p>Sam Nowroozi Larki is an indie fantasy author who blends anime-inspired storytelling, real-life experiences, and music into epic dark fantasy worldbuilding. Sedorium is his debut serial novel, featuring druids, political intrigue, shapeshifters, and richly drawn characters across five nations.</p>
    <p>Follow: <a href="https://instagram.com/anyonebutsam">Instagram @anyonebutsam</a> | <a href="https://tiktok.com/@anyonebutsam">TikTok @anyonebutsam</a></p>
  </section>

  <footer style="text-align:center;margin-top:4em;color:#aaa;font-size:0.85em;">
    <p>© ${new Date().getFullYear()} Sam Nowroozi Larki. All rights reserved.</p>
    <p>Read at <a href="https://www.thefivethrones.com">www.thefivethrones.com</a> | <a href="?format=json">JSON API →</a></p>
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
