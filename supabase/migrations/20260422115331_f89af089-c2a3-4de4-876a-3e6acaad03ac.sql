ALTER TABLE public.glossary ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS glossary_aliases_gin_idx ON public.glossary USING GIN (aliases);