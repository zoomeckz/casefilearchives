-- Create manga_panels table to track generated panels
CREATE TABLE public.manga_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE NOT NULL,
  panel_number integer NOT NULL,
  title text NOT NULL,
  caption text,
  prompt text NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(chapter_id, panel_number)
);

ALTER TABLE public.manga_panels ENABLE ROW LEVEL SECURITY;

-- Everyone can view panels
CREATE POLICY "Anyone can view manga panels"
ON public.manga_panels FOR SELECT
TO anon, authenticated
USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage manga panels"
ON public.manga_panels FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for manga panels
INSERT INTO storage.buckets (id, name, public)
VALUES ('manga-panels', 'manga-panels', true);

-- Allow public read access
CREATE POLICY "Public read access for manga panels"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'manga-panels');

-- Allow admin upload
CREATE POLICY "Admin upload to manga panels"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'manga-panels' AND public.has_role(auth.uid(), 'admin'));

-- Allow admin delete from manga panels
CREATE POLICY "Admin delete from manga panels"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'manga-panels' AND public.has_role(auth.uid(), 'admin'));