# Update the admin panel for standalone stories

## Changes
- Replace chapter-specific labels and number-based sorting in the current Stories dashboard, list, drafts, downloads, and analytics.
- Show current stories by title and publication date, with story-focused views and filters.
- Keep chapter numbers and chapter terminology only in the Legacy area and legacy editor flow.
- Ensure current analytics exclude archived legacy chapters, then verify the admin screens and build.

## Technical details
- Preserve the existing database fields for compatibility; hide internal chapter numbering from the new-story interface.
- Pass an explicit legacy/current mode to shared tables or editors where needed so their labels remain correct.
