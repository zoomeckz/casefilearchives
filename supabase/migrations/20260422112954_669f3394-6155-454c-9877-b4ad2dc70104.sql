-- ============================================================
-- 1. EDIT AUDIT + ROLLBACK INFRASTRUCTURE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chapter_edit_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL,
  chapter_number integer,
  actor_id uuid,
  action text NOT NULL DEFAULT 'replace', -- 'replace' | 'rollback' | 'anchor_miss'
  anchor_text text,
  replacement_text text,
  anchor_found boolean NOT NULL DEFAULT false,
  previous_content text,
  new_content text,
  migration_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chapter_edit_audit_chapter
  ON public.chapter_edit_audit(chapter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapter_edit_audit_chapter_number
  ON public.chapter_edit_audit(chapter_number, created_at DESC);

ALTER TABLE public.chapter_edit_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view edit audit"
  ON public.chapter_edit_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert edit audit"
  ON public.chapter_edit_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Safe replace: only writes if anchor found, snapshots previous content, logs everything
CREATE OR REPLACE FUNCTION public.safe_replace_chapter_content(
  _chapter_id uuid,
  _anchor text,
  _replacement text,
  _migration_id text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.chapters;
  _new_content text;
  _found boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO _row FROM public.chapters WHERE id = _chapter_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chapter % not found', _chapter_id;
  END IF;

  _found := position(_anchor IN _row.content) > 0;

  IF NOT _found THEN
    INSERT INTO public.chapter_edit_audit
      (chapter_id, chapter_number, actor_id, action, anchor_text, replacement_text,
       anchor_found, previous_content, new_content, migration_id, note)
    VALUES
      (_row.id, _row.chapter_number, auth.uid(), 'anchor_miss', _anchor, _replacement,
       false, _row.content, _row.content, _migration_id,
       COALESCE(_note, 'anchor not found; no write performed'));

    RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found');
  END IF;

  _new_content := replace(_row.content, _anchor, _replacement);

  UPDATE public.chapters
  SET content = _new_content, updated_at = now()
  WHERE id = _chapter_id;

  INSERT INTO public.chapter_edit_audit
    (chapter_id, chapter_number, actor_id, action, anchor_text, replacement_text,
     anchor_found, previous_content, new_content, migration_id, note)
  VALUES
    (_row.id, _row.chapter_number, auth.uid(), 'replace', _anchor, _replacement,
     true, _row.content, _new_content, _migration_id, _note);

  RETURN jsonb_build_object('ok', true, 'chapter_id', _chapter_id);
END;
$$;

-- Rollback to a specific audit snapshot
CREATE OR REPLACE FUNCTION public.rollback_chapter_to_audit_entry(_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entry public.chapter_edit_audit;
  _current public.chapters;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO _entry FROM public.chapter_edit_audit WHERE id = _audit_id;
  IF NOT FOUND OR _entry.previous_content IS NULL THEN
    RAISE EXCEPTION 'audit entry % not usable for rollback', _audit_id;
  END IF;

  SELECT * INTO _current FROM public.chapters WHERE id = _entry.chapter_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chapter % no longer exists', _entry.chapter_id;
  END IF;

  UPDATE public.chapters
  SET content = _entry.previous_content, updated_at = now()
  WHERE id = _entry.chapter_id;

  INSERT INTO public.chapter_edit_audit
    (chapter_id, chapter_number, actor_id, action, anchor_found,
     previous_content, new_content, note)
  VALUES
    (_current.id, _current.chapter_number, auth.uid(), 'rollback', true,
     _current.content, _entry.previous_content,
     'rollback to audit ' || _audit_id::text);

  RETURN jsonb_build_object('ok', true, 'chapter_id', _entry.chapter_id);
END;
$$;

-- ============================================================
-- 2. TIGHTEN OVERLY PERMISSIVE INSERT POLICIES
-- ============================================================

-- notifications: was WITH CHECK (true). Require signed-in caller and a target user.
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;
CREATE POLICY "Authenticated can insert notifications"
  ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NOT NULL);

-- page_views: was WITH CHECK (true). Allow anon (user_id NULL) or signed-in user inserting their own.
DROP POLICY IF EXISTS "Anyone can insert page views" ON public.page_views;
CREATE POLICY "Public can insert own page views"
  ON public.page_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- referrals: was WITH CHECK (true). Require caller to be the referrer.
DROP POLICY IF EXISTS "Anyone can insert referrals" ON public.referrals;
CREATE POLICY "Users can insert their own referrals"
  ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = referrer_id);