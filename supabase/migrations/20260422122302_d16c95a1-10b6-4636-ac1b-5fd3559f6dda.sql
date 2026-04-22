
CREATE POLICY "Public can read avatars"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Public can read fan art"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'fan-art');

CREATE POLICY "Public can read manga panels"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'manga-panels');

CREATE POLICY "Public can read images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'images');
