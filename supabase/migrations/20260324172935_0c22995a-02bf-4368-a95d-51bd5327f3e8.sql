
-- Chapter reactions (emoji reactions per chapter)
CREATE TABLE public.chapter_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chapter_id, user_id, reaction)
);
ALTER TABLE public.chapter_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view reactions" ON public.chapter_reactions FOR SELECT USING (true);
CREATE POLICY "Users can insert their own reactions" ON public.chapter_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reactions" ON public.chapter_reactions FOR DELETE USING (auth.uid() = user_id);

-- Theories
CREATE TABLE public.theories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.theories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view theories" ON public.theories FOR SELECT USING (true);
CREATE POLICY "Users can insert their own theories" ON public.theories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own theories" ON public.theories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own theories" ON public.theories FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage theories" ON public.theories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Theory votes
CREATE TABLE public.theory_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theory_id uuid NOT NULL REFERENCES public.theories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(theory_id, user_id)
);
ALTER TABLE public.theory_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view theory votes" ON public.theory_votes FOR SELECT USING (true);
CREATE POLICY "Users can insert their own votes" ON public.theory_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own votes" ON public.theory_votes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own votes" ON public.theory_votes FOR DELETE USING (auth.uid() = user_id);

-- Fan art
CREATE TABLE public.fan_art (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fan_art ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view fan art" ON public.fan_art FOR SELECT USING (true);
CREATE POLICY "Users can insert their own fan art" ON public.fan_art FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own fan art" ON public.fan_art FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage fan art" ON public.fan_art FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fan art votes (likes)
CREATE TABLE public.fan_art_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_art_id uuid NOT NULL REFERENCES public.fan_art(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fan_art_id, user_id)
);
ALTER TABLE public.fan_art_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view fan art votes" ON public.fan_art_votes FOR SELECT USING (true);
CREATE POLICY "Users can insert their own fan art votes" ON public.fan_art_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own fan art votes" ON public.fan_art_votes FOR DELETE USING (auth.uid() = user_id);

-- Referrals
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "Anyone can insert referrals" ON public.referrals FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own referrals" ON public.referrals FOR UPDATE USING (auth.uid() = referrer_id);

-- Chapter polls (admin creates)
CREATE TABLE public.chapter_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chapter_polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view polls" ON public.chapter_polls FOR SELECT USING (true);
CREATE POLICY "Admins can manage polls" ON public.chapter_polls FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Poll options
CREATE TABLE public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.chapter_polls(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view poll options" ON public.poll_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage poll options" ON public.poll_options FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Poll votes
CREATE TABLE public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.chapter_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(poll_id, user_id)
);
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view poll votes" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "Users can insert their own poll votes" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own poll votes" ON public.poll_votes FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.chapter_reactions;

-- Add fan-art storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('fan-art', 'fan-art', true) ON CONFLICT DO NOTHING;
CREATE POLICY "Anyone can view fan art files" ON storage.objects FOR SELECT USING (bucket_id = 'fan-art');
CREATE POLICY "Authenticated users can upload fan art" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fan-art' AND auth.role() = 'authenticated');
CREATE POLICY "Users can delete their own fan art files" ON storage.objects FOR DELETE USING (bucket_id = 'fan-art' AND auth.uid()::text = (storage.foldername(name))[1]);
