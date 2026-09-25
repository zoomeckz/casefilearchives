import { useEffect } from "react";
import Lenis from "lenis";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import i18n, {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LOCALE_TAGS,
  LANGUAGE_STORAGE_KEY,
  detectLanguageFromPath,
  stripLanguagePrefix,
  withLanguagePrefix,
  type SupportedLanguage,
} from "./i18n";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SectionHeaderStory from "./pages/SectionHeaderStory";
import { useDynamicSeo } from "./hooks/useDynamicSeo";

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
  const navigate = useNavigate();

  useEffect(() => {
    const seg = location.pathname.split("/").filter(Boolean)[0];
    const hasPrefix = (SUPPORTED_LANGUAGES as readonly string[]).includes(seg ?? "");
    const isAdmin = stripLanguagePrefix(location.pathname).startsWith("/admin");

    let lang: SupportedLanguage = detectLanguageFromPath(location.pathname);
    if (hasPrefix) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } else if (!isAdmin) {
      // Un-prefixed URL: keep the reader in their remembered language, or on
      // a first visit pick up the browser/system language if we support it.
      let stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as SupportedLanguage | null;
      if (!stored) {
        const sys = (navigator.languages ?? [navigator.language])
          .map((l) => l.toLowerCase().split("-")[0])
          .find((l) => (SUPPORTED_LANGUAGES as readonly string[]).includes(l)) as SupportedLanguage | undefined;
        stored = sys ?? DEFAULT_LANGUAGE;
        localStorage.setItem(LANGUAGE_STORAGE_KEY, stored);
      }
      if ((SUPPORTED_LANGUAGES as readonly string[]).includes(stored) && stored !== DEFAULT_LANGUAGE) {
        navigate(withLanguagePrefix(location.pathname, stored) + location.search + location.hash, { replace: true });
        return;
      }
      lang = DEFAULT_LANGUAGE;
    }

    if (i18n.language !== lang) i18n.changeLanguage(lang);
    document.documentElement.setAttribute("lang", LOCALE_TAGS[lang].split("-")[0]);
    document.documentElement.setAttribute("dir", "ltr");

    const origin = window.location.origin;
    const clean = stripLanguagePrefix(location.pathname);
    document.head
      .querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')
      .forEach((el) => el.remove());
    const add = (hreflang: string, href: string) => {
      const el = document.createElement("link");
      el.rel = "alternate";
      el.hreflang = hreflang;
      el.href = href;
      document.head.appendChild(el);
    };
    SUPPORTED_LANGUAGES.forEach((l) => add(l, `${origin}${withLanguagePrefix(clean, l)}`));
    add("x-default", `${origin}${clean}`);
  }, [location.pathname, location.search, location.hash, navigate]);

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
  { path: "/user/:userId" },
  { path: "/profile" },
  { path: "/admin" },
  { path: "/about" },
  { path: "/forum" },
  { path: "/forum/:postId" },
];

const LEGACY_ROUTES = ["/characters", "/manga", "/leaderboard", "/world", "/rewards"];

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
          {/* Language-prefixed routes: /en/..., /bg/..., one set per language. */}
          {SUPPORTED_LANGUAGES.flatMap((lang) =>
            APP_ROUTES.map((r) => (
              <Route
                key={`${lang}${r.path}`}
                path={r.path === "/" ? `/${lang}` : `/${lang}${r.path}`}
                element={<Index />}
              />
            )),
          )}
          {LEGACY_ROUTES.map((path) => (
            <Route key={path} path={path} element={<Navigate to="/" replace />} />
          ))}
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
