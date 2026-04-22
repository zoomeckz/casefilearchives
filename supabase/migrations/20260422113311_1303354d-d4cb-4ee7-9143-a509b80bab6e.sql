-- Hide scheduled future chapters from the public
DROP POLICY IF EXISTS "Chapters are viewable by everyone" ON public.chapters;

CREATE POLICY "Released chapters viewable by everyone"
  ON public.chapters
  FOR SELECT
  TO anon, authenticated
  USING (
    scheduled_at IS NULL
    OR scheduled_at <= now()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Lock fan-art overwrites to the original uploader
CREATE POLICY "Users can update their own fan art files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fan-art'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'fan-art'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );