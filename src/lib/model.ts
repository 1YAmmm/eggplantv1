import { getGlobalLiteRtPromise, loadAndCompile, loadLiteRt, Tensor, type CompiledModel } from "@litertjs/core";
import { checkLighting, type Lighting } from "./lighting";
import { MIN_PLANT_RATIO, plantColorRatio } from "./plantCheck";

/** MobileNetV3 exported by ml/scripts/export_to_tflite.py: [1, 224, 224, 3] float32 in, 6 logits out. */
const MODEL_URL = "/model/eggplant_model_float16.tflite";
/** Copy of ml/models/tflite/class_names.json; output index i is labels[i]. */
const LABELS_URL = "/model/class_names.json";
/** LiteRT.js WASM runtime, copied from node_modules by scripts/copy-litert-wasm.mjs. */
const WASM_DIR = "/litert/";

const IMAGE_SIZE = 224;
/** ImageNet normalisation, same as val_transforms in train_v2.py. */
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * Labels that mean "not an eggplant". If you retrain with a class using one of
 * these names, the app treats it as "No eggplant detected".
 */
const REJECT_LABELS = new Set(["not_eggplant", "no_eggplant", "background", "unknown", "other", "none"]);

export type Prediction = { label: string; probability: number };

export type Diagnosis =
  | { kind: "eggplant"; predictions: Prediction[]; lighting: Lighting }
  | { kind: "not_eggplant"; reason: "no_plant" | "model"; lighting: Lighting };

type Loaded = { model: CompiledModel; labels: string[] };

let cached: Promise<Loaded> | null = null;

/**
 * LiteRT's runtime writes its startup chatter ("INFO: Created XNNPACK delegate…") to console.error,
 * which `next dev` then prints as browser errors with stack traces. Drop the noise (INFO lines and the
 * NPU warning, which is always expected in a browser) and route the rest by severity.
 * The WASM loader passes `self.Module` to the runtime, so this must be set before loadLiteRt().
 */
function quietLiteRtLogs() {
  const isNoise = (line: string) => line.startsWith("INFO:") || line.includes("npu_registry");
  (globalThis as { Module?: unknown }).Module = {
    print: (line: string) => {
      if (!isNoise(line)) console.log(line);
    },
    printErr: (line: string) => {
      if (isNoise(line)) return;
      if (line.startsWith("WARNING:")) console.warn(line);
      else console.error(line);
    },
  };
}

export function loadModel() {
  if (!cached) {
    cached = (async () => {
      // loadLiteRt() may only be called once per page, even across hot reloads of this module.
      if (!getGlobalLiteRtPromise()) quietLiteRtLogs();
      await (getGlobalLiteRtPromise() ?? loadLiteRt(WASM_DIR));
      const [model, labels] = await Promise.all([
        loadAndCompile(MODEL_URL, { accelerator: "wasm" }),
        fetch(LABELS_URL).then((r) => r.json() as Promise<string[]>),
      ]);
      const outputs = model.getOutputDetails()[0].shape.at(-1);
      if (outputs !== labels.length) {
        throw new Error(`Model has ${outputs} outputs but ${LABELS_URL} lists ${labels.length} labels.`);
      }
      // Warm up so the first real prediction is fast.
      await run(model, new Float32Array(IMAGE_SIZE * IMAGE_SIZE * 3));
      return { model, labels };
    })().catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

/** Runs the model on an NHWC input and returns softmax probabilities. */
async function run(model: CompiledModel, pixels: Float32Array) {
  const input = new Tensor(pixels, [1, IMAGE_SIZE, IMAGE_SIZE, 3]);
  let outputs: Tensor[] | undefined;
  try {
    outputs = await model.run(input);
    return softmax(outputs[0].toTypedArray() as Float32Array);
  } finally {
    input.delete();
    outputs?.forEach((t) => t.delete());
  }
}

function softmax(logits: Float32Array) {
  const max = Math.max(...logits);
  const exps = Array.from(logits, (v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Stretches the whole image to a square, matching the training resize (no crop). */
function toSquareCanvas(source: CanvasImageSource, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // Smooth downscaling of large phone photos, closer to PIL's antialiased resize used in training.
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size, size);
  return canvas;
}

/** `skipPlantCheck` runs the classifier even when the colour check found no plant (the "ask AI to double-check" button). */
export async function classify(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  { skipPlantCheck = false }: { skipPlantCheck?: boolean } = {},
): Promise<Diagnosis> {
  const { model, labels } = await loadModel();
  const canvas = toSquareCanvas(source, IMAGE_SIZE);

  // 1. Cheap colour check: no leaf-green / eggplant-purple at all -> reject.
  const pixels = canvas.getContext("2d")!.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE).data;
  const lighting = checkLighting(pixels);
  const { plant } = plantColorRatio(pixels, IMAGE_SIZE, IMAGE_SIZE);
  if (!skipPlantCheck && plant < MIN_PLANT_RATIO) {
    return { kind: "not_eggplant", reason: "no_plant", lighting };
  }

  // 2. Pest classifier. RGBA 0-255 -> normalised RGB, NHWC.
  const input = new Float32Array(IMAGE_SIZE * IMAGE_SIZE * 3);
  for (let p = 0, i = 0; p < pixels.length; p += 4) {
    for (let c = 0; c < 3; c++, i++) input[i] = (pixels[p + c] / 255 - MEAN[c]) / STD[c];
  }
  const probs = await run(model, input);

  const predictions = labels
    .map((label, i) => ({ label, probability: probs[i] }))
    .sort((a, b) => b.probability - a.probability);

  if (REJECT_LABELS.has(predictions[0].label.toLowerCase())) {
    return { kind: "not_eggplant", reason: "model", lighting };
  }
  return {
    kind: "eggplant",
    predictions: predictions.filter((p) => !REJECT_LABELS.has(p.label.toLowerCase())),
    lighting,
  };
}
