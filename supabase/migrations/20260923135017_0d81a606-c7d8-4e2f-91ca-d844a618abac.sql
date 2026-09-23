REVOKE EXECUTE ON FUNCTION public.auto_subscribe_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_subscribe_new_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_seo_cron_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seo_cron_status() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.increment_chapter_views(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_chapter_views(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rollback_chapter_to_audit_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_chapter_to_audit_entry(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.safe_replace_chapter_content(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_replace_chapter_content(uuid, text, text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;