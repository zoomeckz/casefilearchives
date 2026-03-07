import React, { useState, useEffect, useCallback } from "react";
import { Icons } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { dbFetch } from "@/lib/dbFetch";
import { AuthUser } from "@/hooks/useAuth";

interface MangaPanel {
  id: string;
  chapter_id: string;
  panel_number: number;
  title: string;
  caption: string | null;
  prompt: string;
  image_url: string | null;
  created_at: string;
}

interface PanelDefinition {
  panelNumber: number;
  title: string;
  caption: string;
  prompt: string;
}

// Chapter 1 panel definitions
const CHAPTER_1_PANELS: PanelDefinition[] = [
  {
    panelNumber: 1,
    title: "The Sentinel",
    caption: "Felm stands over a sleeping infant in a dark, storm-battered shed.",
    prompt:
      "A tall mysterious man with ocean-blue eyes (colored blue), dark windswept hair, scarred hands, and an ornate amulet stands protectively over a sleeping infant in a wooden crib. The setting is a dark storm-battered shed. Lightning flashes through cracks in the walls, dramatically illuminating his face. Rain hammers the walls. His blue eyes glow with selective blue color against the monochrome scene. Dramatic low angle shot.",
  },
  {
    panelNumber: 2,
    title: "Vicera Emerges",
    caption: "A spectral figure steps from the shadows — pale skin, piercing green eyes, fiery red hair.",
    prompt:
      "A woman with pale porcelain skin, piercing green eyes (colored green), and fiery red hair (colored deep red) steps from deep shadows into dim light. She wears tattered but once-elegant garments. Her presence is spectral and commanding. A man with blue eyes watches her from across the dark room. Split panel composition showing both characters locking eyes across the space. Green eyes glow with selective color.",
  },
  {
    panelNumber: 3,
    title: "The Exchange",
    caption: "Tension between two people with shared history — words sharp as blades.",
    prompt:
      "Close-up split panel of two faces in tense dialogue. Left: a man with sharp features, ocean-blue eyes (colored), a dry smirk. Right: a woman with green eyes (colored), an eye twitch of irritation, steely defiance. Dark atmospheric background. Speech bubbles implied. The tension between them is palpable. Extreme close-up cinematic framing.",
  },
  {
    panelNumber: 4,
    title: "The Gathering",
    caption: "Shadowed figures emerge and surround the infant. Scarred, rune-marked hands exposed to the cold.",
    prompt:
      "A dramatic wide shot of shadowed hooded figures emerging from darkness to surround a small wooden crib with an infant. The central man removes his gloves revealing scarred hands covered in glowing rune markings (selective pale blue glow). The infant laughs joyfully — the only warm element in the cold dark scene. Overhead dramatic lighting. Multiple mysterious silhouettes.",
  },
  {
    panelNumber: 5,
    title: "The Opal Eyes",
    caption: "Her eyes blaze with opal brilliance — a kaleidoscope of colors flooding the dark shed.",
    prompt:
      "The climactic moment: a woman with red hair places her finger gently on an infant's forehead. Her eyes explode with brilliant opal colors — rainbow iridescence (full selective color: purple, blue, green, gold, pink) radiating outward. The entire dark shed is flooded with prismatic light. Everything else frozen in silence. The most colorful panel — dramatic contrast against the dark manga style. Radial light burst composition.",
  },
  {
    panelNumber: 6,
    title: "The Aftermath",
    caption: "Colors fade. She staggers into darkness, drained. He holds the infant with wonder.",
    prompt:
      "The colors are fading. A woman staggers backward into shadows, visibly drained, her hair limp. A man with blue eyes holds the infant tenderly — the baby stares up at him with wonder and a faint smile. The group of hooded figures watches in heavy silence. Muted tones returning to black and white. Melancholic atmosphere. Wide establishing shot.",
  },
  {
    panelNumber: 7,
    title: "Legacy",
    caption: '"This child is and shall remain our legacy. Our hero, or our demon."',
    prompt:
      'Final dramatic panel: a man with ocean-blue eyes (colored blue) addresses a group of shadowed figures, his expression defeated yet resolute. Split into two sub-frames: top shows him speaking with determination, bottom is an extreme close-up of the infant\'s innocent face transitioning to the man\'s fierce determined blue eyes. Text overlay area for the quote: "Our hero, or our demon." Cinematic final page composition.',
  },
];

interface MangaPageProps {
  user: AuthUser | null;
  setCurrentPage: (page: string) => void;
}

export const MangaPage: React.FC<MangaPageProps> = ({ user, setCurrentPage }) => {
  const [panels, setPanels] = useState<MangaPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPanel, setGeneratingPanel] = useState<number | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const { toast } = useToast();

  // Get chapter 1 ID
  useEffect(() => {
    (async () => {
      const { data } = await dbFetch<any[]>("chapters", {
        select: "id",
        filters: "chapter_number=eq.1",
      });
      if (data && data.length > 0) {
        setChapterId(data[0].id);
      }
    })();
  }, []);

  // Load existing panels
  const fetchPanels = useCallback(async () => {
    if (!chapterId) return;
    setLoading(true);
    const { data } = await dbFetch<MangaPanel[]>("manga_panels", {
      select: "*",
      filters: `chapter_id=eq.${chapterId}`,
      order: "panel_number.asc",
    });
    if (data) setPanels(data);
    setLoading(false);
  }, [chapterId]);

  useEffect(() => {
    fetchPanels();
  }, [fetchPanels]);

  const getSession = () => {
    try {
      const stored = localStorage.getItem("app-auth-session");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const generatePanel = async (def: PanelDefinition) => {
    if (!chapterId) return;
    const session = getSession();
    if (!session?.access_token) {
      toast({ title: "Please sign in as admin to generate panels", variant: "destructive" });
      return;
    }

    setGeneratingPanel(def.panelNumber);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-manga-panel`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          chapterId,
          panelNumber: def.panelNumber,
          title: def.title,
          caption: def.caption,
          prompt: def.prompt,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Generation failed");
      }

      toast({ title: `Panel ${def.panelNumber} generated!` });
      await fetchPanels();
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingPanel(null);
    }
  };

  const existingPanel = (panelNumber: number) =>
    panels.find((p) => p.panel_number === panelNumber);

  const isAdmin = user?.isAdmin;

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setCurrentPage("chapters")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8"
        >
          <Icons.ChevronLeft />
          Back to chapters
        </button>

        <header className="mb-12 text-center">
          <span className="text-primary text-sm font-medium tracking-widest uppercase">
            Chapter 1
          </span>
          <h1 className="font-display text-4xl sm:text-5xl text-accent mt-2">
            A Grim Introduction
          </h1>
          <p className="text-muted-foreground mt-4 text-sm">
            Manga adaptation — scroll down to read
          </p>
        </header>

        <div className="space-y-8">
          {CHAPTER_1_PANELS.map((def) => {
            const existing = existingPanel(def.panelNumber);
            const isGenerating = generatingPanel === def.panelNumber;

            return (
              <Card
                key={def.panelNumber}
                className="overflow-hidden bg-card/50 border-border/50"
              >
                <CardContent className="p-0">
                  {/* Panel number & title */}
                  <div className="px-6 pt-5 pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-primary font-medium">
                          Panel {def.panelNumber}
                        </span>
                        <h3 className="font-display text-xl text-accent">
                          {def.title}
                        </h3>
                      </div>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant={existing ? "outline" : "default"}
                          onClick={() => generatePanel(def)}
                          disabled={isGenerating || generatingPanel !== null}
                        >
                          {isGenerating ? (
                            <>
                              <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                              Generating…
                            </>
                          ) : existing ? (
                            "Regenerate"
                          ) : (
                            "Generate"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Image area */}
                  <div className="w-full bg-muted/30 min-h-[300px] flex items-center justify-center">
                    {loading ? (
                      <Skeleton className="w-full h-[400px]" />
                    ) : existing?.image_url ? (
                      <img
                        src={existing.image_url}
                        alt={`Panel ${def.panelNumber}: ${def.title}`}
                        className="w-full h-auto"
                        loading="lazy"
                      />
                    ) : (
                      <div className="text-center py-16 px-6">
                        <Icons.Eye className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground/50 text-sm">
                          {isAdmin
                            ? 'Click "Generate" to create this panel'
                            : "Panel not yet generated"}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Caption */}
                  <div className="px-6 py-4">
                    <p className="text-muted-foreground text-sm italic">
                      {def.caption}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MangaPage;
