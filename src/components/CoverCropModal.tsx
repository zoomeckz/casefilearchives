import React, { useState, useRef, useCallback, useEffect } from "react";
import { Icons } from "@/lib/icons";

interface CoverCropModalProps {
  imageFile: File;
  /** Aspect ratio width/height. e.g. 4/5 for cover. */
  aspect?: number;
  /** Output longest edge in pixels. */
  outputMaxEdge?: number;
  onCrop: (blob: Blob) => void;
  onClose: () => void;
}

/**
 * Rectangular crop modal — used for chapter covers (4:5 portrait by default).
 * Drag to position, scroll/slider to zoom. Outputs a JPEG blob the parent
 * can hand to the WebP encoder.
 */
export const CoverCropModal: React.FC<CoverCropModalProps> = ({
  imageFile,
  aspect = 4 / 5,
  outputMaxEdge = 1000,
  onCrop,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Frame size for the on-screen crop area.
  const frameW = aspect >= 1 ? 360 : 280;
  const frameH = Math.round(frameW / aspect);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      // Cover-fit so the smaller axis fills the frame.
      const sx = frameW / img.width;
      const sy = frameH / img.height;
      const initial = Math.max(sx, sy);
      setScale(initial);
      setOffset({
        x: (frameW - img.width * initial) / 2,
        y: (frameH - img.height * initial) / 2,
      });
    };
    img.src = URL.createObjectURL(imageFile);
    return () => URL.revokeObjectURL(img.src);
  }, [imageFile, frameW, frameH]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = frameW;
    canvas.height = frameH;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, frameW, frameH);
    ctx.drawImage(image, offset.x, offset.y, image.width * scale, image.height * scale);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, frameW - 2, frameH - 2);
  }, [image, offset, scale, frameW, frameH]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setDragging(false);
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setDragging(true);
    setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y });
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    const t = e.touches[0];
    setOffset({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y });
  };

  const handleCrop = () => {
    if (!image) return;
    // Compute output size while preserving aspect.
    let outW = outputMaxEdge;
    let outH = Math.round(outW / aspect);
    if (outH > outputMaxEdge) {
      outH = outputMaxEdge;
      outW = Math.round(outH * aspect);
    }
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const ratio = outW / frameW;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(
      image,
      offset.x * ratio,
      offset.y * ratio,
      image.width * scale * ratio,
      image.height * scale * ratio,
    );
    out.toBlob((blob) => { if (blob) onCrop(blob); }, "image/jpeg", 0.95);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-stone-700 animate-fade-in">
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
          <Icons.Close />
        </button>
        <h3 className="font-display text-xl text-accent mb-1 text-center">Crop Cover Image</h3>
        <p className="text-muted-foreground text-sm text-center mb-4">
          Drag to reposition · scroll or use the slider to zoom
        </p>
        <div
          className="mx-auto overflow-hidden cursor-grab active:cursor-grabbing border-2 border-border rounded-md"
          style={{ width: frameW, height: frameH }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => setDragging(false)}
          onWheel={(e) => {
            e.preventDefault();
            const next = Math.max(0.05, scale + (e.deltaY > 0 ? -0.05 : 0.05));
            setScale(next);
          }}
        >
          <canvas ref={canvasRef} width={frameW} height={frameH} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-muted-foreground text-xs">Zoom</span>
          <input
            type="range"
            min="0.05"
            max="4"
            step="0.01"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="flex-1 accent-primary"
          />
        </div>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={onClose} className="px-6 py-2 text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={handleCrop} className="px-6 py-2 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg font-medium transition-colors">
            Save Crop
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoverCropModal;