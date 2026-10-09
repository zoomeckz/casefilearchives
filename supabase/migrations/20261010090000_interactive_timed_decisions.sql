-- Timed decisions for Interactive Case Files.
-- A decision node may carry "timeLimit" (seconds). The clock starts when the
-- reader reaches the decision (interactive_playthroughs.updated_at). Once the
-- limit plus a short grace period has passed, the server ignores the submitted
-- option and files a random available one, so the limit cannot be dodged by
-- refreshing or by editing requests.

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
  IF tl IS NOT NULL AND tl > 0 AND now() > pt.updated_at + make_interval(secs => (tl + 5)::double precision) THEN
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
    visited = visited || res->'visited',
    status = CASE WHEN (res->>'terminal')::boolean THEN 'completed' ELSE 'in_progress' END,
    ending_node = res->>'ending',
    completed_at = CASE WHEN (res->>'terminal')::boolean THEN now() END,
    updated_at = now()
  WHERE id = pt.id;
  RETURN public.ic_state(pt.id);
END $$;

REVOKE ALL ON FUNCTION public.ic_choose(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_choose(uuid, text, text) TO authenticated;
