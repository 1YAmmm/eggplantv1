import { useEffect, useState, type RefObject } from "react";
import { checkLighting, type Lighting } from "./lighting";

/** Preview frames are shrunk to this size before measuring; brightness does not need more. */
const SAMPLE_SIZE = 64;
const INTERVAL_MS = 500;
/** A reading must repeat this many times in a row before the hint changes, so it does not flicker. */
const STABLE_READINGS = 2;

/** Watches the live camera preview and reports whether the light is too dark or too bright. */
export function useLiveLighting(videoRef: RefObject<HTMLVideoElement | null>, active: boolean): Lighting {
  const [lighting, setLighting] = useState<Lighting>("ok");

  useEffect(() => {
    if (!active) return;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let last: Lighting = "ok";
    let streak = 0;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || video.paused) return;
      ctx.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const reading = checkLighting(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
      streak = reading === last ? streak + 1 : 1;
      last = reading;
      if (streak >= STABLE_READINGS) setLighting(reading);
    }, INTERVAL_MS);

    return () => {
      clearInterval(timer);
      setLighting("ok");
    };
  }, [videoRef, active]);

  return active ? lighting : "ok";
}
