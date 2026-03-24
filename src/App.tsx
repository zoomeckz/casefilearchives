import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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

export default App;
