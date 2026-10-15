-- Follow-ups after review.

-- 1. ic_present also returns when the decision was first shown, so a reader who
--    switches device sees the clock that is already running instead of a fresh one.
CREATE OR REPLACE FUNCTION public.ic_present(_chapter_id uuid, _node_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); pt public.interactive_playthroughs; shown timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO pt FROM public.interactive_playthroughs
   WHERE user_id = uid AND chapter_id = _chapter_id AND status = 'in_progress' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_playthrough'; END IF;
  IF pt.current_node IS DISTINCT FROM _node_id THEN RAISE EXCEPTION 'decision_not_reached'; END IF;
  shown := pt.presented_at;
  -- Only the first sighting of this decision counts; reloading does not restart the clock.
  IF shown IS NULL OR shown < pt.updated_at THEN
    shown := now();
    UPDATE public.interactive_playthroughs SET presented_at = shown WHERE id = pt.id;
  END IF;
  RETURN public.ic_state(pt.id) || jsonb_build_object('presented_at', shown);
END $$;
REVOKE ALL ON FUNCTION public.ic_present(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_present(uuid, text) TO authenticated;

-- 2. Indexes for the per-reader counts behind hint tokens, rank and the admin list.
CREATE INDEX IF NOT EXISTS ic_hint_uses_user_idx ON public.ic_hint_uses (user_id);
CREATE INDEX IF NOT EXISTS interactive_playthroughs_user_chapter_idx ON public.interactive_playthroughs (user_id, chapter_id);
CREATE INDEX IF NOT EXISTS interactive_decisions_user_idx ON public.interactive_decisions (user_id);

-- 3. Account deletion also clears referral rows and anything else linked to the
--    account by a foreign key, whatever the column is called.
CREATE OR REPLACE FUNCTION public.admin_delete_reader(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record;
  pass integer;
  kept text[] := '{}';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF _user_id = auth.uid() OR public.has_role(_user_id, 'admin'::app_role) THEN RAISE EXCEPTION 'cannot_delete_admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN RAISE EXCEPTION 'not_found'; END IF;

  -- Two passes, so rows that other rows point at (a post and its replies) go once
  -- their dependants are gone.
  FOR pass IN 1..2 LOOP
    kept := '{}';
    FOR t IN
      SELECT DISTINCT c.table_name::text AS table_name, c.column_name::text AS column_name
        FROM information_schema.columns c
        JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
       WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE' AND c.data_type = 'uuid'
         AND c.column_name IN ('user_id', 'referrer_id', 'referred_id')
         AND c.table_name NOT IN ('profiles', 'user_roles')
      UNION
      SELECT DISTINCT cl.relname::text, a.attname::text
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
       WHERE con.contype = 'f' AND con.confrelid = 'auth.users'::regclass
         AND cl.relname NOT IN ('profiles', 'user_roles')
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', t.table_name, t.column_name) USING _user_id;
      EXCEPTION WHEN OTHERS THEN
        kept := kept || (t.table_name || '.' || t.column_name);
      END;
    END LOOP;
  END LOOP;

  DELETE FROM public.profiles WHERE user_id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
  RETURN jsonb_build_object('deleted', true, 'kept', kept);
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_reader(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_reader(uuid) TO authenticated;
