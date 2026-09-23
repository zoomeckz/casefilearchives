CREATE OR REPLACE FUNCTION public.get_seo_cron_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('error', 'admin only');
  END IF;

  SELECT jsonb_build_object(
    'jobName', j.jobname,
    'schedule', j.schedule,
    'active', j.active,
    'lastRuns', COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'status', r.status,
          'startTime', r.start_time,
          'endTime', r.end_time,
          'returnMessage', r.return_message
        ) ORDER BY r.start_time DESC)
        FROM (
          SELECT * FROM cron.job_run_details rd
          WHERE rd.jobid = j.jobid
          ORDER BY rd.start_time DESC
          LIMIT 5
        ) r
      ),
      '[]'::jsonb
    )
  )
  INTO result
  FROM cron.job j
  WHERE j.jobname = 'weekly-seo-refresh'
  LIMIT 1;

  RETURN COALESCE(result, jsonb_build_object('jobName', null, 'error', 'job not found'));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_subscribe_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_chapter_views(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_seo_cron_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seo_cron_status() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rollback_chapter_to_audit_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_chapter_to_audit_entry(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.safe_replace_chapter_content(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_replace_chapter_content(uuid, text, text, text, text) TO authenticated, service_role;