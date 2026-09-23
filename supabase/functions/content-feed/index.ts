const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const data = {
    title: "Sedorium",
    author: "AnyoneButSam",
    description: "Random situations put into story form.",
    language: "en",
    url: "https://www.thefivethrones.com",
  };
  if (url.searchParams.get("format") === "json") {
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return new Response(
    `<!doctype html><html lang="en"><head><title>Sedorium</title><meta name="description" content="${data.description}"></head><body><main><h1>Sedorium</h1><p>${data.description}</p><p>By ${data.author}</p></main></body></html>`,
    { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );
});