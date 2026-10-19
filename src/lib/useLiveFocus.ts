import { useEffect, useState, type RefObject } from "react";
import { BLURRY, focusPercent, sharpness } from "./sharpness";

/** The preview's centre square (what the viewfinder shows and Capture keeps) is shrunk to this size before measuring. */
const SAMPLE_SIZE = 240;
const INTERVAL_MS = 500;
/** "Blurry" must repeat this many times in a row before the hint changes, so it does not flicker. */
const STABLE_READINGS = 2;

/** `percent` is 0-100 for the meter; `blurry` turns on the hint to twist the lens. */
export type Focus = { percent: number; blurry: boolean };

/** Watches the ESP32 camera's preview canvas and reports how sharp it is, so the user can focus the lens by hand. */
export function useLiveFocus(previewRef: RefObject<HTMLCanvasElement | null>, active: boolean): Focus | null {
  const [focus, setFocus] = useState<Focus | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";

    let blurry = false;
    let streak = 0;
    const timer = setInterval(() => {
      const preview = previewRef.current;
      if (!preview || !preview.width) return;
      const side = Math.min(preview.width, preview.height);
      ctx.drawImage(preview, (preview.width - side) / 2, (preview.height - side) / 2, side, side, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const score = sharpness(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, SAMPLE_SIZE, SAMPLE_SIZE);
      const reading = score < BLURRY;
      streak = reading === blurry ? 0 : streak + 1;
      if (streak >= STABLE_READINGS) {
        blurry = reading;
        streak = 0;
      }
      const next = { percent: focusPercent(score), blurry };
      // The number moves with every reading, so the user sees the effect of each twist of the lens.
      setFocus((prev) => (prev && prev.percent === next.percent && prev.blurry === next.blurry ? prev : next));
    }, INTERVAL_MS);

    return () => {
      clearInterval(timer);
      setFocus(null);
    };
  }, [previewRef, active]);

  return active ? focus : null;
}
