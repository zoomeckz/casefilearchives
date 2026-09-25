import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icons } from "@/lib/icons";
import { AuthUser } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  NAV_GROUPS,
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

  // All labels resolve through the typed `NAV_GROUPS` registry so adding /
  // renaming a nav item happens in exactly one place. See `src/i18n/navKeys.ts`.
  const labelFor = (entry: NavEntry) => t(`nav.${entry.i18nKey}`);

  const navItems = NAV_GROUPS.primary.map((e) => ({ id: e.id, label: labelFor(e) }));
  const extraItems: { id: string; label: string }[] = [];
  if (user) {
    extraItems.push(...NAV_GROUPS.authed.map((e) => ({ id: e.id, label: labelFor(e) })));
  }
  if (user?.isAdmin) {
    extraItems.push(...NAV_GROUPS.admin.map((e) => ({ id: e.id, label: labelFor(e) })));
  }

  return (
    /*
     * Force LTR on the navbar even when the document is RTL (Arabic).
     * Without this, flex children flip order so the language switcher /
     * notification bell / avatar end up on the LEFT instead of the right,
     * and the dropdown menus open from the wrong edge. The chrome is
     * intentionally locale-agnostic — only page CONTENT mirrors for RTL.
     */
    <nav dir="ltr" className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          {/* Mobile sigil — replaces a naked hamburger with a small brand mark */}
          <button
            onClick={() => setCurrentPage("home")}
            className="brand-title md:hidden text-foreground text-xl leading-none"
            aria-label="Case Files home"
          >
            CF
          </button>

          {/* Centered Nav */}
           <button onClick={() => setCurrentPage("home")} className="hidden md:block brand-title text-xl text-foreground mr-10">CASE FILES</button>
          <div className="hidden md:flex items-center gap-7 flex-1">
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

            <LanguageSwitcher variant="mobile" />
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
            <LanguageSwitcher />
            <ThemeToggle />
            {user ? (
              <>
                <NotificationBell user={user} onNavigate={(path) => navigate(path)} />
                <button
                  onClick={() => setCurrentPage("profile")}
                  aria-label="Open profile"
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
            className="md:hidden text-muted-foreground hover:text-foreground ml-auto mr-3"
          >
            {mobileMenuOpen ? <Icons.Close /> : <Icons.Menu />}
          </button>
          <div className="md:hidden"><ThemeToggle /></div>
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
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
