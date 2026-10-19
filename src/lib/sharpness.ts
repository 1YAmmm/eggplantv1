/**
 * How sharp a photo is, for the focus meter on the ESP32 camera's preview: its lens has no autofocus and is focused by
 * twisting it by hand. The score is the variance of the Laplacian of the grey image: edges and fine texture give big
 * values, a soft photo small ones. It also depends on what is in the picture (a smooth fruit scores lower than a hairy
 * leaf), so it guides the user while turning the lens; it is not a pass/fail test. No imports, so tests can load it.
 */

/**
 * Below this score the preview counts as blurry. Measured on the 300 test photos of the training set at the meter's
 * sample size (240 px): sharp photos have a median of 351 (95% above 82), slightly blurred ones (Gaussian σ 1 px) 66,
 * clearly out of focus (σ 2 px) 10. ESP32 photos are softer than phone photos, so the limit sits low to avoid false alarms.
 */
export const BLURRY = 40;
/** The score shown as 100%. A typical sharp photo shows about 75%. */
const SHARP = 1500;
/** The score shown as 0%. */
const FLAT = 5;

/** `data` is RGBA (as from canvas getImageData). */
export function sharpness(data: Uint8ClampedArray | Uint8Array, width: number, height: number): number {
  const grey = new Float32Array(width * height);
  for (let p = 0, i = 0; i < grey.length; p += 4, i++) grey[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1, i = y * width + 1; x < width - 1; x++, i++) {
      const lap = grey[i - 1] + grey[i + 1] + grey[i - width] + grey[i + width] - 4 * grey[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** The score as 0-100 for the meter, on a log scale: each step of the lens changes the score by a factor, not an amount. */
export function focusPercent(score: number): number {
  if (score <= FLAT) return 0;
  return Math.round(Math.min(100, (100 * Math.log(score / FLAT)) / Math.log(SHARP / FLAT)));
}
