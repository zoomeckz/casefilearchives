
-- 1. Notifications: only the owner can insert
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert their own notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. Saved quotes: scope reads to owner only
DROP POLICY IF EXISTS "Anyone can view saved quotes" ON public.saved_quotes;
CREATE POLICY "Owners can view their own saved quotes"
  ON public.saved_quotes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Storage: tighten fan-art INSERT to require user-id folder prefix
DROP POLICY IF EXISTS "Authenticated users can upload fan art" ON storage.objects;
CREATE POLICY "Users can upload fan art under own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fan-art'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 4. Storage SELECT: restrict listing to admins for each public bucket.
-- Public file access via /storage/v1/object/public/<bucket>/<path> still works
-- because the public route bypasses these RLS SELECT checks. These policies
-- only gate the `list` / authenticated `get` API which is what the linter flags.

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Admins can list avatars"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Anyone can view fan art files" ON storage.objects;
CREATE POLICY "Admins can list fan art"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fan-art'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Public read access for manga panels" ON storage.objects;
CREATE POLICY "Admins can list manga panels"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'manga-panels'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;
CREATE POLICY "Admins can list images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'images'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
