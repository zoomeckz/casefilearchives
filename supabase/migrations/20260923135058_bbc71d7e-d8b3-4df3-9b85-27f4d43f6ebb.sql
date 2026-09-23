CREATE OR REPLACE FUNCTION public.rollback_chapter_to_audit_entry(_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.safe_replace_chapter_content(_chapter_id uuid, _anchor text, _replacement text, _migration_id text DEFAULT NULL::text, _note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_subscribe_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_chapter_views(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_subscribe_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_chapter_views(uuid) TO service_role;