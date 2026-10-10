/** Request check and prompt for /api/recognize (the AI second opinion on a photo). No imports, so tests can load it. */

/** The browser sends a downscaled JPEG of about 100 KB; anything much bigger is not from the app. */
export const MAX_IMAGE_CHARS = 2_000_000;
const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Returns the photo as a base64 data URL, or null when the body is not a valid request. */
export function parseRecognizeRequest(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const { image } = body as { image?: unknown };
  if (typeof image !== "string" || image.length > MAX_IMAGE_CHARS || !DATA_URL.test(image)) return null;
  return image;
}

/** The labels match public/model/class_names.json plus "not_eggplant". The AI never sees the on-device answer. */
export const VISION_PROMPT = `You are an expert in eggplant (Solanum melongena) pests. Look at the photo and pick the single best label:
- aphids: clusters of tiny soft pear-shaped insects (green, black or white) on leaf undersides or stems; curled, yellowing leaves; sticky honeydew
- flea_beetle: tiny dark shiny jumping beetles, or many small round "shot holes" in the leaves
- fruit_shoot_borer: a caterpillar or larva, entry holes and frass in the fruit, or wilted/dead shoot tips
- thrips: tiny slender insects with silvery or bronze streaks and speckles on the leaf, curled stunted leaves
- healthy: a healthy whole eggplant plant or fruit with no damage
- healthy_leaf: a close-up of an undamaged leaf
- not_eggplant: no eggplant plant, leaf or fruit in the photo
Reply with JSON only: {"label": "<one label above>", "confidence": <0 to 1>, "reason": "<max 15 words>"}`;

/** Friendly names for the models shown to the user ("Checked by Llama 4 Scout"). */
const MODEL_NAMES: Record<string, string> = {
  "@cf/meta/llama-4-scout-17b-16e-instruct": "Llama 4 Scout",
  "@cf/mistralai/mistral-small-3.1-24b-instruct": "Mistral Small 3.1",
  "command-a-vision-07-2025": "Cohere Command A Vision",
  "command-a-03-2025": "Cohere Command A",
  "ministral-8b-latest": "Ministral 8B",
};

export function modelName(model: string): string {
  return MODEL_NAMES[model] ?? model.split("/").pop() ?? model;
}
