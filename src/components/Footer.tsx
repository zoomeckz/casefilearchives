import React, { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface FooterProps {
  setCurrentPage: (page: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentPage }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAuthHint, setShowAuthHint] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      // Anonymous subscriber capture — uses the page-views style anon insert.
      // We piggy-back on the email_subscriptions table only when a user is signed
      // in. For anonymous footer signups we just acknowledge and let the user know
      // they should create an account to fully subscribe (RLS prevents anon writes).
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/email_subscriptions`;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let token = key;
      try {
        const raw = localStorage.getItem("app-auth-session");
        if (raw) token = JSON.parse(raw)?.access_token || key;
      } catch {}

      if (token === key) {
        toast.info("Create an account to receive story alerts at this address.");
        setShowAuthHint(true);
        setEmail("");
        return;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({ email: trimmed, new_chapters: true }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      toast.success("You're subscribed to story alerts.");
      setEmail("");
    } catch {
      toast.error("Couldn't subscribe right now. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer className="border-t border-border py-14 px-6 bg-card/40">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center text-center">
          <p className="brand-title text-foreground text-2xl mb-2">CASE FILE</p>
          <p className="case-label text-[9px] mb-3">Independent fiction archive</p>
          <p className="text-muted-foreground text-sm mb-6">
            Written by AnyoneButSam
          </p>

          {/* Subscribe form */}
          <form
            onSubmit={handleSubscribe}
            className="w-full max-w-md mx-auto flex flex-col items-center gap-3 mb-3"
          >
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-center bg-background border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
              aria-label="Email address for new chapter notifications"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-primary text-primary-foreground border border-primary rounded-none text-sm uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              {submitting ? "…" : "Subscribe"}
            </button>
          </form>
          {showAuthHint && (
            <p className="text-muted-foreground text-xs mb-6">
              Tip: sign in to manage your subscription preferences.
            </p>
          )}

          {/* Socials — kept */}
          <div className="flex justify-center gap-4 mb-6 mt-2">
            <a
              href="https://instagram.com/anyonebutsam"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors text-sm"
            >
              Instagram
            </a>
            <span className="text-muted-foreground">·</span>
            <a
              href="https://tiktok.com/@anyonebutsam"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors text-sm"
            >
              TikTok
            </a>
          </div>

          <div className="flex justify-center gap-6 text-muted-foreground text-sm">
            <span>© {new Date().getFullYear()}</span>
            <span>·</span>
            <button onClick={() => setCurrentPage("about")} className="hover:text-primary transition-colors">
              About
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
