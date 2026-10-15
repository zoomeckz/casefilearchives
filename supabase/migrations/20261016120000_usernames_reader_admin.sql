-- Unique usernames ----------------------------------------------------------------
-- Display names are unique regardless of case ("Kaiteydave" and "kaiteydave" are the
-- same name). Sign-ups never fail on a taken name: the database adds a number
-- ("Kaiteydave 2"); the sign-up form checks first so readers can pick another.
-- Readers can change their name once every 30 days; admins are exempt.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_changed_at timestamptz;

-- Same cleanup as cf_guard_profile_name: trimmed, single spaces, at most 40 characters.
CREATE OR REPLACE FUNCTION public.cf_norm_name(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(nullif(left(regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g'), 40), ''), 'Reader')
$$;

-- The name itself if it is free, otherwise "name 2", "name 3", …
CREATE OR REPLACE FUNCTION public.cf_unique_name(_name text, _user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base text := public.cf_norm_name(_name);
  cand text := base;
  n int := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(name) = lower(cand) AND user_id IS DISTINCT FROM _user_id) LOOP
    n := n + 1;
    cand := rtrim(left(base, 40 - length(n::text) - 1)) || ' ' || n;
  END LOOP;
  RETURN cand;
END $$;
REVOKE ALL ON FUNCTION public.cf_unique_name(text, uuid) FROM PUBLIC, anon, authenticated;

-- Rename existing duplicates. Confirmed accounts keep the name, then the oldest.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.user_id, p.name FROM (
      SELECT p.user_id, p.name,
             row_number() OVER (PARTITION BY lower(p.name) ORDER BY (u.email_confirmed_at IS NULL), p.created_at) AS rn
      FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.user_id
    ) p WHERE p.rn > 1
  LOOP
    UPDATE public.profiles SET name = public.cf_unique_name(r.name, r.user_id) WHERE user_id = r.user_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_name_unique_ci ON public.profiles (lower(name));

-- Runs after cf_guard_profile_name (triggers fire in name order), so the name is already cleaned up.
CREATE OR REPLACE FUNCTION public.cf_profile_name_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_admin boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.name := public.cf_unique_name(NEW.name, NEW.user_id);
    NEW.name_changed_at := NULL;
    RETURN NEW;
  END IF;

  is_admin := auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role);
  -- Readers cannot reset their own cooldown.
  IF NOT is_admin THEN NEW.name_changed_at := OLD.name_changed_at; END IF;

  IF NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(name) = lower(NEW.name) AND user_id <> NEW.user_id) THEN
    RAISE EXCEPTION 'name_taken' USING ERRCODE = '23505';
  END IF;

  -- Changing only capitals is free.
  IF lower(NEW.name) = lower(OLD.name) THEN RETURN NEW; END IF;

  IF NOT is_admin AND OLD.name_changed_at IS NOT NULL AND OLD.name_changed_at > now() - interval '30 days' THEN
    RAISE EXCEPTION 'name_change_limit:%', to_char(OLD.name_changed_at + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  END IF;

  IF auth.uid() = NEW.user_id THEN NEW.name_changed_at := now(); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cf_profile_name_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cf_profile_name_rules ON public.profiles;
CREATE TRIGGER cf_profile_name_rules BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.cf_profile_name_rules();

-- Is this name free (for the sign-up form and the profile editor), and when may the
-- signed-in reader change their name next (null = now)?
CREATE OR REPLACE FUNCTION public.cf_name_status(_name text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'name', public.cf_norm_name(_name),
    'available', NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE lower(name) = lower(public.cf_norm_name(_name)) AND user_id IS DISTINCT FROM auth.uid()
    ),
    'next_change_at', (
      SELECT p.name_changed_at + interval '30 days' FROM public.profiles p
      WHERE auth.uid() IS NOT NULL AND p.user_id = auth.uid()
        AND p.name_changed_at > now() - interval '30 days'
        AND NOT public.has_role(auth.uid(), 'admin'::app_role)
    )
  )
$$;
GRANT EXECUTE ON FUNCTION public.cf_name_status(text) TO anon, authenticated;

-- Reader management (Admin → Readers → Manage readers) -----------------------------
-- Every function checks the admin role itself.

CREATE OR REPLACE FUNCTION public.admin_reader_detail(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  SELECT jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'name', p.name,
    'bio', p.bio,
    'joined_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed', u.email_confirmed_at IS NOT NULL,
    'provider', coalesce(u.raw_app_meta_data->>'provider', 'email'),
    'banned_until', u.banned_until,
    'name_changed_at', p.name_changed_at,
    'is_admin', public.has_role(u.id, 'admin'::app_role),
    'commendations', coalesce((
      SELECT jsonb_agg(jsonb_build_object('key', uc.key, 'unlocked_at', uc.unlocked_at) ORDER BY uc.unlocked_at)
      FROM public.user_commendations uc WHERE uc.user_id = u.id
    ), '[]'::jsonb)
  ) INTO result
  FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = _user_id;
  IF result IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_reader_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reader_detail(uuid) TO authenticated;

-- Change a reader's name and/or email (null = leave as is). Admin renames skip the cooldown.
CREATE OR REPLACE FUNCTION public.admin_update_reader(_user_id uuid, _name text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN RAISE EXCEPTION 'not_found'; END IF;

  IF _name IS NOT NULL THEN
    UPDATE public.profiles SET name = public.cf_norm_name(_name) WHERE user_id = _user_id;
  END IF;

  IF _email IS NOT NULL THEN
    e := lower(btrim(_email));
    IF e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = e AND id <> _user_id) THEN RAISE EXCEPTION 'email_taken'; END IF;
    UPDATE auth.users SET email = e, updated_at = now() WHERE id = _user_id;
    UPDATE auth.identities SET identity_data = identity_data || jsonb_build_object('email', e)
      WHERE user_id = _user_id AND provider = 'email';
  END IF;

  RETURN public.admin_reader_detail(_user_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_update_reader(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_reader(uuid, text, text) TO authenticated;

-- Small account actions: 'confirm_email', 'reset_name_cooldown', 'reset_all_cases',
-- 'suspend' (_days > 0; 36500 = permanent) and 'unsuspend'.
CREATE OR REPLACE FUNCTION public.admin_reader_action(_user_id uuid, _action text, _days integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN RAISE EXCEPTION 'not_found'; END IF;

  IF _action = 'confirm_email' THEN
    UPDATE auth.users SET email_confirmed_at = coalesce(email_confirmed_at, now()) WHERE id = _user_id;
  ELSIF _action = 'reset_name_cooldown' THEN
    UPDATE public.profiles SET name_changed_at = NULL WHERE user_id = _user_id;
  ELSIF _action = 'reset_all_cases' THEN
    DELETE FROM public.interactive_playthroughs WHERE user_id = _user_id;
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSIF _action = 'suspend' THEN
    IF _user_id = auth.uid() OR public.has_role(_user_id, 'admin'::app_role) THEN RAISE EXCEPTION 'cannot_suspend_admin'; END IF;
    IF coalesce(_days, 0) <= 0 THEN RAISE EXCEPTION 'invalid_days'; END IF;
    UPDATE auth.users SET banned_until = now() + make_interval(days => _days) WHERE id = _user_id;
    BEGIN
      DELETE FROM auth.sessions WHERE user_id = _user_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  ELSIF _action = 'unsuspend' THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = _user_id;
  ELSE
    RAISE EXCEPTION 'unknown_action';
  END IF;

  RETURN public.admin_reader_detail(_user_id) || jsonb_build_object('affected', n);
END $$;
REVOKE ALL ON FUNCTION public.admin_reader_action(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reader_action(uuid, text, integer) TO authenticated;

-- Grant or remove a commendation. Earned ones (reading, cases, comments…) come back
-- the next time the reader's awards are checked; manual grants stay.
CREATE OR REPLACE FUNCTION public.admin_set_commendation(_user_id uuid, _key text, _granted boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF _granted THEN
    INSERT INTO public.user_commendations (user_id, key) VALUES (_user_id, _key) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_commendations WHERE user_id = _user_id AND key = _key;
  END IF;
  RETURN public.admin_reader_detail(_user_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_commendation(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_commendation(uuid, text, boolean) TO authenticated;

-- Delete an account and everything it wrote (comments, posts, progress, awards…).
-- Admin accounts cannot be deleted here.
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

  -- Rows in tables without a cascading link to the account. Two passes, so rows that
  -- other rows point at (a post and its replies) go once their dependants are gone.
  FOR pass IN 1..2 LOOP
    kept := '{}';
    FOR t IN
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'user_id' AND tb.table_type = 'BASE TABLE'
        AND c.table_name NOT IN ('profiles', 'user_roles')
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', t.table_name) USING _user_id;
      EXCEPTION WHEN OTHERS THEN
        kept := kept || t.table_name::text;
      END;
    END LOOP;
  END LOOP;

  DELETE FROM public.profiles WHERE user_id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
  RETURN jsonb_build_object('deleted', true, 'kept', kept);
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_reader(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_reader(uuid) TO authenticated;
