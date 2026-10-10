import { judge, type AssistMode, type Opinion, type PredictionLike, type Vote } from "./assist";

/** "always" sends every scan to the AI; the default only sends doubtful ones. Set NEXT_PUBLIC_ASSIST_MODE=always. */
export const ASSIST_MODE: AssistMode = process.env.NEXT_PUBLIC_ASSIST_MODE === "always" ? "always" : "uncertain";

const MAX_SIDE = 768;
const JPEG_QUALITY = 0.8;

/** The photo shrunk to at most 768 px on its longest side, as a JPEG data URL (about 100 KB). */
function photoDataUrl(source: HTMLImageElement | HTMLCanvasElement): string {
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/**
 * Asks the server's AI for a second opinion on the photo and compares it with the on-device result. It never
 * throws: when the AI is unavailable, offline or out of quota, the answer is "unavailable" and the page keeps the
 * on-device result.
 */
export async function askSecondOpinion(source: HTMLImageElement | HTMLCanvasElement, local: PredictionLike[]): Promise<Opinion> {
  try {
    const res = await fetch("/api/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: photoDataUrl(source) }),
    });
    const data = (await res.json().catch(() => null)) as { vote?: Vote; trusted?: boolean } | null;
    if (!res.ok || !data?.vote) return { kind: "unavailable" };
    return judge(local, data.vote, data.trusted === true);
  } catch {
    return { kind: "unavailable" };
  }
}
