import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/*
 * The phone's side of the ESP32-CAM relay (see /api/cam/*). While `active`, it fetches the newest preview photo about
 * once a second and draws it on a canvas; each fetch also tells the camera that someone is looking, which wakes it
 * from idle. `capture()` asks for one full-size photo and returns it as a canvas, ready for the classifier.
 */

export type CamState = "idle" | "waking" | "live" | "offline" | "error";

const POLL_MS = 700;
const BACKOFF_MS = 3_000;
/** A sleeping camera wakes within its ~10 s heartbeat; allow for the first upload as well. */
const WAKE_TIMEOUT_MS = 25_000;
/** Previews arrive about once a second, so a long gap means the camera has stopped. */
const STALE_AFTER_MS = 8_000;
const CAPTURE_TIMEOUT_MS = 15_000;
const CAPTURE_POLL_MS = 500;

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

/** Decodes a JPEG response onto a canvas, resizing the canvas to the photo. */
async function drawPhoto(res: Response, canvas: HTMLCanvasElement) {
  const bitmap = await createImageBitmap(await res.blob());
  if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
}

export function useEsp32Camera(code: string, active: boolean, canvasRef: RefObject<HTMLCanvasElement | null>) {
  const [state, setState] = useState<CamState>("waking");
  const [message, setMessage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  /** Lets `capture()` stop with the preview loop when the scanner is closed. */
  const abortRef = useRef<AbortController | null>(null);

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
          const res = await fetch(`/api/cam/frame?after=${after}`, { headers, cache: "no-store", signal });
          failures = 0;
          if (res.status === 200) {
            after = Number(res.headers.get("x-frame-seq")) || after;
            // The server keeps the last preview for a minute. If the camera has since gone quiet, that photo is
            // history, not a live view: skip it, so a switched-off camera is not shown as live.
            if (res.headers.get("x-camera-online") === "1") {
              try {
                const canvas = canvasRef.current;
                if (canvas) await drawPhoto(res, canvas);
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
    };
  }, [active, code, canvasRef]);

  /** Asks the camera for one full-size photo and waits for it. Rejects with a message that can be shown to the user. */
  const capture = useCallback(async (): Promise<HTMLCanvasElement> => {
    const signal = abortRef.current?.signal;
    if (!signal || signal.aborted) throw new Error(NO_CAMERA);
    const headers = { "x-cam-code": code };

    setCapturing(true);
    try {
      const asked = await fetch("/api/cam/capture", { method: "POST", headers, cache: "no-store", signal });
      if (!asked.ok) throw new Error(failure(asked));
      const { id } = (await asked.json()) as { id: string };

      const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
      while (Date.now() < deadline && !signal.aborted) {
        await sleep(CAPTURE_POLL_MS, signal);
        if (signal.aborted) break;
        const res = await fetch(`/api/cam/capture?id=${id}`, { headers, cache: "no-store", signal });
        if (res.status === 200) {
          const canvas = document.createElement("canvas");
          await drawPhoto(res, canvas);
          return canvas;
        }
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

  return { state: active ? state : ("idle" as CamState), message: active ? message : null, capturing, capture };
}
