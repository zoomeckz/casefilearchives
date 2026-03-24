
-- Add updated_at to comments table
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Add updated_at to forum_replies table
ALTER TABLE public.forum_replies ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Allow users to update their own comments
CREATE POLICY "Users can update their own comments"
ON public.comments
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own forum replies
CREATE POLICY "Users can update their own replies"
ON public.forum_replies
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
