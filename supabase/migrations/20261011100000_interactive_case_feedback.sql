-- Interactive Case Files: the archivist's feedback on readers' written conclusions.
-- Readers file a conclusion at the end of a case (ic_answer). Admins read every
-- conclusion in the admin panel (Case reports) and may answer it; the reader
-- sees the answer on the case and receives a notification.

ALTER TABLE public.interactive_playthroughs
  ADD COLUMN IF NOT EXISTS admin_feedback text,
  ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

-- Admin inbox: every filed conclusion, newest first. _status: 'open' (no
-- feedback yet), 'answered', or 'all'. Returns nothing for non-admins.
CREATE OR REPLACE FUNCTION public.ic_admin_reports(_status text DEFAULT 'all')
RETURNS TABLE (
  playthrough_id uuid, chapter_id uuid, case_title text, reader_id uuid, reader_name text,
  attempt int, ending_node text, completed_at timestamptz, final_answer text, answered_at timestamptz,
  admin_feedback text, feedback_at timestamptz, variables jsonb, visited jsonb, decisions jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.chapter_id, c.title, p.user_id, coalesce(nullif(btrim(pr.name), ''), 'Reader'),
         p.attempt, p.ending_node, p.completed_at, p.final_answer, p.answered_at,
         p.admin_feedback, p.feedback_at, p.variables, p.visited,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object(
                    'node_id', d.node_id, 'option_id', d.option_id,
                    'option_label', d.option_label, 'created_at', d.created_at)
                  ORDER BY d.created_at)
             FROM public.interactive_decisions d WHERE d.playthrough_id = p.id
         ), '[]'::jsonb)
    FROM public.interactive_playthroughs p
    JOIN public.chapters c ON c.id = p.chapter_id
    LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
   WHERE public.has_role(auth.uid(), 'admin'::app_role)
     AND p.final_answer IS NOT NULL
     AND (coalesce(_status, 'all') = 'all'
          OR (_status = 'open' AND p.admin_feedback IS NULL)
          OR (_status = 'answered' AND p.admin_feedback IS NOT NULL))
   ORDER BY p.answered_at DESC NULLS LAST;
$$;
REVOKE ALL ON FUNCTION public.ic_admin_reports(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_admin_reports(text) TO authenticated;

-- Save (or revise) feedback on one conclusion and notify the reader.
-- _link is the story's public path, used by the notification.
CREATE OR REPLACE FUNCTION public.ic_admin_feedback(_playthrough_id uuid, _feedback text, _link text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pt public.interactive_playthroughs; clean text := btrim(coalesce(_feedback, '')); case_title text; revised boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF clean = '' THEN RAISE EXCEPTION 'empty_feedback'; END IF;
  IF length(clean) > 4000 THEN RAISE EXCEPTION 'feedback_too_long'; END IF;

  SELECT * INTO pt FROM public.interactive_playthroughs WHERE id = _playthrough_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF pt.final_answer IS NULL THEN RAISE EXCEPTION 'no_conclusion'; END IF;
  revised := pt.admin_feedback IS NOT NULL;

  UPDATE public.interactive_playthroughs SET admin_feedback = clean, feedback_at = now() WHERE id = pt.id;

  SELECT title INTO case_title FROM public.chapters WHERE id = pt.chapter_id;
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (pt.user_id, 'case_feedback',
          CASE WHEN revised THEN 'Your case report review was updated' ELSE 'Your case report was reviewed' END,
          'The archivist responded to your conclusion on “' || coalesce(case_title, 'a case file') || '”.',
          nullif(btrim(coalesce(_link, '')), ''));

  RETURN jsonb_build_object('feedback_at', now());
END $$;
REVOKE ALL ON FUNCTION public.ic_admin_feedback(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_admin_feedback(uuid, text, text) TO authenticated;
