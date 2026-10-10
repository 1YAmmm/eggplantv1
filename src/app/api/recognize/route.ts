import type { NextRequest } from "next/server";
import { ask, getProviders, imageMessage, trustedVisionModels } from "@/lib/ai/providers";
import { parseVote } from "@/lib/assist";
import { PESTS } from "@/lib/pests";
import { createCooldown, createRateLimiter } from "@/lib/rateLimit";
import { modelName, parseRecognizeRequest, VISION_PROMPT } from "@/lib/recognize";

/*
 * AI second opinion on a photo. The browser calls this only when the on-device model is unsure. The AIs are set up
 * in src/lib/ai/providers.ts: Llama 4 Scout decides, and backups answer only when it is down. Photos are sent to the
 * AI service and are not stored or logged here. Any failure just means "no second opinion": the page keeps the
 * on-device result.
 */
export const maxDuration = 30;

/* Best-effort limit per client: 12 photos per 10 minutes. */
const rateLimited = createRateLimiter(10 * 60_000, 12);
/* When every AI says "too busy / out of quota", stop trying for a few minutes. */
const cooldown = createCooldown(5 * 60_000);

const KNOWN_LABELS = Object.keys(PESTS);

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  const providers = getProviders("vision");
  if (providers.length === 0) return fail("The AI second opinion is not set up.", 503);
  if (cooldown.active()) return fail("The AI second opinion is busy right now.", 503);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return fail("Too many photos. Please wait a few minutes.", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request.", 400);
  }
  const image = parseRecognizeRequest(body);
  if (!image) return fail("Invalid request.", 400);

  const outcome = await ask(
    providers,
    { temperature: 0, max_tokens: 200, messages: [imageMessage(VISION_PROMPT, image)] },
    (reply) => parseVote("", reply, KNOWN_LABELS),
    { budgetMs: 25_000, tag: "recognize" },
  );
  if ("value" in outcome) {
    const vote = { ...outcome.value, provider: modelName(outcome.model) };
    return Response.json({ vote, trusted: trustedVisionModels().includes(outcome.model) });
  }
  if (outcome.failure === "busy") cooldown.trip();
  return fail("The AI second opinion is unavailable right now.", 503);
}
