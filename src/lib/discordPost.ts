import { toast } from "sonner";

// Admin: post a story to Discord again with its current title and text, replacing the
// site's previous post of it when Discord's answer to that post is known.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function token(): string {
  try { return JSON.parse(localStorage.getItem("app-auth-session") || "null")?.access_token || ANON; } catch { return ANON; }
}

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "request_failed");
  return data as T;
}

export async function postStoryToDiscord(chapterId: string, title: string) {
  if (!window.confirm(`Post "${title}" to Discord with its current title and text? The site's earlier post of this story is removed if it can be.`)) return;
  const id = toast.loading("Sending to Discord…");
  try {
    const sent = await rpc<{ request_id: number | null; replaced: boolean }>("admin_discord_post_story", { _chapter_id: chapterId, _replace: true });
    for (let i = 0; i < 12 && sent.request_id; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const r = await rpc<{ done: boolean; status?: number; error?: string }>("admin_discord_result", { _request_id: sent.request_id });
      if (!r?.done) continue;
      if (r.status && r.status >= 200 && r.status < 300) {
        toast.success(sent.replaced ? "Posted to Discord. The old post was removed." : "Posted to Discord. Delete the old post in Discord if there is one.", { id, duration: 8000 });
      } else {
        toast.error(`Discord did not accept it (${r.status ?? r.error ?? "unknown error"}).`, { id });
      }
      return;
    }
    toast.success("Sent to Discord.", { id });
  } catch (e: any) {
    const msg = e?.message || "";
    toast.error(
      msg === "no_webhook" ? "Connect Discord first in Admin → Discord & RSS."
        : /admin_discord_post_story|request_failed/.test(msg) ? "Apply the latest database migration first."
        : msg || "Could not send to Discord.",
      { id },
    );
  }
}
