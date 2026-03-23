import React, { useState, useRef, useCallback, useEffect } from "react";
import { Icons } from "@/lib/icons";

interface AvatarCropModalProps {
  imageFile: File;
  onCrop: (blob: Blob) => void;
  onClose: () => void;
}

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({ imageFile, onCrop, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerSize = 300;
  const outputSize = 400;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      // Fit image so its smallest dimension fills the circle
      const minDim = Math.min(img.width, img.height);
      const initialScale = containerSize / minDim;
      setScale(initialScale);
      setOffset({
        x: (containerSize - img.width * initialScale) / 2,
        y: (containerSize - img.height * initialScale) / 2,
      });
    };
    img.src = URL.createObjectURL(imageFile);
    return () => URL.revokeObjectURL(img.src);
  }, [imageFile]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = containerSize;
    canvas.height = containerSize;
    ctx.clearRect(0, 0, containerSize, containerSize);
    ctx.save();
    ctx.beginPath();
    ctx.arc(containerSize / 2, containerSize / 2, containerSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, offset.x, offset.y, image.width * scale, image.height * scale);
    ctx.restore();
    // Draw circle border
    ctx.beginPath();
    ctx.arc(containerSize / 2, containerSize / 2, containerSize / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [image, offset, scale]);

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
    const outCanvas = document.createElement("canvas");
    outCanvas.width = outputSize;
    outCanvas.height = outputSize;
    const ctx = outCanvas.getContext("2d");
    if (!ctx) return;
    // Scale the offset/size proportionally
    const ratio = outputSize / containerSize;
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, offset.x * ratio, offset.y * ratio, image.width * scale * ratio, image.height * scale * ratio);
    outCanvas.toBlob((blob) => { if (blob) onCrop(blob); }, "image/jpeg", 0.9);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-stone-700 animate-fade-in">
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
          <Icons.Close />
        </button>
        <h3 className="font-display text-xl text-accent mb-4 text-center">Position Your Avatar</h3>
        <p className="text-muted-foreground text-sm text-center mb-4">Drag to position, scroll to zoom</p>
        <div
          className="mx-auto rounded-full overflow-hidden cursor-grab active:cursor-grabbing border-2 border-border"
          style={{ width: containerSize, height: containerSize }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => setDragging(false)}
          onWheel={(e) => {
            e.preventDefault();
            const newScale = Math.max(0.1, scale + (e.deltaY > 0 ? -0.05 : 0.05));
            setScale(newScale);
          }}
        >
          <canvas ref={canvasRef} width={containerSize} height={containerSize} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-muted-foreground text-xs">Zoom</span>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.05"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="flex-1 accent-primary"
          />
        </div>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={onClose} className="px-6 py-2 text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={handleCrop} className="px-6 py-2 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg font-medium transition-colors">
            Save Avatar
          </button>
        </div>
      </div>
    </div>
  );
};
