CREATE OR REPLACE FUNCTION public.get_seo_cron_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Only admins can call this
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
$$;

REVOKE ALL ON FUNCTION public.get_seo_cron_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seo_cron_status() TO authenticated;