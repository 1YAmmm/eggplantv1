/*
 * The AI-written treatment plan: the prompt, and the checker that decides whether an AI's reply may be shown.
 * The app only ever shows a plan that passes `validateAdvice`; otherwise the next AI is tried, and in the end the
 * static advice from pests.ts stays on screen. Only type imports from ./pests, so this runs under `node --test`.
 */
import { extractJson } from "./assist";
import type { Pesticide, PestInfo } from "./pests";

export type AdvicePick = { name: string; why: string };
export type Advice = { intro: string; picks: AdvicePick[]; steps: string[]; watchFor: string; schedule: string };
export type AdviceCheck = { ok: true; advice: Advice } | { ok: false; reason: string };

/** The facts about one pest as plain text; also used by the chat's system prompt. */
export function describePest(pest: PestInfo): string {
  const lines = [`## ${pest.name}${pest.scientific ? ` (${pest.scientific})` : ""}`, pest.summary];
  if (pest.symptoms.length) lines.push(`Signs: ${pest.symptoms.join("; ")}.`);
  if (pest.pesticides.length) {
    lines.push("Recommended pesticides:");
    for (const p of pest.pesticides) {
      lines.push(`- ${p.name}${p.brand ? ` / ${p.brand}` : ""} [${p.type}]: ${p.note} Where: ${p.where}`);
    }
  }
  lines.push(`Treatment: ${pest.treatment.join(" ")}`);
  lines.push(`Prevention: ${pest.prevention.join(" ")}`);
  return lines.join("\n");
}

/** Everything the AI may draw on: the pest description plus the reasons behind each product. */
function facts(pest: PestInfo): string {
  const reasons = pest.pesticides.map((p) => `${p.name}: ${p.why.join(" ")}`);
  return [describePest(pest), ...(reasons.length ? ["Why each product is a good choice:", ...reasons] : [])].join("\n");
}

export function buildAdvicePrompt(pest: PestInfo): { system: string; user: string } {
  const system = [
    "You write the treatment plan that a Filipino eggplant (talong) grower reads in the EggplantCare app after a pest",
    "was found in their photo.",
    "",
    "Rules:",
    "- Use only the facts under \"Verified facts\". Never add products, brands, active ingredients, doses, intervals or",
    "  any number that is not written there. If you mention a number, copy it from the facts.",
    "- Choose 1 to 3 pesticides from the list. Copy each name exactly as written. Put organic and low-hazard options",
    "  first and chemicals last. Do not write doses: the app shows them on the product cards.",
    "- Give 4 to 7 short steps in the order the grower should do them, in simple English, each under 200 characters.",
    "- For chemicals, remind the grower to read the label, wear protective gear and respect the pre-harvest interval.",
    "  For plant extracts, say the dose is only a starting point and to test on a few leaves first.",
    "",
    "Reply with JSON only, no markdown, in exactly this shape:",
    '{"intro": "1-2 sentences on what was found and why it matters",',
    ' "pesticides": [{"name": "<exact name from the list>", "why_for_you": "one short sentence"}],',
    ' "steps": ["step 1", "step 2"],',
    ' "watch_for": "one sentence on what to check in the next days",',
    ' "spray_schedule": "one sentence on how often to spray, using only the facts"}',
  ].join("\n");
  const user = ["# Verified facts", facts(pest), "", `Write the plan for: ${pest.name}.`].join("\n");
  return { system, user };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Finds the pesticide an AI meant: by exact name, or when one name contains the other, or by brand. */
function matchPesticide(name: string, pest: PestInfo): Pesticide | null {
  const wanted = norm(name);
  if (wanted.length < 4) return null;
  const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a)));
  return (
    pest.pesticides.find((p) => norm(p.name) === wanted) ??
    pest.pesticides.find((p) => same(norm(p.name), wanted) || (p.brand ? same(norm(p.brand), wanted) : false)) ??
    null
  );
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const UNITS: Record<string, string> = {
  "%": "%", ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  g: "g", gram: "g", grams: "g", kg: "kg", kilogram: "kg", kilograms: "kg", cc: "cc", ppm: "ppm",
  l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  day: "day", days: "day", hour: "hour", hours: "hour", hr: "hour", hrs: "hour", week: "week", weeks: "week",
  time: "time", times: "time", minute: "minute", minutes: "minute",
};
const NUMBER = "\\d+(?:[.,]\\d+)?";
/** A number (or number word), optionally a range like "3–5" or "3 to 5", then a unit. */
const QUANTITY = new RegExp(
  `(${NUMBER}|\\b(?:${Object.keys(NUMBER_WORDS).join("|")})\\b)(?:\\s*(?:-|–|—|to)\\s*(${NUMBER}))?\\s*(%|[a-z]+)`,
  "gi",
);

/** Every "number + unit" in the text (doses, intervals, durations), normalised, for example "10ml" or "7day". */
function quantities(text: string): Set<string> {
  const found = new Set<string>();
  for (const [, from, to, rawUnit] of text.matchAll(QUANTITY)) {
    const unit = UNITS[rawUnit.toLowerCase()];
    if (!unit) continue;
    // Both ends of a range count: "3–5 days" allows "3 days" and "5 days".
    for (const amount of [from, to]) {
      if (!amount) continue;
      const word = NUMBER_WORDS[amount.toLowerCase()];
      found.add(`${word ?? Number(amount.replace(",", "."))}${unit}`);
    }
  }
  return found;
}

/** Common insecticides and home remedies that are not in the app's verified list. */
const OFF_LIST = new RegExp(
  "\\b(neem|azadirachtin|imidacloprid|thiamethoxam|acetamiprid|abamectin|emamectin|lambda[- ]?cyhalothrin|deltamethrin|" +
    "permethrin|bifenthrin|malathion|chlorpyrifos|dimethoate|profenofos|carbaryl|cartap|methomyl|lannate|fipronil|" +
    "diazinon|carbofuran|endosulfan|spinetoram|flubendiamide|pymetrozine|spirotetramat|chlorfenapyr|indoxacarb|" +
    "bacillus|beauveria|metarhizium|kaolin|pyrethrin|garlic|chili|chilli|vinegar|diatomaceous|baking soda|detergent)\\b",
  "gi",
);

const LIMITS = { intro: 500, why: 300, step: 300, note: 300 };

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length <= max ? value.trim() : null;
}

/**
 * Checks an AI reply against the pest's verified facts. It must be JSON of the right shape, pick only pesticides from
 * the pest's list, mention no other product, and contain no dose, interval or duration that is not in the facts.
 */
export function validateAdvice(reply: string, pest: PestInfo): AdviceCheck {
  const json = extractJson(reply);
  if (!json) return { ok: false, reason: "not JSON" };

  const intro = text(json.intro, LIMITS.intro);
  if (!intro) return { ok: false, reason: "missing or too long intro" };

  if (!Array.isArray(json.steps) || json.steps.length < 3 || json.steps.length > 8) {
    return { ok: false, reason: "steps must be 3 to 8 items" };
  }
  const steps = json.steps.map((s) => text(s, LIMITS.step));
  if (steps.some((s) => !s)) return { ok: false, reason: "a step is empty or too long" };

  const picks: AdvicePick[] = [];
  for (const item of Array.isArray(json.pesticides) ? json.pesticides : []) {
    const entry = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const match = typeof entry.name === "string" ? matchPesticide(entry.name, pest) : null;
    if (!match || picks.some((p) => p.name === match.name)) continue; // unknown or repeated names are dropped
    picks.push({ name: match.name, why: text(entry.why_for_you, LIMITS.why) ?? "" });
  }
  if (pest.pesticides.length > 0 && picks.length === 0) return { ok: false, reason: "no pesticide from the verified list" };

  const advice: Advice = {
    intro,
    picks: picks.slice(0, 3),
    steps: steps as string[],
    watchFor: text(json.watch_for, LIMITS.note) ?? "",
    schedule: text(json.spray_schedule, LIMITS.note) ?? "",
  };

  const written = [advice.intro, ...advice.picks.map((p) => p.why), ...advice.steps, advice.watchFor, advice.schedule].join("\n");
  const allowed = facts(pest);
  const allowedLower = allowed.toLowerCase();

  const otherProduct = [...written.matchAll(OFF_LIST)].find((m) => !allowedLower.includes(m[0].toLowerCase()));
  if (otherProduct) return { ok: false, reason: `mentions a product that is not in the list: ${otherProduct[0]}` };

  const known = quantities(allowed);
  const invented = [...quantities(written)].find((q) => !known.has(q));
  if (invented) return { ok: false, reason: `a number that is not in the verified facts: ${invented}` };

  return { ok: true, advice };
}
