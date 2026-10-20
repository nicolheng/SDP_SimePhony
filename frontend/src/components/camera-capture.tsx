"use client";
import { Camera, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** True when the browser can open a live camera (needs https or localhost). */
export const canUseCamera = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

/** Full-screen live camera with a shutter button. Returns a JPEG data URL. */
export function CameraCapture({ onCapture, onClose, onUnavailable }: { onCapture: (url: string) => void; onClose: () => void; onUnavailable: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  // Which camera to show: start on the back camera; once cameras are listed, switching cycles through them by device.
  const [cameras, setCameras] = useState<string[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const open = (video: MediaTrackConstraints) => navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, ...video }, audio: false });
    const deviceId = index === null ? undefined : cameras[index];
    (deviceId
      ? open({ deviceId: { exact: deviceId } })
      : // "exact" forces the back camera on phones; laptops with only a front camera fall back to any camera.
        open({ facingMode: { exact: "environment" } }).catch(() => open({ facingMode: { ideal: "environment" } }))
    )
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        // Device labels and ids are only available after permission is granted.
        if (!cameras.length) {
          const ids = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").map((d) => d.deviceId);
          const current = s.getVideoTracks()[0]?.getSettings().deviceId;
          if (!cancelled && ids.length > 1) {
            setCameras(ids);
            setIndex(Math.max(0, ids.indexOf(current ?? "")));
          }
        }
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
  }, [index, cameras, stop]);

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
        {cameras.length > 1 ? (
          <button
            type="button"
            onClick={() => setIndex(((index ?? 0) + 1) % cameras.length)}
            className="grid size-10 place-items-center rounded-full bg-white/10"
            aria-label="Switch between front and back camera"
          >
            <RefreshCw className="size-5" />
          </button>
        ) : (
          <span className="size-10" />
        )}
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
