

## Chapter 1: "A Grim Introduction" — Scene Breakdown for Image Generation

Here are the key scenes from Chapter 1, broken down into panels that would work well as manga-style illustrations:

---

### Panel 1 — "The Sentinel"
Felm stands over a sleeping infant in a dark, storm-battered shed. Lightning flashes through cracks, illuminating his ocean-blue eyes, dark windswept hair, scarred hands, and ornate amulet. Rain hammers the walls.

### Panel 2 — "Vicera Emerges"
Vicera steps from the shadows — pale porcelain skin, piercing green eyes, fiery red hair, tattered garments. A spectral, commanding presence. The two lock eyes across the dim room.

### Panel 3 — "The Exchange"
Close-up dialogue panel: Felm's dry remark about her appearance, Vicera's eye twitch and steely defiance. Tension between two people with shared history.

### Panel 4 — "The Gathering"
Felm beckons shadowed figures to emerge and surround the infant. He removes his gloves, exposing scarred, rune-marked hands to the cold. The infant laughs — the only warmth in the room.

### Panel 5 — "The Opal Eyes"
The climactic moment: Vicera places her finger on the infant's forehead. Her eyes blaze with opal brilliance, a kaleidoscope of colors flooding the dark shed. Everything goes silent — rain, wind, all sound ceases.

### Panel 6 — "The Aftermath"
Colors fade. Vicera staggers into darkness, drained. Felm holds the infant, who stares back with wonder and a faint smile. The group watches in heavy silence.

### Panel 7 — "Legacy"
Felm addresses the group, defeated yet resolute: *"This child is and shall remain our legacy. Our hero, or our demon."* Close-up on the infant's face, then Felm's determined eyes.

---

### Implementation Plan

1. **Create an edge function** (`generate-manga-panel`) that calls the Lovable AI image generation endpoint (`google/gemini-2.5-flash-image`) with detailed scene prompts in a dark manga art style
2. **Build a UI page** (`/manga` or a tab within the reader) where each panel is displayed in a vertical manga scroll layout with scene captions
3. **Store generated images** in a storage bucket so they only need to be generated once
4. **Add a "Generate" button** per panel so you can review and regenerate individual panels if needed

The style prompt prefix for all panels would emphasize: *dark atmospheric manga, high contrast black and white with selective color (blue for Felm's eyes, green for Vicera's, opal rainbow for the gift scene), detailed ink linework, cinematic composition.*

