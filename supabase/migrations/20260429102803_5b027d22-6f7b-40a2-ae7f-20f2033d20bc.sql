-- 1) Drop broad public SELECT policies on storage.objects
DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can read fan art" ON storage.objects;
DROP POLICY IF EXISTS "Public can read images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read manga panels" ON storage.objects;

-- 2) Revoke anon EXECUTE on SECURITY DEFINER functions in public schema
REVOKE EXECUTE ON FUNCTION public.auto_subscribe_new_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_seo_cron_status() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.rollback_chapter_to_audit_entry(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.safe_replace_chapter_content(uuid, text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.increment_chapter_views(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seo_cron_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_chapter_to_audit_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_replace_chapter_content(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_chapter_views(uuid) TO authenticated;