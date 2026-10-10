import type { NextRequest } from "next/server";
import { buildAdvicePrompt, validateAdvice, type Advice } from "@/lib/advice";
import { ask, getProviders } from "@/lib/ai/providers";
import { PESTS } from "@/lib/pests";
import { createCooldown, createRateLimiter } from "@/lib/rateLimit";
import { modelName } from "@/lib/recognize";

/*
 * AI-written treatment plan for a diagnosed pest. The AI may only pick products from the pest's verified list in
 * src/lib/pests.ts, and validateAdvice rejects any reply that adds a product, dose or interval of its own. Any
 * failure just means "no suggested plan": the page keeps the static advice. The same pest gets the same plan for a day,
 * so repeated scans cost no AI quota.
 */
export const maxDuration = 45;

/* Best-effort limit per client: 15 plans per 10 minutes. */
const rateLimited = createRateLimiter(10 * 60_000, 15);
/* When every AI says "too busy / out of quota", stop trying for a few minutes. */
const cooldown = createCooldown(5 * 60_000);

const CACHE_MS = 24 * 60 * 60_000;
const cache = new Map<string, { advice: Advice; by: string; expires: number }>();

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request.", 400);
  }
  const label = typeof body === "object" && body !== null ? (body as { label?: unknown }).label : undefined;
  const pest = typeof label === "string" && Object.hasOwn(PESTS, label) ? PESTS[label] : null;
  // Healthy results have no pesticides to recommend, so there is nothing for the AI to write.
  if (!pest || pest.healthy || pest.pesticides.length === 0) return fail("Invalid request.", 400);

  const hit = cache.get(pest.label);
  if (hit && hit.expires > Date.now()) return Response.json({ advice: hit.advice, by: hit.by });

  const providers = getProviders("advice");
  if (providers.length === 0) return fail("The suggested plan is not set up.", 503);
  if (cooldown.active()) return fail("The suggested plan is busy right now.", 503);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return fail("Too many requests. Please wait a few minutes.", 429);

  const { system, user } = buildAdvicePrompt(pest);
  const outcome = await ask(
    providers,
    {
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    (reply) => {
      const check = validateAdvice(reply, pest);
      if (!check.ok) console.error(`[advice] reply rejected: ${check.reason}`);
      return check.ok ? check.advice : null;
    },
    { budgetMs: 40_000, tag: "advice" },
  );
  if ("value" in outcome) {
    const by = modelName(outcome.model);
    cache.set(pest.label, { advice: outcome.value, by, expires: Date.now() + CACHE_MS });
    return Response.json({ advice: outcome.value, by });
  }
  if (outcome.failure === "busy") cooldown.trip();
  return fail("The suggested plan is unavailable right now.", 503);
}
