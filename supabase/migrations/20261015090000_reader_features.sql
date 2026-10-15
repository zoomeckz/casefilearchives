-- Reader features: resume reading, series, theory votes, ending statistics,
-- and the commendations that go with them.

-- ── Resume reading ─────────────────────────────────────────────────────────
-- How far (0–100 %) a signed-in reader has scrolled through a story, so the
-- position follows them across devices. Guests keep theirs in the browser.
CREATE TABLE IF NOT EXISTS public.reading_positions (
  user_id uuid NOT NULL,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  progress real NOT NULL CHECK (progress >= 0 AND progress <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chapter_id)
);
ALTER TABLE public.reading_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Readers read own positions" ON public.reading_positions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Readers save own positions" ON public.reading_positions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Readers update own positions" ON public.reading_positions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Readers clear own positions" ON public.reading_positions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_positions TO authenticated;

-- ── Series and collections ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  cover_image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.series_entries (
  series_id uuid NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  PRIMARY KEY (series_id, chapter_id)
);
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Series are public" ON public.series FOR SELECT USING (true);
CREATE POLICY "Admins manage series" ON public.series FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Series entries are public" ON public.series_entries FOR SELECT USING (true);
CREATE POLICY "Admins manage series entries" ON public.series_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.series, public.series_entries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.series, public.series_entries TO authenticated;

-- ── Theory votes ("credible") on forum posts ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_votes (
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Votes are public" ON public.forum_votes FOR SELECT USING (true);
-- One vote per reader per post, never on your own post.
CREATE POLICY "Readers vote on others' posts" ON public.forum_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.forum_posts p WHERE p.id = post_id AND p.user_id = auth.uid()
  ));
CREATE POLICY "Readers withdraw own votes" ON public.forum_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());
GRANT SELECT ON public.forum_votes TO anon, authenticated;
GRANT INSERT, DELETE ON public.forum_votes TO authenticated;

-- ── Ending statistics ──────────────────────────────────────────────────────
-- How many readers reached each outcome of a case. Only readers who have
-- closed the case themselves (or admins) may see it, so it never spoils.
CREATE OR REPLACE FUNCTION public.ic_ending_stats(_chapter_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_role(uid, 'admin'::app_role) AND NOT EXISTS (
    SELECT 1 FROM public.interactive_playthroughs
    WHERE user_id = uid AND chapter_id = _chapter_id AND completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'case_not_closed';
  END IF;

  RETURN jsonb_build_object(
    'readers', (
      SELECT count(DISTINCT user_id) FROM public.interactive_playthroughs
      WHERE chapter_id = _chapter_id AND ending_node IS NOT NULL
    ),
    'endings', (
      SELECT coalesce(jsonb_object_agg(ending_node, n), '{}'::jsonb) FROM (
        SELECT ending_node, count(DISTINCT user_id) AS n FROM public.interactive_playthroughs
        WHERE chapter_id = _chapter_id AND ending_node IS NOT NULL
        GROUP BY ending_node
      ) e
    )
  );
END $$;
REVOKE ALL ON FUNCTION public.ic_ending_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_ending_stats(uuid) TO authenticated;

-- ── Commendations ──────────────────────────────────────────────────────────
INSERT INTO public.commendations (key, title, description, category, points, reward_frame, reward_title, sort_order) VALUES
  ('lone_witness', 'Lone Witness', 'Reach an outcome no other reader has reached.', 'interactive', 30, NULL, 'Lone Witness', 75)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, category = EXCLUDED.category,
  points = EXCLUDED.points, reward_title = EXCLUDED.reward_title, sort_order = EXCLUDED.sort_order;

UPDATE public.commendations
SET description = 'Post 10 theories, or write the top-rated theory on a case (5+ credible votes).'
WHERE key = 'lead_detective';

-- cf_sync gains two checks: the top-rated theory route to Lead Detective, and
-- Lone Witness. Their counts are added to the stats it returns.
CREATE OR REPLACE FUNCTION public.cf_sync(_tz text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s jsonb; earned text[] := '{}'::text[]; top_theories int; lone_endings int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  IF _tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = _tz) THEN
    INSERT INTO public.profile_settings (user_id, timezone) VALUES (uid, _tz)
    ON CONFLICT (user_id) DO UPDATE SET timezone = EXCLUDED.timezone
    WHERE public.profile_settings.timezone IS DISTINCT FROM EXCLUDED.timezone;
  END IF;

  s := public.cf_stats(uid, _tz);

  -- Theories of this reader that lead their case with at least 5 credible votes.
  WITH votes AS (
    SELECT fp.id, fp.user_id, fp.story_id, (SELECT count(*) FROM public.forum_votes v WHERE v.post_id = fp.id) AS n
    FROM public.forum_posts fp
    WHERE fp.category = 'theories' AND NOT fp.is_archived AND fp.story_id IS NOT NULL
  )
  SELECT count(*) INTO top_theories FROM votes mine
  WHERE mine.user_id = uid AND mine.n >= 5
    AND NOT EXISTS (SELECT 1 FROM votes other WHERE other.story_id = mine.story_id AND other.id <> mine.id AND other.n > mine.n);

  -- Outcomes this reader reached that nobody else has.
  SELECT count(*) INTO lone_endings FROM (
    SELECT DISTINCT p.chapter_id, p.ending_node FROM public.interactive_playthroughs p
    WHERE p.user_id = uid AND p.ending_node IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.interactive_playthroughs q
        WHERE q.chapter_id = p.chapter_id AND q.ending_node = p.ending_node AND q.user_id <> uid
      )
  ) x;

  s := s || jsonb_build_object('top_theories', top_theories, 'lone_endings', lone_endings);

  IF (s->>'files_read')::int >= 1 THEN earned := array_append(earned, 'case_opened'); END IF;
  IF (s->>'files_read')::int >= 5 THEN earned := array_append(earned, 'field_agent'); END IF;
  IF (s->>'files_read')::int >= 15 THEN earned := array_append(earned, 'senior_investigator'); END IF;
  IF (s->>'published')::int > 0 AND (s->>'published_read')::int >= (s->>'published')::int THEN
    earned := array_append(earned, 'archivist');
  END IF;
  IF (s->>'decisions')::int >= 1 THEN earned := array_append(earned, 'first_decision'); END IF;
  IF (s->>'endings')::int >= 1 THEN earned := array_append(earned, 'case_closed'); END IF;
  IF (s->>'every_angle')::boolean THEN earned := array_append(earned, 'every_angle'); END IF;
  IF lone_endings >= 1 THEN earned := array_append(earned, 'lone_witness'); END IF;
  IF (s->>'night_shift')::boolean THEN earned := array_append(earned, 'night_shift'); END IF;
  IF (s->>'best_streak')::int >= 7 THEN earned := array_append(earned, 'stakeout'); END IF;
  IF (s->>'comments')::int >= 1 THEN earned := array_append(earned, 'statement_given'); END IF;
  IF (s->>'comments')::int >= 10 THEN earned := array_append(earned, 'informant'); END IF;
  IF (s->>'theories')::int >= 1 THEN earned := array_append(earned, 'theorist'); END IF;
  IF (s->>'theories')::int >= 10 OR top_theories >= 1 THEN earned := array_append(earned, 'lead_detective'); END IF;
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
REVOKE ALL ON FUNCTION public.cf_sync(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf_sync(text) TO authenticated;
