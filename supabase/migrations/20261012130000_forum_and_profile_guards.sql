-- Forum and profile guards.
--
-- The row rules let members edit their own threads and replies, but every
-- column of them: a member could pin their own thread to the top, bring back a
-- thread an admin archived, move a reply into another thread, or post
-- unlimited text as fast as they like. These triggers keep members to their
-- own words; admins (and the service role) are not limited.

-- Threads ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_guard_forum_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR public.has_role(uid, 'admin'::app_role) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_pinned := false;
    NEW.is_archived := false;
    NEW.created_at := now();
    IF (SELECT count(*) FROM public.forum_posts WHERE user_id = uid AND created_at > now() - interval '10 minutes') >= 5 THEN
      RAISE EXCEPTION 'slow_down' USING HINT = 'Too many new threads in a short time.';
    END IF;
  ELSE
    -- Only admins pin, archive or re-attribute a thread.
    NEW.is_pinned := OLD.is_pinned;
    NEW.is_archived := OLD.is_archived;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title)
     AND (btrim(coalesce(NEW.title, '')) = '' OR length(NEW.title) > 140) THEN
    RAISE EXCEPTION 'invalid_title';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content)
     AND (btrim(coalesce(NEW.content, '')) = '' OR length(NEW.content) > 10000) THEN
    RAISE EXCEPTION 'invalid_content';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.category IS DISTINCT FROM OLD.category)
     AND NEW.category NOT IN ('case-discussion', 'theories', 'general', 'feedback') THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cf_guard_forum_post() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cf_guard_forum_post ON public.forum_posts;
CREATE TRIGGER cf_guard_forum_post BEFORE INSERT OR UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.cf_guard_forum_post();

-- Replies ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf_guard_forum_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR public.has_role(uid, 'admin'::app_role) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    -- No new replies on archived (closed) threads.
    IF NOT EXISTS (SELECT 1 FROM public.forum_posts p WHERE p.id = NEW.post_id AND p.is_archived = false) THEN
      RAISE EXCEPTION 'thread_closed';
    END IF;
    NEW.created_at := now();
    IF (SELECT count(*) FROM public.forum_replies WHERE user_id = uid AND created_at > now() - interval '10 minutes') >= 20 THEN
      RAISE EXCEPTION 'slow_down' USING HINT = 'Too many replies in a short time.';
    END IF;
  ELSE
    -- A reply stays in its thread, with its author and date.
    NEW.post_id := OLD.post_id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content)
     AND (btrim(coalesce(NEW.content, '')) = '' OR length(NEW.content) > 5000) THEN
    RAISE EXCEPTION 'invalid_content';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cf_guard_forum_reply() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cf_guard_forum_reply ON public.forum_replies;
CREATE TRIGGER cf_guard_forum_reply BEFORE INSERT OR UPDATE ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.cf_guard_forum_reply();

-- Display names -----------------------------------------------------------------
-- Names show on comments and in the forum: trimmed, never empty, at most 40
-- characters. Shortened rather than refused, so a long name never blocks a sign-up.
CREATE OR REPLACE FUNCTION public.cf_guard_profile_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.name := left(regexp_replace(btrim(coalesce(NEW.name, '')), '\s+', ' ', 'g'), 40);
  IF NEW.name = '' THEN NEW.name := 'Reader'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cf_guard_profile_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cf_guard_profile_name ON public.profiles;
CREATE TRIGGER cf_guard_profile_name BEFORE INSERT OR UPDATE OF name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.cf_guard_profile_name();
