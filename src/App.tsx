import { useEffect } from "react";
import Lenis from "lenis";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useDynamicSeo } from "./hooks/useDynamicSeo";

const queryClient = new QueryClient();

const DynamicSeo = () => {
  useDynamicSeo();
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
