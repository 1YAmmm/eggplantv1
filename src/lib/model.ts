import * as tf from "@tensorflow/tfjs";
import { MIN_PLANT_RATIO, plantColorRatio } from "./plantCheck";

const MODEL_URL = "/model/model.json";
const METADATA_URL = "/model/metadata.json";
const GATE_URL = "/model/gate/model.json";
const GATE_CONFIG_URL = "/model/gate/config.json";

/**
 * Labels that mean "not an eggplant". If you retrain in Teachable Machine with a
 * class using one of these names, the app treats it as "No eggplant detected".
 */
const REJECT_LABELS = new Set(["not_eggplant", "no_eggplant", "background", "unknown", "other", "none"]);

export type Prediction = { label: string; probability: number };

export type Diagnosis =
  | { kind: "eggplant"; predictions: Prediction[]; eggplantScore: number }
  | { kind: "not_eggplant"; reason: "no_plant" | "gate" | "model"; eggplantScore: number };

type Metadata = { labels: string[]; imageSize: number };
type GateConfig = { threshold: number };

type Loaded = {
  /** MobileNet feature extractor: image -> 1280 features. */
  backbone: tf.LayersModel;
  /** Teachable Machine classifier head: 1280 features -> pest classes. */
  head: tf.LayersModel;
  /** "Is this an eggplant leaf/fruit?" head: 1280 features -> score 0..1. */
  gate: tf.LayersModel | null;
  gateThreshold: number;
  meta: Metadata;
};

let cached: Promise<Loaded> | null = null;

export function loadModel() {
  if (!cached) {
    cached = (async () => {
      await tf.ready();
      const [model, meta, gate, gateConfig] = await Promise.all([
        tf.loadLayersModel(MODEL_URL),
        fetch(METADATA_URL).then((r) => r.json() as Promise<Metadata>),
        tf.loadLayersModel(GATE_URL).catch(() => null),
        fetch(GATE_CONFIG_URL)
          .then((r) => (r.ok ? (r.json() as Promise<GateConfig>) : null))
          .catch(() => null),
      ]);
      // Teachable Machine exports Sequential[backbone, head]; split it so the
      // gate can reuse the backbone features instead of running a second network.
      const [backbone, head] = model.layers as unknown as [tf.LayersModel, tf.LayersModel];
      // Warm up so the first real prediction is fast.
      tf.tidy(() => {
        const f = backbone.predict(tf.zeros([1, meta.imageSize, meta.imageSize, 3])) as tf.Tensor;
        head.predict(f);
        gate?.predict(f);
      });
      return { backbone, head, gate, gateThreshold: gateConfig?.threshold ?? 0.5, meta };
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
  const { backbone, head, gate, gateThreshold, meta } = await loadModel();
  const w = source instanceof HTMLVideoElement ? source.videoWidth : source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const canvas = toSquareCanvas(source, w, h, meta.imageSize);

  // 1. Cheap colour check: no leaf-green / eggplant-purple at all -> reject.
  const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  const { plant } = plantColorRatio(pixels, canvas.width, canvas.height);
  if (plant < MIN_PLANT_RATIO) {
    return { kind: "not_eggplant", reason: "no_plant", eggplantScore: 0 };
  }

  // 2. Shared features, then the eggplant gate and the pest classifier.
  const [gateOut, probs] = tf.tidy(() => {
    const input = tf.browser.fromPixels(canvas).toFloat().div(127.5).sub(1).expandDims(0);
    const features = backbone.predict(input) as tf.Tensor;
    return [
      gate ? (gate.predict(features) as tf.Tensor).squeeze() : tf.scalar(1),
      (head.predict(features) as tf.Tensor).squeeze(),
    ];
  });
  const [eggplantScore] = await gateOut.data();
  const values = await probs.data();
  tf.dispose([gateOut, probs]);

  if (eggplantScore < gateThreshold) {
    return { kind: "not_eggplant", reason: "gate", eggplantScore };
  }

  const predictions = meta.labels
    .map((label, i) => ({ label, probability: values[i] }))
    .sort((a, b) => b.probability - a.probability);

  if (REJECT_LABELS.has(predictions[0].label.toLowerCase())) {
    return { kind: "not_eggplant", reason: "model", eggplantScore };
  }
  return {
    kind: "eggplant",
    eggplantScore,
    predictions: predictions.filter((p) => !REJECT_LABELS.has(p.label.toLowerCase())),
  };
}
