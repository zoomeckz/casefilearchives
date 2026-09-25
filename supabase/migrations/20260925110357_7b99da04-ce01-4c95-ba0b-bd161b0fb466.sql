DROP POLICY "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Signed-in users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT id, user_id, name, avatar_url, bio, instagram, tiktok, website, selected_frame, created_at
FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;

DROP POLICY "Anyone can view poll votes" ON public.poll_votes;
CREATE POLICY "Signed-in users can view poll votes" ON public.poll_votes FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.get_poll_counts(_poll_id uuid)
RETURNS TABLE(option_id uuid, votes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT option_id, count(*)::bigint AS votes
  FROM public.poll_votes
  WHERE poll_id = _poll_id
  GROUP BY option_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_poll_counts(uuid) TO anon, authenticated;