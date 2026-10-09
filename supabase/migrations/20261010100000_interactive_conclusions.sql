-- Interactive Case Files: written conclusions and the one-week retry lock.

-- A reader's typed answer at the end of a case, filed once per playthrough.
ALTER TABLE public.interactive_playthroughs
  ADD COLUMN IF NOT EXISTS final_answer text,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz;

CREATE OR REPLACE FUNCTION public.ic_answer(_chapter_id uuid, _answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); pt public.interactive_playthroughs; clean text := btrim(coalesce(_answer, ''));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF clean = '' THEN RAISE EXCEPTION 'empty_answer'; END IF;
  IF length(clean) > 2000 THEN RAISE EXCEPTION 'answer_too_long'; END IF;

  SELECT * INTO pt FROM public.interactive_playthroughs
   WHERE user_id = uid AND chapter_id = _chapter_id AND status = 'completed'
   ORDER BY attempt DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_closed'; END IF;
  IF pt.final_answer IS NOT NULL THEN RAISE EXCEPTION 'already_answered'; END IF;

  UPDATE public.interactive_playthroughs SET final_answer = clean, answered_at = now() WHERE id = pt.id;
  RETURN public.ic_state(pt.id);
END $$;
REVOKE ALL ON FUNCTION public.ic_answer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_answer(uuid, text) TO authenticated;

-- Retry lock: unless a case says otherwise, a closed case reopens for a new
-- attempt one week (168 hours) after it was completed.
CREATE OR REPLACE FUNCTION public.ic_start(_chapter_id uuid, _replay boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); ch public.chapters; g jsonb; pt public.interactive_playthroughs;
  res jsonb; pol text; next_attempt int; is_admin boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  is_admin := public.has_role(uid, 'admin'::app_role);
  SELECT * INTO ch FROM public.chapters WHERE id = _chapter_id AND story_format = 'interactive';
  IF NOT FOUND OR ch.interactive_graph IS NULL THEN RAISE EXCEPTION 'not_interactive'; END IF;
  IF NOT is_admin AND (ch.is_archived OR ch.published_at > now() OR (ch.scheduled_at IS NOT NULL AND ch.scheduled_at > now())) THEN
    RAISE EXCEPTION 'not_available';
  END IF;
  g := ch.interactive_graph;

  SELECT * INTO pt FROM public.interactive_playthroughs
   WHERE user_id = uid AND chapter_id = _chapter_id AND status IN ('in_progress', 'completed') FOR UPDATE;
  IF FOUND THEN
    IF NOT _replay OR pt.status <> 'completed' THEN RETURN public.ic_state(pt.id); END IF;
    pol := coalesce(nullif(g->'settings'->>'replay', ''), 'after_wait');
    IF NOT (pol = 'after_completion'
        OR (pol = 'after_wait' AND pt.completed_at + make_interval(hours => coalesce(nullif(g->'settings'->>'replayWaitHours','')::int, 168)) <= now())
        OR (pol = 'admin_only' AND is_admin)) THEN
      RAISE EXCEPTION 'replay_not_permitted';
    END IF;
    UPDATE public.interactive_playthroughs SET status = 'replayed', updated_at = now() WHERE id = pt.id;
  END IF;

  SELECT coalesce(max(attempt), 0) + 1 INTO next_attempt FROM public.interactive_playthroughs WHERE user_id = uid AND chapter_id = _chapter_id;
  res := public.ic_resolve(g, g->>'startNodeId', '{}'::jsonb);
  INSERT INTO public.interactive_playthroughs (user_id, chapter_id, attempt, status, current_node, visited, ending_node, completed_at)
  VALUES (uid, _chapter_id, next_attempt,
          CASE WHEN (res->>'terminal')::boolean THEN 'completed' ELSE 'in_progress' END,
          res->>'current', res->'visited', res->>'ending',
          CASE WHEN (res->>'terminal')::boolean THEN now() END)
  RETURNING * INTO pt;
  RETURN public.ic_state(pt.id);
END $$;
REVOKE ALL ON FUNCTION public.ic_start(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_start(uuid, boolean) TO authenticated;
