-- Commendations (awards) + personnel-file profiles.
-- Replaces the legacy achievements system. The old achievements /
-- user_achievements tables are left in place but are no longer used.
-- Unlocks are decided only by the cf_* functions below; readers cannot write
-- their own commendations.

-- ── Catalogue ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commendations (
  key text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  points integer NOT NULL DEFAULT 10,
  reward_frame text,
  reward_title text,
  sort_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.commendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Commendations are public" ON public.commendations FOR SELECT USING (true);
GRANT SELECT ON public.commendations TO anon, authenticated;

INSERT INTO public.commendations (key, title, description, category, points, reward_frame, reward_title, sort_order) VALUES
  ('case_opened',         'Case Opened',         'Read your first file.',                          'reading',     10, NULL,           NULL,               10),
  ('field_agent',         'Field Agent',         'Read 5 files.',                                  'reading',     20, 'manila',       NULL,               20),
  ('senior_investigator', 'Senior Investigator', 'Read 15 files.',                                 'reading',     30, 'brass',        NULL,               30),
  ('archivist',           'Archivist',           'Read every published file.',                     'reading',     50, 'gold-seal',    'Archivist',        40),
  ('first_decision',      'First Decision',      'File a decision in an interactive case.',        'interactive', 10, NULL,           NULL,               50),
  ('case_closed',         'Case Closed',         'Reach an ending in an interactive case.',        'interactive', 15, NULL,           NULL,               60),
  ('every_angle',         'Every Angle',         'Reach every ending of one interactive case.',    'interactive', 40, 'red-string',   NULL,               70),
  ('night_shift',         'Night Shift',         'Finish a file between 00:00 and 04:00.',         'habits',      15, NULL,           'Night Shift',      80),
  ('stakeout',            'Stakeout',            'Read on 7 days in a row.',                       'habits',      30, 'surveillance', NULL,               90),
  ('statement_given',     'Statement Given',     'Leave your first comment.',                      'community',   10, NULL,           NULL,              100),
  ('informant',           'Informant',           'Leave 10 comments.',                             'community',   25, NULL,           'Informant',       110),
  ('theorist',            'Theorist',            'Post your first theory.',                        'community',   10, NULL,           NULL,              120),
  ('lead_detective',      'Lead Detective',      'Post 10 theories.',                              'community',   35, NULL,           'Lead Detective',  130),
  ('evidence_locker',     'Evidence Locker',     'Bookmark 5 files or saved quotes.',              'community',   15, NULL,           NULL,              140),
  ('founding_witness',    'Founding Witness',    'One of the first 100 registered readers.',       'special',     30, 'founding',     'Founding Witness', 150),
  ('recruiter',           'Recruiter',           'Someone registers through your referral link.',  'special',     25, 'recruiter',    NULL,              160)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, category = EXCLUDED.category,
  points = EXCLUDED.points, reward_frame = EXCLUDED.reward_frame, reward_title = EXCLUDED.reward_title,
  sort_order = EXCLUDED.sort_order;

-- ── Unlocks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_commendations (
  user_id uuid NOT NULL,
  key text NOT NULL REFERENCES public.commendations(key) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  seen boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, key)
);
ALTER TABLE public.user_commendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Readers see own commendations" ON public.user_commendations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- No insert/update/delete policies: only the SECURITY DEFINER functions write here.
REVOKE INSERT, UPDATE, DELETE ON public.user_commendations FROM anon, authenticated;
GRANT SELECT ON public.user_commendations TO authenticated;

-- ── Profile settings (showcase, title, privacy) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_settings (
  user_id uuid PRIMARY KEY,
  pinned text[] NOT NULL DEFAULT '{}',
  selected_title text,
  favorite_chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  timezone text,
  show_statement boolean NOT NULL DEFAULT true,
  show_record boolean NOT NULL DEFAULT true,
  show_commendations boolean NOT NULL DEFAULT true,
  show_cases boolean NOT NULL DEFAULT true,
  show_evidence boolean NOT NULL DEFAULT true,
  -- Reading times and history are private until the reader opts in.
  show_log boolean NOT NULL DEFAULT false,
  show_activity boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads profile settings" ON public.profile_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner inserts profile settings" ON public.profile_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner updates profile settings" ON public.profile_settings
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.profile_settings TO authenticated;

-- Titles and pins must be earned; timezone must be real.
CREATE OR REPLACE FUNCTION public.cf_guard_profile_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.selected_title IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_commendations uc JOIN public.commendations c ON c.key = uc.key
    WHERE uc.user_id = NEW.user_id AND c.reward_title = NEW.selected_title
  ) THEN
    RAISE EXCEPTION 'title_locked';
  END IF;

  NEW.pinned := coalesce((
    SELECT array_agg(k ORDER BY ord) FROM (
      SELECT k, min(ord) AS ord
      FROM unnest(coalesce(NEW.pinned, '{}'::text[])) WITH ORDINALITY AS t(k, ord)
      WHERE EXISTS (SELECT 1 FROM public.user_commendations uc WHERE uc.user_id = NEW.user_id AND uc.key = t.k)
      GROUP BY k
      ORDER BY min(ord)
      LIMIT 3
    ) s
  ), '{}'::text[]);

  IF NEW.timezone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    NEW.timezone := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cf_guard_profile_settings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cf_guard_profile_settings ON public.profile_settings;
CREATE TRIGGER cf_guard_profile_settings BEFORE INSERT OR UPDATE ON public.profile_settings
  FOR EACH ROW EXECUTE FUNCTION public.cf_guard_profile_settings();

-- Frames must be earned (admins and server-side edits are exempt).
CREATE OR REPLACE FUNCTION public.cf_guard_profile_frame()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.selected_frame IS NOT NULL
     AND NEW.selected_frame IS DISTINCT FROM OLD.selected_frame
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_commendations uc JOIN public.commendations c ON c.key = uc.key
       WHERE uc.user_id = NEW.user_id AND c.reward_frame = NEW.selected_frame
     ) THEN
    RAISE EXCEPTION 'frame_locked';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cf_guard_profile_frame() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cf_guard_profile_frame ON public.profiles;
CREATE TRIGGER cf_guard_profile_frame BEFORE UPDATE OF selected_frame ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.cf_guard_profile_frame();

-- ── Referrals ──────────────────────────────────────────────────────────────
-- The legacy referrals table holds one code per referrer; redemptions are
-- recorded here, one per newly registered reader.
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  referred_id uuid PRIMARY KEY,
  referrer_id uuid NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Readers see their own referral records" ON public.referral_redemptions
  FOR SELECT TO authenticated USING (referrer_id = auth.uid() OR referred_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.referral_redemptions FROM anon, authenticated;
GRANT SELECT ON public.referral_redemptions TO authenticated;

CREATE OR REPLACE FUNCTION public.cf_redeem_referral(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); ref uuid; joined timestamptz; clean text := upper(trim(coalesce(_code, '')));
BEGIN
  IF uid IS NULL OR clean = '' THEN RETURN false; END IF;
  SELECT referrer_id INTO ref FROM public.referrals WHERE upper(code) = clean LIMIT 1;
  IF ref IS NULL OR ref = uid THEN RETURN false; END IF;
  -- Only accounts created recently can be credited to a referrer.
  SELECT created_at INTO joined FROM auth.users WHERE id = uid;
  IF joined IS NULL OR joined < now() - interval '14 days' THEN RETURN false; END IF;
  INSERT INTO public.referral_redemptions (referred_id, referrer_id, code)
  VALUES (uid, ref, clean) ON CONFLICT (referred_id) DO NOTHING;
  RETURN FOUND;
END $$;

-- ── Stats ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cf_level(_points integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _points >= 280 THEN 5 WHEN _points >= 180 THEN 4 WHEN _points >= 100 THEN 3 WHEN _points >= 40 THEN 2 ELSE 1 END
$$;

CREATE OR REPLACE FUNCTION public.cf_stats(_uid uuid, _tz text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tz text;
  files int; published int; published_read int; decisions int; endings int;
  every_angle boolean; night boolean; best_streak int; cur_streak int;
  comments int; theories int; evidence int; reader_no bigint; recruits int; secs bigint;
BEGIN
  tz := coalesce(_tz, (SELECT timezone FROM public.profile_settings WHERE user_id = _uid), 'Europe/Stockholm');
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz) THEN tz := 'Europe/Stockholm'; END IF;

  SELECT count(*) INTO files
  FROM public.reading_progress rp JOIN public.chapters c ON c.id = rp.chapter_id
  WHERE rp.user_id = _uid AND NOT c.is_archived;

  SELECT count(*), count(rp.chapter_id) INTO published, published_read
  FROM public.chapters c
  LEFT JOIN public.reading_progress rp ON rp.chapter_id = c.id AND rp.user_id = _uid
  WHERE NOT c.is_archived AND c.published_at <= now() AND (c.scheduled_at IS NULL OR c.scheduled_at <= now());

  SELECT count(*) INTO decisions FROM public.interactive_decisions WHERE user_id = _uid;

  SELECT count(DISTINCT chapter_id::text || ':' || ending_node) INTO endings
  FROM public.interactive_playthroughs WHERE user_id = _uid AND ending_node IS NOT NULL;

  SELECT EXISTS (
    SELECT 1 FROM public.chapters c
    WHERE c.story_format = 'interactive' AND c.interactive_graph IS NOT NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(c.interactive_graph->'nodes', '[]'::jsonb)) n WHERE n->>'type' = 'ending')
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(c.interactive_graph->'nodes', '[]'::jsonb)) n
        WHERE n->>'type' = 'ending'
          AND NOT EXISTS (
            SELECT 1 FROM public.interactive_playthroughs p
            WHERE p.user_id = _uid AND p.chapter_id = c.id AND p.ending_node = n->>'id'
          )
      )
  ) INTO every_angle;

  SELECT EXISTS (
    SELECT 1 FROM public.reading_progress rp JOIN public.chapters c ON c.id = rp.chapter_id
    WHERE rp.user_id = _uid AND NOT c.is_archived AND extract(hour FROM rp.read_at AT TIME ZONE tz) < 4
  ) INTO night;

  -- Days with any reading activity: files marked read, story visits, interactive decisions.
  WITH d AS (
    SELECT DISTINCT day FROM (
      SELECT (rp.read_at AT TIME ZONE tz)::date AS day FROM public.reading_progress rp WHERE rp.user_id = _uid
      UNION ALL
      SELECT (pv.created_at AT TIME ZONE tz)::date FROM public.page_views pv
      WHERE pv.user_id = _uid AND pv.chapter_id IS NOT NULL AND pv.created_at > now() - interval '400 days'
      UNION ALL
      SELECT (dd.created_at AT TIME ZONE tz)::date FROM public.interactive_decisions dd WHERE dd.user_id = _uid
    ) x
  ),
  g AS (SELECT day, day - (row_number() OVER (ORDER BY day))::int AS grp FROM d),
  runs AS (SELECT count(*)::int AS len, max(day) AS last_day FROM g GROUP BY grp)
  SELECT coalesce(max(len), 0),
         coalesce(max(len) FILTER (WHERE last_day >= (now() AT TIME ZONE tz)::date - 1), 0)
  INTO best_streak, cur_streak FROM runs;

  SELECT count(*) INTO comments FROM public.comments WHERE user_id = _uid;

  SELECT (SELECT count(*) FROM public.forum_posts WHERE user_id = _uid AND category = 'theories')
       + (SELECT count(*) FROM public.theories WHERE user_id = _uid)
  INTO theories;

  SELECT (SELECT count(*) FROM public.bookmarks WHERE user_id = _uid)
       + (SELECT count(*) FROM public.saved_quotes WHERE user_id = _uid)
  INTO evidence;

  SELECT count(*) INTO reader_no FROM public.profiles p2
  WHERE p2.created_at <= (SELECT created_at FROM public.profiles WHERE user_id = _uid);
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _uid) THEN reader_no := NULL; END IF;

  SELECT count(*) INTO recruits FROM public.referral_redemptions WHERE referrer_id = _uid;

  SELECT coalesce(sum(duration_seconds), 0) INTO secs
  FROM public.page_views WHERE user_id = _uid AND chapter_id IS NOT NULL;

  RETURN jsonb_build_object(
    'files_read', files, 'published', published, 'published_read', published_read,
    'decisions', decisions, 'endings', endings, 'every_angle', every_angle, 'night_shift', night,
    'best_streak', best_streak, 'current_streak', cur_streak,
    'comments', comments, 'theories', theories, 'evidence', evidence,
    'reader_number', reader_no, 'recruits', recruits, 'reading_seconds', secs
  );
END $$;
REVOKE ALL ON FUNCTION public.cf_stats(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Sync: award everything the reader has earned ───────────────────────────
CREATE OR REPLACE FUNCTION public.cf_sync(_tz text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s jsonb; earned text[] := '{}'::text[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  IF _tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = _tz) THEN
    INSERT INTO public.profile_settings (user_id, timezone) VALUES (uid, _tz)
    ON CONFLICT (user_id) DO UPDATE SET timezone = EXCLUDED.timezone
    WHERE public.profile_settings.timezone IS DISTINCT FROM EXCLUDED.timezone;
  END IF;

  s := public.cf_stats(uid, _tz);

  IF (s->>'files_read')::int >= 1 THEN earned := array_append(earned, 'case_opened'); END IF;
  IF (s->>'files_read')::int >= 5 THEN earned := array_append(earned, 'field_agent'); END IF;
  IF (s->>'files_read')::int >= 15 THEN earned := array_append(earned, 'senior_investigator'); END IF;
  IF (s->>'published')::int > 0 AND (s->>'published_read')::int >= (s->>'published')::int THEN
    earned := array_append(earned, 'archivist');
  END IF;
  IF (s->>'decisions')::int >= 1 THEN earned := array_append(earned, 'first_decision'); END IF;
  IF (s->>'endings')::int >= 1 THEN earned := array_append(earned, 'case_closed'); END IF;
  IF (s->>'every_angle')::boolean THEN earned := array_append(earned, 'every_angle'); END IF;
  IF (s->>'night_shift')::boolean THEN earned := array_append(earned, 'night_shift'); END IF;
  IF (s->>'best_streak')::int >= 7 THEN earned := array_append(earned, 'stakeout'); END IF;
  IF (s->>'comments')::int >= 1 THEN earned := array_append(earned, 'statement_given'); END IF;
  IF (s->>'comments')::int >= 10 THEN earned := array_append(earned, 'informant'); END IF;
  IF (s->>'theories')::int >= 1 THEN earned := array_append(earned, 'theorist'); END IF;
  IF (s->>'theories')::int >= 10 THEN earned := array_append(earned, 'lead_detective'); END IF;
  IF (s->>'evidence')::int >= 5 THEN earned := array_append(earned, 'evidence_locker'); END IF;
  IF (s->>'reader_number') IS NOT NULL AND (s->>'reader_number')::int <= 100 THEN
    earned := array_append(earned, 'founding_witness');
  END IF;
  IF (s->>'recruits')::int >= 1 THEN earned := array_append(earned, 'recruiter'); END IF;

  INSERT INTO public.user_commendations (user_id, key)
  SELECT uid, k FROM unnest(earned) AS k
  WHERE EXISTS (SELECT 1 FROM public.commendations c WHERE c.key = k)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'stats', s,
    'unlocked', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('key', key, 'unlocked_at', unlocked_at, 'seen', seen) ORDER BY unlocked_at), '[]'::jsonb)
      FROM public.user_commendations WHERE user_id = uid
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.cf_mark_seen(_keys text[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.user_commendations SET seen = true
  WHERE user_id = auth.uid() AND key = ANY(coalesce(_keys, '{}'::text[]))
$$;

-- ── Titles shown next to names (comments, forum) ───────────────────────────
CREATE OR REPLACE FUNCTION public.cf_reader_titles(_user_ids uuid[])
RETURNS TABLE(user_id uuid, title text, clearance integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id,
         ps.selected_title,
         public.cf_level(coalesce((
           SELECT sum(c.points)::int FROM public.user_commendations uc JOIN public.commendations c ON c.key = uc.key
           WHERE uc.user_id = p.user_id
         ), 0))
  FROM public.profiles p
  LEFT JOIN public.profile_settings ps ON ps.user_id = p.user_id
  WHERE p.user_id = ANY((coalesce(_user_ids, '{}'::uuid[]))[1:200])
$$;

-- ── Personnel file (profile page) ──────────────────────────────────────────
-- Header and commendations are public. Other sections need a signed-in viewer
-- and the owner's permission; the owner always sees everything.
CREATE OR REPLACE FUNCTION public.cf_dossier(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  viewer uuid := auth.uid();
  owner boolean;
  p public.profiles;
  st public.profile_settings;
  s jsonb; pts int; tz text; out jsonb;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE user_id = _user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  owner := viewer IS NOT NULL AND viewer = _user_id;
  SELECT * INTO st FROM public.profile_settings WHERE user_id = _user_id;
  tz := coalesce(st.timezone, 'Europe/Stockholm');
  s := public.cf_stats(_user_id, tz);
  SELECT coalesce(sum(c.points), 0)::int INTO pts
  FROM public.user_commendations uc JOIN public.commendations c ON c.key = uc.key WHERE uc.user_id = _user_id;

  out := jsonb_build_object(
    'user_id', p.user_id,
    'name', p.name,
    'avatar_url', p.avatar_url,
    'selected_frame', p.selected_frame,
    'created_at', p.created_at,
    'reader_number', s->'reader_number',
    'title', st.selected_title,
    'points', pts,
    'clearance', public.cf_level(pts),
    'is_owner', owner,
    'signed_in', viewer IS NOT NULL,
    'visibility', jsonb_build_object(
      'statement', coalesce(st.show_statement, true),
      'record', coalesce(st.show_record, true),
      'commendations', coalesce(st.show_commendations, true),
      'cases', coalesce(st.show_cases, true),
      'evidence', coalesce(st.show_evidence, true),
      'log', coalesce(st.show_log, false),
      'activity', coalesce(st.show_activity, false)
    )
  );

  IF owner THEN
    out := out || jsonb_build_object('settings', jsonb_build_object(
      'pinned', to_jsonb(coalesce(st.pinned, '{}'::text[])),
      'selected_title', st.selected_title,
      'favorite_chapter_id', st.favorite_chapter_id
    ));
  END IF;

  IF owner OR coalesce(st.show_commendations, true) THEN
    out := out || jsonb_build_object(
      'commendations', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', uc.key, 'unlocked_at', uc.unlocked_at) ORDER BY uc.unlocked_at), '[]'::jsonb)
        FROM public.user_commendations uc WHERE uc.user_id = _user_id
      ),
      'pinned', to_jsonb(coalesce(st.pinned, '{}'::text[]))
    );
  END IF;

  IF NOT owner AND viewer IS NULL THEN
    RETURN out;
  END IF;

  IF owner OR coalesce(st.show_statement, true) THEN
    out := out || jsonb_build_object('statement', jsonb_build_object(
      'bio', p.bio, 'instagram', p.instagram, 'tiktok', p.tiktok, 'website', p.website,
      'favorite', (
        SELECT jsonb_build_object('id', c.id, 'title', c.title, 'cover_image_url', c.cover_image_url)
        FROM public.chapters c WHERE c.id = st.favorite_chapter_id AND NOT c.is_archived
      )
    ));
  END IF;

  IF owner OR coalesce(st.show_record, true) THEN
    out := out || jsonb_build_object('record', jsonb_build_object(
      'files_read', s->'files_read', 'decisions', s->'decisions', 'endings', s->'endings',
      'current_streak', s->'current_streak', 'best_streak', s->'best_streak',
      'reading_seconds', s->'reading_seconds', 'comments', s->'comments', 'theories', s->'theories'
    ));
  END IF;

  IF owner OR coalesce(st.show_cases, true) THEN
    out := out || jsonb_build_object('cases', (
      SELECT coalesce(jsonb_agg(x ORDER BY x->>'updated_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'chapter_id', c.id,
          'title', c.title,
          'status', pt.status,
          'updated_at', pt.updated_at,
          'completed_at', pt.completed_at,
          'endings_total', (
            SELECT count(*) FROM jsonb_array_elements(coalesce(c.interactive_graph->'nodes', '[]'::jsonb)) n WHERE n->>'type' = 'ending'
          ),
          'endings_reached', (
            SELECT count(DISTINCT p2.ending_node) FROM public.interactive_playthroughs p2
            WHERE p2.user_id = _user_id AND p2.chapter_id = c.id AND p2.ending_node IS NOT NULL
          ),
          'ending_index', (
            SELECT e.idx FROM (
              SELECT t.n->>'id' AS id, row_number() OVER (ORDER BY t.ord) AS idx
              FROM jsonb_array_elements(coalesce(c.interactive_graph->'nodes', '[]'::jsonb)) WITH ORDINALITY AS t(n, ord)
              WHERE t.n->>'type' = 'ending'
            ) e WHERE e.id = pt.ending_node
          ),
          -- Ending names stay classified unless the viewer has closed this case too.
          'ending_title', CASE
            WHEN pt.ending_node IS NOT NULL AND (owner OR EXISTS (
              SELECT 1 FROM public.interactive_playthroughs v
              WHERE v.user_id = viewer AND v.chapter_id = c.id AND v.completed_at IS NOT NULL
            )) THEN (
              SELECT n->>'endingTitle' FROM jsonb_array_elements(coalesce(c.interactive_graph->'nodes', '[]'::jsonb)) n
              WHERE n->>'id' = pt.ending_node LIMIT 1
            )
          END
        ) AS x
        FROM (
          SELECT DISTINCT ON (chapter_id) * FROM public.interactive_playthroughs
          WHERE user_id = _user_id ORDER BY chapter_id, attempt DESC
        ) pt
        JOIN public.chapters c ON c.id = pt.chapter_id
        WHERE NOT c.is_archived
      ) q
    ));
  END IF;

  IF owner OR coalesce(st.show_log, false) THEN
    out := out || jsonb_build_object('log', (
      SELECT coalesce(jsonb_agg(e ORDER BY ts DESC), '[]'::jsonb) FROM (
        SELECT e, ts FROM (
          SELECT jsonb_build_object('type', 'comment', 'at', cm.created_at, 'chapter_id', c.id, 'title', c.title,
                   'text', left(regexp_replace(cm.content, '<[^>]*>', '', 'g'), 160)) AS e, cm.created_at AS ts
          FROM public.comments cm JOIN public.chapters c ON c.id = cm.chapter_id
          WHERE cm.user_id = _user_id AND NOT c.is_archived
          UNION ALL
          SELECT jsonb_build_object('type', 'thread', 'at', fp.created_at, 'post_id', fp.id, 'title', fp.title, 'category', fp.category),
                 fp.created_at
          FROM public.forum_posts fp WHERE fp.user_id = _user_id AND NOT fp.is_archived
          UNION ALL
          SELECT jsonb_build_object('type', 'commendation', 'at', uc.unlocked_at, 'key', uc.key), uc.unlocked_at
          FROM public.user_commendations uc WHERE uc.user_id = _user_id
          UNION ALL
          SELECT jsonb_build_object('type', 'case_closed', 'at', pt.completed_at, 'chapter_id', c.id, 'title', c.title), pt.completed_at
          FROM public.interactive_playthroughs pt JOIN public.chapters c ON c.id = pt.chapter_id
          WHERE pt.user_id = _user_id AND pt.completed_at IS NOT NULL AND NOT c.is_archived
          UNION ALL
          SELECT jsonb_build_object('type', 'read', 'at', rp.read_at, 'chapter_id', c.id, 'title', c.title), rp.read_at
          FROM public.reading_progress rp JOIN public.chapters c ON c.id = rp.chapter_id
          WHERE rp.user_id = _user_id AND NOT c.is_archived
        ) u
        ORDER BY ts DESC
        LIMIT 25
      ) q
    ));
  END IF;

  IF owner OR coalesce(st.show_activity, false) THEN
    out := out || jsonb_build_object('activity', (
      SELECT coalesce(jsonb_object_agg(day::text, n), '{}'::jsonb) FROM (
        SELECT day, count(*) AS n FROM (
          SELECT (rp.read_at AT TIME ZONE tz)::date AS day FROM public.reading_progress rp WHERE rp.user_id = _user_id
          UNION ALL
          SELECT (pv.created_at AT TIME ZONE tz)::date FROM public.page_views pv
          WHERE pv.user_id = _user_id AND pv.chapter_id IS NOT NULL AND pv.created_at > now() - interval '380 days'
          UNION ALL
          SELECT (d.created_at AT TIME ZONE tz)::date FROM public.interactive_decisions d WHERE d.user_id = _user_id
        ) x
        WHERE day > (now() AT TIME ZONE tz)::date - 371
        GROUP BY day
      ) y
    ), 'today', ((now() AT TIME ZONE tz)::date)::text);
  END IF;

  IF owner OR coalesce(st.show_evidence, true) THEN
    out := out || jsonb_build_object('evidence', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'text', q.quote_text, 'chapter_id', c.id, 'title', c.title, 'at', q.created_at) ORDER BY q.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.saved_quotes WHERE user_id = _user_id ORDER BY created_at DESC LIMIT 12) q
      LEFT JOIN public.chapters c ON c.id = q.chapter_id
    ));
  END IF;

  RETURN out;
END $$;

REVOKE ALL ON FUNCTION public.cf_sync(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cf_mark_seen(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cf_redeem_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf_sync(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_mark_seen(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_redeem_referral(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_reader_titles(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cf_dossier(uuid) TO anon, authenticated;
