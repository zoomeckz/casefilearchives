-- Allow admins to update any forum post
CREATE POLICY "Admins can update any forum post"
ON public.forum_posts
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete any forum post
CREATE POLICY "Admins can delete any forum post"
ON public.forum_posts
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update any forum reply
CREATE POLICY "Admins can update any forum reply"
ON public.forum_replies
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete any forum reply
CREATE POLICY "Admins can delete any forum reply"
ON public.forum_replies
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));