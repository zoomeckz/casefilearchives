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

  const navItems = [
    { id: "home", label: "Home", icon: Icons.Home },
    { id: "chapters", label: "Chapters", icon: Icons.Book },
    { id: "characters", label: "Codex", icon: Icons.Users },
    { id: "forum", label: "Forum", icon: Icons.Message },
  ];

  if (user?.isAdmin) {
    navItems.push({ id: "admin", label: "Admin", icon: Icons.Settings });
  }

  return (
    <nav className="sticky top-0 z-50 bg-stone-950/95 backdrop-blur-sm border-b border-border/50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          {/* Spacer for balance */}
          <div className="w-10 md:hidden" />

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
          </div>

          {/* Right side - auth */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <button
                  onClick={() => setCurrentPage("profile")}
                  className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-destructive flex items-center justify-center text-primary-foreground text-xs font-medium overflow-hidden"
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
                onClick={() => {
                  setCurrentPage(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`block w-full text-left py-2 transition-colors ${
                  currentPage === item.id
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
            {user ? (
              <>
                <button
                  onClick={() => {
                    setCurrentPage("profile");
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left py-2 text-muted-foreground hover:text-foreground"
                >
                  Profile
                </button>
                <button
                  onClick={() => {
                    onSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left py-2 text-muted-foreground hover:text-destructive"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setShowAuthModal(true);
                  setMobileMenuOpen(false);
                }}
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
