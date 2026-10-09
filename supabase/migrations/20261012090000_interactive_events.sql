-- Interactive Case Files: reading analytics.
-- Readers (guests included) log small events while they read: which decision
-- they saw, how long they took (visible time only), what they picked, when they
-- confirmed or backed out, when they left the page and when they came back.
-- Admin panel → Case analytics reads them. Readers can only insert, never read.

CREATE TABLE IF NOT EXISTS public.interactive_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_key text NOT NULL,              -- chapter id, or "test:<id>" for tester links
  user_id uuid,                        -- null for guests
  device_id text NOT NULL,             -- random id kept in the reader's browser
  session_id text NOT NULL,            -- one per page visit
  attempt int,
  kind text NOT NULL,                  -- open, view, confirm_open, confirm_cancel, choose, timeout, hidden, visible, close, ending, answer, replay
  node_id text,
  option_id text,
  ms int,                              -- thinking time (visible ms) or time away
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_ts timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interactive_events_case_idx ON public.interactive_events (case_key, created_at);
CREATE INDEX IF NOT EXISTS interactive_events_reader_idx ON public.interactive_events (case_key, device_id, client_ts);

ALTER TABLE public.interactive_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readers log their own reading events" ON public.interactive_events;
CREATE POLICY "Readers log their own reading events" ON public.interactive_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND char_length(case_key) <= 80
    AND char_length(device_id) <= 64
    AND char_length(session_id) <= 64
    AND kind IN ('open','view','confirm_open','confirm_cancel','choose','timeout','hidden','visible','close','ending','answer','replay')
    AND coalesce(char_length(node_id), 0) <= 120
    AND coalesce(char_length(option_id), 0) <= 120
    AND pg_column_size(meta) <= 2048
  );

DROP POLICY IF EXISTS "Admins read reading events" ON public.interactive_events;
CREATE POLICY "Admins read reading events" ON public.interactive_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins delete reading events" ON public.interactive_events;
CREATE POLICY "Admins delete reading events" ON public.interactive_events
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT INSERT ON public.interactive_events TO anon, authenticated;
GRANT SELECT, DELETE ON public.interactive_events TO authenticated;
