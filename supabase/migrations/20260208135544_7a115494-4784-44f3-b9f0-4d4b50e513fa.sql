
CREATE OR REPLACE FUNCTION public.increment_chapter_views(chapter_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE chapters SET views = views + 1 WHERE id = chapter_id;
$$;
