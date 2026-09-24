ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS story_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS forum_posts_story_id_idx ON public.forum_posts(story_id);
CREATE INDEX IF NOT EXISTS forum_replies_post_id_idx ON public.forum_replies(post_id);

DROP POLICY IF EXISTS "Forum replies are viewable by everyone" ON public.forum_replies;
CREATE POLICY "Replies on active posts are viewable by everyone" ON public.forum_replies
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.forum_posts p WHERE p.id = post_id AND p.is_archived = false)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);