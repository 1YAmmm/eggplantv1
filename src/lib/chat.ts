/** Server-side helpers for /api/chat: request validation and the system prompt. */
import { describePest } from "./advice";
import { PESTS } from "./pests";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ScanPrediction = { label: string; probability: number };
export type ChatRequest = { messages: ChatMessage[]; scan?: ScanPrediction[] };

export const MAX_MESSAGES = 10;
export const MAX_MESSAGE_CHARS = 500;
const MAX_SCAN_ENTRIES = 4;

/** Returns a clean request, or null when the body is not a valid chat request. */
export function parseChatRequest(body: unknown): ChatRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { messages, scan } = body as { messages?: unknown; scan?: unknown };

  if (!Array.isArray(messages) || messages.length === 0) return null;
  const clean: ChatMessage[] = [];
  for (const m of messages.slice(-MAX_MESSAGES)) {
    if (typeof m !== "object" || m === null) return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (text) clean.push({ role, content: text });
  }
  // The model must be answering a user message.
  if (clean.length === 0 || clean[clean.length - 1].role !== "user") return null;

  const request: ChatRequest = { messages: clean };
  if (Array.isArray(scan)) {
    // Only labels the app knows are kept, so the client cannot put free text into the system prompt.
    const known = scan
      .filter((p): p is ScanPrediction => typeof p?.label === "string" && typeof p?.probability === "number")
      .filter((p) => Object.hasOwn(PESTS, p.label) && Number.isFinite(p.probability))
      .slice(0, MAX_SCAN_ENTRIES)
      .map((p) => ({ label: p.label, probability: Math.min(1, Math.max(0, p.probability)) }));
    if (known.length > 0) request.scan = known;
  }
  return request;
}

function describeScan(scan: ScanPrediction[]): string {
  const rows = scan.map((p) => `- ${PESTS[p.label].name}: ${Math.round(p.probability * 100)}%`);
  return [
    "The user just scanned a photo with the app's image model. Its result:",
    ...rows,
    "The first line is the diagnosis shown to the user. The model can be wrong, most often mixing up aphids and",
    "flea beetle, so when it matters, suggest checking the plant for the signs listed below. The app only gives",
    "treatment advice for results of 30% or more: do not recommend products for a weaker result, only say it is",
    "less likely.",
  ].join("\n");
}

export function buildSystemPrompt(scan?: ScanPrediction[]): string {
  const knowledge = Object.values(PESTS).map(describePest).join("\n\n");
  return [
    "You are the assistant inside EggplantCare, a mobile app that helps Filipino eggplant (talong) farmers and",
    "backyard growers identify pests and treat them.",
    "",
    "Rules:",
    "- Always reply in the language of the user's LAST message: English message -> English reply, Tagalog -> Tagalog,",
    "  Taglish -> Taglish. Do not switch to Tagalog just because the app is for Filipino users. Use simple, friendly",
    "  words. Product names and the pest names in the app stay as written.",
    "- Keep answers short: a few sentences, or a short list when giving steps. Use plain text only, no markdown",
    "  headings, bold or tables. Start list items with '-'.",
    "- Only recommend pesticides that appear in the app's list below. If asked about any other product, say you",
    "  cannot vouch for it and suggest asking the local agri-vet store or the municipal agriculturist.",
    "- Only use doses, intervals and numbers that appear in the list. If a product has no number there, tell the",
    "  user to follow the product label. Never invent dosages, registration numbers or pre-harvest intervals.",
    "- For plant extracts the doses are only starting points, not official. Say so and suggest testing on a few",
    "  leaves first.",
    "- For chemical products, remind the user to read the label, wear protective gear and respect the",
    "  pre-harvest interval.",
    "- You may answer general eggplant growing questions (watering, fertilizer, spacing, harvest, diseases) from",
    "  general knowledge. Be honest when unsure, and suggest a municipal agriculturist for serious problems.",
    "- Politely decline anything that is not about eggplant or gardening.",
    "",
    scan ? describeScan(scan) : "The user has not scanned anything yet in this conversation.",
    "",
    "# App knowledge (the only source for pesticide advice)",
    knowledge,
  ].join("\n");
}
