/*
 * Server-side AI provider layer shared by /api/chat, /api/recognize and /api/advice. Every provider here speaks the
 * OpenAI chat-completions format, so one transport works for all of them.
 *
 *   chat    Gemini, then Groq, then OpenRouter (keys: GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY)
 *   vision  Cloudflare Workers AI (Llama 4 Scout first), then Cohere, for the photo second opinion
 *   advice  Mistral, Cloudflare Workers AI and Cohere, tried in order, for the recommendation and treatment plan
 *
 * Each provider can list several models separated by commas (e.g. MISTRAL_VISION_MODEL). They are tried in order,
 * so when one has used up its free quota or its name is retired, the next model answers, and when a provider is
 * out of models the next provider takes over. Only providers with a key set are used, so one key is enough to start.
 */
export type Purpose = "chat" | "vision" | "advice";
export type Provider = { name: string; baseUrl: string; apiKey: string; models: string[]; extra: Record<string, unknown> };

const modelList = (value: string | undefined, fallback: string) =>
  (value || fallback).split(",").map((m) => m.trim()).filter(Boolean);

function chatProviders(): Provider[] {
  const providers: Provider[] = [];

  // CHAT_API_KEY is the old name of the Gemini key.
  const geminiKey = process.env.GEMINI_API_KEY || process.env.CHAT_API_KEY;
  if (geminiKey) {
    // Gemini "thinking" tokens count against max_tokens, can cut answers short and add seconds of delay. All the
    // facts are in the prompt, so thinking is switched off. Set GEMINI_REASONING_EFFORT to "low" if a model
    // rejects "none", or to an empty value to omit the field.
    const effort = process.env.GEMINI_REASONING_EFFORT ?? "none";
    providers.push({
      name: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: geminiKey,
      models: modelList(process.env.GEMINI_MODEL, "gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3.8-flash"),
      extra: effort ? { reasoning_effort: effort } : {},
    });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      models: modelList(process.env.GROQ_MODEL, "llama-3.3-70b-versatile"),
      extra: {},
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      // "openrouter/free" lets OpenRouter pick any free model that is up at the moment.
      models: modelList(process.env.OPENROUTER_MODEL, "openrouter/free"),
      extra: {},
    });
  }
  return providers;
}

/**
 * The free-tier providers for the photo second opinion and the advice writer, in the order they are tried.
 * Default models were picked by benchmark, not by guess:
 *  - Photos (20 labelled pest photos): Llama 4 Scout got 20/20, Mistral Small 3.1 13/20, Cohere 12/20 (0/5 thrips),
 *    Ministral 8B 2/20. A vote between them scored worse than Scout alone, so Scout decides and Mistral Small 3.1
 *    only steps in when Scout fails. Cohere and Mistral are used for photos only when COHERE_VISION_MODEL or
 *    MISTRAL_VISION_MODEL is set.
 *  - Advice (4 pests, scored by validateAdvice): Scout, Llama 3.3 70B, Mistral Small 3.1 and gpt-oss-120b passed all
 *    four. Cohere passed 3/4 and Ministral 8B 2/4, so they are last-resort backups. The checker rejects any backup
 *    reply that invents a dose or product.
 * Cohere's trial key allows only 1,000 calls a month, and `mistral-small-latest` has a rate limit of 0 on Mistral's
 * free plan. All Cloudflare models share one free allowance (10,000 neurons a day).
 */
function assistProviders(purpose: "vision" | "advice"): Provider[] {
  const suffix = purpose === "vision" ? "VISION_MODEL" : "ADVICE_MODEL";
  const mistral: Provider | null = process.env.MISTRAL_API_KEY
    ? {
        name: "mistral",
        baseUrl: "https://api.mistral.ai/v1",
        apiKey: process.env.MISTRAL_API_KEY,
        models: modelList(process.env[`MISTRAL_${suffix}`], purpose === "vision" ? "" : "ministral-8b-latest"),
        extra: {},
      }
    : null;
  const cloudflare: Provider | null =
    process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID
      ? {
          name: "cloudflare",
          baseUrl: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
          apiKey: process.env.CLOUDFLARE_API_TOKEN,
          models: modelList(
            process.env[`CLOUDFLARE_${suffix}`],
            "@cf/meta/llama-4-scout-17b-16e-instruct,@cf/mistralai/mistral-small-3.1-24b-instruct",
          ),
          extra: {},
        }
      : null;
  const cohere: Provider | null = process.env.COHERE_API_KEY
    ? {
        name: "cohere",
        baseUrl: "https://api.cohere.ai/compatibility/v1",
        apiKey: process.env.COHERE_API_KEY,
        models: modelList(process.env[`COHERE_${suffix}`], purpose === "vision" ? "" : "command-a-03-2025"),
        extra: {},
      }
    : null;

  return [cloudflare, cohere, mistral].filter((p): p is Provider => p !== null && p.models.length > 0);
}

/**
 * Models whose photo answers may overrule the on-device result. Any other model can only confirm it or say it is
 * unsure, because their accuracy in the benchmark was too low to trust a disagreement.
 */
export function trustedVisionModels(): string[] {
  return modelList(process.env.VISION_TRUSTED_MODELS, "@cf/meta/llama-4-scout-17b-16e-instruct");
}

export function getProviders(purpose: Purpose): Provider[] {
  return purpose === "chat" ? chatProviders() : assistProviders(purpose);
}

// Providers usually answer in 1-9 s but sometimes stall or return 503 "high demand", so one retry is allowed.
const ATTEMPT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;

/** POSTs to the provider, retrying once on a timeout, network error or 503 (temporary overload). */
async function postWithRetry(url: string, headers: Record<string, string>, body: string, budgetMs: number) {
  const deadline = Date.now() + budgetMs;
  for (let attempt = 1; ; attempt++) {
    const timeout = Math.min(ATTEMPT_TIMEOUT_MS, Math.max(deadline - Date.now(), 1000));
    try {
      const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeout) });
      if (res.status !== 503 || attempt >= MAX_ATTEMPTS || Date.now() > deadline) return res;
      await res.body?.cancel();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || Date.now() > deadline) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export type Failure = "busy" | "timeout" | "empty" | "unavailable";
export type Outcome<T> = { value: T; provider: string; model: string } | { failure: Failure };

type Options = {
  /** Upper bound for the whole call across all models, so the user never waits much longer than this. */
  budgetMs?: number;
  /** Prefix for server log lines. */
  tag: string;
};

/** Tries one provider's models in turn and returns the first reply that `parse` accepts (it returns null to reject). */
async function askProvider<T>(
  { name, baseUrl, apiKey, models, extra }: Provider,
  payload: Record<string, unknown>,
  parse: (reply: string) => T | null,
  deadline: number,
  tag: string,
): Promise<Outcome<T>> {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  let failure: Failure = "unavailable";

  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) return { failure };
    const label = `${name}/${model}`;
    try {
      const body = JSON.stringify({ ...payload, ...extra, model });
      const res = await postWithRetry(`${baseUrl}/chat/completions`, headers, body, remaining);
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
        const reply = data?.choices?.[0]?.message?.content;
        if (typeof reply === "string" && reply.trim()) {
          const value = parse(reply.trim());
          if (value !== null) return { value, provider: name, model };
          console.error(`[${tag}] ${label} gave an answer that was not usable`);
        } else {
          console.error(`[${tag}] ${label} returned an empty answer`);
        }
        failure = "empty";
        continue;
      }
      console.error(`[${tag}] ${label} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      failure = res.status === 429 || res.status === 503 ? "busy" : "unavailable";
      // A bad key fails the same way for every model of this provider, so give up on it.
      if (res.status === 401 || res.status === 403) break;
    } catch (err) {
      console.error(`[${tag}] request to ${label} failed:`, err instanceof Error ? err.message : err);
      failure = "timeout";
    }
  }
  return { failure };
}

/** Asks the providers one after another and returns the first usable answer. */
export async function ask<T>(
  providers: Provider[],
  payload: Record<string, unknown>,
  parse: (reply: string) => T | null,
  { budgetMs = 45_000, tag }: Options,
): Promise<Outcome<T>> {
  const deadline = Date.now() + budgetMs;
  let failure: Failure = "unavailable";
  for (const provider of providers) {
    const outcome = await askProvider(provider, payload, parse, deadline, tag);
    if ("value" in outcome) return outcome;
    failure = outcome.failure;
  }
  return { failure };
}

/** A user message that holds text and one image (the OpenAI-style `image_url` part, a base64 data URL). */
export function imageMessage(text: string, dataUrl: string) {
  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  };
}
