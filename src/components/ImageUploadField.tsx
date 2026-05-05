import React, { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CoverCropModal } from "@/components/CoverCropModal";
import { useAuth } from "@/hooks/useAuth";
import {
  encodeWebpAuto,
  encodeWebpFixed,
  ENCODE_TARGETS,
  formatKB,
  type ImageKind,
} from "@/lib/webpEncoder";

interface ImageUploadFieldProps {
  /** Image role — picks the right size band and max edge. */
  kind: ImageKind;
  /** Storage path prefix inside the `images` bucket (e.g. "chapters/cover"). */
  pathPrefix: string;
  /** Currently saved URL, if any. Shown as preview. */
  value: string | null;
  /** Called with the public URL after a successful upload, or null if cleared. */
  onChange: (url: string | null) => void;
  /** Optional label override. */
  label?: string;
}

/**
 * Drop-in image uploader that:
 *   1. Lets the admin pick a file
 *   2. Converts it to WebP — auto-targeting the size band for `kind`
 *   3. Uploads to the public `images` bucket
 *   4. Returns the public URL via `onChange`
 *
 * A small "Advanced" panel exposes a manual-quality slider for cases where
 * auto can't fit the target band (very flat or very busy art).
 */
export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  kind,
  pathPrefix,
  value,
  onChange,
  label,
}) => {
  const { session } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualQuality, setManualQuality] = useState(0.8);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lastReport, setLastReport] = useState<string>("");
  const [cropFile, setCropFile] = useState<File | null>(null);

  const target = ENCODE_TARGETS[kind];
  const targetLabel = `${target.minKB}–${target.maxKB} KB · max ${target.maxEdge}px`;

  async function uploadBlob(blob: Blob): Promise<string> {
    const ext = "webp";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const path = `${pathPrefix.replace(/\/+$/, "")}/${filename}`;

    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const token = session?.access_token || key;
    const res = await fetch(`${url}/storage/v1/object/images/${path}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/webp",
        "x-upsert": "false",
      },
      body: blob,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `Upload failed (${res.status})`);
    }

    const { data } = supabase.storage.from("images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleFile(file: File, useManual: boolean) {
    setBusy(true);
    try {
      const result = useManual
        ? await encodeWebpFixed(file, manualQuality, target.maxEdge)
        : await encodeWebpAuto(file, target);

      const url = await uploadBlob(result.blob);
      onChange(url);

      const fit = result.outOfBand ? "outside target band" : "within target";
      setLastReport(
        `${result.width}×${result.height} · q${result.quality.toFixed(2)} · ${formatKB(
          result.bytes,
        )} (${fit})`,
      );

      if (result.outOfBand && !useManual) {
        toast.warning(
          `Image saved at ${formatKB(result.bytes)} — outside the ${target.minKB}–${target.maxKB} KB target. Try the manual slider if needed.`,
        );
      } else {
        toast.success(`Image converted & uploaded (${formatKB(result.bytes)} WebP)`);
      }

      setPendingFile(file);
    } catch (err: any) {
      toast.error(err?.message || "Image upload failed");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      if (kind === "cover") {
        // Always allow upload — let admin crop to the displayed 4:5 aspect.
        setCropFile(f);
      } else {
        handleFile(f, false);
      }
    }
    // Reset so picking the same file again still triggers change
    if (fileRef.current) fileRef.current.value = "";
  }

  function onReencode() {
    if (pendingFile) handleFile(pendingFile, true);
  }

  function onClear() {
    onChange(null);
    setPendingFile(null);
    setLastReport("");
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm text-muted-foreground">{label}</label>
      )}

      <div className="flex items-start gap-3">
        {value ? (
          <div className="relative shrink-0">
            <img
              src={value}
              alt="Preview"
              className={
                kind === "cover"
                  ? "w-20 h-24 object-cover rounded-md border border-border/60 bg-stone-900"
                  : "w-24 h-24 object-cover rounded-md border border-border/60 bg-stone-900"
              }
            />
          </div>
        ) : (
          <div
            className={
              (kind === "cover" ? "w-20 h-24 " : "w-24 h-24 ") +
              "shrink-0 rounded-md border border-dashed border-border/60 bg-card/40 flex items-center justify-center text-2xl text-muted-foreground/40"
            }
            aria-hidden="true"
          >
            ✦
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-md text-xs transition-colors disabled:opacity-50"
            >
              {busy ? "Converting…" : value ? "Replace image" : "Upload image"}
            </button>
            {value && !busy && (
              <button
                type="button"
                onClick={onClear}
                className="px-2 py-1.5 text-xs text-destructive hover:text-destructive/80"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? "Hide advanced" : "Advanced"}
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Auto-converts to WebP · target {targetLabel}
          </p>
          {lastReport && (
            <p className="text-[11px] text-accent/80 font-mono">{lastReport}</p>
          )}

          {showAdvanced && (
            <div className="mt-2 p-2 rounded-md border border-border/60 bg-card/40 space-y-1">
              <label className="text-[11px] text-muted-foreground block">
                Manual quality: {(manualQuality * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.05}
                value={manualQuality}
                onChange={(e) => setManualQuality(parseFloat(e.target.value))}
                className="w-full"
              />
              <button
                type="button"
                disabled={!pendingFile || busy}
                onClick={onReencode}
                className="px-2 py-1 text-[11px] bg-accent/20 hover:bg-accent/30 text-accent rounded disabled:opacity-40"
              >
                Re-encode last file at this quality
              </button>
              {!pendingFile && (
                <p className="text-[11px] text-muted-foreground">
                  Upload a file first, then adjust here to override.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />

      {cropFile && (
        <CoverCropModal
          imageFile={cropFile}
          aspect={4 / 5}
          outputMaxEdge={target.maxEdge}
          onClose={() => setCropFile(null)}
          onCrop={(blob) => {
            const cropped = new File([blob], `cover-${Date.now()}.jpg`, { type: "image/jpeg" });
            setCropFile(null);
            handleFile(cropped, false);
          }}
        />
      )}
    </div>
  );
};

export default ImageUploadField;