-- Fix unrendered markdown italics (*text*) in chapters 45-48
-- Converting *text* patterns to <em>text</em> in HTML content

-- This is auto-generated from scanning chapters 45-48 for *text* patterns in text nodes

-- Chapter 48
UPDATE chapters SET content = regexp_replace(
  content,
  '(?<![<*])(\*)(?!\*)([^*<>\n]{1,200}?)(?<!\*)\*(?!\*)',
  '<em>\2</em>',
  'g'
), updated_at = now()
WHERE chapter_number = 48
  AND content ~ '(?<![<*])\*(?!\*)[^*<>\n]{1,200}(?<!\*)\*(?!\*)';

-- Chapter 47
UPDATE chapters SET content = regexp_replace(
  content,
  '(?<![<*])(\*)(?!\*)([^*<>\n]{1,200}?)(?<!\*)\*(?!\*)',
  '<em>\2</em>',
  'g'
), updated_at = now()
WHERE chapter_number = 47
  AND content ~ '(?<![<*])\*(?!\*)[^*<>\n]{1,200}(?<!\*)\*(?!\*)';

-- Chapter 46
UPDATE chapters SET content = regexp_replace(
  content,
  '(?<![<*])(\*)(?!\*)([^*<>\n]{1,200}?)(?<!\*)\*(?!\*)',
  '<em>\2</em>',
  'g'
), updated_at = now()
WHERE chapter_number = 46
  AND content ~ '(?<![<*])\*(?!\*)[^*<>\n]{1,200}(?<!\*)\*(?!\*)';

-- Chapter 45
UPDATE chapters SET content = regexp_replace(
  content,
  '(?<![<*])(\*)(?!\*)([^*<>\n]{1,200}?)(?<!\*)\*(?!\*)',
  '<em>\2</em>',
  'g'
), updated_at = now()
WHERE chapter_number = 45
  AND content ~ '(?<![<*])\*(?!\*)[^*<>\n]{1,200}(?<!\*)\*(?!\*)';