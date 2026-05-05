/**
 * webpEncoder
 * ----------
 * Client-side image → WebP conversion utility used by the chapter editor.
 *
 * Two flavours:
 *   • encodeWebpAuto — binary-searches `quality` so the encoded blob lands
 *     inside a target KB band (e.g. 80–150 KB for chapter covers,
 *     150–400 KB for inline body images). Also down-scales the image to a
 *     max edge so we never store a 4000 px source for a 680 px column.
 *   • encodeWebpFixed — single pass at a chosen quality (manual override).
 *
 * Everything runs in the browser via <canvas>. WebP support is universal
 * in modern browsers; we fall back to JPEG if the encoder ever returns null.
 */

export type ImageKind = "cover" | "inline";

export interface EncodeTarget {
  /** Maximum edge length in CSS pixels (longest side). */
  maxEdge: number;
  /** Lower bound of the desired file size, in kilobytes. */
  minKB: number;
  /** Upper bound of the desired file size, in kilobytes. */
  maxKB: number;
}

export const ENCODE_TARGETS: Record<ImageKind, EncodeTarget> = {
  // 4:5 portrait card, displayed at ~64×80 px → 800×1000 source covers 3× retina.
  cover: { maxEdge: 1000, minKB: 40, maxKB: 400 },
  // Reader column caps at 680 CSS px → 1360 px is the 2× retina target.
  inline: { maxEdge: 1360, minKB: 150, maxKB: 400 },
};

export interface EncodeResult {
  blob: Blob;
  /** Final quality value used (0.05–0.95). */
  quality: number;
  /** Final file size in bytes. */
  bytes: number;
  /** Final dimensions after any down-scaling. */
  width: number;
  height: number;
  /** True if we couldn't get inside the band even at q=0.05 / q=0.95. */
  outOfBand: boolean;
}

/* ──────────────────────── internal helpers ──────────────────────── */

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function drawToCanvas(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("WebP encoding failed"));
      },
      "image/webp",
      quality,
    );
  });
}

/* ──────────────────────── public API ──────────────────────── */

/**
 * Encode `file` to WebP at a fixed quality (0.05 – 0.95). Used when the admin
 * overrides the auto target via the slider.
 */
export async function encodeWebpFixed(
  file: File,
  quality: number,
  maxEdge: number,
): Promise<EncodeResult> {
  const q = Math.min(0.95, Math.max(0.05, quality));
  const img = await loadImageFromFile(file);
  const canvas = drawToCanvas(img, maxEdge);
  const blob = await canvasToBlob(canvas, q);
  return {
    blob,
    quality: q,
    bytes: blob.size,
    width: canvas.width,
    height: canvas.height,
    outOfBand: false,
  };
}

/**
 * Encode `file` to WebP using a binary search on quality so the resulting blob
 * lands inside [minKB, maxKB]. We cap iterations at 7 (≈ 0.7% precision) to
 * keep the UI snappy. If we can't fit the band, returns the closest attempt.
 */
export async function encodeWebpAuto(
  file: File,
  target: EncodeTarget,
): Promise<EncodeResult> {
  const img = await loadImageFromFile(file);
  const canvas = drawToCanvas(img, target.maxEdge);

  const minBytes = target.minKB * 1024;
  const maxBytes = target.maxKB * 1024;

  let lo = 0.4;
  let hi = 0.92;
  let best: { blob: Blob; quality: number } | null = null;

  for (let i = 0; i < 7; i++) {
    const q = (lo + hi) / 2;
    const blob = await canvasToBlob(canvas, q);

    // Track the closest-to-band attempt regardless of fit.
    if (
      !best ||
      Math.abs(blob.size - (minBytes + maxBytes) / 2) <
        Math.abs(best.blob.size - (minBytes + maxBytes) / 2)
    ) {
      best = { blob, quality: q };
    }

    if (blob.size > maxBytes) {
      hi = q;
    } else if (blob.size < minBytes) {
      lo = q;
    } else {
      // In-band hit — return immediately.
      return {
        blob,
        quality: q,
        bytes: blob.size,
        width: canvas.width,
        height: canvas.height,
        outOfBand: false,
      };
    }
  }

  // Couldn't land in the band; return the closest attempt and flag it.
  const finalBlob = best!.blob;
  const inBand = finalBlob.size >= minBytes && finalBlob.size <= maxBytes;
  return {
    blob: finalBlob,
    quality: best!.quality,
    bytes: finalBlob.size,
    width: canvas.width,
    height: canvas.height,
    outOfBand: !inBand,
  };
}

/** Convenience formatter for KB display in the UI. */
export function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}