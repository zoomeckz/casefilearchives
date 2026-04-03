CREATE OR REPLACE FUNCTION public.normalize_chapter_schedule_to_ten_stockholm()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.scheduled_at IS NOT NULL THEN
    NEW.scheduled_at := (
      date_trunc('day', NEW.scheduled_at AT TIME ZONE 'Europe/Stockholm')
      + interval '10 hours'
    ) AT TIME ZONE 'Europe/Stockholm';
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.chapters
SET scheduled_at = (
  date_trunc('day', scheduled_at AT TIME ZONE 'Europe/Stockholm')
  + interval '10 hours'
) AT TIME ZONE 'Europe/Stockholm'
WHERE scheduled_at IS NOT NULL
  AND scheduled_at > now();