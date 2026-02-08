
-- Add bio, social links to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tiktok TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '';

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Page analytics tracking table
CREATE TABLE public.page_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  page TEXT NOT NULL DEFAULT '/',
  country TEXT,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert page views (anonymous tracking)
CREATE POLICY "Anyone can insert page views" ON public.page_views FOR INSERT WITH CHECK (true);
-- Only admins can read page views
CREATE POLICY "Admins can read page views" ON public.page_views FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Auto-subscribe Google OAuth users to email notifications
CREATE OR REPLACE FUNCTION public.auto_subscribe_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Auto-subscribe if user signed up via OAuth (Google etc)
  IF NEW.raw_app_meta_data->>'provider' != 'email' THEN
    INSERT INTO public.email_subscriptions (user_id, email, new_chapters)
    VALUES (NEW.id, NEW.email, true)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_subscribe
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_subscribe_new_user();

-- Add pinned column to forum_posts
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
