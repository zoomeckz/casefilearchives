-- Achievements definition table
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🏆',
  category text NOT NULL DEFAULT 'general',
  requirement_type text NOT NULL,
  requirement_count integer NOT NULL DEFAULT 1,
  frame_style text DEFAULT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User achievements tracking
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- User's selected frame
ALTER TABLE public.profiles ADD COLUMN selected_frame text DEFAULT NULL;

-- RLS
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Achievements viewable by everyone" ON public.achievements FOR SELECT USING (true);
CREATE POLICY "Admins can manage achievements" ON public.achievements FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own achievements" ON public.user_achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert achievements" ON public.user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can view user achievements" ON public.user_achievements FOR SELECT USING (true);

-- Seed achievements
INSERT INTO public.achievements (key, title, description, icon, category, requirement_type, requirement_count, frame_style, sort_order) VALUES
('first_chapter', 'First Steps', 'Read your first chapter', '📖', 'reading', 'chapters_read', 1, NULL, 1),
('bookworm', 'Bookworm', 'Read 5 chapters', '📚', 'reading', 'chapters_read', 5, 'bookworm', 2),
('devoted_reader', 'Devoted Reader', 'Read 10 chapters', '🔥', 'reading', 'chapters_read', 10, 'flame', 3),
('completionist', 'Completionist', 'Read all available chapters', '👑', 'reading', 'chapters_read', 18, 'gold-crown', 4),
('first_comment', 'Voice Heard', 'Leave your first comment', '💬', 'community', 'comments', 1, NULL, 5),
('commentator', 'Commentator', 'Leave 10 comments', '🗣️', 'community', 'comments', 10, 'speech', 6),
('first_post', 'Forum Debut', 'Create your first forum post', '✍️', 'community', 'forum_posts', 1, NULL, 7),
('contributor', 'Active Contributor', 'Create 5 forum posts', '⭐', 'community', 'forum_posts', 5, 'star', 8),
('community_pillar', 'Community Pillar', 'Create 10 forum posts and 20 comments', '🏛️', 'community', 'community_combined', 30, 'pillar', 9),
('first_bookmark', 'Collector', 'Bookmark your first chapter', '🔖', 'engagement', 'bookmarks', 1, NULL, 10),
('curator', 'Curator', 'Bookmark 5 chapters', '📌', 'engagement', 'bookmarks', 5, 'ribbon-blue', 11),
('early_bird', 'Early Bird', 'One of the first 50 registered users', '🐦', 'special', 'early_user', 1, 'ribbon-pink', 12),
('loyal_fan', 'Loyal Fan', 'Read chapters, comment, and post in forums', '💎', 'special', 'all_activities', 1, 'diamond', 13);