-- 1. Timed decisions start when the reader sees them.
-- 2. Admin: every registered reader, their progress, and a reset per case.
-- 3. Detective rank (XP).
-- 4. Hint tokens: at most two per attempt of an interactive case.

-- ── 1. Timer starts on screen ──────────────────────────────────────────────
-- Until now the clock ran from the moment the previous choice was filed, so it
-- ticked while readers were still reading the scene in between. The reader's
-- browser now reports when the decision appears (ic_present); the time limit
-- counts from then.
ALTER TABLE public.interactive_playthroughs ADD COLUMN IF NOT EXISTS presented_at timestamptz;

CREATE OR REPLACE FUNCTION public.ic_present(_chapter_id uuid, _node_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); pt public.interactive_playthroughs;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO pt FROM public.interactive_playthroughs
   WHERE user_id = uid AND chapter_id = _chapter_id AND status = 'in_progress' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_playthrough'; END IF;
  IF pt.current_node IS DISTINCT FROM _node_id THEN RAISE EXCEPTION 'decision_not_reached'; END IF;
  -- Only the first sighting of this decision counts; reloading does not restart the clock.
  IF pt.presented_at IS NULL OR pt.presented_at < pt.updated_at THEN
    UPDATE public.interactive_playthroughs SET presented_at = now() WHERE id = pt.id;
  END IF;
  RETURN public.ic_state(pt.id);
END $$;
REVOKE ALL ON FUNCTION public.ic_present(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_present(uuid, text) TO authenticated;

-- Same as the 20261012140000 version, except the time limit counts from
-- presented_at (when the decision was shown) instead of updated_at.
CREATE OR REPLACE FUNCTION public.ic_choose(_chapter_id uuid, _node_id text, _option_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); g jsonb; pt public.interactive_playthroughs; n jsonb; opt jsonb; e jsonb;
  vars jsonb; res jsonb; nxt text; locked jsonb; tl numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT interactive_graph INTO g FROM public.chapters WHERE id = _chapter_id AND story_format = 'interactive';
  IF g IS NULL THEN RAISE EXCEPTION 'not_interactive'; END IF;

  SELECT * INTO pt FROM public.interactive_playthroughs
   WHERE user_id = uid AND chapter_id = _chapter_id AND status = 'in_progress' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_playthrough'; END IF;
  IF pt.current_node IS DISTINCT FROM _node_id THEN RAISE EXCEPTION 'decision_not_reached'; END IF;
  IF EXISTS (SELECT 1 FROM public.interactive_decisions WHERE playthrough_id = pt.id AND node_id = _node_id) THEN
    RAISE EXCEPTION 'already_decided';
  END IF;

  n := public.ic_find_node(g, _node_id);
  IF n IS NULL OR n->>'type' <> 'decision' THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  vars := pt.variables;

  tl := CASE WHEN coalesce(n->>'timeLimit', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (n->>'timeLimit')::numeric END;
  IF tl IS NOT NULL AND tl > 0
     AND pt.presented_at IS NOT NULL AND pt.presented_at >= pt.updated_at
     AND now() > pt.presented_at + make_interval(secs => (tl + 5)::double precision) THEN
    -- Time ran out: file a random available option instead of the requested one.
    SELECT o INTO opt FROM jsonb_array_elements(coalesce(n->'options', '[]'::jsonb)) o
     WHERE public.ic_eval_conds(o->'visibleIf', vars)
       AND NOT (jsonb_array_length(coalesce(o->'lockedIf', '[]'::jsonb)) > 0 AND public.ic_eval_conds(o->'lockedIf', vars))
       AND coalesce(o->>'next', '') <> ''
       AND public.ic_find_node(g, o->>'next') IS NOT NULL
     ORDER BY random() LIMIT 1;
    IF opt IS NULL THEN RAISE EXCEPTION 'option_unavailable'; END IF;
  ELSE
    SELECT o INTO opt FROM jsonb_array_elements(coalesce(n->'options', '[]'::jsonb)) o WHERE o->>'id' = _option_id LIMIT 1;
    IF opt IS NULL THEN RAISE EXCEPTION 'invalid_option'; END IF;
    locked := coalesce(opt->'lockedIf', '[]'::jsonb);
    IF NOT public.ic_eval_conds(opt->'visibleIf', vars)
       OR (jsonb_array_length(locked) > 0 AND public.ic_eval_conds(locked, vars)) THEN
      RAISE EXCEPTION 'option_unavailable';
    END IF;
  END IF;

  nxt := nullif(opt->>'next', '');
  IF nxt IS NULL OR public.ic_find_node(g, nxt) IS NULL THEN RAISE EXCEPTION 'broken_link'; END IF;

  INSERT INTO public.interactive_decisions (playthrough_id, user_id, chapter_id, node_id, option_id, option_label)
  VALUES (pt.id, uid, _chapter_id, _node_id, opt->>'id', opt->>'label');

  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(opt->'effects', '[]'::jsonb)) LOOP
    IF coalesce(e->>'var', '') = '' THEN CONTINUE; END IF;
    IF e->>'op' = 'add' THEN
      BEGIN
        vars := vars || jsonb_build_object(e->>'var', (coalesce(nullif(vars->>(e->>'var'), ''), '0')::numeric + coalesce(nullif(e->>'value',''),'0')::numeric)::text);
      EXCEPTION WHEN others THEN NULL;
      END;
    ELSE
      vars := vars || jsonb_build_object(e->>'var', coalesce(e->>'value', ''));
    END IF;
  END LOOP;

  res := public.ic_resolve(g, nxt, vars);
  UPDATE public.interactive_playthroughs SET
    variables = vars,
    current_node = res->>'current',
    visited = visited || (res->'visited'),
    status = CASE WHEN (res->>'terminal')::boolean THEN 'completed' ELSE 'in_progress' END,
    ending_node = res->>'ending',
    completed_at = CASE WHEN (res->>'terminal')::boolean THEN now() END,
    updated_at = now()
  WHERE id = pt.id;
  RETURN public.ic_state(pt.id);
END $$;
REVOKE ALL ON FUNCTION public.ic_choose(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_choose(uuid, text, text) TO authenticated;

-- ── 2. Admin: readers ──────────────────────────────────────────────────────
-- Every registered account with sign-up details and activity counts.
-- Returns nothing for non-admins.
CREATE OR REPLACE FUNCTION public.admin_readers()
RETURNS TABLE (
  user_id uuid, email text, name text, avatar_url text, joined_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed boolean, provider text, is_admin boolean,
  files_read int, comments int, forum_posts int, cases_started int, cases_closed int, commendations int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id,
         u.email::text,
         coalesce(nullif(btrim(p.name), ''), split_part(u.email::text, '@', 1)),
         p.avatar_url,
         u.created_at,
         u.last_sign_in_at,
         u.email_confirmed_at IS NOT NULL,
         coalesce(u.raw_app_meta_data->>'provider', 'email'),
         EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin'::app_role),
         (SELECT count(*)::int FROM public.reading_progress rp WHERE rp.user_id = u.id),
         (SELECT count(*)::int FROM public.comments c WHERE c.user_id = u.id),
         (SELECT count(*)::int FROM public.forum_posts f WHERE f.user_id = u.id),
         (SELECT count(DISTINCT ip.chapter_id)::int FROM public.interactive_playthroughs ip WHERE ip.user_id = u.id),
         (SELECT count(DISTINCT ip.chapter_id)::int FROM public.interactive_playthroughs ip WHERE ip.user_id = u.id AND ip.completed_at IS NOT NULL),
         (SELECT count(*)::int FROM public.user_commendations uc WHERE uc.user_id = u.id)
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
   WHERE public.has_role(auth.uid(), 'admin'::app_role)
   ORDER BY u.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_readers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_readers() TO authenticated;

-- One reader's interactive attempts, newest first.
CREATE OR REPLACE FUNCTION public.admin_reader_cases(_user_id uuid)
RETURNS TABLE (
  playthrough_id uuid, chapter_id uuid, case_title text, attempt int, status text, current_node text,
  ending_node text, started_at timestamptz, completed_at timestamptz, updated_at timestamptz, decisions int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.chapter_id, c.title, p.attempt, p.status, p.current_node, p.ending_node,
         p.started_at, p.completed_at, p.updated_at,
         (SELECT count(*)::int FROM public.interactive_decisions d WHERE d.playthrough_id = p.id)
    FROM public.interactive_playthroughs p
    JOIN public.chapters c ON c.id = p.chapter_id
   WHERE public.has_role(auth.uid(), 'admin'::app_role) AND p.user_id = _user_id
   ORDER BY p.updated_at DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_reader_cases(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reader_cases(uuid) TO authenticated;

-- Wipe a reader's attempts at one interactive case so they can start it fresh
-- (decisions and hints go with them). Returns how many attempts were removed.
CREATE OR REPLACE FUNCTION public.admin_reset_case(_user_id uuid, _chapter_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE removed int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  DELETE FROM public.interactive_decisions WHERE user_id = _user_id AND chapter_id = _chapter_id;
  DELETE FROM public.interactive_playthroughs WHERE user_id = _user_id AND chapter_id = _chapter_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.admin_reset_case(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_case(uuid, uuid) TO authenticated;

-- ── 4. Hint tokens (table first: the rank counts hints used) ───────────────
CREATE TABLE IF NOT EXISTS public.ic_hint_uses (
  playthrough_id uuid NOT NULL REFERENCES public.interactive_playthroughs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playthrough_id, node_id)
);
ALTER TABLE public.ic_hint_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Readers see own hint uses" ON public.ic_hint_uses
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.ic_hint_uses FROM anon, authenticated;
GRANT SELECT ON public.ic_hint_uses TO authenticated;

-- Tokens earned by reading and taking part, minus tokens spent. Everyone starts with one.
CREATE OR REPLACE FUNCTION public.ic_hint_tokens(_uid uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT greatest(0,
      1
    + (SELECT count(*) FROM public.reading_progress rp JOIN public.chapters c ON c.id = rp.chapter_id
        WHERE rp.user_id = _uid AND NOT c.is_archived)::int
    + 2 * (SELECT count(DISTINCT chapter_id) FROM public.interactive_playthroughs
            WHERE user_id = _uid AND completed_at IS NOT NULL)::int
    + (SELECT count(*) FROM public.comments WHERE user_id = _uid)::int / 3
    + (SELECT count(*) FROM public.forum_votes v JOIN public.forum_posts fp ON fp.id = v.post_id
        WHERE fp.user_id = _uid)::int / 2
    - (SELECT count(*) FROM public.ic_hint_uses WHERE user_id = _uid)::int)
$$;
REVOKE ALL ON FUNCTION public.ic_hint_tokens(uuid) FROM PUBLIC, anon, authenticated;

-- Tokens left, and the hints already revealed in the reader's latest attempt.
CREATE OR REPLACE FUNCTION public.ic_hint_status(_chapter_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); g jsonb; pt public.interactive_playthroughs;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT interactive_graph INTO g FROM public.chapters WHERE id = _chapter_id;
  SELECT * INTO pt FROM public.interactive_playthroughs
   WHERE user_id = uid AND chapter_id = _chapter_id ORDER BY attempt DESC LIMIT 1;
  RETURN jsonb_build_object(
    'tokens', public.ic_hint_tokens(uid),
    'max', 2,
    'used', coalesce((
      SELECT jsonb_agg(jsonb_build_object('node_id', h.node_id, 'hint', public.ic_find_node(g, h.node_id)->>'hint') ORDER BY h.created_at)
      FROM public.ic_hint_uses h WHERE h.playthrough_id = pt.id
    ), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.ic_hint_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_hint_status(uuid) TO authenticated;

-- Spend a token on the hint for the decision the reader is at (max two per attempt).
CREATE OR REPLACE FUNCTION public.ic_use_hint(_chapter_id uuid, _node_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); g jsonb; pt public.interactive_playthroughs; hint text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT interactive_graph INTO g FROM public.chapters WHERE id = _chapter_id AND story_format = 'interactive';
  IF g IS NULL THEN RAISE EXCEPTION 'not_interactive'; END IF;
  SELECT * INTO pt FROM public.interactive_playthroughs
   WHERE user_id = uid AND chapter_id = _chapter_id AND status = 'in_progress' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_playthrough'; END IF;
  IF pt.current_node IS DISTINCT FROM _node_id THEN RAISE EXCEPTION 'decision_not_reached'; END IF;
  hint := nullif(btrim(coalesce(public.ic_find_node(g, _node_id)->>'hint', '')), '');
  IF hint IS NULL THEN RAISE EXCEPTION 'no_hint'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ic_hint_uses WHERE playthrough_id = pt.id AND node_id = _node_id) THEN
    IF (SELECT count(*) FROM public.ic_hint_uses WHERE playthrough_id = pt.id) >= 2 THEN RAISE EXCEPTION 'hint_limit'; END IF;
    IF public.ic_hint_tokens(uid) < 1 THEN RAISE EXCEPTION 'no_tokens'; END IF;
    INSERT INTO public.ic_hint_uses (playthrough_id, user_id, chapter_id, node_id) VALUES (pt.id, uid, _chapter_id, _node_id);
  END IF;
  RETURN public.ic_hint_status(_chapter_id);
END $$;
REVOKE ALL ON FUNCTION public.ic_use_hint(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_use_hint(uuid, text) TO authenticated;

-- ── 3. Detective rank ──────────────────────────────────────────────────────
-- XP from reading, decisions, outcomes (rare and unique ones count extra),
-- credible votes on theories and comments, minus 10 per hint used.
CREATE OR REPLACE FUNCTION public.cf_rank_xp(_uid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE files int; picks int; outcomes int; rare int; lone int; votes int; posts int; notes int; hints int; xp int;
BEGIN
  SELECT count(*) INTO files FROM public.reading_progress rp JOIN public.chapters c ON c.id = rp.chapter_id
   WHERE rp.user_id = _uid AND NOT c.is_archived;
  SELECT count(*) INTO picks FROM public.interactive_decisions WHERE user_id = _uid;

  WITH mine AS (
    SELECT DISTINCT chapter_id, ending_node FROM public.interactive_playthroughs
     WHERE user_id = _uid AND ending_node IS NOT NULL
  ), totals AS (
    SELECT p.chapter_id, count(DISTINCT p.user_id) AS readers FROM public.interactive_playthroughs p
     WHERE p.ending_node IS NOT NULL AND p.chapter_id IN (SELECT chapter_id FROM mine)
     GROUP BY p.chapter_id
  ), per AS (
    SELECT p.chapter_id, p.ending_node, count(DISTINCT p.user_id) AS n FROM public.interactive_playthroughs p
      JOIN mine m ON m.chapter_id = p.chapter_id AND m.ending_node = p.ending_node
     GROUP BY p.chapter_id, p.ending_node
  )
  SELECT count(*),
         count(*) FILTER (WHERE t.readers >= 10 AND per.n::numeric / t.readers <= 0.10),
         count(*) FILTER (WHERE per.n = 1 AND t.readers > 1)
    INTO outcomes, rare, lone
    FROM per JOIN totals t ON t.chapter_id = per.chapter_id;

  SELECT count(*) INTO votes FROM public.forum_votes v JOIN public.forum_posts fp ON fp.id = v.post_id
   WHERE fp.user_id = _uid AND fp.category = 'theories';
  SELECT count(*) INTO posts FROM public.forum_posts WHERE user_id = _uid AND category = 'theories' AND NOT is_archived;
  SELECT count(*) INTO notes FROM public.comments WHERE user_id = _uid;
  SELECT count(*) INTO hints FROM public.ic_hint_uses WHERE user_id = _uid;

  xp := files * 20 + picks * 5 + outcomes * 40 + rare * 60 + lone * 100 + votes * 15 + posts * 10 + notes * 5 - hints * 10;
  RETURN jsonb_build_object(
    'xp', greatest(xp, 0),
    'reading', files * 20, 'decisions', picks * 5, 'outcomes', outcomes * 40,
    'rare', rare * 60 + lone * 100, 'theories', votes * 15 + posts * 10, 'comments', notes * 5, 'hints', hints * -10,
    'rare_endings', rare, 'lone_endings', lone, 'credible_votes', votes, 'hints_used', hints
  );
END $$;
REVOKE ALL ON FUNCTION public.cf_rank_xp(uuid) FROM PUBLIC, anon, authenticated;

-- Public: a reader's rank and XP, shown on profiles.
CREATE OR REPLACE FUNCTION public.cf_rank(_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id) THEN public.cf_rank_xp(_user_id) END
$$;
REVOKE ALL ON FUNCTION public.cf_rank(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cf_rank(uuid) TO anon, authenticated;
