/**
 * Rules for the ESP32-CAM relay (/api/cam/*): camera codes, upload checks and the timings the server and the
 * firmware share. No imports, so tests can load it.
 *
 * How the relay works: the ESP32 cannot be reached from a phone's browser (the site is HTTPS, the camera is not), so
 * the camera uploads its photos to the app's server and the phone fetches them from there. The camera code is the
 * shared secret that pairs one camera with its phones.
 */

/** A stored photo lives this long; the phone only ever wants the newest one. */
export const FRAME_TTL_S = 60;
/** How long a phone's "I am looking" lasts. Every phone poll renews it, and the camera idles once it runs out. */
export const WANTED_TTL_S = 15;
/** How long a Capture request waits for the camera before it is dropped. */
export const CAPTURE_TTL_S = 30;
/**
 * The camera counts as online while its newest preview is younger than this. A preview arrives about once a second,
 * so an older one is a leftover from a camera that has stopped, and the phone must not show it as live.
 */
export const ONLINE_WINDOW_MS = 10_000;

/** Told to the camera in `nextMs`: how long to wait before its next request. */
export const IDLE_POLL_MS = 10_000;
/** The camera's wait between two preview photos. Its own upload takes longer than this on a slow link, so it rarely idles. */
export const PREVIEW_POLL_MS = 300;

/** A preview is a few KB and a capture about 60 KB; anything much bigger is not from the camera. */
export const MAX_FRAME_BYTES = 300_000;
export const MIN_CODE_LENGTH = 16;
export const MAX_CODE_LENGTH = 128;

export type FrameKind = "preview" | "capture";

/**
 * What the camera should send in its next request. A capture carries the id the phone is waiting for. `flash` is the
 * phone's choice for the white LED; without it the camera keeps to the setting saved on the camera itself.
 */
export type Want = { mode: "idle" | "preview"; flash?: "on" | "off" } | { mode: "capture"; id: string; flash?: "on" | "off" };

/** The phone's choice for the camera's white LED: "auto" means "no choice, use the camera's own setting". */
export type FlashChoice = "auto" | "on" | "off";

/** The `flash` query of a phone request. Anything else counts as "auto", so a typo can never switch the LED. */
export function parseFlash(value: string | null): FlashChoice {
  return value === "on" || value === "off" ? value : "auto";
}

/**
 * Codes are typed on a phone and sent in an HTTP header, so only URL-safe characters are allowed. At least
 * MIN_CODE_LENGTH of them: the code is the only thing keeping other people out of the camera.
 */
export function isWellFormedCode(code: string): boolean {
  return code.length >= MIN_CODE_LENGTH && code.length <= MAX_CODE_LENGTH && /^[A-Za-z0-9_-]+$/.test(code);
}

/** Reads ESP32_CAM_CODES (comma-separated). Malformed entries are dropped, so a typo cannot open the relay. */
export function parseCodes(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(isWellFormedCode);
}

/** Compares two strings without stopping at the first difference. */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** True when `presented` is one of the allowed codes. Checks every code so the time taken does not reveal a near miss. */
export function matchCode(presented: string | null, allowed: readonly string[]): boolean {
  if (!presented || presented.length > MAX_CODE_LENGTH) return false;
  let found = false;
  for (const code of allowed) if (sameText(presented, code)) found = true;
  return found;
}

/** The storage name of a camera: a hash of its code, so the code itself never appears in Redis keys or logs. */
export async function cameraKey(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 32);
}

export function parseKind(value: string | null): FrameKind | null {
  return value === "preview" || value === "capture" ? value : null;
}

const CAPTURE_ID = /^[a-f0-9]{12}$/;

export function isCaptureId(value: string | null): value is string {
  return value !== null && CAPTURE_ID.test(value);
}

export function newCaptureId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The `after` query of a preview poll: the sequence number of the frame the phone already has. */
export function parseAfter(value: string | null): number {
  const after = Number(value);
  return Number.isFinite(after) && after > 0 ? after : 0;
}

export type FrameCheck = "ok" | "empty" | "too_big" | "not_jpeg";

/** Cheap sanity check of an upload: a JPEG starts with FF D8 and ends with FF D9 (a little padding after it is fine). */
export function checkFrame(bytes: Uint8Array): FrameCheck {
  if (bytes.length === 0) return "empty";
  if (bytes.length > MAX_FRAME_BYTES) return "too_big";
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return "not_jpeg";
  for (let i = bytes.length - 2; i >= Math.max(2, bytes.length - 8); i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return "ok";
  }
  return "not_jpeg";
}

/** How long the camera waits before its next request, given what it is about to do. */
export function nextDelayMs(want: Want): number {
  if (want.mode === "idle") return IDLE_POLL_MS;
  if (want.mode === "preview") return PREVIEW_POLL_MS;
  return 0;
}
