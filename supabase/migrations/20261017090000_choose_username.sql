-- 5. Readers choose their own username.
-- Google sign-ups start with their Google name. Until they pick a username (or keep
-- that one) the site asks them to. The first pick is free; after that the
-- once-a-month limit applies. Admin renames count as chosen.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_chosen boolean NOT NULL DEFAULT false;

-- Already chosen: email sign-ups (they typed it), admins, and anyone whose name
-- is no longer the one their Google account gave them.
UPDATE public.profiles p SET name_chosen = true
FROM auth.users u
WHERE u.id = p.user_id AND NOT p.name_chosen AND (
  coalesce(u.raw_app_meta_data->>'provider', 'email') = 'email'
  OR p.name_changed_at IS NOT NULL
  OR public.has_role(u.id, 'admin'::app_role)
  OR lower(p.name) <> lower(coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', p.name))
);

CREATE OR REPLACE FUNCTION public.cf_profile_name_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_admin boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.name := public.cf_unique_name(NEW.name, NEW.user_id);
    NEW.name_changed_at := NULL;
    -- Email sign-ups type their username in the form; Google sign-ups get asked later.
    NEW.name_chosen := EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = NEW.user_id AND coalesce(u.raw_app_meta_data->>'provider', 'email') = 'email'
    );
    RETURN NEW;
  END IF;

  is_admin := auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role);
  IF NOT is_admin THEN
    -- Readers cannot reset their own cooldown, and cannot undo having chosen.
    NEW.name_changed_at := OLD.name_changed_at;
    NEW.name_chosen := OLD.name_chosen OR coalesce(NEW.name_chosen, false);
  END IF;

  IF NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(name) = lower(NEW.name) AND user_id <> NEW.user_id) THEN
    RAISE EXCEPTION 'name_taken' USING ERRCODE = '23505';
  END IF;

  NEW.name_chosen := true;

  -- Changing only capitals is free.
  IF lower(NEW.name) = lower(OLD.name) THEN RETURN NEW; END IF;

  -- The first pick after sign-up is free and starts no cooldown.
  IF NOT OLD.name_chosen THEN RETURN NEW; END IF;

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

NOTIFY pgrst, 'reload schema';
