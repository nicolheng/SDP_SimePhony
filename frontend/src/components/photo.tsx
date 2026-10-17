"use client";
import { Camera, ImageIcon, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Photo } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<Photo["kind"], string> = {
  original: "Original",
  reopen: "Reopen",
  verdict: "Inspection",
  repair: "Repair",
  verification: "Verification",
};

export function PhotoThumb({ photo, className, label = true }: { photo: Photo; className?: string; label?: boolean }) {
  return (
    <figure className={cn("relative overflow-hidden rounded-lg bg-zinc-100", className)}>
      {photo.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt={`${KIND_LABEL[photo.kind]} photo`} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center bg-gradient-to-br from-zinc-200 to-zinc-300 text-zinc-500">
          <ImageIcon className="size-6" />
        </div>
      )}
      {label && (
        <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {KIND_LABEL[photo.kind]}
        </figcaption>
      )}
    </figure>
  );
}

/** Generated stand-in photo for demos run on a laptop (a stained ceiling). */
export function samplePhoto(variant: "leak" | "leak-worse" | "repaired" = "leak"): string {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 480;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ece6da";
  g.fillRect(0, 0, 640, 480);
  g.strokeStyle = "#d8d0c0";
  for (let x = 0; x < 640; x += 160) g.strokeRect(x, 0, 160, 480);
  if (variant !== "repaired") {
    const r = variant === "leak-worse" ? 190 : 120;
    const grad = g.createRadialGradient(330, 230, 10, 330, 230, r);
    grad.addColorStop(0, "rgba(120,80,30,0.85)");
    grad.addColorStop(0.6, "rgba(150,110,50,0.45)");
    grad.addColorStop(1, "rgba(150,110,50,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(330, 230, r * 1.3, r, 0.3, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = "#f3efe6";
    g.fillRect(230, 150, 200, 160);
  }
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.font = "16px sans-serif";
  g.fillText("Sample photo", 16, 464);
  return c.toDataURL("image/jpeg", 0.8);
}

/** Downscale to keep localStorage small. */
async function toDataUrl(file: File, max = 900): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}

export function PhotoInput({
  value,
  onChange,
  label = "Add photo",
  required,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            onChange(await toDataUrl(f));
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Selected" className="h-44 w-full rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white"
            aria-label="Remove photo"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-300 bg-white text-sm text-zinc-500 transition hover:border-brand hover:text-brand"
        >
          <Camera className="size-6" />
          {busy ? "Processing photo…" : label}
          {required && <span className="text-[11px] text-zinc-400">Required</span>}
        </button>
      )}
    </div>
  );
}
