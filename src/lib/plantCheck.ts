/**
 * Cheap colour-based gate that runs before the classifier.
 *
 * The Teachable Machine model only knows its trained classes, so it will label a
 * face or a wall as a pest. This check rejects images that don't contain enough
 * leaf-green or eggplant-purple pixels to plausibly be an eggplant plant/fruit.
 */

export type PlantCheck = {
  /** Fraction of pixels that look like leaf (yellow-green to green). */
  green: number;
  /** Fraction of pixels that look like eggplant skin (purple / violet). */
  purple: number;
  /** green + purple */
  plant: number;
};

/** Minimum share of plant-coloured pixels for an image to count as eggplant. */
export const MIN_PLANT_RATIO = 0.15;

/** `data` is RGBA (as from canvas getImageData), already center-cropped. */
export function plantColorRatio(data: Uint8ClampedArray | Uint8Array, width: number, height: number): PlantCheck {
  let green = 0;
  let purple = 0;
  const total = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const v = max;
    const s = max === 0 ? 0 : d / max;
    if (d === 0) continue;

    let h: number;
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;

    if (h >= 50 && h <= 170 && s >= 0.18 && v >= 0.12) green++;
    else if (h >= 250 && h <= 340 && s >= 0.25 && v >= 0.12) purple++;
  }

  return { green: green / total, purple: purple / total, plant: (green + purple) / total };
}
