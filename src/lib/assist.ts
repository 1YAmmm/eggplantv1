/*
 * Second-opinion logic shared by the browser, /api/recognize and the tests. It has no imports on purpose, so it also
 * runs under `node --test`.
 *
 * Flow: the on-device model answers first. When it is doubtful, the photo goes to an AI (the server tries Llama 4
 * Scout first and falls back to other AIs if it is down). The AI never sees the on-device answer, and `judge` turns
 * its answer into an `Opinion` for the screen. A vote between several AIs was tried and scored worse than Scout
 * alone (9/20 against 20/20 on labelled test photos), so there is no voting.
 */

/** Label for "no eggplant leaf or fruit in this photo". */
export const NOT_EGGPLANT = "not_eggplant";

/** Below this top probability the on-device result counts as low confidence. */
export const LOW_CONFIDENCE = 0.6;

/** An AI answer below this confidence is ignored and the on-device result stays. */
export const MIN_AI_CONFIDENCE = 0.5;

/** The on-device model mixes these two up even when it is very sure, so they always get a second look. */
const CONFUSABLE = new Set(["aphids", "flea_beetle"]);
const HEALTHY = new Set(["healthy", "healthy_leaf"]);

export type PredictionLike = { label: string; probability: number };
/** One AI's answer. `provider` is the display name of the AI that gave it, for example "Llama 4 Scout". */
export type Vote = { provider: string; label: string; confidence: number; reason: string };

export type Opinion =
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "unsure"; by: string }
  | { kind: "confirmed"; by: string }
  | { kind: "corrected"; by: string; label: string; confidence: number }
  | { kind: "not_eggplant"; by: string; reason: string };

/** "uncertain": ask only when the on-device result is doubtful. "always": ask on every scan. */
export type AssistMode = "uncertain" | "always";

export function needsSecondOpinion(predictions: PredictionLike[], mode: AssistMode = "uncertain"): boolean {
  if (predictions.length === 0) return false;
  if (mode === "always") return true;
  const top = predictions[0];
  return top.probability < LOW_CONFIDENCE || CONFUSABLE.has(top.label);
}

/** The two healthy labels count as the same answer. */
const group = (label: string) => (HEALTHY.has(label) ? "healthy" : label);

/**
 * Compares the AI's answer with the on-device result. No answer, or a doubtful one, leaves the result unchanged.
 * `trusted` is false for the backup AIs: they can confirm the on-device result but not overrule it, because their
 * accuracy was too low in testing (the server decides, see trustedVisionModels).
 */
export function judge(local: PredictionLike[], vote: Vote | null, trusted = true): Opinion {
  if (!vote || local.length === 0) return { kind: "unavailable" };
  if (vote.confidence < MIN_AI_CONFIDENCE) return { kind: "unsure", by: vote.provider };
  if (vote.label !== NOT_EGGPLANT && group(local[0].label) === group(vote.label)) return { kind: "confirmed", by: vote.provider };
  if (!trusted) return { kind: "unsure", by: vote.provider };
  if (vote.label === NOT_EGGPLANT) return { kind: "not_eggplant", by: vote.provider, reason: vote.reason };
  return { kind: "corrected", by: vote.provider, label: vote.label, confidence: vote.confidence };
}

/**
 * Puts the AI's corrected label first; the on-device answer becomes the first alternative. The promoted label takes
 * the AI's stated confidence (never less than the on-device odds), so the rest of the app, such as the 30% rule for
 * showing advice, treats it as a real result. The screen shows "AI-checked" instead of a percentage for it.
 */
export function applyOpinion<T extends PredictionLike>(predictions: T[], opinion: Opinion | null): T[] {
  if (opinion?.kind !== "corrected") return predictions;
  const chosen = predictions.find((p) => p.label === opinion.label);
  if (!chosen) return predictions;
  const promoted = { ...chosen, probability: Math.max(chosen.probability, opinion.confidence) };
  return [promoted, ...predictions.filter((p) => p !== chosen)];
}

/** Pulls the first JSON object out of a model reply, which may be wrapped in a code fence or in a sentence. */
export function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Reads one AI's reply into a vote, or null when it is not valid JSON or names a label the app does not know. */
export function parseVote(provider: string, reply: string, known: readonly string[]): Vote | null {
  const json = extractJson(reply);
  if (!json || typeof json.label !== "string") return null;
  const label = json.label.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (label !== NOT_EGGPLANT && !known.includes(label)) return null;
  const confidence = Number(json.confidence);
  return {
    provider,
    label,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    reason: typeof json.reason === "string" ? json.reason.trim().slice(0, 140) : "",
  };
}
