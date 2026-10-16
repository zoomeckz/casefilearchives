-- "Send to Discord" for a story: posts its current title and text again. The site now
-- remembers the Discord message of every post it makes, so a new post can replace the
-- old one (for example after the title was corrected).

ALTER TABLE public.discord_announced ADD COLUMN IF NOT EXISTS request_id bigint;
ALTER TABLE public.discord_announced ADD COLUMN IF NOT EXISTS message_id text;

-- Posts with ?wait=true so Discord answers with the message (its id is kept).
CREATE OR REPLACE FUNCTION public.cf_discord_send(_payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  url text := rtrim(coalesce(public.cf_discord_settings()->>'webhook_url', ''), '/');
  req bigint;
BEGIN
  IF url = '' THEN RETURN NULL; END IF;
  SELECT net.http_post(url := url || '?wait=true', body := _payload, headers := '{"Content-Type": "application/json"}'::jsonb) INTO req;
  RETURN req;
END $$;
REVOKE ALL ON FUNCTION public.cf_discord_send(jsonb) FROM PUBLIC, anon, authenticated;

-- Reads Discord's answers (kept by pg_net for a few hours) and stores the message ids.
CREATE OR REPLACE FUNCTION public.cf_discord_resolve_ids()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE $q$
    UPDATE public.discord_announced a
       SET message_id = (r.content::jsonb)->>'id'
      FROM net._http_response r
     WHERE a.message_id IS NULL AND a.request_id = r.id
       AND r.status_code BETWEEN 200 AND 299 AND r.content LIKE '{%'
  $q$;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
REVOKE ALL ON FUNCTION public.cf_discord_resolve_ids() FROM PUBLIC, anon, authenticated;

-- Same as before, but keeps the request of each post so its message can be found later.
CREATE OR REPLACE FUNCTION public.cf_discord_announce()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s jsonb := public.cf_discord_settings();
  c public.chapters;
  p public.forum_posts;
  n integer := 0;
BEGIN
  PERFORM public.cf_discord_resolve_ids();
  IF coalesce(s->>'webhook_url', '') = '' THEN RETURN 0; END IF;

  IF coalesce((s->>'stories')::boolean, true) THEN
    FOR c IN
      SELECT ch.* FROM public.chapters ch
       WHERE NOT ch.is_archived AND ch.published_at <= now()
         AND (ch.scheduled_at IS NULL OR ch.scheduled_at <= now())
         AND NOT EXISTS (SELECT 1 FROM public.discord_announced a WHERE a.kind = 'story' AND a.ref_id = ch.id)
       ORDER BY coalesce(ch.scheduled_at, ch.published_at)
       LIMIT 5
    LOOP
      INSERT INTO public.discord_announced (kind, ref_id) VALUES ('story', c.id) ON CONFLICT DO NOTHING;
      IF FOUND THEN
        UPDATE public.discord_announced SET request_id = public.cf_discord_send(public.cf_discord_story_payload(c))
         WHERE kind = 'story' AND ref_id = c.id;
        n := n + 1;
      END IF;
    END LOOP;
  END IF;

  IF coalesce((s->>'forum')::boolean, false) THEN
    FOR p IN
      SELECT fp.* FROM public.forum_posts fp
       WHERE NOT fp.is_archived AND fp.created_at > now() - interval '1 day'
         AND NOT EXISTS (SELECT 1 FROM public.discord_announced a WHERE a.kind = 'forum' AND a.ref_id = fp.id)
       ORDER BY fp.created_at
       LIMIT 5
    LOOP
      INSERT INTO public.discord_announced (kind, ref_id) VALUES ('forum', p.id) ON CONFLICT DO NOTHING;
      IF FOUND THEN
        UPDATE public.discord_announced SET request_id = public.cf_discord_send(public.cf_discord_forum_payload(p))
         WHERE kind = 'forum' AND ref_id = p.id;
        n := n + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cf_discord_announce() FROM PUBLIC, anon, authenticated;

-- Admin: post a story to Discord again with its current title and text. With _replace,
-- the site's previous post of this story is deleted first (if Discord's answer to it is known).
-- Re-posts never ping @everyone.
CREATE OR REPLACE FUNCTION public.admin_discord_post_story(_chapter_id uuid, _replace boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  url text := rtrim(coalesce(public.cf_discord_settings()->>'webhook_url', ''), '/');
  c public.chapters;
  mid text;
  req bigint;
  removed boolean := false;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF url = '' THEN RAISE EXCEPTION 'no_webhook'; END IF;
  SELECT * INTO c FROM public.chapters WHERE id = _chapter_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF _replace THEN
    PERFORM public.cf_discord_resolve_ids();
    SELECT message_id INTO mid FROM public.discord_announced WHERE kind = 'story' AND ref_id = c.id;
    IF mid IS NOT NULL THEN
      BEGIN
        PERFORM net.http_delete(url := url || '/messages/' || mid);
        removed := true;
      EXCEPTION WHEN OTHERS THEN removed := false;
      END;
    END IF;
  END IF;

  req := public.cf_discord_send(
    (public.cf_discord_story_payload(c) - 'content') || jsonb_build_object('allowed_mentions', jsonb_build_object('parse', '[]'::jsonb))
  );
  INSERT INTO public.discord_announced (kind, ref_id, request_id, message_id, announced_at)
  VALUES ('story', c.id, req, NULL, now())
  ON CONFLICT (kind, ref_id) DO UPDATE SET request_id = EXCLUDED.request_id, message_id = NULL, announced_at = now();

  RETURN jsonb_build_object('request_id', req, 'replaced', removed);
END $$;
REVOKE ALL ON FUNCTION public.admin_discord_post_story(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_discord_post_story(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
