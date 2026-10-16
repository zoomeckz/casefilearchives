import React, { useEffect, useState } from "react";
import { toast } from "sonner";

// Admin → Discord & RSS: post new case files (and optionally forum posts and new
// readers) to a Discord channel through a webhook, plus the public RSS feeds.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FEED_URL = `${SUPA_URL}/functions/v1/rss-feed`;

interface Settings {
  configured: boolean;
  webhook_hint: string | null;
  stories: boolean;
  ping_everyone: boolean;
  forum: boolean;
  readers: boolean;
  can_send: boolean;
  scheduled_checks: boolean;
}

function freshToken(fallback?: string) {
  try {
    const s = JSON.parse(localStorage.getItem("app-auth-session") || "null");
    if (s?.access_token && s.expires_at > Date.now() / 1000 + 30) return s.access_token as string;
  } catch { /* ignore */ }
  return fallback;
}

async function rpc<T>(fn: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${freshToken(token) || ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "request_failed");
  return data as T;
}

const ERRORS: Record<string, string> = {
  invalid_webhook: "That isn't a Discord webhook address. It should start with https://discord.com/api/webhooks/",
  no_webhook: "Save a webhook address first.",
  admin_only: "Only admins can do this.",
};
const explain = (e: any) => ERRORS[e?.message] || e?.message || "Something went wrong.";

const card = "p-4 sm:p-5 rounded-lg border border-border bg-card/40";
const btn = "px-3 py-2 border border-border rounded text-sm hover:border-primary disabled:opacity-50";
const primaryBtn = "px-4 py-2 rounded text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-50";
const inputCls = "w-full min-w-0 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary";

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({ checked, onChange, label, hint, disabled }) => (
  <label className={`flex items-start gap-3 py-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
    <input type="checkbox" className="mt-1" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="block text-sm text-foreground">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </span>
  </label>
);

const CopyField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <div className="flex gap-2">
      <input readOnly value={value} className={`${inputCls} font-mono text-xs`} onFocus={(e) => e.target.select()} />
      <button type="button" className={`${btn} shrink-0`}
        onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"), () => toast.error("Copy failed"))}>
        Copy
      </button>
    </div>
  </div>
);

export const DiscordSettings: React.FC<{ authToken?: string }> = ({ authToken }) => {
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [opts, setOpts] = useState({ stories: true, ping_everyone: false, forum: false, readers: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const apply = (next: Settings) => {
    setS(next);
    setOpts({ stories: next.stories, ping_everyone: next.ping_everyone, forum: next.forum, readers: next.readers });
  };

  useEffect(() => {
    rpc<Settings>("admin_discord_settings", {}, authToken)
      .then(apply)
      .catch((e) => setError(e.message === "request_failed" || /admin_discord/.test(e.message) ? "Apply the latest database migration (20261018090000) first." : explain(e)));
  }, [authToken]);

  const save = async (webhook: string | null) => {
    setBusy("save");
    try {
      apply(await rpc<Settings>("admin_save_discord", { _webhook_url: webhook, ...prefix(opts) }, authToken));
      setUrl("");
      toast.success(webhook === "" ? "Webhook removed" : "Discord settings saved");
    } catch (e: any) {
      toast.error(explain(e));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setTestResult("Sending…");
    try {
      const id = await rpc<number>("admin_discord_test", {}, authToken);
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const r = await rpc<{ done: boolean; status?: number; error?: string; timed_out?: boolean }>("admin_discord_result", { _request_id: id }, authToken);
        if (!r.done) continue;
        if (r.status && r.status >= 200 && r.status < 300) setTestResult("Delivered. Check your Discord channel.");
        else if (r.status === 404 || r.status === 401) setTestResult("Discord rejected it: the webhook was deleted or the address is wrong.");
        else setTestResult(`Not delivered (${r.status ?? (r.timed_out ? "timed out" : r.error || "unknown error")}).`);
        return;
      }
      setTestResult("Sent, but no answer from Discord yet. Check the channel.");
    } catch (e: any) {
      setTestResult(explain(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="p-6 border border-destructive/40 rounded-lg text-sm text-foreground">{error}</div>;
  if (!s) return <p className="text-muted-foreground text-sm p-6">Loading…</p>;

  const dirty = url.trim() !== "" || opts.stories !== s.stories || opts.ping_everyone !== s.ping_everyone || opts.forum !== s.forum || opts.readers !== s.readers;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Discord &amp; RSS</h2>
        <p className="text-sm text-muted-foreground">Post new case files to your Discord server automatically.</p>
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm font-medium text-foreground">Discord webhook</p>
          <span className={`text-xs ${s.configured ? "text-primary" : "text-muted-foreground"}`}>
            {s.configured ? `Connected (${s.webhook_hint})` : "Not connected"}
          </span>
        </div>

        <ol className="text-xs text-muted-foreground list-decimal pl-5 space-y-1 mb-4">
          <li>In Discord, open <span className="text-foreground">Server Settings → Integrations → Webhooks</span>.</li>
          <li>Click <span className="text-foreground">New Webhook</span>, pick the channel for announcements, then <span className="text-foreground">Copy Webhook URL</span>.</li>
          <li>Paste it below and save. Then send a test.</li>
        </ol>

        <div className="flex gap-2">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls}
            placeholder={s.configured ? "Paste a new address to replace the current one" : "https://discord.com/api/webhooks/…"} />
        </div>

        <div className="mt-4 divide-y divide-border">
          <Toggle checked={opts.stories} onChange={(v) => setOpts({ ...opts, stories: v })} label="New case files"
            hint="Posted the moment a story is published, or when a scheduled story goes live." />
          <Toggle checked={opts.ping_everyone} disabled={!opts.stories} onChange={(v) => setOpts({ ...opts, ping_everyone: v })} label="Ping @everyone for new case files" />
          <Toggle checked={opts.forum} onChange={(v) => setOpts({ ...opts, forum: v })} label="New forum posts" hint="Theories and threads, with a link to the post." />
          <Toggle checked={opts.readers} onChange={(v) => setOpts({ ...opts, readers: v })} label="New readers registered"
            hint="Shows the username only. Best for a private staff channel." />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" className={primaryBtn} disabled={!!busy || !dirty || (!s.configured && !url.trim())}
            onClick={() => save(url.trim() || null)}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button type="button" className={btn} disabled={!!busy || !s.configured || !s.can_send} onClick={test}>
            {busy === "test" ? "Sending…" : "Send test message"}
          </button>
          {s.configured && (
            <button type="button" className={`${btn} text-destructive`} disabled={!!busy}
              onClick={() => { if (window.confirm("Disconnect Discord? Nothing will be posted until you add a webhook again.")) void save(""); }}>
              Disconnect
            </button>
          )}
        </div>
        {testResult && <p className="text-xs text-foreground mt-3" aria-live="polite">{testResult}</p>}
        {!s.can_send && <p className="text-xs text-destructive mt-3">Sending is unavailable: the database's web request extension (pg_net) is not enabled.</p>}
        {s.configured && !s.scheduled_checks && (
          <p className="text-xs text-muted-foreground mt-3">Scheduled stories are announced with the next publish or forum post (the five-minute check isn't available on this database).</p>
        )}
      </section>

      <section className={`${card} space-y-4`}>
        <div>
          <p className="text-sm font-medium text-foreground">RSS feeds</p>
          <p className="text-xs text-muted-foreground mt-1">
            For feed readers, or Discord RSS bots such as MonitoRSS if you prefer a bot over the webhook.
          </p>
        </div>
        <CopyField label="New case files" value={FEED_URL} />
        <CopyField label="Forum posts" value={`${FEED_URL}?type=forum`} />
        <a href={FEED_URL} target="_blank" rel="noreferrer" className="inline-block text-xs text-primary hover:underline">Open the feed ↗</a>
      </section>
    </div>
  );
};

// admin_save_discord takes its options as _stories, _ping_everyone, …
function prefix(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [`_${k}`, v]));
}

export default DiscordSettings;
