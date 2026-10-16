import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// RSS feed of published case files (default) or forum posts (?type=forum).
// Works with feed readers and Discord RSS bots such as MonitoRSS.

const SITE_URL = "https://thecasefiles.org";
const LIMIT = 30;

const slugify = (t: string) => (t || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const xml = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cdata = (s: string) => `<![CDATA[${(s || "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

function excerpt(html: string, max: number) {
  const text = (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const absolute = (url: string | null) => (!url ? null : url.startsWith("http") ? url : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`);

interface Item { title: string; link: string; guid: string; date: string; description: string; category?: string; image?: string | null }

Deno.serve(async (req) => {
  const type = new URL(req.url).searchParams.get("type") === "forum" ? "forum" : "stories";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();
  let items: Item[] = [];

  try {
    if (type === "forum") {
      const { data } = await supabase
        .from("forum_posts")
        .select("id, title, content, category, created_at")
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      items = (data ?? []).map((p) => ({
        title: p.title,
        link: `${SITE_URL}/forum/${slugify(p.title)}--${String(p.id).slice(0, 8)}`,
        guid: `forum-${p.id}`,
        date: p.created_at,
        description: excerpt(p.content, 400),
        category: p.category,
      }));
    } else {
      const { data } = await supabase
        .from("chapters")
        .select("id, title, content, cover_image_url, story_format, published_at, scheduled_at, tags")
        .eq("is_archived", false)
        .lte("published_at", now.toISOString())
        .order("published_at", { ascending: false })
        .limit(LIMIT * 2);
      items = (data ?? [])
        // Scheduled stories appear once their time has come.
        .filter((c) => !c.scheduled_at || new Date(c.scheduled_at) <= now)
        .map((c) => {
          const out = c.scheduled_at && c.scheduled_at > c.published_at ? c.scheduled_at : c.published_at;
          return {
            title: c.title,
            link: `${SITE_URL}/stories/${slugify(c.title)}`,
            guid: `story-${c.id}`,
            date: out,
            description: excerpt(c.content, 600),
            category: c.story_format === "interactive" ? "Interactive case" : "Case file",
            image: absolute(c.cover_image_url),
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, LIMIT);
    }
  } catch (e) {
    console.error("rss-feed", e);
  }

  const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/rss-feed${type === "forum" ? "?type=forum" : ""}`;
  const channelTitle = type === "forum" ? "Case Files · Forum" : "Case Files";
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>${xml(channelTitle)}</title>
  <link>${SITE_URL}${type === "forum" ? "/forum" : "/chapters"}</link>
  <atom:link href="${xml(self)}" rel="self" type="application/rss+xml" />
  <description>${xml(type === "forum" ? "New posts in the Case Files forum." : "Unrelated stories. Uncomfortable possibilities.")}</description>
  <language>en</language>
  <lastBuildDate>${now.toUTCString()}</lastBuildDate>
  <ttl>15</ttl>
${items.map((i) => `  <item>
    <title>${xml(i.title)}</title>
    <link>${xml(i.link)}</link>
    <guid isPermaLink="false">${xml(i.guid)}</guid>
    <pubDate>${new Date(i.date).toUTCString()}</pubDate>
    ${i.category ? `<category>${xml(i.category)}</category>` : ""}
    <description>${cdata(i.description)}</description>
    ${i.image ? `<media:content url="${xml(i.image)}" medium="image" />\n    <enclosure url="${xml(i.image)}" type="image/jpeg" length="0" />` : ""}
  </item>`).join("\n")}
</channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
