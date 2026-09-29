DROP VIEW IF EXISTS public.public_profiles;
CREATE OR REPLACE FUNCTION public.get_public_profiles(_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE(user_id uuid, name text, avatar_url text, selected_frame text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.name, p.avatar_url, p.selected_frame FROM public.profiles p
  WHERE _user_ids IS NULL OR p.user_id = ANY(_user_ids)
$$;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO anon, authenticated;