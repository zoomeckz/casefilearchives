const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const data = {
    title: "Case File",
    author: "AnyoneButSam",
    description: "Unrelated stories. Uncomfortable possibilities.",
    language: "en",
    url: "https://www.thefivethrones.com",
  };
  if (url.searchParams.get("format") === "json") {
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return new Response(
    `<!doctype html><html lang="en"><head><title>Case File</title><meta name="description" content="${data.description}"></head><body><main><h1>Case File</h1><p>${data.description}</p><p>By ${data.author}</p></main></body></html>`,
    { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );
});