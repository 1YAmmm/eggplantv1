import { authorize, clientIp, fail, jpegResponse, NO_STORE } from "@/lib/camRoute";
import { isCaptureId } from "@/lib/camRelay";
import { getCamStore } from "@/lib/camStore";
import { createRateLimiter } from "@/lib/rateLimit";

/*
 * The Capture button. POST asks the camera for one full-size photo and returns the id to wait for; GET `?id=` returns
 * that photo as soon as the camera has sent it (204 until then). Kept apart from the preview so a following preview
 * cannot overwrite a capture before the phone has fetched it.
 */

/* 20 captures per minute per visitor. */
const captureLimited = createRateLimiter(60_000, 20);

export async function POST(request: Request) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  const store = getCamStore();
  if (!store) return fail("The ESP32 camera relay is not set up.", 503);
  if (captureLimited(clientIp(request))) return fail("Too many photos. Please wait a moment.", 429);

  try {
    return Response.json({ id: await store.requestCapture(access.cam) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[cam] capture request failed:", err instanceof Error ? err.message : err);
    return fail("The camera relay is unavailable right now.", 503);
  }
}

export async function GET(request: Request) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  const store = getCamStore();
  if (!store) return fail("The ESP32 camera relay is not set up.", 503);

  const id = new URL(request.url).searchParams.get("id");
  if (!isCaptureId(id)) return fail("Invalid capture id.", 400);

  try {
    const jpeg = await store.readCapture(access.cam, id);
    return jpeg ? jpegResponse(jpeg) : new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    console.error("[cam] capture read failed:", err instanceof Error ? err.message : err);
    return fail("The camera relay is unavailable right now.", 503);
  }
}
