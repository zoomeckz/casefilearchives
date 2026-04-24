import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icons } from "@/lib/icons";
import { AuthUser } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import {
  NAV_GROUPS,
  COMMUNITY_GROUP_KEY,
  NAV_CHROME_KEYS,
  type NavEntry,
} from "@/i18n/navKeys";

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

  // All labels resolve through the typed `NAV_GROUPS` registry so adding /
  // renaming a nav item happens in exactly one place. See `src/i18n/navKeys.ts`.
  const labelFor = (entry: NavEntry) => t(`nav.${entry.i18nKey}`);

  const navItems = NAV_GROUPS.primary.map((e) => ({ id: e.id, label: labelFor(e) }));
  const communityItems = NAV_GROUPS.community.map((e) => ({ id: e.id, label: labelFor(e) }));
  const extraItems: { id: string; label: string }[] = [];
  if (user) {
    extraItems.push(...NAV_GROUPS.authed.map((e) => ({ id: e.id, label: labelFor(e) })));
  }
  if (user?.isAdmin) {
    extraItems.push(...NAV_GROUPS.admin.map((e) => ({ id: e.id, label: labelFor(e) })));
  }

  const communityActive = communityItems.some(c => currentPage === c.id);

  return (
    /*
     * Force LTR on the navbar even when the document is RTL (Arabic).
     * Without this, flex children flip order so the language switcher /
     * notification bell / avatar end up on the LEFT instead of the right,
     * and the dropdown menus open from the wrong edge. The chrome is
     * intentionally locale-agnostic — only page CONTENT mirrors for RTL.
     */
    <nav dir="ltr" className="sticky top-0 z-50 bg-stone-950/95 backdrop-blur-sm border-b border-border/50">
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
                {t(`nav.${COMMUNITY_GROUP_KEY}`)}
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
                  title={t(`nav.${NAV_CHROME_KEYS.signOut}`)}
                >
                  <Icons.Logout className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-sm px-3.5 py-1.5 rounded-full bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 transition-colors"
              >
                {t(`nav.${NAV_CHROME_KEYS.signIn}`)}
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
            <div className="py-1 text-xs text-muted-foreground/50 uppercase tracking-wider">{t(`nav.${COMMUNITY_GROUP_KEY}`)}</div>
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
                  {t(`nav.${NAV_CHROME_KEYS.profile}`)}
                </button>
                <button
                  onClick={() => { onSignOut(); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 text-muted-foreground hover:text-destructive"
                >
                  {t(`nav.${NAV_CHROME_KEYS.signOut}`)}
                </button>
              </>
            ) : (
              <button
                onClick={() => { setShowAuthModal(true); setMobileMenuOpen(false); }}
                className="block w-full text-left py-2 text-muted-foreground hover:text-primary"
              >
                {t(`nav.${NAV_CHROME_KEYS.signIn}`)}
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
