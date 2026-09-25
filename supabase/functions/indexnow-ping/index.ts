const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_HOST = "www.thecasefiles.org";
const SITE_URL = `https://${SITE_HOST}`;
// IndexNow key — exposed publicly at /{key}.txt on your site, which is fine.
// This is just an identifier so search engines can verify ownership.
const INDEXNOW_KEY = "5ed7c9a2f1b04e8d9c3a1f6b2e7d8c4a";

interface PingResult {
  endpoint: string;
  status: number;
  ok: boolean;
}

async function pingIndexNow(urls: string[]): Promise<PingResult[]> {
  const endpoints = [
    "https://api.indexnow.org/IndexNow",
    "https://www.bing.com/indexnow",
  ];

  const body = JSON.stringify({
    host: SITE_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  });

  return await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body,
        });
        return { endpoint, status: res.status, ok: res.ok };
      } catch (err) {
        console.error(`IndexNow ${endpoint} failed:`, err);
        return { endpoint, status: 0, ok: false };
      }
    })
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Optional: pass { chapter_number: N } to ping a single chapter.
    // Otherwise ping all currently-published chapters + key static pages.
    let body: { chapter_number?: number } = {};
    try {
      body = await req.json();
    } catch {
      // no body — that's fine
    }

    const urls: string[] = [];

    if (typeof body.chapter_number === "number") {
      urls.push(`${SITE_URL}/chapters`);
      urls.push(`${SITE_URL}/`);
    } else {
      urls.push(
        `${SITE_URL}/`,
        `${SITE_URL}/chapters`,
        `${SITE_URL}/about`
      );
    }

    const results = await pingIndexNow(urls);
    console.log("IndexNow ping results:", JSON.stringify(results));

    return new Response(
      JSON.stringify({
        success: true,
        urlsSubmitted: urls.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("indexnow-ping error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
