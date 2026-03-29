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
    // Verify admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all data counts and content in parallel
    const [
      chaptersRes,
      glossaryRes,
      forumRes,
      theoriesRes,
      fanArtRes,
      profilesRes,
      commentsRes,
    ] = await Promise.all([
      supabase.from("chapters").select("chapter_number, title, views, published_at").order("chapter_number", { ascending: true }),
      supabase.from("glossary").select("term, type, description, image_url, parent_term").order("term", { ascending: true }),
      supabase.from("forum_posts").select("id, title, category").order("created_at", { ascending: false }),
      supabase.from("theories").select("id, title, status").order("created_at", { ascending: false }),
      supabase.from("fan_art").select("id, title, image_url"),
      supabase.from("profiles").select("user_id, name"),
      supabase.from("comments").select("id"),
    ]);

    const chapters = chaptersRes.data ?? [];
    const glossary = glossaryRes.data ?? [];
    const forumPosts = forumRes.data ?? [];
    const theories = theoriesRes.data ?? [];
    const fanArt = fanArtRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const comments = commentsRes.data ?? [];

    // Categorize glossary
    const glossaryByType: Record<string, number> = {};
    for (const g of glossary) {
      glossaryByType[g.type] = (glossaryByType[g.type] || 0) + 1;
    }

    // Content feed URL for verification
    const contentFeedUrl = `${supabaseUrl}/functions/v1/content-feed`;

    // Verify content feed is accessible
    let contentFeedStatus = "unknown";
    try {
      const cfRes = await fetch(contentFeedUrl, { method: "HEAD" });
      contentFeedStatus = cfRes.ok ? "online" : `error (${cfRes.status})`;
    } catch {
      contentFeedStatus = "offline";
    }

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      contentFeedStatus,
      contentFeedUrl,
      contentFeedJsonUrl: `${contentFeedUrl}?format=json`,
      stats: {
        chapters: {
          total: chapters.length,
          totalViews: chapters.reduce((sum, ch) => sum + (ch.views || 0), 0),
          list: chapters.map(ch => ({
            number: ch.chapter_number,
            title: ch.title,
            views: ch.views,
          })),
        },
        glossary: {
          total: glossary.length,
          byType: glossaryByType,
        },
        community: {
          forumPosts: forumPosts.length,
          theories: theories.length,
          fanArt: fanArt.length,
          registeredUsers: profiles.length,
          comments: comments.length,
        },
      },
      seoChecklist: {
        structuredDataChapters: chapters.length,
        sitemapNeedsUpdate: chapters.length > 28,
        contentFeedServing: contentFeedStatus === "online",
        glossaryTermsIndexed: glossary.length,
        communityContentIndexed: forumPosts.length + theories.length,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("seo-sync error:", err);
    return new Response(
      JSON.stringify({ error: "SEO sync failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
