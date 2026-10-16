-- 1. Dispatches: stories told in chapters, a third kind next to Case Files and
--    Interactive Case Files. A dispatch (the serial) has chapters; each chapter is a
--    row in chapters with story_format = 'dispatch', dispatch_id and dispatch_part.
-- 2. Cards mode: hand-arranged cards per story (chapters.card_breaks).
-- 3. Admin settings (the admin menu order) stored in the database.

-- ── 1. Dispatches ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  cover_image_url text,
  status text NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'complete', 'hiatus')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Dispatches are public" ON public.dispatches;
CREATE POLICY "Dispatches are public" ON public.dispatches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage dispatches" ON public.dispatches;
CREATE POLICY "Admins manage dispatches" ON public.dispatches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.dispatches TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dispatches TO authenticated;

ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.dispatches(id) ON DELETE SET NULL;
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS dispatch_part integer;
CREATE INDEX IF NOT EXISTS chapters_dispatch_idx ON public.chapters (dispatch_id, dispatch_part);

-- Discord: a dispatch chapter links to its own address and says which dispatch it belongs to.
CREATE OR REPLACE FUNCTION public.cf_discord_story_payload(c public.chapters)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'username', 'Case Files',
    'content', CASE WHEN ping THEN '@everyone' END,
    'allowed_mentions', jsonb_build_object('parse', CASE WHEN ping THEN '["everyone"]'::jsonb ELSE '[]'::jsonb END),
    'embeds', jsonb_build_array(jsonb_build_object(
      'author', jsonb_build_object('name', CASE
        WHEN c.story_format = 'dispatch' THEN 'New dispatch · ' || coalesce(d.title, 'Dispatches') || coalesce(' · Chapter ' || c.dispatch_part, '')
        WHEN c.story_format = 'interactive' THEN 'New interactive case'
        ELSE 'New case file' END),
      'title', left(c.title, 250),
      'url', CASE WHEN c.story_format = 'dispatch' AND d.slug IS NOT NULL
        THEN 'https://thecasefiles.org/dispatches/' || d.slug || '/' || coalesce(c.dispatch_part, 1)
        ELSE 'https://thecasefiles.org/stories/' || public.cf_slug(c.title) END,
      'description', nullif(public.cf_plain_excerpt(c.content, 300), ''),
      'color', 12131356,
      'image', CASE WHEN coalesce(c.cover_image_url, d.cover_image_url, '') <> '' THEN jsonb_build_object('url',
        CASE WHEN coalesce(c.cover_image_url, d.cover_image_url) LIKE 'http%' THEN coalesce(c.cover_image_url, d.cover_image_url)
             ELSE 'https://thecasefiles.org' || coalesce(c.cover_image_url, d.cover_image_url) END) END,
      'timestamp', to_char(greatest(c.published_at, coalesce(c.scheduled_at, c.published_at)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ))
  ))
  FROM (SELECT coalesce((public.cf_discord_settings()->>'ping_everyone')::boolean, false) AS ping) s
  LEFT JOIN public.dispatches d ON d.id = c.dispatch_id
$$;
REVOKE ALL ON FUNCTION public.cf_discord_story_payload(public.chapters) FROM PUBLIC, anon, authenticated;

-- ── 2. Hand-arranged cards ─────────────────────────────────────────────────────────

-- {"v": 1, "starts": ["<opening words of the paragraph that starts a card>#n", …]}
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS card_breaks jsonb;

CREATE OR REPLACE FUNCTION public.admin_set_card_breaks(_chapter_id uuid, _starts jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  UPDATE public.chapters
     SET card_breaks = CASE WHEN _starts IS NULL OR jsonb_typeof(_starts) <> 'array' OR jsonb_array_length(_starts) = 0
                            THEN NULL ELSE jsonb_build_object('v', 1, 'starts', _starts) END
   WHERE id = _chapter_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_card_breaks(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_card_breaks(uuid, jsonb) TO authenticated;

-- ── 3. Admin settings ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_integrations (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_integrations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_setting(_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  RETURN (SELECT value FROM public.site_integrations WHERE key = 'admin:' || _key);
END $$;
REVOKE ALL ON FUNCTION public.admin_get_setting(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_setting(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_setting(_key text, _value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin_only'; END IF;
  INSERT INTO public.site_integrations (key, value, updated_at) VALUES ('admin:' || _key, coalesce(_value, 'null'::jsonb), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.admin_set_setting(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb) TO authenticated;

-- ── The first dispatch and its first chapter ───────────────────────────────────────
-- The dispatch's title and description can be changed in Admin → Dispatches.

INSERT INTO public.dispatches (slug, title, description, status)
VALUES ('coroner-nights', 'Coroner. Nights.', 'A black card on a university noticeboard, and a job that knows she doesn''t sleep.', 'ongoing')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.chapters (title, content, chapter_number, story_format, dispatch_id, dispatch_part, tags, published_at)
SELECT 'The Board', $chapter$<p>Autumn came to Duvlann the way it always had. Wet, early, and without apology.</p>
<p>By four in the afternoon the light was gone. By five the rain canopies had unfolded over the main streets, long translucent ribs that hummed when the wind got under them and turned the downpour into a steady drumming overhead. Beneath them, the city carried on. Driverless trams slid along the old routes, silent except for a soft chime at every stop. People paid for coffee with a flick of a ring past a reader. Old brick terraces, two and three hundred years old, stood wedged between towers of green glass like stubborn teeth that refused to come out.</p>
<p>And the adverts talked. They read the chip under your skin as you passed, and they said your name. Warm. Personal. Like an old friend who'd been waiting all day just for you.</p>
<p><em>They're the only things in this city that say my name right.</em></p>
<p><em>Saoirse. SEER-sha. Not Sor-sha. Not Say-or-see. Not "sorry, how do you say that?" with the little apologetic laugh. A billboard for protein water nailed it this morning, perfect, every vowel. The man I lived with never once said it without thinking first.</em></p>
<p><em>So I'm Sara. Sara is easy. Sara doesn't need explaining.</em></p>
<p>Rathlinn University sat on the north bank of the river, a quad of old grey stone that someone in the 2030s had tried to modernise by bolting a glass wing onto one side. It hadn't worked. The stone still looked like a university. The glass looked like a hospital.</p>
<p>The gym was in the basement of the glass wing. Graduates kept their passes for a year. Saoirse's had eleven days left on it.</p>
<p><em>I lift because it's the only thing that still does what it's told.</em></p>
<p><em>Bar on my back. Breathe in, brace, sit down between my heels, stand up. The bar doesn't care how I slept. The bar doesn't care that I didn't. Five sets of five. Then deadlifts. Then the chicken and rice in the plastic box in my bag, which I eat sitting on the bench because I've stopped caring who watches.</em></p>
<p><em>People watch. They always have. Men look at my chest first and my face second, and some of them never make it to the face at all. Women look at my hair. Everyone looks at the freckles like they're trying to count them. I used to mind. If I'm honest, I used to like it a bit. Now it's weather. It happens on the outside of me.</em></p>
<p><em>My ring buzzed on the bench. Rent reminder. Payment due in four days. I have enough for this month and half of the next. After that, I have a degree in Biomedical Science, a specialisation in histopathology, and absolutely nothing else.</em></p>
<p><em>I can look at a slice of liver thinner than a hair and tell you what killed it. Nobody's hiring for that. Not without three years' experience that nobody will let you get.</em></p>
<p><em>Fragments. That's how it comes back. Never the whole thing.</em></p>
<p><em>He worked nights. Security. A new job, a uniform that smelled of somebody else's sweat and the cheap orange aftershave they handed out in the locker room. I worked bars and studied. We passed each other in the hallway at six in the morning like two ghosts who'd forgotten they used to haunt the same house.</em></p>
<p><em>The night we finally said it out loud, it's over, he went out.</em></p>
<p><em>He came back at three.</em></p>
<hr>
<p>The board hung in the corridor outside the gym, between the vending machine and the stairwell. A real board. Cork. A relic. Everything else at Rathlinn ran on screens, but students still pinned paper to it out of habit, or irony, or because paper was cheaper than paying to be seen.</p>
<p>Saoirse stopped in front of it with her gym bag on her shoulder and her hair still damp at the roots.</p>
<p><em>Lost cat, grey, answers to Pudding. Flatmate wanted, no smokers, no drama. Sleep study, paid, volunteers must be able to sleep. I laugh at that one, out loud, by myself. Anatomy tutoring, cheap.</em></p>
<p><em>And in the corner, half under a flyer for a band I've never heard of, a card.</em></p>
<p><em>Matte black. Thick. White letters. No logo. No address.</em></p>
<blockquote style="background:#0b0b0b;color:#f2f2f2;border:1px solid #2b2b2b;margin:2em auto;max-width:22em;padding:1.6em 1.8em;text-align:center;font-style:normal;font-family:'IBM Plex Mono',monospace;letter-spacing:0.08em;line-height:1.9;"><p><strong>CORONER. NIGHTS.</strong></p><p>Biomedical science. Histopathology.</p><p>You don't sleep anyway.</p><p>Walking distance.</p><p>Pay beyond reason.</p><p>Call once.</p></blockquote>
<p><em>And a number.</em></p>
<p><em>I read it three times. Then a fourth.</em></p>
<p><em>You don't sleep anyway.</em></p>
<p><em>Something cold slides down the back of my neck and into my spine, and I go very still. It's a joke. It's marketing. Somebody thought it was clever. Everyone in this building who studies histopathology is a night owl. Nobody in this building sleeps.</em></p>
<p><em>Walking distance. From where?</em></p>
<p><em>Two students push past me toward the stairwell. One of them looks straight at the board. His eyes travel over the lost cat and the sleep study and the band, and slide right off the black card like it isn't there.</em></p>
<p><em>I take a picture of it with my ring. My hand isn't shaking. I check.</em></p>
<hr>
<p>Her flat was on the top floor of a narrow brick building squeezed between two glass ones, four streets from the river.</p>
<p>It was a strange place. So small that the bed had been built up on a platform near the ceiling, reached by a ladder, with a desk tucked underneath like a cave. Every wall had shelves. Every shelf was stacked with boxes she still hadn't opened. Fairy lights she'd strung up the first week and never switched off. A pink throw. Three plants, two of them alive.</p>
<p>And then the bathroom.</p>
<p>The bathroom was bigger than the rest of the flat put together. Heated stone floor. A bath sunk into it, deep enough to drown in. A rain shower behind glass. A mirror that ran the whole length of one wall. Brass taps. Everything perfect, sealed, spotless, as if the last owner had decided the only room in the world worth spending a fortune on was the one where you're naked.</p>
<p><em>I don't know who lived here before me. The agent didn't say. Somebody rich, or somebody who used to be. Somebody who knew exactly what they were going to do in this room and needed it to be beautiful.</em></p>
<p><em>The old flat had an ordinary bathroom. I couldn't go into it anymore. Not after the doorframe. I stayed three months after he left, and then one morning I put my hand on the handle and couldn't make it turn, and that was that. I took the first place I could afford that didn't smell of him.</em></p>
<p><em>He never apologised. He moved out on a Tuesday with two bags. That was more than a year ago. I don't count it in days. Counting makes it a date, and a date makes it something that happened, and if it happened, then...</em></p>
<p><em>I run the shower so hot it stings and stand in front of the mirror while it fogs.</em></p>
<p><em>There I am. Red hair gone dark with wet. Pale as milk. Freckles everywhere, shoulders, chest, down my stomach. My tits still sit high, like I'm wearing something, even when I'm not. Small pink nipples tight from the cold air. Strong legs. Good arse. I built all of it on purpose, rep by rep, and I look at it now the way I'd look at a slide under a microscope. Healthy tissue. Nothing wrong with it. Nothing going on in it either.</em></p>
<p><em>I used to touch myself in the shower. Most mornings. I used to like being looked at.</em></p>
<p><em>I haven't since. Not because I'm scared of it. Because there's nobody home to do it.</em></p>
<p><em>The mirror fogs over, and I'm gone.</em></p>
<hr>
<p>She called at eleven that night, cross-legged at the desk under the bed, the fairy lights blinking over the boxes.</p>
<p>The line didn't ring. It just opened.</p>
<p>"This line is recorded." A voice with no voice in it. Flat. Not a man. Not a woman. "State your name."</p>
<p><em>Beep.</em></p>
<p>"Saoirse." She didn't spell it. For once, she didn't spell it.</p>
<p>"State your age."</p>
<p><em>Beep.</em></p>
<p>"Twenty-seven."</p>
<p>"State your occupation."</p>
<p><em>Beep.</em></p>
<p>She opened her mouth. Closed it.</p>
<p>"Nothing," she said. "I'm nothing right now."</p>
<p>A pause. Long enough that she thought the line had died.</p>
<p>"Accepted. Tomorrow. Twenty-two hundred. Rue Carrow, number nine. Do not be late."</p>
<p><em>Click.</em></p>
<p><em>Rue Carrow.</em></p>
<p><em>I know Rue Carrow. I walk down it every day to the tram. It's two streets from here. Two. There's nothing on it. A closed bakery, a launderette, and a long brick building with no ground-floor windows and a black door I've walked past a thousand times without once looking at it.</em></p>
<p><em>Walking distance.</em></p>
<p><em>I climb the ladder and lie on my back with my face a foot from the ceiling, and I count the cracks in the plaster. There aren't any. This ceiling is perfect too.</em></p>
<p><em>I count anyway.</em></p>$chapter$,
  (SELECT coalesce(max(chapter_number), 0) + 1 FROM public.chapters),
  'dispatch', d.id, 1, '{}'::text[], now()
FROM public.dispatches d
WHERE d.slug = 'coroner-nights'
  AND NOT EXISTS (SELECT 1 FROM public.chapters c WHERE c.dispatch_id = d.id AND c.dispatch_part = 1);

NOTIFY pgrst, 'reload schema';
