import type { NextRequest } from "next/server";
import { ask, getProviders, type Failure } from "@/lib/ai/providers";
import { buildSystemPrompt, parseChatRequest } from "@/lib/chat";
import { createRateLimiter } from "@/lib/rateLimit";

/*
 * Chat proxy. The API keys stay on the server. Providers (Gemini, then Groq, then OpenRouter) and their models are
 * set up in src/lib/ai/providers.ts; only providers with a key set are used (see .env.example).
 */

/* Best-effort limit per client to protect the free quota: 20 questions per 10 minutes. */
const rateLimited = createRateLimiter(10 * 60_000, 20);

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

const FAILURE_MESSAGES: Record<Failure, [string, number]> = {
  busy: ["The assistant is busy right now. Please try again in a minute.", 429],
  timeout: ["The assistant did not answer in time. Please try again.", 502],
  empty: ["The assistant gave an empty answer. Please try again.", 502],
  unavailable: ["The assistant is unavailable right now. Please try again later.", 502],
};

export async function POST(request: NextRequest) {
  const providers = getProviders("chat");
  if (providers.length === 0) return fail("The chat is not set up yet.", 503);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return fail("Too many questions. Please wait a few minutes and try again.", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request.", 400);
  }
  const chat = parseChatRequest(body);
  if (!chat) return fail("Invalid request.", 400);

  const outcome = await ask(
    providers,
    {
      temperature: 0.4,
      max_tokens: 1000,
      messages: [{ role: "system", content: buildSystemPrompt(chat.scan) }, ...chat.messages],
    },
    (reply) => reply,
    { tag: "chat" },
  );
  if ("value" in outcome) return Response.json({ reply: outcome.value });
  const [message, status] = FAILURE_MESSAGES[outcome.failure];
  return fail(message, status);
}
