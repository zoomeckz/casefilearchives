import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/hooks/useAuth";
import { dbFetch } from "@/lib/dbFetch";
import { sessionToken } from "@/lib/commendations";

interface ReferralSectionProps {
  user: AuthUser;
}

export const ReferralSection: React.FC<ReferralSectionProps> = ({ user }) => {
  const [code, setCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase
        .from("referrals")
        .select("code")
        .eq("referrer_id", user.id)
        .limit(1);

      if (data && data.length > 0) {
        setCode(data[0].code);
      } else {
        const newCode = `${user.name.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "CASE"}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await supabase.from("referrals").insert({ referrer_id: user.id, code: newCode });
        setCode(newCode);
      }

      // Readers who registered through this link.
      const { count } = await dbFetch("referral_redemptions", {
        select: "referred_id",
        filters: `referrer_id=eq.${user.id}`,
        head: true,
        token: sessionToken() || undefined,
      });
      setReferralCount(count || 0);
    };
    init();
  }, [user.id]);

  const shareUrl = code ? `${window.location.origin}?ref=${code}` : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!code) return null;

  return (
    <div className="case-file p-6">
      <p className="case-label text-[9px] mb-3">Recruitment</p>
      <h4 className="text-foreground font-medium">Bring in a new reader</h4>
      <p className="text-muted-foreground text-sm mb-4">
        When someone registers through your link, you earn the Recruiter commendation and its frame.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={shareUrl}
          readOnly
          className="flex-1 min-w-0 px-3 py-2 bg-background border border-border text-foreground text-sm"
        />
        <button
          onClick={handleCopy}
          className="px-4 py-2 bg-primary hover:bg-primary/85 text-primary-foreground text-sm transition-colors shrink-0"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="case-label text-[8px] mt-3">
        {referralCount} reader{referralCount === 1 ? "" : "s"} recruited
      </p>
    </div>
  );
};
