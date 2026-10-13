-- Moves playthroughs saved outside the normal tables back into them.
--
-- While ic_choose was broken (fixed in 20261012140000), signed-in readers played
-- on in their browser. Their closing answer was saved as a reading event
-- (interactive_events, kind 'answer', meta.local = true) holding the case, the
-- ending (node_id), every decision (meta.d = [[node, option], …]), the variables
-- (meta.v), the answer (meta.text) and when the case was closed (meta.at).
--
-- ic_migrate_browser_reports() rebuilds each one as an ordinary playthrough:
-- decisions replayed through the same engine (ic_resolve), the answer filed, so
-- it appears in Admin → Case reports ready for a reply. Moved events are marked
-- (meta.migrated), so it can run any number of times. Readers still part-way
-- through are moved by the site itself on their next visit. Admins can run this
-- from Case reports; it also runs once here.

-- One playthrough rebuilt from its decisions. Returns its id, or NULL when the
-- reader's server record already holds progress of its own (theirs wins).
CREATE OR REPLACE FUNCTION public.ic_rebuild_playthrough(
  _user uuid, _chapter uuid, _decisions jsonb, _finished boolean,
  _answer text, _closed_at timestamptz, _answered_at timestamptz, _ending text, _fallback_vars jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g jsonb; pt public.interactive_playthroughs; target uuid; target_status text; next_attempt int;
  res jsonb; vars jsonb := '{}'::jsonb; vis jsonb; cur text; d jsonb; n jsonb; opt jsonb; e jsonb;
  step int := 0; total int; complete_route boolean; terminal boolean := false;
BEGIN
  SELECT c.interactive_graph INTO g FROM public.chapters c WHERE c.id = _chapter;
  IF g IS NULL THEN RETURN NULL; END IF;
  total := CASE WHEN jsonb_typeof(_decisions) = 'array' THEN jsonb_array_length(_decisions) ELSE 0 END;

  SELECT * INTO pt FROM public.interactive_playthroughs p
   WHERE p.user_id = _user AND p.chapter_id = _chapter AND p.status IN ('in_progress', 'completed')
   FOR UPDATE;
  IF FOUND AND pt.status = 'in_progress'
     AND NOT EXISTS (SELECT 1 FROM public.interactive_decisions x WHERE x.playthrough_id = pt.id) THEN
    -- The playthrough the broken server left at the first decision: carry on in it.
    target := pt.id;
    target_status := CASE WHEN _finished THEN 'completed' ELSE 'in_progress' END;
  ELSIF NOT _finished AND FOUND THEN
    RETURN NULL; -- unfinished, and the reader already has server progress of their own
  ELSE
    IF NOT _finished THEN
      target_status := 'in_progress';
    ELSIF FOUND AND pt.status = 'completed' AND coalesce(pt.completed_at, pt.updated_at) <= _closed_at THEN
      UPDATE public.interactive_playthroughs SET status = 'replayed', updated_at = now() WHERE id = pt.id;
      target_status := 'completed';
    ELSIF FOUND THEN
      target_status := 'replayed'; -- older than what is on the server: kept as history
    ELSE
      target_status := 'completed';
    END IF;
    SELECT coalesce(max(attempt), 0) + 1 INTO next_attempt FROM public.interactive_playthroughs
     WHERE user_id = _user AND chapter_id = _chapter;
    INSERT INTO public.interactive_playthroughs (user_id, chapter_id, attempt, status, current_node, visited, started_at)
    VALUES (_user, _chapter, next_attempt, CASE WHEN target_status = 'replayed' THEN 'replayed' ELSE 'in_progress' END,
            NULL, '[]'::jsonb, coalesce(_closed_at, now()))
    RETURNING id INTO target;
  END IF;

  -- Replay the decisions from the opening, exactly as ic_choose would have.
  res := public.ic_resolve(g, g->>'startNodeId', '{}'::jsonb);
  vis := coalesce(res->'visited', '[]'::jsonb);
  cur := res->>'current';
  complete_route := true;
  FOR d IN SELECT * FROM jsonb_array_elements(CASE WHEN total > 0 THEN _decisions ELSE '[]'::jsonb END) LOOP
    step := step + 1;
    n := public.ic_find_node(g, d->>0);
    opt := NULL;
    SELECT o INTO opt FROM jsonb_array_elements(coalesce(n->'options', '[]'::jsonb)) o WHERE o->>'id' = d->>1 LIMIT 1;
    -- The case was edited since: keep what still matches and stop there.
    IF n IS NULL OR opt IS NULL OR cur IS DISTINCT FROM d->>0 THEN complete_route := false; EXIT; END IF;
    INSERT INTO public.interactive_decisions (playthrough_id, user_id, chapter_id, node_id, option_id, option_label, created_at)
    VALUES (target, _user, _chapter, d->>0, d->>1, opt->>'label',
            coalesce(_closed_at, now()) - make_interval(secs => total - step + 1))
    ON CONFLICT (playthrough_id, node_id) DO NOTHING;
    FOR e IN SELECT * FROM jsonb_array_elements(coalesce(opt->'effects', '[]'::jsonb)) LOOP
      IF coalesce(e->>'var', '') = '' THEN CONTINUE; END IF;
      IF e->>'op' = 'add' THEN
        BEGIN
          vars := vars || jsonb_build_object(e->>'var', (coalesce(nullif(vars->>(e->>'var'), ''), '0')::numeric + coalesce(nullif(e->>'value', ''), '0')::numeric)::text);
        EXCEPTION WHEN others THEN NULL;
        END;
      ELSE
        vars := vars || jsonb_build_object(e->>'var', coalesce(e->>'value', ''));
      END IF;
    END LOOP;
    res := public.ic_resolve(g, nullif(opt->>'next', ''), vars);
    vis := vis || coalesce(res->'visited', '[]'::jsonb);
    cur := res->>'current';
    terminal := coalesce((res->>'terminal')::boolean, false);
  END LOOP;
  IF total = 0 THEN complete_route := false; END IF;
  IF NOT complete_route AND jsonb_typeof(_fallback_vars) = 'object' THEN vars := _fallback_vars; END IF;

  UPDATE public.interactive_playthroughs SET
    status = target_status,
    current_node = CASE WHEN _finished THEN coalesce(_ending, cur) ELSE cur END,
    visited = vis,
    variables = vars,
    ending_node = CASE WHEN _finished THEN coalesce(_ending, CASE WHEN terminal THEN cur END) END,
    completed_at = CASE WHEN _finished THEN coalesce(_closed_at, now()) END,
    final_answer = CASE WHEN _finished AND btrim(coalesce(_answer, '')) <> '' THEN left(btrim(_answer), 2000) END,
    answered_at = CASE WHEN _finished AND btrim(coalesce(_answer, '')) <> '' THEN coalesce(_answered_at, now()) END,
    updated_at = now()
  WHERE id = target;
  RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.ic_rebuild_playthrough(uuid, uuid, jsonb, boolean, text, timestamptz, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ic_migrate_browser_reports()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev record; target uuid; answer text;
  moved int := 0; skipped int := 0;
BEGIN
  -- From the site: admins only. As a migration there is no user, which is allowed.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  -- Answers saved as reading events.
  FOR ev IN
    SELECT x.* FROM public.interactive_events x
     WHERE x.kind = 'answer' AND x.meta->>'local' = 'true' AND x.meta->>'migrated' IS NULL
       AND x.user_id IS NOT NULL AND x.case_key ~ '^[0-9a-fA-F-]{36}$'
     ORDER BY x.created_at
  LOOP
    answer := btrim(coalesce(ev.meta->>'text', ''));
    target := NULL;
    SELECT p.id INTO target FROM public.interactive_playthroughs p
     WHERE p.user_id = ev.user_id AND p.chapter_id = ev.case_key::uuid AND p.final_answer = answer LIMIT 1;
    IF target IS NULL AND answer <> '' THEN
      target := public.ic_rebuild_playthrough(
        ev.user_id, ev.case_key::uuid, ev.meta->'d', true, answer,
        coalesce(nullif(ev.meta->>'at', '')::timestamptz, ev.created_at), ev.created_at, ev.node_id, ev.meta->'v');
      IF target IS NOT NULL THEN moved := moved + 1; END IF;
    ELSE
      skipped := skipped + 1;
    END IF;
    UPDATE public.interactive_events SET meta = meta || jsonb_build_object('migrated', coalesce(target::text, 'skipped')) WHERE id = ev.id;
  END LOOP;

  RETURN jsonb_build_object('moved', moved, 'skipped', skipped);
END $$;
REVOKE ALL ON FUNCTION public.ic_migrate_browser_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_migrate_browser_reports() TO authenticated;

-- Move everything saved so far.
SELECT public.ic_migrate_browser_reports();
