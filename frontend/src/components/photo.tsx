"use client";
import { Camera, CloudUpload, ImageIcon, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmtDateTime } from "@/lib/dates";
import type { Photo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CameraCapture, canUseCamera } from "./camera-capture";
import { Overlay } from "./overlay";

const KIND_LABEL: Record<Photo["kind"], string> = {
  original: "Original",
  reopen: "Reopen",
  verdict: "Inspection",
  repair: "Repair",
  verification: "Verification",
};

/** Full-size photo over the page; tap anywhere or press Esc to close. */
export function PhotoViewer({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <Overlay
      label="Photo"
      onClick={onClose}
      className="flex flex-col items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-white/15 text-white"
        aria-label="Close photo"
      >
        <X className="size-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={caption ?? "Photo"}
        className="max-h-[85%] max-w-full rounded-lg object-contain"
      />
      {caption && <p className="mt-3 text-sm text-white/80">{caption}</p>}
    </Overlay>
  );
}

/** A case photo; tapping it opens it full size (zoom={false} inside links, so the tap navigates instead).
 * A missing photo shows the placeholder rather than crashing. */
export function PhotoThumb({
  photo,
  className,
  label = true,
  zoom = true,
}: {
  photo?: Photo | null;
  className?: string;
  label?: boolean;
  zoom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const kind = photo ? (KIND_LABEL[photo.kind] ?? "Photo") : null;
  const canZoom = zoom && !!photo?.url;
  const image = photo?.url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.url}
      alt={`${kind} photo`}
      className="size-full object-cover"
    />
  ) : (
    <div className="grid size-full place-items-center bg-gradient-to-br from-zinc-200 to-zinc-300 text-zinc-500">
      <ImageIcon className="size-6" />
    </div>
  );
  return (
    <figure
      className={cn(
        "relative overflow-hidden rounded-lg bg-zinc-100",
        className,
      )}
    >
      {canZoom ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block size-full cursor-zoom-in"
          aria-label={`View ${kind?.toLowerCase()} photo full size`}
        >
          {image}
        </button>
      ) : (
        image
      )}
      {label && kind && (
        <figcaption className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {kind}
        </figcaption>
      )}
      {open && photo?.url && (
        <PhotoViewer
          src={photo.url}
          caption={`${kind} photo${photo.at ? ` · ${fmtDateTime(photo.at)}` : ""}`}
          onClose={() => setOpen(false)}
        />
      )}
    </figure>
  );
}

/** Generated stand-in photo for demos run on a laptop (a stained ceiling). */
export function samplePhoto(
  variant: "leak" | "leak-worse" | "repaired" = "leak",
): string {
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

/** Downscale before uploading so photos stay small. */
async function toDataUrl(file: File, max = 720): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

const MAX_BYTES = 3 * 1024 * 1024;
const FORMATS = ["image/jpeg", "image/png"];

export function PhotoInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [viewing, setViewing] = useState(false);

  async function fromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!FORMATS.includes(f.type))
      return setError("Please choose a JPG or PNG photo.");
    if (f.size > MAX_BYTES)
      return setError("That photo is too large (max 3MB).");
    setBusy(true);
    setError(null);
    try {
      onChange(await toDataUrl(f));
    } catch {
      setError("Couldn't read that photo. Please try another.");
    } finally {
      setBusy(false);
    }
  }

  // Live camera where the browser allows it; otherwise the phone's own camera app via capture.
  const takePhoto = () =>
    canUseCamera() ? setCamera(true) : cameraRef.current?.click();

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={fromFile}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={fromFile}
      />
      {camera && (
        <CameraCapture
          onCapture={(url) => {
            setCamera(false);
            setError(null);
            onChange(url);
          }}
          onClose={() => setCamera(false)}
          onUnavailable={() => {
            setCamera(false);
            fileRef.current?.click();
          }}
        />
      )}
      {value ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="block w-full cursor-zoom-in"
            aria-label="View selected photo full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Selected"
              className="h-44 w-full rounded-xl object-cover"
            />
          </button>
          {viewing && (
            <PhotoViewer
              src={value}
              caption="Selected photo"
              onClose={() => setViewing(false)}
            />
          )}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white"
            aria-label="Remove photo"
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            onClick={takePhoto}
            className="absolute bottom-2 right-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white"
          >
            Retake
          </button>
        </div>
      ) : busy ? (
        <div className="flex h-32 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Processing photo…
        </div>
      ) : (
        <div>
          {/* Red "Upload a Photo" (file picker) + grey "Take Photo" (camera), in one bar as in the SDP app. */}
          <div className="flex h-12 w-full overflow-hidden rounded-md ring-1 ring-zinc-200">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 bg-brand px-2 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              <CloudUpload className="size-5 shrink-0" />{" "}
              <span className="whitespace-nowrap">Upload a Photo</span>
            </button>
            <button
              type="button"
              onClick={takePhoto}
              className="flex flex-1 items-center justify-center gap-1.5 bg-zinc-100 px-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-200"
            >
              <Camera className="size-5 shrink-0" />{" "}
              <span className="whitespace-nowrap">Take Photo</span>
            </button>
          </div>
          <p className="mt-1.5 text-xs text-zinc-400">
            Format Support: JPG, PNG (Max 3MB)
          </p>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-brand">{error}</p>}
    </div>
  );
}
