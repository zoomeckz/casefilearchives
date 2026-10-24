import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * RSS feed of new posts on Case Files, for feed readers and Discord feed bots.
 *   /functions/v1/rss                 new stories and case files (default)
 *   /functions/v1/rss?type=forum      new discussion threads
 *   /functions/v1/rss?type=all        both
 * Only what the public can see: published, not archived, and past any scheduled time.
 */

const SITE_URL = "https://thecasefiles.org";
const SITE_TITLE = "Case Files";
const SITE_DESCRIPTION = "Unrelated stories. Uncomfortable possibilities.";
const LIMIT = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const slugify = (t: string) =>
  (t || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Plain-text teaser from stored HTML or markdown. */
function excerpt(html: string, max = 280): string {
  const text = (html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[*_#>`]+/g, " ")
    .replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")}…` : text;
}

const imageType = (url: string) =>
  /\.png(\?|$)/i.test(url) ? "image/png" : /\.webp(\?|$)/i.test(url) ? "image/webp" : /\.gif(\?|$)/i.test(url) ? "image/gif" : "image/jpeg";

interface Item { title: string; link: string; guid: string; date: string; description: string; category?: string; author?: string; image?: string | null }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "stories").toLowerCase();
  const wantStories = type === "stories" || type === "all";
  const wantForum = type === "forum" || type === "all";

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date();
    const items: Item[] = [];

    if (wantStories) {
      const { data } = await supabase
        .from("chapters")
        .select("id, title, content, cover_image_url, published_at, scheduled_at, story_format, tags, is_archived")
        .eq("is_archived", false)
        .lte("published_at", now.toISOString())
        .order("published_at", { ascending: false })
        .limit(LIMIT * 2);
      for (const c of data ?? []) {
        if (c.scheduled_at && new Date(c.scheduled_at) > now) continue;
        const slug = slugify(c.title);
        if (!slug) continue;
        const when = c.scheduled_at && new Date(c.scheduled_at) > new Date(c.published_at) ? c.scheduled_at : c.published_at;
        const kind = c.story_format === "interactive" ? "Interactive case file" : "New story";
        const teaser = excerpt(c.content);
        items.push({
          title: c.title,
          link: `${SITE_URL}/stories/${slug}`,
          guid: `story-${c.id}`,
          date: when,
          description: teaser ? `${kind}. ${teaser}` : `${kind} on ${SITE_TITLE}.`,
          category: kind,
          image: c.cover_image_url,
        });
      }
    }

    if (wantForum) {
      const { data } = await supabase
        .from("forum_posts")
        .select("id, title, content, category, created_at, user_id, is_archived")
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      const ids = [...new Set((data ?? []).map((p) => p.user_id))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, name").in("user_id", ids);
        for (const p of profiles ?? []) names.set(p.user_id, p.name);
      }
      for (const p of data ?? []) {
        const author = names.get(p.user_id) || "A reader";
        items.push({
          title: `Discussion: ${p.title}`,
          link: `${SITE_URL}/forum/${p.id}`,
          guid: `forum-${p.id}`,
          date: p.created_at,
          description: `${author} started a thread${p.category ? ` in ${p.category}` : ""}. ${excerpt(p.content, 240)}`.trim(),
          category: "Discussion",
          author,
        });
      }
    }

    items.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const list = items.slice(0, LIMIT);
    const self = `${url.origin}${url.pathname}${url.search}`;
    const feedTitle = type === "forum" ? `${SITE_TITLE} · Discussions` : type === "all" ? `${SITE_TITLE} · Everything new` : SITE_TITLE;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${esc(feedTitle)}</title>
<link>${SITE_URL}</link>
<description>${esc(SITE_DESCRIPTION)}</description>
<language>en</language>
<atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
<lastBuildDate>${now.toUTCString()}</lastBuildDate>
<ttl>15</ttl>
<image><url>${SITE_URL}/og-image.jpg</url><title>${esc(feedTitle)}</title><link>${SITE_URL}</link></image>
${list.map((i) => `<item>
<title>${esc(i.title)}</title>
<link>${esc(i.link)}</link>
<guid isPermaLink="false">${esc(i.guid)}</guid>
<pubDate>${new Date(i.date).toUTCString()}</pubDate>
<description>${esc(i.description)}</description>${i.category ? `\n<category>${esc(i.category)}</category>` : ""}${i.author ? `\n<dc:creator>${esc(i.author)}</dc:creator>` : ""}${i.image ? `\n<enclosure url="${esc(i.image)}" length="0" type="${imageType(i.image)}"/>\n<media:content url="${esc(i.image)}" medium="image"/>` : ""}
</item>`).join("\n")}
</channel>
</rss>
`;
    return new Response(xml, {
      headers: { ...corsHeaders, "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    return new Response(`Feed unavailable: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
