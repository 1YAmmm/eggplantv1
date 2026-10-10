/**
 * Flags photos that are too dark or too bright. The model was trained on photos whose average brightness
 * (0-255) spans about 63-165 (1st-99th percentile); on the test set, artificially darkening or brightening
 * the same photos cut accuracy from 92% to about 80% (very dark), 86% (bright) and 70% (washed out).
 * The limits sit just outside the normal range so ordinary photos are not flagged.
 */

export type Lighting = "ok" | "dark" | "bright";

/** Average brightness below this is "too dark". */
export const TOO_DARK = 55;
/** Average brightness above this is "too bright". */
export const TOO_BRIGHT = 180;
/** A photo with more near-white pixels than this is "too bright" (glare), whatever its average. */
export const GLARE_SHARE = 0.35;
const NEAR_WHITE = 235;

/** `data` is RGBA (as from canvas getImageData). */
export function checkLighting(data: Uint8ClampedArray | Uint8Array): Lighting {
  const pixels = data.length / 4;
  if (pixels === 0) return "ok";
  let sum = 0;
  let white = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += luma;
    if (luma > NEAR_WHITE) white++;
  }
  const mean = sum / pixels;
  if (mean < TOO_DARK) return "dark";
  if (mean > TOO_BRIGHT || white / pixels > GLARE_SHARE) return "bright";
  return "ok";
}
