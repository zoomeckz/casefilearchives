import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * /reset-password: where the "Forgot password?" email leads. The link signs the
 * reader in for this one purpose (the auth client reads it from the URL); here
 * they choose a new password, and are then signed in on the site as usual.
 */
const PASSWORD_MIN = 8;
const STORAGE_KEY = "app-auth-session"; // the site's own session (see useAuth)

type Stage = "checking" | "ready" | "invalid" | "done";

const ResetPasswordPage = () => {
  // Read before the auth client tidies the URL: an expired or used link arrives as #error=…
  const [linkError] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("error_description"));
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Choose a new password · Case Files";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    let settled = false;
    const ready = () => { if (!settled) { settled = true; setStage("ready"); } };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) ready();
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) ready(); });
    const timer = window.setTimeout(() => { if (!settled) { settled = true; setStage("invalid"); } }, 6000);
    return () => { sub.subscription.unsubscribe(); window.clearTimeout(timer); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < PASSWORD_MIN) { setError(`Choose a password of at least ${PASSWORD_MIN} characters.`); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setBusy(false);
      setError(/same|different from the old/i.test(err.message) ? "Choose a password you haven't used before." : err.message);
      return;
    }
    // Sign the reader in on the site with the same session.
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (s) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
          user: s.user,
        }));
      } catch { /* the site falls back to the auth client's session */ }
    }
    setBusy(false);
    setStage("done");
  };

  const field = "w-full px-4 py-3 bg-background border border-border rounded-none text-foreground focus:outline-none focus:border-primary transition-colors";

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="case-file bg-card w-full max-w-md p-8">
        <p className="case-label text-[9px] mb-2">Identity</p>
        <h1 className="font-display text-2xl uppercase mb-2">Choose a new password</h1>

        {stage === "checking" && <p className="text-muted-foreground">Checking your link…</p>}

        {stage === "invalid" && (
          <>
            <p className="text-muted-foreground mb-6">
              {linkError ? `${linkError}. ` : ""}This link has expired or has already been used. Open the site, choose “Sign in”, then “Forgot password?” to get a new one.
            </p>
            <a href="/" className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm uppercase tracking-widest">Back to the archive</a>
          </>
        )}

        {stage === "ready" && (
          <form onSubmit={submit} className="space-y-4 mt-4" noValidate>
            <div>
              <label htmlFor="rp-new" className="block text-sm mb-2">New password</label>
              <input id="rp-new" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} value={password}
                onChange={(e) => setPassword(e.target.value)} className={field} disabled={busy} autoFocus />
              <p className="text-[11px] text-muted-foreground mt-1">At least {PASSWORD_MIN} characters.</p>
            </div>
            <div>
              <label htmlFor="rp-confirm" className="block text-sm mb-2">Type it again</label>
              <input id="rp-confirm" type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} className={field} disabled={busy} />
            </div>
            {error && <p className="text-red-400 text-sm" aria-live="assertive">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium uppercase tracking-widest transition-colors">
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}

        {stage === "done" && (
          <>
            <p className="text-muted-foreground mb-6" aria-live="polite">Your password has been changed and you are signed in.</p>
            <a href="/" className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm uppercase tracking-widest">Back to the archive</a>
          </>
        )}
      </div>
    </main>
  );
};

export default ResetPasswordPage;
