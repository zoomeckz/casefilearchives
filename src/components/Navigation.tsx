import React, { useState } from "react";
import { Icons } from "@/lib/icons";

interface NavigationProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  user: any | null;
  setShowAuthModal: (show: boolean) => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentPage,
  setCurrentPage,
  user,
  setShowAuthModal,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: "home", label: "Home", icon: Icons.Home },
    { id: "stories", label: "Stories", icon: Icons.Book },
    { id: "characters", label: "Characters", icon: Icons.Users },
    { id: "forum", label: "Forum", icon: Icons.Message },
  ];

  if (user) {
    navItems.push({ id: "profile", label: "Profile", icon: Icons.Users });
  }

  if (user?.isAdmin) {
    navItems.push({ id: "admin", label: "Admin", icon: Icons.Settings });
  }

  return (
    <nav className="sticky top-0 z-50 bg-stone-950/95 backdrop-blur-sm border-b border-stone-800/50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          <button
            onClick={() => setCurrentPage("home")}
            className="font-display text-lg text-amber-100 hover:text-amber-300 transition-colors"
          >
            Sedorium
          </button>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`text-sm transition-colors ${
                  currentPage === item.id
                    ? "text-sky-400"
                    : "text-stone-500 hover:text-stone-200"
                }`}
              >
                {item.label}
              </button>
            ))}

            {user ? (
              <button
                onClick={() => setCurrentPage("profile")}
                className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-600 to-maroon-600 flex items-center justify-center text-white text-xs font-medium"
              >
                {user.name?.charAt(0).toUpperCase()}
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-sm text-stone-500 hover:text-sky-400 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-stone-400 hover:text-stone-200"
          >
            {mobileMenuOpen ? <Icons.Close /> : <Icons.Menu />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-stone-800/50 animate-fade-in">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentPage(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`block w-full text-left py-2 transition-colors ${
                  currentPage === item.id
                    ? "text-sky-400"
                    : "text-stone-500 hover:text-stone-200"
                }`}
              >
                {item.label}
              </button>
            ))}
            {!user && (
              <button
                onClick={() => {
                  setShowAuthModal(true);
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left py-2 text-stone-500 hover:text-sky-400"
              >
                Sign In
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
