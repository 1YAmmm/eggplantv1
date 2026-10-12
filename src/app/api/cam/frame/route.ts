import { authorize, fail, jpegResponse, NO_STORE } from "@/lib/camRoute";
import { parseAfter } from "@/lib/camRelay";
import { getCamStore } from "@/lib/camStore";

/*
 * The phone's live preview. Every poll also tells the camera that someone is looking, which wakes it from idle.
 * `after` is the sequence number of the preview the phone already has: when nothing newer exists the answer is an
 * empty 204, so a poll costs almost no data. `x-camera-online` says whether the camera sent a photo recently.
 */
export async function GET(request: Request) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  const store = getCamStore();
  if (!store) return fail("The ESP32 camera relay is not set up.", 503);

  const after = parseAfter(new URL(request.url).searchParams.get("after"));
  try {
    const poll = await store.pollPreview(access.cam, after);
    const headers = { "x-camera-online": poll.online ? "1" : "0" };
    if (poll.status !== "frame") return new Response(null, { status: 204, headers: { ...NO_STORE, ...headers } });
    return jpegResponse(poll.jpeg, { ...headers, "x-frame-seq": String(poll.seq) });
  } catch (err) {
    console.error("[cam] preview poll failed:", err instanceof Error ? err.message : err);
    return fail("The camera relay is unavailable right now.", 503);
  }
}
