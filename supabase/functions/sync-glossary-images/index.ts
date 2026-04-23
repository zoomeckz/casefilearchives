import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "images";
const FOLDER = "glossary";

const PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${FOLDER}/`;

interface SyncResult {
  scanned: number;
  matched: number;
  updated: number;
  cleared: number;
  unmatchedFiles: string[];
  changes: Array<{ term: string; from: string | null; to: string | null; reason: string }>;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Derive candidate term keys from a storage filename.
 * Examples:
 *   "Velvet_Sedorium.png" -> ["velvet"]
 *   "Captain_Dorren_Sedorium.png" -> ["captaindorren", "captain dorren"]
 *   "mezaru-1.png" -> ["mezaru1", "mezaru"]
 *   "helsim.png" -> ["helsim"]
 */
function candidateKeysFromFile(filename: string): string[] {
  const stem = filename.replace(/\.[^.]+$/, "");
  const withoutSuffix = stem.replace(/_sedorium$/i, "");
  const parts = withoutSuffix.split(/[_\-\s]+/).filter(Boolean);
  const joined = parts.join("");
  const spaced = parts.join(" ");
  // Also try stripping a trailing -N or _N (variant numbering)
  const stripped = withoutSuffix.replace(/[-_]\d+$/, "");
  const out = new Set<string>([
    normalize(joined),
    normalize(spaced),
    normalize(withoutSuffix),
    normalize(stripped),
  ]);
  return Array.from(out).filter((k) => k.length > 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1. Authenticate caller and confirm admin role
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "1";

    // 2. List files in storage glossary folder
    const { data: files, error: listErr } = await admin.storage
      .from(BUCKET)
      .list(FOLDER, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (listErr) throw listErr;
    const validFiles = (files ?? []).filter(
      (f) => f.name && /\.(png|jpe?g|webp|gif)$/i.test(f.name),
    );

    // Build lookup: normalized key -> filename (prefer files containing "_sedorium")
    const fileByKey = new Map<string, string>();
    const sortedFiles = [...validFiles].sort((a, b) => {
      const aSed = /_sedorium/i.test(a.name) ? 0 : 1;
      const bSed = /_sedorium/i.test(b.name) ? 0 : 1;
      return aSed - bSed;
    });
    for (const f of sortedFiles) {
      for (const k of candidateKeysFromFile(f.name)) {
        if (!fileByKey.has(k)) fileByKey.set(k, f.name);
      }
    }
    const fileNameSet = new Set(validFiles.map((f) => f.name));

    // 3. Pull all glossary entries
    const { data: entries, error: glossErr } = await admin
      .from("glossary")
      .select("id, term, image_url, aliases");
    if (glossErr) throw glossErr;

    const result: SyncResult = {
      scanned: entries?.length ?? 0,
      matched: 0,
      updated: 0,
      cleared: 0,
      unmatchedFiles: [],
      changes: [],
    };
    const usedFiles = new Set<string>();

    for (const e of entries ?? []) {
      const keys = new Set<string>();
      keys.add(normalize(e.term));
      for (const a of (e.aliases ?? []) as string[]) keys.add(normalize(a));

      let matchedFile: string | null = null;
      for (const k of keys) {
        const f = fileByKey.get(k);
        if (f) {
          matchedFile = f;
          break;
        }
      }

      const expectedUrl = matchedFile ? PUBLIC_BASE + matchedFile : null;
      const currentUrl: string | null = e.image_url ?? null;

      if (matchedFile) {
        result.matched += 1;
        usedFiles.add(matchedFile);
      }

      // Determine if current URL points to a file that no longer exists in storage
      const currentBelongsToFolder =
        currentUrl && currentUrl.includes(`/${BUCKET}/`) &&
        currentUrl.includes(`/${FOLDER}/`);
      const currentFileName = currentBelongsToFolder
        ? decodeURIComponent(
            currentUrl!.split(`/${FOLDER}/`)[1]?.split("?")[0] ?? "",
          )
        : null;
      const currentMissing =
        currentBelongsToFolder &&
        currentFileName !== null &&
        !fileNameSet.has(currentFileName);

      if (matchedFile && currentUrl !== expectedUrl) {
        result.changes.push({
          term: e.term,
          from: currentUrl,
          to: expectedUrl,
          reason: currentUrl ? "mismatch" : "missing",
        });
        if (!dryRun) {
          const { error: upErr } = await admin
            .from("glossary")
            .update({ image_url: expectedUrl })
            .eq("id", e.id);
          if (!upErr) result.updated += 1;
        } else {
          result.updated += 1;
        }
      } else if (!matchedFile && currentMissing) {
        // Clear stale URL pointing to a deleted storage file
        result.changes.push({
          term: e.term,
          from: currentUrl,
          to: null,
          reason: "stale (file deleted)",
        });
        if (!dryRun) {
          const { error: upErr } = await admin
            .from("glossary")
            .update({ image_url: null })
            .eq("id", e.id);
          if (!upErr) result.cleared += 1;
        } else {
          result.cleared += 1;
        }
      }
    }

    for (const f of validFiles) {
      if (!usedFiles.has(f.name)) result.unmatchedFiles.push(f.name);
    }

    return new Response(
      JSON.stringify({ ok: true, dryRun, ...result }, null, 2),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("sync-glossary-images error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});