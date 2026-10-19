import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { drawPhoto, squarePhoto } from "./camPhoto";
import type { FlashChoice } from "./camRelay";

/*
 * The phone's side of the ESP32-CAM relay (see /api/cam/*). While `active`, it fetches the newest preview photo about
 * once a second and draws it on a canvas; each fetch also tells the camera that someone is looking, which wakes it
 * from idle. `capture()` asks for one full-size photo and returns its centre square (what the viewfinder shows) as a
 * canvas, ready for the classifier.
 */

export type CamState = "idle" | "waking" | "live" | "offline" | "error";

/** While a Capture is under way: the request is reaching the camera, then its full-size photo is coming back. */
export type CapturePhase = "asking" | "receiving";

/** What the scanner needs from an ESP32 camera link: this Wi-Fi relay, or the Bluetooth one (useEsp32Bluetooth). */
export type Esp32Link = {
  state: CamState;
  message: string | null;
  capturing: boolean;
  capturePhase: CapturePhase;
  /** Whether the camera's white LED is really lit, as the camera reports it; null until it has said. */
  cameraFlash: boolean | null;
  capture: () => Promise<HTMLCanvasElement>;
};

/** Pause between preview polls. The camera sends about one photo a second, so polling this often keeps the picture fresh. */
const POLL_MS = 300;
const BACKOFF_MS = 3_000;
/** A sleeping camera wakes within its ~10 s heartbeat; allow for the first upload as well. */
const WAKE_TIMEOUT_MS = 25_000;
/** Previews arrive about once a second, so a long gap means the camera has stopped. */
const STALE_AFTER_MS = 8_000;
const CAPTURE_TIMEOUT_MS = 15_000;
const CAPTURE_POLL_MS = 300;

const NO_CAMERA = "The camera is not connected.";
const NO_NETWORK = "Can't reach the server. Check your internet connection.";
const NOT_RESPONDING = "The camera is not responding. Check that it is powered and on Wi-Fi with internet.";

function failure(res: Response): string {
  if (res.status === 401) return "That camera code was not accepted.";
  if (res.status === 429) return "Too many requests. Please wait a moment.";
  if (res.status === 503) return "The ESP32 camera is not set up on this server.";
  return "Could not reach the camera relay.";
}

/** Resolves after `ms`, or as soon as the signal aborts. */
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

/** Resolves when the page is visible again (or the signal aborts). Hidden pages do not poll, which saves data. */
function untilVisible(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    document.addEventListener("visibilitychange", check);
    signal.addEventListener("abort", done, { once: true });
    function check() {
      if (!document.hidden) done();
    }
    function done() {
      document.removeEventListener("visibilitychange", check);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

/**
 * `flash` is the user's choice for the camera's white LED: "on" / "off", or "auto" to leave it to the camera's own
 * setting. It rides along with every poll, so the camera follows within about a second.
 */
export function useEsp32Camera(
  code: string,
  active: boolean,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  flash: FlashChoice = "auto",
): Esp32Link {
  const [state, setState] = useState<CamState>("waking");
  const [message, setMessage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("asking");
  /** Whether the camera's white LED is really lit, as the camera reports it; null until it has said. */
  const [cameraFlash, setCameraFlash] = useState<boolean | null>(null);
  /** Lets `capture()` stop with the preview loop when the scanner is closed. */
  const abortRef = useRef<AbortController | null>(null);
  /** The latest flash choice, read by the polling loop without restarting it every time the user taps the button. */
  const flashRef = useRef(flash);
  useEffect(() => {
    flashRef.current = flash;
  }, [flash]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    const headers = { "x-cam-code": code };

    /** The newest preview the phone has, so the server can answer "nothing new" with an empty 204. */
    let after = 0;
    let lastPhotoAt = Date.now();
    let gotPhoto = false;
    let failures = 0;

    async function run() {
      while (!signal.aborted) {
        if (document.hidden) {
          await untilVisible(signal);
          // The camera went back to sleep while the page was hidden; the next poll wakes it again.
          lastPhotoAt = Date.now();
          gotPhoto = false;
          setState("waking");
          setMessage(null);
          continue;
        }

        let pause = POLL_MS;
        try {
          const res = await fetch(`/api/cam/frame?after=${after}&flash=${flashRef.current}`, { headers, cache: "no-store", signal });
          failures = 0;
          const lit = res.headers.get("x-camera-flash");
          if (lit !== null) setCameraFlash(lit === "1");
          if (res.status === 200) {
            after = Number(res.headers.get("x-frame-seq")) || after;
            // The server keeps the last preview for a minute. If the camera has since gone quiet, that photo is
            // history, not a live view: skip it, so a switched-off camera is not shown as live.
            if (res.headers.get("x-camera-online") === "1") {
              try {
                const canvas = canvasRef.current;
                if (canvas) await drawPhoto(await res.blob(), canvas);
                lastPhotoAt = Date.now();
                gotPhoto = true;
                setState("live");
                setMessage(null);
              } catch {
                // A damaged preview is skipped; the next one is a second away.
              }
            }
          } else if (res.status === 429) {
            pause = BACKOFF_MS;
          } else if (res.status !== 204) {
            setState("error");
            setMessage(failure(res));
            return;
          }
        } catch {
          if (signal.aborted) return;
          // A damaged photo or a dropped connection: try again, and say so only if it keeps happening.
          failures++;
          pause = BACKOFF_MS;
          if (failures >= 3) {
            setState("offline");
            setMessage(NO_NETWORK);
          }
        }

        if (failures < 3 && Date.now() - lastPhotoAt > (gotPhoto ? STALE_AFTER_MS : WAKE_TIMEOUT_MS)) {
          setState("offline");
          setMessage(NOT_RESPONDING);
        }
        await sleep(pause, signal);
      }
    }
    void run();

    return () => {
      controller.abort();
      abortRef.current = null;
      setState("waking");
      setMessage(null);
      setCameraFlash(null);
    };
  }, [active, code, canvasRef]);

  /** Asks the camera for one full-size photo and waits for it (cropped to the viewfinder's square). Rejects with a message that can be shown to the user. */
  const capture = useCallback(async (): Promise<HTMLCanvasElement> => {
    const signal = abortRef.current?.signal;
    if (!signal || signal.aborted) throw new Error(NO_CAMERA);
    const headers = { "x-cam-code": code };

    setCapturePhase("asking");
    setCapturing(true);
    try {
      const asked = await fetch(`/api/cam/capture?flash=${flashRef.current}`, { method: "POST", headers, cache: "no-store", signal });
      if (!asked.ok) throw new Error(failure(asked));
      const { id } = (await asked.json()) as { id: string };
      setCapturePhase("receiving");

      const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
      while (Date.now() < deadline && !signal.aborted) {
        await sleep(CAPTURE_POLL_MS, signal);
        if (signal.aborted) break;
        const res = await fetch(`/api/cam/capture?id=${id}`, { headers, cache: "no-store", signal });
        if (res.status === 200) return await squarePhoto(await res.blob());
        if (res.status !== 204) throw new Error(failure(res));
      }
      throw new Error(signal.aborted ? NO_CAMERA : "The camera did not send the photo. Check that it is powered and online, then try again.");
    } catch (err) {
      if (signal.aborted) throw new Error(NO_CAMERA);
      if (err instanceof TypeError) throw new Error(NO_NETWORK);
      if (err instanceof DOMException) throw new Error("The photo from the camera was damaged. Please try again.");
      throw err;
    } finally {
      setCapturing(false);
    }
  }, [code]);

  return {
    state: active ? state : ("idle" as CamState),
    message: active ? message : null,
    capturing,
    capturePhase,
    cameraFlash: active ? cameraFlash : null,
    capture,
  };
}
