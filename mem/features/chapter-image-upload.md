---
name: Chapter image upload
description: WebP conversion + auto-quality targeting for chapter cover and inline body images
type: feature
---

Chapter editor and rich-text editor both upload images via `src/lib/webpEncoder.ts` + `src/components/ImageUploadField.tsx`.

- Encoder converts files to WebP via canvas; binary-searches `quality` to land in a KB band.
- Targets in `ENCODE_TARGETS`:
  - **cover**: maxEdge 1000 px, 80–150 KB (4:5 portrait, displayed 64×80 in StoriesPage list)
  - **inline**: maxEdge 1360 px, 150–400 KB (reader column caps at 680 CSS px)
- Manual override: `Advanced` panel exposes a 5–95% quality slider that re-encodes the last picked file.
- Storage: bucket `images`, paths `chapters/cover/<uuid>.webp` and `chapters/inline/<uuid>.webp`.
- Cover URL persists to `chapters.cover_image_url`; inline images are inserted into the TipTap document via `setImage`.
- The old "Add Image" toolbar button now opens a file picker; a separate `URL` button preserves the legacy paste-URL flow.