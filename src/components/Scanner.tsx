"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classify, loadModel, type Diagnosis } from "@/lib/model";
import ResultCard from "./ResultCard";

type Status = "idle" | "camera" | "analyzing" | "done" | "error";

export default function Scanner() {
  const [modelReady, setModelReady] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadModel()
      .then(() => setModelReady(true))
      .catch(() => {
        setError("Could not load the detection model. Please refresh the page.");
        setStatus("error");
      });
    return () => stopCamera();
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const analyze = useCallback(async (el: HTMLImageElement | HTMLCanvasElement) => {
    setStatus("analyzing");
    try {
      setDiagnosis(await classify(el));
      setStatus("done");
    } catch {
      setError("Something went wrong while analysing the image.");
      setStatus("error");
    }
  }, []);

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Live camera needs HTTPS. Use “Take / upload photo” instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setPreview(null);
      setDiagnosis(null);
      setStatus("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError("Camera access was denied or is unavailable. Use “Take / upload photo” instead.");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    setPreview(canvas.toDataURL("image/jpeg", 0.9));
    stopCamera();
    analyze(canvas);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    stopCamera();
    setError(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    const img = new Image();
    img.onload = () => analyze(img);
    img.onerror = () => {
      setError("That file could not be read as an image.");
      setStatus("error");
    };
    img.src = url;
  }

  function reset() {
    stopCamera();
    setPreview(null);
    setDiagnosis(null);
    setError(null);
    setStatus("idle");
  }

  return (
    <div className="w-full">
      {/* Viewfinder */}
      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-3xl bg-leaf-950 shadow-xl shadow-leaf-900/10 ring-1 ring-leaf-900/10">
        {status === "camera" && (
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        )}
        {preview && status !== "camera" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Captured eggplant" className="h-full w-full object-cover" />
        )}
        {!preview && status !== "camera" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-leaf-100/80">
            <LeafIcon className="h-12 w-12 text-leaf-300" />
            <p className="text-sm">Point your camera at an eggplant leaf or fruit, or upload a photo.</p>
          </div>
        )}

        {/* Scan frame corners */}
        {(status === "camera" || status === "analyzing") && (
          <div className="pointer-events-none absolute inset-8">
            <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-leaf-300" />
            <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-leaf-300" />
            <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-leaf-300" />
            <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-leaf-300" />
          </div>
        )}

        {status === "analyzing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-leaf-950/50 backdrop-blur-[2px]">
            <div className="scan-line absolute inset-x-8 h-0.5 bg-leaf-300 shadow-[0_0_16px_4px] shadow-leaf-300/60" />
            <span className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-medium text-leaf-900">
              Analysing…
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-3">
        {status === "camera" ? (
          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary flex-1">
              Cancel
            </button>
            <button onClick={capture} className="btn-primary flex-[2]">
              <CameraIcon className="h-5 w-5" /> Capture
            </button>
          </div>
        ) : status === "done" || status === "error" ? (
          <button onClick={reset} className="btn-primary">
            Scan another
          </button>
        ) : (
          <>
            <button onClick={startCamera} disabled={!modelReady || status === "analyzing"} className="btn-primary">
              <ScanIcon className="h-5 w-5" /> {modelReady ? "Scan with camera" : "Loading model…"}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!modelReady || status === "analyzing"}
              className="btn-secondary"
            >
              <UploadIcon className="h-5 w-5" /> Take / upload photo
            </button>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </div>

      {status === "done" && diagnosis?.kind === "eggplant" && (
        <div className="mx-auto mt-8 w-full max-w-2xl">
          <ResultCard predictions={diagnosis.predictions} />
        </div>
      )}
      {status === "done" && diagnosis?.kind === "not_eggplant" && (
        <div className="mx-auto mt-8 w-full max-w-md">
          <NoEggplantCard />
        </div>
      )}
    </div>
  );
}

function NoEggplantCard() {
  return (
    <article className="rounded-3xl bg-white px-6 py-8 text-center shadow-xl shadow-leaf-900/5 ring-1 ring-leaf-900/5">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-leaf-100 text-leaf-600">
        <SearchOffIcon className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-leaf-950">This is not an eggplant</h2>
      <p className="mt-2 text-sm text-leaf-900/70">
        EggplantCare only checks eggplant <strong className="font-medium text-leaf-900">leaves</strong> and{" "}
        <strong className="font-medium text-leaf-900">fruit</strong>. We couldn&apos;t find either in this photo, so no
        diagnosis was made.
      </p>
      <ul className="mt-5 space-y-2 text-left text-sm text-leaf-900/80">
        {[
          "Fill most of the frame with the leaf or fruit",
          "Use daylight and avoid strong shadows",
          "Hold the phone steady so the photo is sharp",
        ].map((tip) => (
          <li key={tip} className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-400" />
            {tip}
          </li>
        ))}
      </ul>
    </article>
  );
}

type IconProps = { className?: string };
const svg = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24" } as const;

function LeafIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}
function SearchOffIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3M8.5 8.5l5 5M13.5 8.5l-5 5" />
    </svg>
  );
}
function CameraIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
function ScanIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
    </svg>
  );
}
function UploadIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}
