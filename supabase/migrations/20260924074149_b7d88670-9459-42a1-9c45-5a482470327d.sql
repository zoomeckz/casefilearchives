ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.story_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.story_tags TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.story_tags TO authenticated;
GRANT ALL ON public.story_tags TO service_role;
ALTER TABLE public.story_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view tags" ON public.story_tags FOR SELECT USING (true);
CREATE POLICY "Admins manage tags" ON public.story_tags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.story_tags (name, is_favorite) VALUES
 ('NSFW', true), ('Nudity', true), ('Novel', true), ('War', true),
 ('Horror', false), ('Thriller', false), ('Sci-Fi', false), ('Romance', false), ('Drama', false), ('Comedy', false);