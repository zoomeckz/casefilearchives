
-- Fix all RESTRICTIVE SELECT policies to be PERMISSIVE
-- The problem: all policies were created as RESTRICTIVE, but PostgreSQL requires
-- at least one PERMISSIVE policy to grant access. With only RESTRICTIVE policies,
-- no rows are ever returned.

-- CHAPTERS: Drop and recreate all policies as PERMISSIVE
DROP POLICY IF EXISTS "Chapters are viewable by everyone" ON public.chapters;
CREATE POLICY "Chapters are viewable by everyone" ON public.chapters FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert chapters" ON public.chapters;
CREATE POLICY "Admins can insert chapters" ON public.chapters FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update chapters" ON public.chapters;
CREATE POLICY "Admins can update chapters" ON public.chapters FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete chapters" ON public.chapters;
CREATE POLICY "Admins can delete chapters" ON public.chapters FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- FORUM_POSTS
DROP POLICY IF EXISTS "Forum posts are viewable by everyone" ON public.forum_posts;
CREATE POLICY "Forum posts are viewable by everyone" ON public.forum_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own posts" ON public.forum_posts;
CREATE POLICY "Users can insert their own posts" ON public.forum_posts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own posts" ON public.forum_posts;
CREATE POLICY "Users can update their own posts" ON public.forum_posts FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own posts" ON public.forum_posts;
CREATE POLICY "Users can delete their own posts" ON public.forum_posts FOR DELETE USING (auth.uid() = user_id);

-- FORUM_REPLIES
DROP POLICY IF EXISTS "Forum replies are viewable by everyone" ON public.forum_replies;
CREATE POLICY "Forum replies are viewable by everyone" ON public.forum_replies FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own replies" ON public.forum_replies;
CREATE POLICY "Users can insert their own replies" ON public.forum_replies FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own replies" ON public.forum_replies;
CREATE POLICY "Users can delete their own replies" ON public.forum_replies FOR DELETE USING (auth.uid() = user_id);

-- COMMENTS
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own comments" ON public.comments;
CREATE POLICY "Users can insert their own comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
CREATE POLICY "Users can delete their own comments" ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- GLOSSARY
DROP POLICY IF EXISTS "Glossary is viewable by everyone" ON public.glossary;
CREATE POLICY "Glossary is viewable by everyone" ON public.glossary FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert glossary" ON public.glossary;
CREATE POLICY "Admins can insert glossary" ON public.glossary FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update glossary" ON public.glossary;
CREATE POLICY "Admins can update glossary" ON public.glossary FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete glossary" ON public.glossary;
CREATE POLICY "Admins can delete glossary" ON public.glossary FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- PROFILES
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- BOOKMARKS
DROP POLICY IF EXISTS "Users can view their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can view their own bookmarks" ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can insert their own bookmarks" ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can delete their own bookmarks" ON public.bookmarks FOR DELETE USING (auth.uid() = user_id);

-- READING_PROGRESS
DROP POLICY IF EXISTS "Users can view their own reading progress" ON public.reading_progress;
CREATE POLICY "Users can view their own reading progress" ON public.reading_progress FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own reading progress" ON public.reading_progress;
CREATE POLICY "Users can insert their own reading progress" ON public.reading_progress FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reading progress" ON public.reading_progress;
CREATE POLICY "Users can delete their own reading progress" ON public.reading_progress FOR DELETE USING (auth.uid() = user_id);

-- EMAIL_SUBSCRIPTIONS
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.email_subscriptions;
CREATE POLICY "Users can view their own subscriptions" ON public.email_subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.email_subscriptions;
CREATE POLICY "Users can insert their own subscriptions" ON public.email_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.email_subscriptions;
CREATE POLICY "Users can update their own subscriptions" ON public.email_subscriptions FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.email_subscriptions;
CREATE POLICY "Users can delete their own subscriptions" ON public.email_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- PAGE_VIEWS
DROP POLICY IF EXISTS "Anyone can insert page views" ON public.page_views;
CREATE POLICY "Anyone can insert page views" ON public.page_views FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read page views" ON public.page_views;
CREATE POLICY "Admins can read page views" ON public.page_views FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- USER_ROLES
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
