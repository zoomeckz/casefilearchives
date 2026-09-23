ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

UPDATE public.chapters
SET is_archived = true,
    scheduled_at = NULL
WHERE is_archived = false;

UPDATE public.forum_posts
SET is_archived = true
WHERE is_archived = false;

DROP POLICY IF EXISTS "Released chapters viewable by everyone" ON public.chapters;
CREATE POLICY "Public can view active released chapters"
ON public.chapters
FOR SELECT
TO anon, authenticated
USING (
  is_archived = false
  AND published_at <= now()
  AND (scheduled_at IS NULL OR scheduled_at <= now())
);

CREATE POLICY "Admins can view archived chapters"
ON public.chapters
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Forum posts are viewable by everyone" ON public.forum_posts;
CREATE POLICY "Public can view active forum posts"
ON public.forum_posts
FOR SELECT
TO anon, authenticated
USING (is_archived = false);

CREATE POLICY "Admins can view archived forum posts"
ON public.forum_posts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));