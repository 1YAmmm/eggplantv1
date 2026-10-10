"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyOpinion, needsSecondOpinion, type Opinion } from "@/lib/assist";
import type { Lighting } from "@/lib/lighting";
import { classify, loadModel, type Diagnosis } from "@/lib/model";
import { askSecondOpinion, ASSIST_MODE } from "@/lib/secondOpinion";
import { useLiveLighting } from "@/lib/useLiveLighting";
import AnalysingOverlay from "./AnalysingOverlay";
import ChatBox from "./ChatBox";
import LightingNotice from "./LightingNotice";
import ResultCard from "./ResultCard";

type Status = "idle" | "camera" | "analyzing" | "done" | "error";

/** Image Capture camera controls (mainly Chrome on Android); not in TypeScript's DOM types yet. */
type CameraCapabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };
type CameraConstraints = MediaTrackConstraintSet & {
  torch?: boolean;
  focusMode?: string;
  pointsOfInterest?: { x: number; y: number }[];
};

/** How long a tap-to-focus lock lasts before handing back to continuous autofocus. */
const FOCUS_LOCK_MS = 3000;

/** The on-device scan takes a fraction of a second; the "Analysing image…" overlay stays at least this long so it can be seen. */
const MIN_ANALYSING_MS = 1600;

export default function Scanner() {
  const [modelReady, setModelReady] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  /** What the AI second opinion said about the current photo; null until one is requested. */
  const [opinion, setOpinion] = useState<Opinion | null>(null);
  const [focusModes, setFocusModes] = useState<string[]>([]);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  /** Where the user last tapped to focus, in viewfinder pixels; `id` restarts the ring animation. */
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; id: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** "Upload photo": no `capture` hint, so phones show their media picker (gallery, files, and usually a camera option). */
  const fileRef = useRef<HTMLInputElement>(null);
  /** Opens the phone's camera app directly; only used when the live camera is not available. */
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The photo being analysed, kept so the AI can be asked about it later; and a counter that drops stale answers. */
  const sourceRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const scanId = useRef(0);

  const canTapFocus = focusModes.includes("single-shot") || focusModes.includes("continuous");
  /** Live check of the camera preview, so the user can fix the light before capturing. */
  const liveLighting = useLiveLighting(videoRef, status === "camera");

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
    clearTimeout(focusTimer.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
    setFocusRing(null);
  }

  /** Applies camera controls; unsupported ones are ignored by the browser. */
  function applyCamera(constraints: CameraConstraints) {
    const track = streamRef.current?.getVideoTracks()[0];
    return track ? track.applyConstraints({ advanced: [constraints] }) : Promise.reject(new Error("No camera"));
  }

  async function toggleTorch() {
    try {
      await applyCamera({ torch: !torchOn });
      // Read back the real state: browsers silently skip constraints the camera can't meet.
      const settings = streamRef.current?.getVideoTracks()[0]?.getSettings() as { torch?: boolean } | undefined;
      setTorchOn(settings?.torch ?? !torchOn);
    } catch {
      setError("Could not switch the flash.");
    }
  }

  function focusAt(e: React.PointerEvent<HTMLVideoElement>) {
    const video = e.currentTarget;
    if (!canTapFocus || !video.videoWidth) return;
    const rect = video.getBoundingClientRect();
    const tapX = e.clientX - rect.left;
    const tapY = e.clientY - rect.top;
    // The video is object-cover, so map the tap back to 0..1 coordinates of the full camera frame.
    const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const frameW = video.videoWidth * scale;
    const frameH = video.videoHeight * scale;
    const x = (tapX + (frameW - rect.width) / 2) / frameW;
    const y = (tapY + (frameH - rect.height) / 2) / frameH;

    const singleShot = focusModes.includes("single-shot");
    applyCamera({ pointsOfInterest: [{ x, y }], focusMode: singleShot ? "single-shot" : "continuous" }).catch(() => {});
    setFocusRing({ x: tapX, y: tapY, id: e.timeStamp });

    // Single-shot locks focus; go back to continuous so moving the phone still refocuses.
    clearTimeout(focusTimer.current);
    if (singleShot && focusModes.includes("continuous")) {
      focusTimer.current = setTimeout(() => applyCamera({ focusMode: "continuous" }).catch(() => {}), FOCUS_LOCK_MS);
    }
  }

  const analyze = useCallback(
    async (el: HTMLImageElement | HTMLCanvasElement) => {
      const scan = ++scanId.current;
      sourceRef.current = el;
      setOpinion(null);
      setStatus("analyzing");
      try {
        const started = Date.now();
        const result = await classify(el);
        const remaining = MIN_ANALYSING_MS - (Date.now() - started);
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
        // The user may have tapped "Scan another" or picked a new photo while the overlay was showing.
        if (scan !== scanId.current) return;
        setDiagnosis(result);
        setStatus("done");
        // The on-device result is already on screen; the AI second opinion arrives later and may correct it.
        if (result.kind === "eggplant" && needsSecondOpinion(result.predictions, ASSIST_MODE)) {
          setOpinion({ kind: "checking" });
          const answer = await askSecondOpinion(el, result.predictions);
          if (scan === scanId.current) setOpinion(answer);
        }
      } catch {
        setError("Something went wrong while analysing the image.");
        setStatus("error");
      }
    },
    [],
  );

  /** For a photo the colour check rejected: runs the classifier anyway and lets the AI decide. */
  async function recheckWithAi() {
    const el = sourceRef.current;
    if (!el) return;
    const scan = ++scanId.current;
    setOpinion({ kind: "checking" });
    try {
      const forced = await classify(el, { skipPlantCheck: true });
      const answer = forced.kind === "eggplant" ? await askSecondOpinion(el, forced.predictions) : ({ kind: "unavailable" } as const);
      if (scan !== scanId.current) return;
      // Only an AI that agrees with or corrects the classifier turns a rejected photo into a result.
      if (forced.kind === "eggplant" && (answer.kind === "confirmed" || answer.kind === "corrected")) setDiagnosis(forced);
      setOpinion(answer);
    } catch {
      if (scan === scanId.current) setOpinion({ kind: "unavailable" });
    }
  }

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      // No live camera (plain HTTP): open the phone's camera app instead. This still runs inside the tap, so the
      // browser allows it.
      cameraFileRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      // Firefox has no getCapabilities(); flash and tap-to-focus stay hidden there.
      const caps = (stream.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as CameraCapabilities;
      const modes = caps.focusMode ?? [];
      setFocusModes(modes);
      setHasTorch(caps.torch === true);
      if (modes.includes("continuous")) applyCamera({ focusMode: "continuous" }).catch(() => {});
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
      setError("Camera access was denied or is unavailable. Use “Upload photo” instead.");
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
    scanId.current++;
    sourceRef.current = null;
    setOpinion(null);
    setPreview(null);
    setDiagnosis(null);
    setError(null);
    setStatus("idle");
  }

  const eggplant = diagnosis?.kind === "eggplant" ? diagnosis : null;
  /** The AI looked at the photo and says it shows no eggplant, so the result is replaced by the "not an eggplant" card. */
  const aiRejected = opinion?.kind === "not_eggplant";
  /** The on-device result is on screen and the AI is still looking at the photo. */
  const aiChecking = opinion?.kind === "checking";
  const shown = eggplant ? applyOpinion(eggplant.predictions, opinion) : null;

  return (
    <div className="w-full">
      {/* Viewfinder */}
      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-3xl bg-leaf-950 shadow-xl shadow-leaf-900/10 ring-1 ring-leaf-900/10">
        {status === "camera" && (
          <video
            ref={videoRef}
            playsInline
            muted
            onPointerDown={focusAt}
            className={`h-full w-full object-cover ${canTapFocus ? "cursor-crosshair" : ""}`}
          />
        )}
        {status === "camera" && focusRing && (
          <span
            key={focusRing.id}
            className="focus-ring pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: focusRing.x, top: focusRing.y }}
          />
        )}
        {status === "camera" && hasTorch && (
          <button
            onClick={toggleTorch}
            aria-pressed={torchOn}
            className={`absolute left-1/2 top-3 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium backdrop-blur transition ${
              torchOn ? "bg-yellow-300 text-leaf-950" : "bg-black/40 text-white"
            }`}
          >
            <FlashIcon className="h-4 w-4" /> {torchOn ? "Flash on" : "Flash off"}
          </button>
        )}
        {status === "camera" && canTapFocus && (
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur">
            Tap to focus
          </span>
        )}
        {status === "camera" && (
          <div role="status" className="pointer-events-none absolute inset-x-3 bottom-16 flex justify-center">
            {liveLighting !== "ok" && (
              <span className="flex items-center gap-2 rounded-2xl bg-amber-100/95 px-3.5 py-2 text-left text-xs font-medium text-amber-900 shadow-lg">
                {liveLighting === "dark" ? <MoonIcon className="h-4 w-4 shrink-0" /> : <SunIcon className="h-4 w-4 shrink-0" />}
                {liveLighting === "dark"
                  ? hasTorch
                    ? "Too dark. Move to a brighter spot or turn on Flash."
                    : "Too dark. Move to a brighter spot."
                  : "Too bright. Step into the shade or move away from the glare."}
              </span>
            )}
          </div>
        )}
        {preview && status !== "camera" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Captured eggplant" className="h-full w-full object-cover" />
        )}
        {!preview && status !== "camera" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-leaf-100/80">
            <LeafIcon className="h-12 w-12 text-leaf-300" />
            <p className="text-sm">Point your camera at an eggplant leaf or fruit, or upload a photo.</p>
            <p className="text-xs text-leaf-100/60">Use even daylight: not too dark, not too bright.</p>
          </div>
        )}

        {/* Scan frame corners */}
        {(status === "camera" || status === "analyzing" || aiChecking) && (
          <div className="pointer-events-none absolute inset-8">
            <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-leaf-300" />
            <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-leaf-300" />
            <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-leaf-300" />
            <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-leaf-300" />
          </div>
        )}

        {/* Loading: first the on-device scan, then (when it is unsure) the AI check, while the result is already below. */}
        {(status === "analyzing" || aiChecking) && <AnalysingOverlay phase={status === "analyzing" ? "scan" : "ai"} />}
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
              <UploadIcon className="h-5 w-5" /> Upload photo
            </button>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </div>

      {status === "done" && eggplant && shown && !aiRejected && (
        <div className="mx-auto mt-8 w-full max-w-2xl">
          <ResultCard
            predictions={shown}
            lighting={eggplant.lighting}
            opinion={opinion}
            localLabel={eggplant.predictions[0].label}
          />
        </div>
      )}
      {/* Floating chat, only while an eggplant result is on screen; leaving the result resets the conversation. */}
      {status === "done" && shown && !aiRejected && <ChatBox predictions={shown} />}
      {status === "done" && diagnosis && (diagnosis.kind === "not_eggplant" || aiRejected) && (
        <div className="mx-auto mt-8 w-full max-w-md">
          <NoEggplantCard lighting={diagnosis.lighting} opinion={opinion} onAskAi={recheckWithAi} />
        </div>
      )}
    </div>
  );
}

function NoEggplantCard({
  lighting,
  opinion,
  onAskAi,
}: {
  lighting: Lighting;
  opinion: Opinion | null;
  /** The "double-check" button: runs the classifier anyway and lets the AI decide. */
  onAskAi: () => void;
}) {
  const checking = opinion?.kind === "checking";
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
      {opinion?.kind === "not_eggplant" && (
        <p role="status" className="mt-3 rounded-2xl bg-leaf-50 px-4 py-3 text-sm text-leaf-800">
          {opinion.by} checked the photo too and agrees{opinion.reason ? `: ${opinion.reason}` : "."}
        </p>
      )}
      {(opinion?.kind === "unsure" || opinion?.kind === "unavailable") && (
        <p role="status" className="mt-3 rounded-2xl bg-leaf-50 px-4 py-3 text-sm text-leaf-900/60">
          The AI could not give a clear answer, so the photo stays rejected.
        </p>
      )}
      {opinion?.kind !== "not_eggplant" && (
        <button type="button" onClick={onAskAi} disabled={checking} className="btn-secondary mt-4 w-full">
          {checking ? "Asking an AI…" : "Is this wrong? Ask an AI to double-check"}
        </button>
      )}
      {lighting !== "ok" && (
        <div className="mt-4 text-left">
          <LightingNotice lighting={lighting} />
        </div>
      )}
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
function MoonIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className} aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
function SunIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function FlashIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
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
