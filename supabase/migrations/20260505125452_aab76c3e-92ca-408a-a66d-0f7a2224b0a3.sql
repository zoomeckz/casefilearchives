
-- Track chapter views per IP for dedup
CREATE TABLE IF NOT EXISTS public.chapter_view_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_chapter_view_ips_chapter ON public.chapter_view_ips(chapter_id);

ALTER TABLE public.chapter_view_ips ENABLE ROW LEVEL SECURITY;

-- Only admins can read; writes happen via service role from edge function
CREATE POLICY "Admins can read chapter view ips"
  ON public.chapter_view_ips FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Reset all chapter view counts to zero
UPDATE public.chapters SET views = 0;
