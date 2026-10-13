-- Interactive Case Files: "once per calendar month" replay, and a rate limit
-- on reading analytics.
--
-- 1. Replay policy 'monthly': each reader gets one attempt per calendar month.
--    The month is counted in Stockholm time from when the attempt was STARTED,
--    so a case tried on the 30th reopens on the 1st, and one tried on the 1st
--    also reopens on the 1st of the next month. maxAttempts (if set) still caps
--    the total. Admins may always start a new attempt, so they can keep testing.
CREATE OR REPLACE FUNCTION public.ic_start(_chapter_id uuid, _replay boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); ch public.chapters; g jsonb; pt public.interactive_playthroughs;
  res jsonb; pol text; next_attempt int; is_admin boolean; max_attempts int;
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
    max_attempts := CASE WHEN coalesce(g->'settings'->>'maxAttempts', '') ~ '^[0-9]+$'
                         THEN (g->'settings'->>'maxAttempts')::int ELSE 0 END;
    IF NOT is_admin AND max_attempts > 0 AND pt.attempt >= max_attempts THEN
      RAISE EXCEPTION 'attempt_limit_reached';
    END IF;
    pol := coalesce(nullif(g->'settings'->>'replay', ''), 'after_wait');
    IF NOT (pol = 'after_completion'
        OR (pol = 'after_wait' AND pt.completed_at + make_interval(hours => coalesce(nullif(g->'settings'->>'replayWaitHours','')::int, 168)) <= now())
        OR (pol = 'monthly' AND (is_admin
            OR date_trunc('month', now() AT TIME ZONE 'Europe/Stockholm')
               > date_trunc('month', pt.started_at AT TIME ZONE 'Europe/Stockholm')))
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

-- 2. Reading analytics rate limit. Anyone may log events, so a script could
--    flood the table. Each sender (by hashed IP address, falling back to the
--    device id) may log at most 240 events a minute and 5,000 a day; anything
--    beyond that is silently dropped, so real readers never see an error.
ALTER TABLE public.interactive_events ADD COLUMN IF NOT EXISTS sender text;
CREATE INDEX IF NOT EXISTS interactive_events_sender_idx ON public.interactive_events (sender, created_at);

CREATE OR REPLACE FUNCTION public.ic_events_throttle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  headers json; ip text; per_minute int; per_day int;
BEGIN
  BEGIN
    headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN headers := NULL;
  END;
  ip := btrim(split_part(coalesce(headers->>'cf-connecting-ip', headers->>'x-forwarded-for', headers->>'x-real-ip', ''), ',', 1));
  NEW.sender := CASE WHEN ip <> '' THEN 'ip:' || md5(ip) ELSE 'dev:' || NEW.device_id END;

  SELECT count(*) INTO per_minute FROM public.interactive_events
   WHERE sender = NEW.sender AND created_at > now() - interval '1 minute';
  IF per_minute >= 240 THEN RETURN NULL; END IF;

  SELECT count(*) INTO per_day FROM public.interactive_events
   WHERE sender = NEW.sender AND created_at > now() - interval '1 day';
  IF per_day >= 5000 THEN RETURN NULL; END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ic_events_throttle ON public.interactive_events;
CREATE TRIGGER ic_events_throttle BEFORE INSERT ON public.interactive_events
  FOR EACH ROW EXECUTE FUNCTION public.ic_events_throttle();