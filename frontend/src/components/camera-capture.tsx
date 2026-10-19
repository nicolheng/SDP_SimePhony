"use client";
import { Camera, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** True when the browser can open a live camera (needs https or localhost). */
export const canUseCamera = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

/** Full-screen live camera with a shutter button. Returns a JPEG data URL. */
export function CameraCapture({ onCapture, onClose, onUnavailable }: { onCapture: (url: string) => void; onClose: () => void; onUnavailable: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.name === "NotAllowedError" ? "Camera permission was denied." : "No camera found on this device.");
      });
    return () => {
      cancelled = true;
      stop();
      setReady(false);
    };
  }, [facing, stop]);

  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const max = 720;
    const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    stop();
    onCapture(canvas.toDataURL("image/jpeg", 0.7));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Take photo">
      <div className="flex items-center justify-between p-4">
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/10" aria-label="Close camera">
          <X className="size-5" />
        </button>
        <p className="text-sm">Take photo</p>
        <button
          type="button"
          onClick={() => setFacing(facing === "environment" ? "user" : "environment")}
          className="grid size-10 place-items-center rounded-full bg-white/10"
          aria-label="Switch camera"
        >
          <RefreshCw className="size-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {error ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <p className="text-base">{error}</p>
              <button type="button" onClick={onUnavailable} className="mt-4 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900">
                Choose a photo instead
              </button>
            </div>
          </div>
        ) : (
          <>
            <video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(true)} className="h-full w-full object-contain" />
            {!ready && (
              <p className="absolute inset-0 grid place-items-center text-sm text-white/70">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Starting camera…
                </span>
              </p>
            )}
          </>
        )}
      </div>
      {!error && (
        <div className="grid place-items-center p-6">
          <button
            type="button"
            onClick={shoot}
            disabled={!ready}
            className="grid size-18 place-items-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
            aria-label="Capture photo"
          >
            <Camera className="size-7" />
          </button>
        </div>
      )}
    </div>
  );
}
