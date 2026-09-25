import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://www.thecasefiles.org";
const SEO_META_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/dynamic-seo-meta`;
const SITEMAP_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/dynamic-sitemap`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, anonKey, {
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

    // Body is either {} for status or { action: "refresh" } to trigger refresh
    let action: string | undefined;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        action = body?.action;
      } catch {
        // ignore
      }
    }

    let refreshResult: Record<string, number | string> | null = null;
    if (action === "refresh") {
      const start = Date.now();
      const [seoRes, sitemapRes, contentRes] = await Promise.all([
        fetch(SEO_META_URL, { cache: "no-store" }),
        fetch(SITEMAP_URL, { cache: "no-store" }),
        fetch(`${supabaseUrl}/functions/v1/content-feed`, { cache: "no-store" }),
      ]);
      refreshResult = {
        seoMeta: seoRes.status,
        sitemap: sitemapRes.status,
        contentFeed: contentRes.status,
        durationMs: Date.now() - start,
      };
    }

    // Read cron job + last 5 runs (using rpc-like raw query via supabase-js sql is unavailable;
    // use a SECURITY DEFINER function or fall back to direct PostgREST against a view).
    // We exposed a helper via the Postgres `cron` schema; query through the service role.
    // The service role can read cron.* tables directly via the REST API only if exposed.
    // Easiest: use the service role to run a raw query via PostgREST RPC. Since none exists,
    // we instead probe the dynamic-seo-meta endpoint to capture freshness signals
    // (totalChapters, latest chapter, generatedAt) which is what the widget mainly needs.
    const seoMetaRes = await fetch(SEO_META_URL, { cache: "no-store" });
    const seoMeta = seoMetaRes.ok ? await seoMetaRes.json() : null;

    const sitemapHead = await fetch(SITEMAP_URL, { method: "HEAD" });

    // Try to read cron status via a SQL function we'll create; if it doesn't exist, return null
    let cron: unknown = null;
    try {
      const { data, error } = await supabase.rpc("get_seo_cron_status");
      if (!error) cron = data;
    } catch {
      cron = null;
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        endpoints: {
          dynamicSeoMeta: { url: SEO_META_URL, status: seoMetaRes.status },
          dynamicSitemap: { url: SITEMAP_URL, status: sitemapHead.status },
          siteUrl: SITE_URL,
        },
        live: seoMeta
          ? {
              title: seoMeta.title,
              totalChapters: seoMeta.totalChapters,
              latestChapter: seoMeta.latestChapter,
              generatedAt: seoMeta.generatedAt,
              schemas: Object.keys(seoMeta.schemas ?? {}),
            }
          : null,
        cron,
        refreshResult,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("seo-status error:", err);
    return new Response(JSON.stringify({ error: "Status check failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
