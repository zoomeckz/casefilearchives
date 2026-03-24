
-- Saved quotes table (public, visible to everyone)
CREATE TABLE public.saved_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  quote_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view saved quotes"
  ON public.saved_quotes FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can insert their own quotes"
  ON public.saved_quotes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quotes"
  ON public.saved_quotes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
