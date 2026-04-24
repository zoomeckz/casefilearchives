import { useEffect } from "react";
import Lenis from "lenis";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SectionHeaderStory from "./pages/SectionHeaderStory";
import { useDynamicSeo } from "./hooks/useDynamicSeo";
import { useTranslation } from "react-i18next";
import {
  detectLanguageFromPath,
  SUPPORTED_LANGUAGES,
  NON_DEFAULT_LANGUAGES,
  withLanguagePrefix,
  stripLanguagePrefix,
} from "./i18n";

const queryClient = new QueryClient();

const DynamicSeo = () => {
  useDynamicSeo();
  return null;
};

/**
 * Watches the URL language prefix (e.g. `/bg/...`, `/es/...`) and keeps i18n +
 * the `<html lang>` attribute in sync. Also writes one `hreflang` alternate
 * link for every supported language so adding a new locale is just one line
 * in `src/i18n/index.ts` — no edits here required.
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
    // RTL languages need `dir="rtl"` so the entire layout (nav, footer, text
    // alignment, scrollbar position) flips. Add a language code here when the
    // i18n config gains another RTL locale (e.g. "he", "fa", "ur").
    const RTL_LANGUAGES: ReadonlySet<string> = new Set(["ar"]);
    document.documentElement.setAttribute("dir", RTL_LANGUAGES.has(lang) ? "rtl" : "ltr");

    // hreflang alternates — emit one per supported language plus x-default.
    // We rewrite-by-replacement (instead of append) so old links from previous
    // renders are kept fresh, and remove any stray ones for languages that
    // are no longer in SUPPORTED_LANGUAGES.
    const origin = window.location.origin;
    const cleanPath = stripLanguagePrefix(location.pathname);
    const wanted = new Map<string, string>();
    for (const lang of SUPPORTED_LANGUAGES) {
      wanted.set(lang, `${origin}${withLanguagePrefix(cleanPath, lang)}`);
    }
    wanted.set("x-default", `${origin}${cleanPath}`);

    // Remove any alternates that don't belong (stale or removed languages).
    document.head
      .querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')
      .forEach((el) => {
        if (!wanted.has(el.hreflang)) el.remove();
      });

    wanted.forEach((href, hreflang) => {
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
    });
  }, [location.pathname, i18n]);

  return null;
};

/**
 * Single source of truth for the app's URL shape. Adding a localized variant
 * for every page used to require editing dozens of lines in `<Routes>`. Now we
 * just iterate non-default languages and prepend their prefix at render time,
 * so a brand-new language drops in via `SUPPORTED_LANGUAGES` only.
 */
const APP_ROUTES: { path: string }[] = [
  { path: "/" },
  { path: "/chapters" },
  { path: "/chapters/:chapterNumber" },
  { path: "/characters" },
  { path: "/forum" },
  { path: "/forum/:postId" },
  { path: "/rewards" },
  { path: "/user/:userId" },
  { path: "/profile" },
  { path: "/admin" },
  { path: "/manga" },
  { path: "/about" },
  { path: "/leaderboard" },
  { path: "/world" },
];

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
          {/* Default-language routes (no prefix). */}
          {APP_ROUTES.map((r) => (
            <Route key={r.path} path={r.path} element={<Index />} />
          ))}
          {/* Localized variants — one set per non-default language, generated
              automatically. To add e.g. Spanish: append "es" to SUPPORTED_LANGUAGES
              in src/i18n/index.ts and the routes appear here for free. */}
          {NON_DEFAULT_LANGUAGES.flatMap((lang) =>
            APP_ROUTES.map((r) => {
              const path = r.path === "/" ? `/${lang}` : `/${lang}${r.path}`;
              return <Route key={path} path={path} element={<Index />} />;
            }),
          )}
          {/* Dev-only visual story route for <SectionHeader/>. Not added to
              APP_ROUTES because it intentionally bypasses navigation, i18n,
              and the SPA shell — it's a flat preview surface. */}
          <Route path="/dev/section-header" element={<SectionHeaderStory />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
