CREATE OR REPLACE FUNCTION public.normalize_chapter_schedule_to_ten_stockholm()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.scheduled_at IS NOT NULL THEN
    NEW.scheduled_at := timezone('UTC', date_trunc('day', NEW.scheduled_at AT TIME ZONE 'Europe/Stockholm') + interval '10 hours');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_chapter_schedule_to_ten_stockholm ON public.chapters;

CREATE TRIGGER normalize_chapter_schedule_to_ten_stockholm
BEFORE INSERT OR UPDATE OF scheduled_at
ON public.chapters
FOR EACH ROW
EXECUTE FUNCTION public.normalize_chapter_schedule_to_ten_stockholm();

UPDATE public.chapters
SET scheduled_at = timezone('UTC', date_trunc('day', scheduled_at AT TIME ZONE 'Europe/Stockholm') + interval '10 hours')
WHERE scheduled_at IS NOT NULL
  AND scheduled_at > now();