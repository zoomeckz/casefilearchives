-- Discord announcements --------------------------------------------------------------
-- New case files (and, if switched on, forum posts and new readers) are posted to a
-- Discord channel through a webhook. The webhook address is set in Admin → Discord & RSS
-- and is only readable by the database itself.
-- Stories that are published straight away are announced at once; scheduled ones are
-- picked up by a check every five minutes (pg_cron) once their time has come.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net could not be enabled: Discord messages cannot be sent until it is';
END $$;

CREATE TABLE IF NOT EXISTS public.site_integrations (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_integrations FROM anon, authenticated;

-- What has been announced, so nothing is posted twice.
CREATE TABLE IF NOT EXISTS public.discord_announced (
  kind text NOT NULL,
  ref_id uuid NOT NULL,
  announced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref_id)
);
ALTER TABLE public.discord_announced ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discord_announced FROM anon, authenticated;

-- Everything already out counts as announced, so switching this on posts only new things.
INSERT INTO public.discord_announced (kind, ref_id)
SELECT 'story', id FROM public.chapters
 WHERE published_at <= now() AND (scheduled_at IS NULL OR scheduled_at <= now())
ON CONFLICT DO NOTHING;
INSERT INTO public.discord_announced (kind, ref_id)
SELECT 'forum', id FROM public.forum_posts
ON CONFLICT DO NOTHING;

-- Same address the site uses: /stories/<slug>, /forum/<slug>--<id>.
CREATE OR REPLACE FUNCTION public.cf_slug(_t text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        lower(regexp_replace(normalize(coalesce(_t, ''), NFKD), '[' || chr(768) || '-' || chr(879) || ']', '', 'g')),
        '[''' || chr(8217) || ']', '', 'g'),
      '[^a-z0-9]+', '-', 'g'),
    '-')
$$;

-- Story text without markup, cut to a length.
CREATE OR REPLACE FUNCTION public.cf_plain_excerpt(_html text, _len integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(x) > _len THEN rtrim(left(x, _len - 1)) || '…' ELSE x END
  FROM (
    SELECT btrim(regexp_replace(
      replace(replace(replace(replace(replace(
        regexp_replace(coalesce(_html, ''), '<[^>]*>', ' ', 'g'),
        '&nbsp;', ' '), '&amp;', '&'), '&quot;', '"'), '&#39;', ''''), '&rsquo;', chr(8217)),
      '[[:space:]]+', ' ', 'g')) AS x
  ) s
$$;

CREATE OR REPLACE FUNCTION public.cf_discord_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value FROM public.site_integrations WHERE key = 'discord'), '{}'::jsonb)
$$;
REVOKE ALL ON FUNCTION public.cf_discord_settings() FROM PUBLIC, anon, authenticated;

-- Queues one message (pg_net sends it in the background). Returns the request id.
CREATE OR REPLACE FUNCTION public.cf_discord_send(_payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  url text := public.cf_discord_settings()->>'webhook_url';
  req bigint;
BEGIN
  IF coalesce(url, '') = '' THEN RETURN NULL; END IF;
  SELECT net.http_post(url := url, body := _payload, headers := '{"Content-Type": "application/json"}'::jsonb) INTO req;
  RETURN req;
END $$;
REVOKE ALL ON FUNCTION public.cf_discord_send(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cf_discord_story_payload(c public.chapters)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'username', 'Case Files',
    'content', CASE WHEN ping THEN '@everyone' END,
    'allowed_mentions', jsonb_build_object('parse', CASE WHEN ping THEN '["everyone"]'::jsonb ELSE '[]'::jsonb END),
    'embeds', jsonb_build_array(jsonb_build_object(
      'author', jsonb_build_object('name', CASE WHEN c.story_format = 'interactive' THEN 'New interactive case' ELSE 'New case file' END),
      'title', left(c.title, 250),
      'url', 'https://thecasefiles.org/stories/' || public.cf_slug(c.title),
      'description', nullif(public.cf_plain_excerpt(c.content, 300), ''),
      'color', 12131356,
      'image', CASE WHEN coalesce(c.cover_image_url, '') <> '' THEN jsonb_build_object('url',
        CASE WHEN c.cover_image_url LIKE 'http%' THEN c.cover_image_url ELSE 'https://thecasefiles.org' || c.cover_image_url END) END,
      'timestamp', to_char(greatest(c.published_at, coalesce(c.scheduled_at, c.published_at)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ))
  ))
  FROM (SELECT coalesce((public.cf_discord_settings()->>'ping_everyone')::boolean, false) AS ping) s
$$;
REVOKE ALL ON FUNCTION public.cf_discord_story_payload(public.chapters) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cf_discord_forum_payload(p public.forum_posts)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'username', 'Case Files',
    'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb),
    'embeds', jsonb_build_array(jsonb_build_object(
      'author', jsonb_build_object('name', 'New forum post · ' || initcap(replace(coalesce(p.category, 'general'), '_', ' '))),
      'title', left(p.title, 250),
      'url', 'https://thecasefiles.org/forum/' || public.cf_slug(p.title) || '--' || left(p.id::text, 8),
      'description', nullif(public.cf_plain_excerpt(p.content, 250), ''),
      'color', 9807270,
      'footer', jsonb_build_object('text', 'by ' || coalesce((SELECT name FROM public.profiles WHERE user_id = p.user_id), 'a reader')),
      'timestamp', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ))
  ))
$$;
REVOKE ALL ON FUNCTION public.cf_discord_forum_payload(public.forum_posts) FROM PUBLIC, anon, authenticated;

-- Posts everything that is out but not announced yet (at most five of each per run).
CREATE OR REPLACE FUNCTION public.cf_discord_announce()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s jsonb := public.cf_discord_settings();
  c public.chapters;
  p public.forum_posts;
  n integer := 0;
BEGIN
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
        PERFORM public.cf_discord_send(public.cf_discord_story_payload(c));
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
        PERFORM public.cf_discord_send(public.cf_discord_forum_payload(p));
        n := n + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cf_discord_announce() FROM PUBLIC, anon, authenticated;

-- Publishing, scheduling and posting run the check straight away. A Discord problem
-- never blocks the publish or the post itself.
CREATE OR REPLACE FUNCTION public.cf_discord_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.cf_discord_announce();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Discord announcement failed: %', SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.cf_discord_on_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cf_discord_chapters ON public.chapters;
CREATE TRIGGER cf_discord_chapters AFTER INSERT OR UPDATE OF published_at, scheduled_at, is_archived ON public.chapters
  FOR EACH STATEMENT EXECUTE FUNCTION public.cf_discord_on_change();
DROP TRIGGER IF EXISTS cf_discord_forum ON public.forum_posts;
CREATE TRIGGER cf_discord_forum AFTER INSERT ON public.forum_posts
  FOR EACH STATEMENT EXECUTE FUNCTION public.cf_discord_on_change();

-- New readers (off unless switched on; best for a private staff channel).
CREATE OR REPLACE FUNCTION public.cf_discord_new_reader()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF coalesce((public.cf_discord_settings()->>'readers')::boolean, false) THEN
      PERFORM public.cf_discord_send(jsonb_build_object(
        'username', 'Case Files',
        'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb),
        'embeds', jsonb_build_array(jsonb_build_object(
          'author', jsonb_build_object('name', 'New reader registered'),
          'title', left(NEW.name, 250),
          'url', 'https://thecasefiles.org/user/' || NEW.user_id,
          'color', 3066993,
          'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ))
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Discord announcement failed: %', SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.cf_discord_new_reader() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cf_discord_new_reader ON public.profiles;
CREATE TRIGGER cf_discord_new_reader AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.cf_discord_new_reader();

-- Scheduled stories: check every five minutes.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  BEGIN
    PERFORM cron.unschedule('cf-discord-announce');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule('cf-discord-announce', '*/5 * * * *', 'SELECT public.cf_discord_announce()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable: scheduled stories are announced with the next publish or post';
END $$;

-- ── Admin ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_discord_settings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s jsonb := public.cf_discord_settings();
  url text := coalesce(s->>'webhook_url', '');
  has_net boolean := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net');
  has_cron boolean := false;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  BEGIN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)' INTO has_cron USING 'cf-discord-announce';
  EXCEPTION WHEN OTHERS THEN has_cron := false;
  END;
  RETURN jsonb_build_object(
    'configured', url <> '',
    'webhook_hint', CASE WHEN url <> '' THEN '…/' || right(url, 6) END,
    'stories', coalesce((s->>'stories')::boolean, true),
    'ping_everyone', coalesce((s->>'ping_everyone')::boolean, false),
    'forum', coalesce((s->>'forum')::boolean, false),
    'readers', coalesce((s->>'readers')::boolean, false),
    'can_send', has_net,
    'scheduled_checks', has_cron
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_discord_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_discord_settings() TO authenticated;

-- _webhook_url: null keeps the current one, '' removes it.
CREATE OR REPLACE FUNCTION public.admin_save_discord(
  _webhook_url text DEFAULT NULL,
  _stories boolean DEFAULT true,
  _ping_everyone boolean DEFAULT false,
  _forum boolean DEFAULT false,
  _readers boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old jsonb := public.cf_discord_settings();
  url text := coalesce(btrim(_webhook_url), old->>'webhook_url', '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF url <> '' AND url !~ '^https://(ptb[.]|canary[.])?(discord|discordapp)[.]com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+/?$' THEN
    RAISE EXCEPTION 'invalid_webhook';
  END IF;

  -- Whatever is already out when a kind is switched on is not posted afterwards.
  IF _stories AND (coalesce(old->>'webhook_url', '') = '' OR NOT coalesce((old->>'stories')::boolean, true)) THEN
    INSERT INTO public.discord_announced (kind, ref_id)
    SELECT 'story', id FROM public.chapters
     WHERE published_at <= now() AND (scheduled_at IS NULL OR scheduled_at <= now())
    ON CONFLICT DO NOTHING;
  END IF;
  IF _forum AND (coalesce(old->>'webhook_url', '') = '' OR NOT coalesce((old->>'forum')::boolean, false)) THEN
    INSERT INTO public.discord_announced (kind, ref_id) SELECT 'forum', id FROM public.forum_posts
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.site_integrations (key, value, updated_at)
  VALUES ('discord', jsonb_build_object(
    'webhook_url', url, 'stories', _stories, 'ping_everyone', _ping_everyone, 'forum', _forum, 'readers', _readers
  ), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN public.admin_discord_settings();
END $$;
REVOKE ALL ON FUNCTION public.admin_save_discord(text, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_discord(text, boolean, boolean, boolean, boolean) TO authenticated;

-- Sends a test message; returns the request id to check with admin_discord_result.
CREATE OR REPLACE FUNCTION public.admin_discord_test()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF coalesce(public.cf_discord_settings()->>'webhook_url', '') = '' THEN RAISE EXCEPTION 'no_webhook'; END IF;
  req := public.cf_discord_send(jsonb_build_object(
    'username', 'Case Files',
    'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb),
    'embeds', jsonb_build_array(jsonb_build_object(
      'author', jsonb_build_object('name', 'Test message'),
      'title', 'Case Files is connected',
      'url', 'https://thecasefiles.org',
      'description', 'New case files will be posted in this channel.',
      'color', 12131356
    ))
  ));
  RETURN req;
END $$;
REVOKE ALL ON FUNCTION public.admin_discord_test() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_discord_test() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_discord_result(_request_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  BEGIN
    EXECUTE 'SELECT jsonb_build_object(''status'', status_code, ''error'', error_msg, ''timed_out'', timed_out)
               FROM net._http_response WHERE id = $1' INTO r USING _request_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('done', true, 'error', SQLERRM);
  END;
  IF r IS NULL THEN RETURN jsonb_build_object('done', false); END IF;
  RETURN r || jsonb_build_object('done', true);
END $$;
REVOKE ALL ON FUNCTION public.admin_discord_result(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_discord_result(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
