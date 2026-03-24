import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/hooks/useAuth";

interface ReferralSectionProps {
  user: AuthUser;
}

export const ReferralSection: React.FC<ReferralSectionProps> = ({ user }) => {
  const [code, setCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Check if user has a referral code
      const { data } = await supabase
        .from("referrals")
        .select("code")
        .eq("referrer_id", user.id)
        .limit(1);

      if (data && data.length > 0) {
        setCode(data[0].code);
      } else {
        // Generate one
        const newCode = `${user.name.slice(0, 4).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await supabase.from("referrals").insert({ referrer_id: user.id, code: newCode });
        setCode(newCode);
      }

      // Count successful referrals
      const { count } = await supabase
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_id", user.id)
        .not("referred_id", "is", null);
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
    <div className="p-6 bg-card/30 rounded-xl border border-border">
      <h3 className="font-display text-lg text-accent mb-2">🔗 Invite Friends</h3>
      <p className="text-muted-foreground text-sm mb-4">
        Share your referral link — earn XP when friends join and start reading!
      </p>
      <div className="flex items-center gap-2">
        <input
          value={shareUrl}
          readOnly
          className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm"
        />
        <button
          onClick={handleCopy}
          className="px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg text-sm font-medium transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {referralCount > 0 && (
        <p className="text-muted-foreground text-xs mt-3">
          🎉 {referralCount} friend{referralCount !== 1 ? "s" : ""} joined through your link!
        </p>
      )}
    </div>
  );
};
