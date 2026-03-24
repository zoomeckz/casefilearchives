import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { AuthUser } from "@/hooks/useAuth";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);

  const navItems = [
    { id: "home", label: "Home" },
    { id: "chapters", label: "Chapters" },
    { id: "characters", label: "Codex" },
  ];

  const communityItems = [
    { id: "forum", label: "Forum" },
    { id: "leaderboard", label: "Leaderboard" },
    { id: "world", label: "World Atlas" },
  ];

  const extraItems: { id: string; label: string }[] = [];
  if (user) {
    extraItems.push({ id: "rewards", label: "Rewards" });
  }
  if (user?.isAdmin) {
    extraItems.push({ id: "admin", label: "Admin" });
  }

  const communityActive = communityItems.some(c => currentPage === c.id);

  return (
    <nav className="sticky top-0 z-50 bg-stone-950/95 backdrop-blur-sm border-b border-border/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">

          {/* Centered Nav */}
          <div className="hidden md:flex items-center justify-center gap-6 flex-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`text-sm transition-colors ${
                  currentPage === item.id
                    ? "text-primary"
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
                className={`text-sm transition-colors flex items-center gap-1 ${
                  communityActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Community
                <svg className={`w-3 h-3 transition-transform ${communityOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {communityOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-fade-in">
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
              )}
            </div>

            {extraItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`text-sm transition-colors ${
                  currentPage === item.id
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Right side - auth */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
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
                  title="Sign out"
                >
                  <Icons.Logout className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Register / Sign In
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
            <div className="py-1 text-xs text-muted-foreground/50 uppercase tracking-wider">Community</div>
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
                  Profile
                </button>
                <button
                  onClick={() => { onSignOut(); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 text-muted-foreground hover:text-destructive"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => { setShowAuthModal(true); setMobileMenuOpen(false); }}
                className="block w-full text-left py-2 text-muted-foreground hover:text-primary"
              >
                Register / Sign In
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
