import { cameraKey, matchCode, parseCodes } from "./camRelay";
import { createRateLimiter } from "./rateLimit";

/* What /api/cam/* routes share: who may call, how often, and how answers are shaped. */

/** Every request counts: the camera and the phone each ask about once a second while a scan is open. */
const rateLimited = createRateLimiter(60_000, 600);
/** Wrong codes are counted apart and run out quickly, so guessing a code is not worth trying. */
const tooManyWrongCodes = createRateLimiter(10 * 60_000, 20);

/** Photos and instructions are live data: no browser or proxy may reuse an old answer (iOS Safari is eager to). */
export const NO_STORE = { "Cache-Control": "no-store" };

export function fail(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

export type CamAccess = { cam: string } | { response: Response };

/**
 * Checks the camera code in the `x-cam-code` header against ESP32_CAM_CODES. Only listed codes work, so strangers
 * cannot use this server as a free photo relay. On success `cam` is the storage name of that camera.
 */
export async function authorize(request: Request): Promise<CamAccess> {
  const ip = clientIp(request);
  if (rateLimited(ip)) return { response: fail("Too many requests. Please slow down.", 429) };

  const codes = parseCodes(process.env.ESP32_CAM_CODES);
  if (codes.length === 0) return { response: fail("The ESP32 camera is not set up.", 503) };

  const presented = request.headers.get("x-cam-code");
  if (!presented || !matchCode(presented, codes)) {
    if (tooManyWrongCodes(ip)) return { response: fail("Too many wrong codes. Please wait a few minutes.", 429) };
    return { response: fail("Wrong camera code.", 401) };
  }
  return { cam: await cameraKey(presented) };
}

/** A stored photo (base64) as an image response. */
export function jpegResponse(base64: string, headers: Record<string, string> = {}) {
  return new Response(new Uint8Array(Buffer.from(base64, "base64")), {
    headers: { ...NO_STORE, ...headers, "Content-Type": "image/jpeg" },
  });
}
