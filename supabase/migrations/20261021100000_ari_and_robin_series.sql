-- Ari and Robin: one title style, one series, and continuity fixes across the six stories.
-- Run after the Bulgarian translation files (20261021090000–20261021097000), so the
-- Bulgarian versions get the same fixes.

-- 1. Titles: "Ari and Robin - <title>" (Bulgarian: "Ари и Робин - <title>").
UPDATE public.chapters
   SET title = 'Ari and Robin - ' || title
 WHERE id IN ('e3096149-6460-40b0-aab0-e7484a84c021',  -- Heretics' Table
              'e190f304-1726-4f2d-a96b-9f48655dfa39',  -- Nowhere Left to Go
              '6edd9c3a-c6c1-48c8-9d2f-75ef772e9c20',  -- Reading the Air
              'f89d51bb-dea2-4254-9a27-c014834c9001',  -- Where You Draw It
              '3e6a64e0-f2fd-473e-9654-6bcd26863171',  -- Same Guy, Different Jacket
              '7f2800d4-6545-40a9-af4c-3e85dccd4d2e')  -- Bumpers
   AND title NOT LIKE 'Ari and Robin - %';

UPDATE public.chapter_translations
   SET title = CASE WHEN language_code = 'bg' THEN 'Ари и Робин - ' ELSE 'Ari and Robin - ' END || title
 WHERE chapter_id IN ('e3096149-6460-40b0-aab0-e7484a84c021', 'e190f304-1726-4f2d-a96b-9f48655dfa39',
                      '6edd9c3a-c6c1-48c8-9d2f-75ef772e9c20', 'f89d51bb-dea2-4254-9a27-c014834c9001',
                      '3e6a64e0-f2fd-473e-9654-6bcd26863171', '7f2800d4-6545-40a9-af4c-3e85dccd4d2e')
   AND title NOT LIKE 'Ari and Robin - %' AND title NOT LIKE 'Ари и Робин - %';

-- 2. Series "Ari and Robin", in story order.
INSERT INTO public.series_entries (series_id, chapter_id, position)
SELECT s.id, v.chapter_id::uuid, v.position
  FROM public.series s
 CROSS JOIN (VALUES ('e3096149-6460-40b0-aab0-e7484a84c021', 1),
                    ('e190f304-1726-4f2d-a96b-9f48655dfa39', 2),
                    ('6edd9c3a-c6c1-48c8-9d2f-75ef772e9c20', 3),
                    ('f89d51bb-dea2-4254-9a27-c014834c9001', 4),
                    ('3e6a64e0-f2fd-473e-9654-6bcd26863171', 5),
                    ('7f2800d4-6545-40a9-af4c-3e85dccd4d2e', 6)) AS v(chapter_id, position)
 WHERE s.slug = 'ari-and-robin'
ON CONFLICT (series_id, chapter_id) DO UPDATE SET position = EXCLUDED.position;

-- 3. Continuity fixes (English).
-- Heretics' Table: the pub night is where the yearly argument starts, and the profile is Robin's own.
UPDATE public.chapters SET content =
  replace(replace(replace(content,
    $q$and once a year, usually around the third drink, they had some version of the same argument.$q$,
    $q$and somewhere around the third drink tonight, they started the argument they would go on to have once a year.$q$),
    $q$turned the screen across the table. A profile. The last line$q$,
    $q$turned the screen across the table. Robin's own profile, freshly updated. The last line$q$),
    $q$"Honestly? Same," Robin said. "Saves everyone time."$q$,
    $q$"Honestly? Saves everyone time," Robin said.$q$)
 WHERE id = 'e3096149-6460-40b0-aab0-e7484a84c021';

-- Reading the Air: the pub was two years earlier.
UPDATE public.chapters SET content =
  replace(replace(content,
    $q$It was the third year, and neither of them would admit it had become a tradition.$q$,
    $q$It was the third year of the argument, and neither of them would admit the trips had become a tradition.$q$),
    $q$Last year, in that pub,$q$,
    $q$Two years ago, in that pub,$q$)
 WHERE id = '6edd9c3a-c6c1-48c8-9d2f-75ef772e9c20';

-- Where You Draw It: Ari came to England by van, not by plane.
UPDATE public.chapters SET content =
  replace(content, $q$When I landed in England at fourteen$q$, $q$When I got to England at fourteen$q$)
 WHERE id = 'f89d51bb-dea2-4254-9a27-c014834c9001';

-- Bumpers: keep Robin ungendered, and fix a typo.
UPDATE public.chapters SET content =
  replace(replace(content,
    $q$her aunt Robin's habit$q$, $q$Robin's habit$q$),
    $q$and dead a year later$q$, $q$and was dead a year later$q$)
 WHERE id = '7f2800d4-6545-40a9-af4c-3e85dccd4d2e';

-- 4. The same fixes in the Bulgarian translations.
UPDATE public.chapter_translations SET content =
  replace(replace(replace(content,
    $q$и веднъж годишно, обикновено около третото питие, водеха някаква версия на един и същи спор.$q$,
    $q$и тази вечер, някъде около третото питие, започнаха спора, който оттогава щяха да водят веднъж годишно.$q$),
    $q$обърна екрана през масата. Профил. Последният ред$q$,
    $q$обърна екрана през масата. Собственият профил на Робин, току-що обновен. Последният ред$q$),
    $q$„Честно? И аз така – каза Робин. – Спестява време на всички.“$q$,
    $q$„Честно? Спестява време на всички – каза Робин.“$q$)
 WHERE chapter_id = 'e3096149-6460-40b0-aab0-e7484a84c021' AND language_code = 'bg';

UPDATE public.chapter_translations SET content =
  replace(replace(content,
    $q$Беше третата година и нито Ари, нито Робин искаше да признае, че това вече е традиция.$q$,
    $q$Беше третата година на спора и нито Ари, нито Робин искаше да признае, че пътуванията вече са традиция.$q$),
    $q$Миналата година, в онази кръчма,$q$,
    $q$Преди две години, в онази кръчма,$q$)
 WHERE chapter_id = '6edd9c3a-c6c1-48c8-9d2f-75ef772e9c20' AND language_code = 'bg';

UPDATE public.chapter_translations SET content =
  replace(content, $q$Когато кацнах в Англия$q$, $q$Когато стигнах до Англия$q$)
 WHERE chapter_id = 'f89d51bb-dea2-4254-9a27-c014834c9001' AND language_code = 'bg';
