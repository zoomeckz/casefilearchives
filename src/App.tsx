import { useEffect } from "react";
import Lenis from "lenis";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useDynamicSeo } from "./hooks/useDynamicSeo";
import { useTranslation } from "react-i18next";
import { detectLanguageFromPath, SUPPORTED_LANGUAGES } from "./i18n";

const queryClient = new QueryClient();

const DynamicSeo = () => {
  useDynamicSeo();
  return null;
};

/**
 * Watches the URL prefix (`/bg/...`) and keeps i18n + the <html lang> attribute
 * in sync. Also writes hreflang alternate tags for SEO.
 */
const LanguageSync = () => {
  const location = useLocation();
  const { i18n } = useTranslation();

  useEffect(() => {
    const lang = detectLanguageFromPath(location.pathname);
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
    document.documentElement.setAttribute("lang", lang);

    // hreflang alternates — every page advertises both variants so Google can pair them.
    const origin = window.location.origin;
    const cleanPath = location.pathname.replace(/^\/(bg)(?=\/|$)/, "") || "/";
    const ensureLink = (hreflang: string, href: string) => {
      let el = document.head.querySelector<HTMLLinkElement>(
        `link[rel="alternate"][hreflang="${hreflang}"]`,
      );
      if (!el) {
        el = document.createElement("link");
        el.rel = "alternate";
        el.hreflang = hreflang;
        document.head.appendChild(el);
      }
      el.href = href;
    };
    ensureLink("en", `${origin}${cleanPath}`);
    ensureLink("bg", `${origin}/bg${cleanPath === "/" ? "" : cleanPath}`);
    ensureLink("x-default", `${origin}${cleanPath}`);
  }, [location.pathname, i18n]);

  return null;
};

const App = () => {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    // Expose so individual pages (e.g. ReaderPage's back-to-top button) can drive
    // the smooth scroller instead of being intercepted mid-way.
    (window as any).__lenis = lenis;

    let rafId = 0;
    function raf(time: number) {
      // When the tab is hidden, skip stepping Lenis. Otherwise the first
      // frame after returning gets a huge time delta which makes Lenis
      // "snap" the page and temporarily hijack wheel events on nested
      // scroll containers (e.g. the Codex sidebar can scroll down but
      // not up until the snap settles).
      if (!document.hidden) {
        lenis.raf(time);
      }
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    // Stop any in-flight smooth scroll when leaving the tab so we don't
    // resume mid-animation with stale momentum on return.
    const handleVisibility = () => {
      if (document.hidden) {
        lenis.stop();
      } else {
        lenis.start();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      cancelAnimationFrame(rafId);
      lenis.destroy();
      delete (window as any).__lenis;
    };
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DynamicSeo />
        <LanguageSync />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/chapters" element={<Index />} />
          <Route path="/chapters/:chapterNumber" element={<Index />} />
          <Route path="/characters" element={<Index />} />
          <Route path="/forum" element={<Index />} />
          <Route path="/forum/:postId" element={<Index />} />
          <Route path="/rewards" element={<Index />} />
          <Route path="/user/:userId" element={<Index />} />
          <Route path="/profile" element={<Index />} />
          <Route path="/admin" element={<Index />} />
          <Route path="/manga" element={<Index />} />
          <Route path="/about" element={<Index />} />
          <Route path="/leaderboard" element={<Index />} />
          <Route path="/world" element={<Index />} />
          {/* Bulgarian — same components, /bg/ prefix for SEO */}
          <Route path="/bg" element={<Index />} />
          <Route path="/bg/chapters" element={<Index />} />
          <Route path="/bg/chapters/:chapterNumber" element={<Index />} />
          <Route path="/bg/characters" element={<Index />} />
          <Route path="/bg/forum" element={<Index />} />
          <Route path="/bg/forum/:postId" element={<Index />} />
          <Route path="/bg/rewards" element={<Index />} />
          <Route path="/bg/user/:userId" element={<Index />} />
          <Route path="/bg/profile" element={<Index />} />
          <Route path="/bg/admin" element={<Index />} />
          <Route path="/bg/manga" element={<Index />} />
          <Route path="/bg/about" element={<Index />} />
          <Route path="/bg/leaderboard" element={<Index />} />
          <Route path="/bg/world" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
