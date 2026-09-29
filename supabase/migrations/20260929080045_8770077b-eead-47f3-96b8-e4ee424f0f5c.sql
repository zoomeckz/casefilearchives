DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Signed-in users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.profiles FROM anon;
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT user_id, name, avatar_url, selected_frame FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;