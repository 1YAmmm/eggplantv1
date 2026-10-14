import type { CapturePhase } from "@/lib/useEsp32Camera";

/**
 * Frosted-glass card over the viewfinder while the ESP32 camera takes and sends its full-size photo (a few seconds).
 * The last preview stays visible underneath, so it reads as "the shutter was pressed". The two pills show which step
 * is running: the request reaching the camera, then the photo coming back.
 */
export default function CapturingOverlay({ phase }: { phase: CapturePhase }) {
  const asking = phase === "asking";
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 flex items-center justify-center bg-leaf-950/35 p-6 backdrop-blur-[3px]"
    >
      <div className="relative w-full max-w-[17rem] overflow-hidden rounded-3xl border border-white/30 bg-leaf-950/30 bg-gradient-to-br from-white/25 via-white/10 to-white/5 px-5 py-5 text-center text-white shadow-2xl shadow-black/30 backdrop-blur-xl backdrop-saturate-150">
        <span aria-hidden="true" className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

        <div className="mx-auto flex h-12 w-12 items-center justify-center">
          <span aria-hidden="true" className="absolute h-12 w-12 animate-ping rounded-full bg-leaf-300/20 motion-reduce:animate-none" />
          <span className="relative h-10 w-10">
            <span className="absolute inset-0 rounded-full border-[3px] border-white/25" />
            <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-leaf-300 border-r-leaf-300/60 motion-reduce:animate-none" />
          </span>
        </div>

        <p className="mt-3 text-base font-semibold drop-shadow-sm">Capturing…</p>
        <p className="mt-0.5 text-xs text-white/80">
          {asking ? "Telling the camera to take a photo" : "Hold still. The photo is on its way."}
        </p>

        <ol className="mt-4 flex items-center justify-center gap-2 text-[11px] font-medium">
          <Step label="Ask camera" state={asking ? "active" : "done"} />
          <span aria-hidden="true" className="h-px w-3 bg-white/40" />
          <Step label="Receive photo" state={asking ? "pending" : "active"} />
        </ol>
      </div>
    </div>
  );
}

type StepState = "pending" | "active" | "done";

function Step({ label, state }: { label: string; state: StepState }) {
  const style =
    state === "active"
      ? "border-white/40 bg-white/30 text-white"
      : state === "done"
        ? "border-leaf-300/50 bg-leaf-300/25 text-white"
        : "border-white/15 bg-white/5 text-white/55";
  return (
    <li className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-sm ${style}`}>
      {state === "done" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
          <path d="m5 12 5 5L20 7" />
        </svg>
      ) : state === "active" ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-leaf-300 motion-reduce:animate-none" />
      ) : null}
      {label}
      <span className="sr-only">{state === "done" ? " (done)" : state === "active" ? " (in progress)" : " (waiting)"}</span>
    </li>
  );
}
