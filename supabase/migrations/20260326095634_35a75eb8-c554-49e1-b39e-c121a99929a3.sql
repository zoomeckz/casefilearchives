
CREATE TABLE public.chapter_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  chapter_number integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.chapter_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all drafts" ON public.chapter_drafts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert drafts" ON public.chapter_drafts FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update drafts" ON public.chapter_drafts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete drafts" ON public.chapter_drafts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_chapter_drafts_updated_at BEFORE UPDATE ON public.chapter_drafts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
