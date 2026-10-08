import * as tf from "@tensorflow/tfjs";
import { MIN_PLANT_RATIO, plantColorRatio } from "./plantCheck";

const MODEL_URL = "/model/model.json";
const METADATA_URL = "/model/metadata.json";

/**
 * Labels that mean "not an eggplant". If you retrain in Teachable Machine with a
 * class using one of these names, the app treats it as "No eggplant detected".
 */
const REJECT_LABELS = new Set(["not_eggplant", "no_eggplant", "background", "unknown", "other", "none"]);

export type Prediction = { label: string; probability: number };

export type Diagnosis =
  | { kind: "eggplant"; predictions: Prediction[] }
  | { kind: "not_eggplant"; reason: "no_plant" | "model"; plantRatio: number };

type Metadata = { labels: string[]; imageSize: number };

let cached: Promise<{ model: tf.LayersModel; meta: Metadata }> | null = null;

export function loadModel() {
  if (!cached) {
    cached = (async () => {
      await tf.ready();
      const [model, meta] = await Promise.all([
        tf.loadLayersModel(MODEL_URL),
        fetch(METADATA_URL).then((r) => r.json() as Promise<Metadata>),
      ]);
      // Warm up so the first real prediction is fast.
      tf.tidy(() => {
        model.predict(tf.zeros([1, meta.imageSize, meta.imageSize, 3]));
      });
      return { model, meta };
    })().catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

/** Center-crops to a square and resizes, matching Teachable Machine's preprocessing. */
function toSquareCanvas(source: CanvasImageSource, w: number, h: number, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const side = Math.min(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  return canvas;
}

export async function classify(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
): Promise<Diagnosis> {
  const { model, meta } = await loadModel();
  const w = source instanceof HTMLVideoElement ? source.videoWidth : source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const canvas = toSquareCanvas(source, w, h, meta.imageSize);

  const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  const { plant } = plantColorRatio(pixels, canvas.width, canvas.height);
  if (plant < MIN_PLANT_RATIO) {
    return { kind: "not_eggplant", reason: "no_plant", plantRatio: plant };
  }

  const probs = tf.tidy(() => {
    const input = tf.browser
      .fromPixels(canvas)
      .toFloat()
      .div(127.5)
      .sub(1)
      .expandDims(0);
    return (model.predict(input) as tf.Tensor).squeeze();
  });
  const values = await probs.data();
  probs.dispose();

  const predictions = meta.labels
    .map((label, i) => ({ label, probability: values[i] }))
    .sort((a, b) => b.probability - a.probability);

  if (REJECT_LABELS.has(predictions[0].label.toLowerCase())) {
    return { kind: "not_eggplant", reason: "model", plantRatio: plant };
  }
  return {
    kind: "eggplant",
    predictions: predictions.filter((p) => !REJECT_LABELS.has(p.label.toLowerCase())),
  };
}
