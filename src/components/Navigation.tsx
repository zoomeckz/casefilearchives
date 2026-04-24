import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icons } from "@/lib/icons";
import { AuthUser } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

interface NavigationProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  user: AuthUser | null;
  setShowAuthModal: (show: boolean) => void;
  onSignOut: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentPage,
  setCurrentPage,
  user,
  setShowAuthModal,
  onSignOut,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);

  const navItems = [
    { id: "home", label: t("nav.home") },
    { id: "chapters", label: t("nav.chapters") },
    { id: "characters", label: t("nav.codex") },
  ];

  const communityItems = [
    { id: "forum", label: t("nav.forum") },
    { id: "leaderboard", label: t("nav.leaderboard") },
    { id: "world", label: t("nav.worldAtlas") },
  ];

  const extraItems: { id: string; label: string }[] = [];
  if (user) {
    extraItems.push({ id: "rewards", label: t("nav.rewards") });
  }
  if (user?.isAdmin) {
    extraItems.push({ id: "admin", label: t("nav.admin") });
  }

  const communityActive = communityItems.some(c => currentPage === c.id);

  return (
    <nav className="sticky top-0 z-50 bg-stone-950/95 backdrop-blur-sm border-b border-border/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">

          {/* Mobile sigil — replaces a naked hamburger with a small brand mark */}
          <button
            onClick={() => setCurrentPage("home")}
            className="md:hidden font-display text-accent text-xl tracking-[0.2em] leading-none"
            style={{ fontFamily: "'Cinzel Decorative', serif" }}
            aria-label="Sedorium home"
          >
            S
          </button>

          {/* Centered Nav */}
          <div className="hidden md:flex items-center justify-center gap-6 flex-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`relative text-sm transition-colors pb-1 ${
                  currentPage === item.id
                    ? "text-primary nav-active-underline"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}

            {/* Community dropdown */}
            <div className="relative">
              <button
                onClick={() => setCommunityOpen(!communityOpen)}
                onBlur={() => setTimeout(() => setCommunityOpen(false), 200)}
                className={`relative text-sm transition-colors flex items-center gap-1 pb-1 ${
                  communityActive ? "text-primary nav-active-underline" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("nav.community")}
                <svg className={`w-3 h-3 transition-transform ${communityOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div
                className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 w-44 bg-card border border-border rounded-lg shadow-xl overflow-hidden transition-all duration-200 ease-out origin-top ${
                  communityOpen
                    ? "opacity-100 scale-y-100 pointer-events-auto"
                    : "opacity-0 scale-y-90 pointer-events-none"
                }`}
              >
                  {communityItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setCurrentPage(item.id); setCommunityOpen(false); }}
                      className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        currentPage === item.id ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
            </div>

            {extraItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`relative text-sm transition-colors pb-1 ${
                  currentPage === item.id
                    ? "text-primary nav-active-underline"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Right side - auth */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageSwitcher variant="desktop" />
            {user ? (
              <>
                <NotificationBell user={user} onNavigate={(path) => navigate(path)} />
                <button
                  onClick={() => setCurrentPage("profile")}
                  className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-destructive flex items-center justify-center text-primary-foreground text-xs font-medium overflow-hidden"
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    user.name?.charAt(0).toUpperCase()
                  )}
                </button>
                <button
                  onClick={onSignOut}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={t("nav.signOut")}
                >
                  <Icons.Logout className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-sm px-3.5 py-1.5 rounded-full bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 transition-colors"
              >
                {t("nav.signIn")}
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-muted-foreground hover:text-foreground"
          >
            {mobileMenuOpen ? <Icons.Close /> : <Icons.Menu />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border/50 animate-fade-in">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setCurrentPage(item.id); setMobileMenuOpen(false); }}
                className={`block w-full text-left py-2 transition-colors ${
                  currentPage === item.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="py-1 text-xs text-muted-foreground/50 uppercase tracking-wider">{t("nav.community")}</div>
            {communityItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setCurrentPage(item.id); setMobileMenuOpen(false); }}
                className={`block w-full text-left py-2 pl-3 transition-colors ${
                  currentPage === item.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
            {extraItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setCurrentPage(item.id); setMobileMenuOpen(false); }}
                className={`block w-full text-left py-2 transition-colors ${
                  currentPage === item.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
            {user ? (
              <>
                <button
                  onClick={() => { setCurrentPage("profile"); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 text-muted-foreground hover:text-foreground"
                >
                  {t("nav.profile")}
                </button>
                <button
                  onClick={() => { onSignOut(); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 text-muted-foreground hover:text-destructive"
                >
                  {t("nav.signOut")}
                </button>
              </>
            ) : (
              <button
                onClick={() => { setShowAuthModal(true); setMobileMenuOpen(false); }}
                className="block w-full text-left py-2 text-muted-foreground hover:text-primary"
              >
                {t("nav.signIn")}
              </button>
            )}
            <LanguageSwitcher variant="mobile" />
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
