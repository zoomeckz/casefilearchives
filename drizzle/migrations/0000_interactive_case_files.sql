ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS story_format text NOT NULL DEFAULT 'linear',
  ADD COLUMN IF NOT EXISTS interactive_graph jsonb;

CREATE TABLE public.interactive_playthroughs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'in_progress',
  current_node text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  visited jsonb NOT NULL DEFAULT '[]'::jsonb,
  ending_node text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, chapter_id, attempt)
);
CREATE UNIQUE INDEX interactive_playthroughs_one_current
  ON public.interactive_playthroughs (user_id, chapter_id)
  WHERE status IN ('in_progress', 'completed');

GRANT SELECT ON public.interactive_playthroughs TO authenticated;
GRANT ALL ON public.interactive_playthroughs TO service_role;
ALTER TABLE public.interactive_playthroughs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Readers see own playthroughs" ON public.interactive_playthroughs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins see all playthroughs" ON public.interactive_playthroughs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.interactive_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playthrough_id uuid NOT NULL REFERENCES public.interactive_playthroughs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  option_id text NOT NULL,
  option_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playthrough_id, node_id)
);
GRANT SELECT ON public.interactive_decisions TO authenticated;
GRANT ALL ON public.interactive_decisions TO service_role;
ALTER TABLE public.interactive_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Readers see own decisions" ON public.interactive_decisions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins see all decisions" ON public.interactive_decisions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.ic_eval_conds(_conds jsonb, _vars jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE c jsonb; v text; target text; op text;
BEGIN
  IF _conds IS NULL OR jsonb_typeof(_conds) <> 'array' THEN RETURN true; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(_conds) LOOP
    IF coalesce(c->>'var', '') = '' THEN CONTINUE; END IF;
    v := _vars->>(c->>'var');
    target := c->>'value';
    op := coalesce(c->>'op', 'eq');
    IF op = 'eq' THEN
      IF coalesce(v, '') <> coalesce(target, '') THEN RETURN false; END IF;
    ELSIF op = 'neq' THEN
      IF coalesce(v, '') = coalesce(target, '') THEN RETURN false; END IF;
    ELSIF op = 'truthy' THEN
      IF v IS NULL OR v IN ('', 'false', '0') THEN RETURN false; END IF;
    ELSIF op = 'falsy' THEN
      IF NOT (v IS NULL OR v IN ('', 'false', '0')) THEN RETURN false; END IF;
    ELSIF op IN ('gt', 'gte', 'lt', 'lte') THEN
      BEGIN
        IF (op = 'gt' AND NOT (coalesce(nullif(v,''),'0')::numeric > target::numeric))
          OR (op = 'gte' AND NOT (coalesce(nullif(v,''),'0')::numeric >= target::numeric))
          OR (op = 'lt' AND NOT (coalesce(nullif(v,''),'0')::numeric < target::numeric))
          OR (op = 'lte' AND NOT (coalesce(nullif(v,''),'0')::numeric <= target::numeric)) THEN
          RETURN false;
        END IF;
      EXCEPTION WHEN others THEN RETURN false;
      END;
    END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.ic_find_node(_graph jsonb, _id text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT x FROM jsonb_array_elements(coalesce(_graph->'nodes', '[]'::jsonb)) x WHERE x->>'id' = _id LIMIT 1
$$;

-- Walks narrative nodes from _start until a decision, ending, or dead end.
CREATE OR REPLACE FUNCTION public.ic_resolve(_graph jsonb, _start text, _vars jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE cur text := _start; n jsonb; visited jsonb := '[]'::jsonb; i int := 0; r jsonb; nxt text;
BEGIN
  LOOP
    i := i + 1;
    IF i > 300 OR cur IS NULL THEN
      RETURN jsonb_build_object('current', NULL, 'visited', visited, 'terminal', true);
    END IF;
    n := public.ic_find_node(_graph, cur);
    IF n IS NULL THEN
      RETURN jsonb_build_object('current', NULL, 'visited', visited, 'terminal', true, 'error', 'missing_node');
    END IF;
    IF coalesce(n->>'type', 'narrative') = 'narrative' AND NOT public.ic_eval_conds(n->'conditions', _vars) THEN
      cur := nullif(n->>'next', '');
      CONTINUE;
    END IF;
    visited := visited || to_jsonb(cur);
    IF n->>'type' = 'decision' THEN
      RETURN jsonb_build_object('current', cur, 'visited', visited, 'terminal', false);
    END IF;
    IF n->>'type' = 'ending' THEN
      RETURN jsonb_build_object('current', cur, 'visited', visited, 'terminal', true, 'ending', cur);
    END IF;
    nxt := NULL;
    FOR r IN SELECT * FROM jsonb_array_elements(coalesce(n->'routes', '[]'::jsonb)) LOOP
      IF coalesce(r->>'to', '') <> '' AND public.ic_eval_conds(r->'conditions', _vars) THEN
        nxt := r->>'to'; EXIT;
      END IF;
    END LOOP;
    IF nxt IS NULL THEN nxt := nullif(n->>'next', ''); END IF;
    IF nxt IS NULL THEN
      RETURN jsonb_build_object('current', cur, 'visited', visited, 'terminal', true);
    END IF;
    cur := nxt;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.ic_state(_pt_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'playthrough', to_jsonb(p),
    'decisions', coalesce((SELECT jsonb_agg(jsonb_build_object('node_id', d.node_id, 'option_id', d.option_id, 'option_label', d.option_label, 'created_at', d.created_at) ORDER BY d.created_at)
                           FROM public.interactive_decisions d WHERE d.playthrough_id = p.id), '[]'::jsonb)
  ) FROM public.interactive_playthroughs p WHERE p.id = _pt_id
$$;

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
    pol := coalesce(g->'settings'->>'replay', 'disabled');
    IF NOT (pol = 'after_completion'
        OR (pol = 'after_wait' AND pt.completed_at + make_interval(hours => coalesce(nullif(g->'settings'->>'replayWaitHours','')::int, 24)) <= now())
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

CREATE OR REPLACE FUNCTION public.ic_choose(_chapter_id uuid, _node_id text, _option_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); g jsonb; pt public.interactive_playthroughs; n jsonb; opt jsonb; e jsonb;
  vars jsonb; res jsonb; nxt text; locked jsonb;
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
  SELECT o INTO opt FROM jsonb_array_elements(coalesce(n->'options', '[]'::jsonb)) o WHERE o->>'id' = _option_id LIMIT 1;
  IF opt IS NULL THEN RAISE EXCEPTION 'invalid_option'; END IF;

  vars := pt.variables;
  locked := coalesce(opt->'lockedIf', '[]'::jsonb);
  IF NOT public.ic_eval_conds(opt->'visibleIf', vars)
     OR (jsonb_array_length(locked) > 0 AND public.ic_eval_conds(locked, vars)) THEN
    RAISE EXCEPTION 'option_unavailable';
  END IF;
  nxt := nullif(opt->>'next', '');
  IF nxt IS NULL OR public.ic_find_node(g, nxt) IS NULL THEN RAISE EXCEPTION 'broken_link'; END IF;

  INSERT INTO public.interactive_decisions (playthrough_id, user_id, chapter_id, node_id, option_id, option_label)
  VALUES (pt.id, uid, _chapter_id, _node_id, _option_id, opt->>'label');

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

REVOKE ALL ON FUNCTION public.ic_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_start(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ic_choose(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_start(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ic_choose(uuid, text, text) TO authenticated;