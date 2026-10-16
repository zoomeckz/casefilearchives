-- Analytics → Geography: until now no visit ever had a country, so everything showed as
-- "Unknown". Each new visit now gets the two-letter country code of the visitor's
-- connection (sent along by the hosting network), or else the browser's own guess
-- from its time zone. Visits recorded before this stay "Unknown".

CREATE OR REPLACE FUNCTION public.cf_page_view_country()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  h jsonb;
  c text;
BEGIN
  BEGIN
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    h := NULL;
  END;
  c := upper(coalesce(h->>'cf-ipcountry', h->>'x-country-code', h->>'x-vercel-ip-country', ''));
  IF c ~ '^[A-Z]{2}$' AND c NOT IN ('XX', 'T1') THEN
    NEW.country := c;
  ELSIF NEW.country IS NOT NULL THEN
    NEW.country := CASE WHEN upper(btrim(NEW.country)) ~ '^[A-Z]{2}$' THEN upper(btrim(NEW.country)) END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cf_page_view_country ON public.page_views;
CREATE TRIGGER cf_page_view_country BEFORE INSERT ON public.page_views
  FOR EACH ROW EXECUTE FUNCTION public.cf_page_view_country();
