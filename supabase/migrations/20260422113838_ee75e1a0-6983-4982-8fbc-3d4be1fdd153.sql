ALTER TABLE public.glossary
  ADD COLUMN IF NOT EXISTS first_chapter integer;

CREATE INDEX IF NOT EXISTS idx_glossary_first_chapter
  ON public.glossary(first_chapter);