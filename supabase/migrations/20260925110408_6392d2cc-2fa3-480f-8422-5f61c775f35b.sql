DROP VIEW IF EXISTS public.public_profiles;
DROP FUNCTION IF EXISTS public.get_poll_counts(uuid);

DROP POLICY "Signed-in users can view profiles" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY "Signed-in users can view poll votes" ON public.poll_votes;
CREATE POLICY "Anyone can view poll votes" ON public.poll_votes FOR SELECT USING (true);