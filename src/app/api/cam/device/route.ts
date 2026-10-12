import { authorize, fail, NO_STORE } from "@/lib/camRoute";
import { checkFrame, isCaptureId, MAX_FRAME_BYTES, nextDelayMs, parseKind } from "@/lib/camRelay";
import { getCamStore, type DeviceFrame } from "@/lib/camStore";

/*
 * The ESP32-CAM's only endpoint. The camera calls it again and again: with no body while idle (a heartbeat), or with a
 * JPEG (`x-frame-kind: preview`, or `capture` plus `x-capture-id`). The answer says what its next request should
 * carry and how long to wait before sending it, so the camera never needs a second endpoint to listen on.
 * Photos are kept for about a minute and are not logged.
 */
export async function POST(request: Request) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  const store = getCamStore();
  if (!store) return fail("The ESP32 camera relay is not set up.", 503);

  const kind = parseKind(request.headers.get("x-frame-kind"));
  let frame: DeviceFrame | null = null;
  if (kind) {
    if (Number(request.headers.get("content-length")) > MAX_FRAME_BYTES) return fail("That photo is too large.", 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const check = checkFrame(bytes);
    if (check === "too_big") return fail("That photo is too large.", 413);
    if (check !== "ok") return fail("That is not a JPEG photo.", 400);

    const jpeg = Buffer.from(bytes).toString("base64");
    if (kind === "preview") {
      frame = { kind, jpeg };
    } else {
      const id = request.headers.get("x-capture-id");
      if (!isCaptureId(id)) return fail("Invalid capture id.", 400);
      frame = { kind, id, jpeg };
    }
  }

  try {
    const want = await store.deviceTick(access.cam, frame);
    const id = want.mode === "capture" ? want.id : undefined;
    return Response.json({ want: want.mode, id, nextMs: nextDelayMs(want) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[cam] device request failed:", err instanceof Error ? err.message : err);
    return fail("The camera relay is unavailable right now.", 503);
  }
}
