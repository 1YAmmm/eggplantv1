import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_FRAME_BYTES,
  cameraKey,
  checkFrame,
  isCaptureId,
  isWellFormedCode,
  matchCode,
  newCaptureId,
  nextDelayMs,
  parseAfter,
  parseCodes,
  parseFlash,
  parseKind,
} from "../src/lib/camRelay.ts";
import { createCamStore, createMemoryExec, createUpstashExec, upstashFromEnv } from "../src/lib/camStore.ts";

const CODE = "Abcdefgh12345678-_x";
const jpeg = (size = 40) => {
  const bytes = new Uint8Array(size).fill(7);
  bytes.set([0xff, 0xd8], 0);
  bytes.set([0xff, 0xd9], size - 2);
  return bytes;
};

test("codes: only long URL-safe codes are accepted, and typos are dropped", () => {
  assert.equal(isWellFormedCode(CODE), true);
  assert.equal(isWellFormedCode("short"), false);
  assert.equal(isWellFormedCode("has spaces in the middle 123"), false);
  assert.equal(isWellFormedCode("ünïcödé-code-1234567890"), false);
  assert.equal(isWellFormedCode("a".repeat(129)), false);
  assert.deepEqual(parseCodes(` ${CODE} , tooshort ,second-code-1234567890`), [CODE, "second-code-1234567890"]);
  assert.deepEqual(parseCodes(undefined), []);
  assert.deepEqual(parseCodes(""), []);
});

test("matchCode: exact match only", () => {
  const allowed = [CODE, "second-code-1234567890"];
  assert.equal(matchCode(CODE, allowed), true);
  assert.equal(matchCode("second-code-1234567890", allowed), true);
  assert.equal(matchCode(CODE.slice(0, -1), allowed), false);
  assert.equal(matchCode(CODE + "x", allowed), false);
  assert.equal(matchCode("", allowed), false);
  assert.equal(matchCode(null, allowed), false);
  assert.equal(matchCode(CODE, []), false);
  assert.equal(matchCode("x".repeat(500), allowed), false);
});

test("cameraKey: stable, hex, and does not contain the code", async () => {
  const key = await cameraKey(CODE);
  assert.match(key, /^[a-f0-9]{32}$/);
  assert.equal(key, await cameraKey(CODE));
  assert.notEqual(key, await cameraKey(CODE + "x"));
  assert.equal(key.includes(CODE), false);
});

test("checkFrame: accepts a JPEG, rejects empty, huge and non-JPEG data", () => {
  assert.equal(checkFrame(jpeg()), "ok");
  assert.equal(checkFrame(new Uint8Array(0)), "empty");
  assert.equal(checkFrame(jpeg(MAX_FRAME_BYTES + 1)), "too_big");
  assert.equal(checkFrame(jpeg(MAX_FRAME_BYTES)), "ok");
  assert.equal(checkFrame(new TextEncoder().encode("<html>not a photo</html>")), "not_jpeg");
  const noEnd = jpeg();
  noEnd[noEnd.length - 1] = 0;
  assert.equal(checkFrame(noEnd), "not_jpeg");
  assert.equal(checkFrame(new Uint8Array([0xff, 0xd8, 0xff])), "not_jpeg");
  const padded = new Uint8Array([...jpeg(), 0, 0, 0]);
  assert.equal(checkFrame(padded), "ok");
});

test("small parsers", () => {
  assert.equal(parseKind("preview"), "preview");
  assert.equal(parseKind("capture"), "capture");
  assert.equal(parseKind("video"), null);
  assert.equal(parseKind(null), null);
  const id = newCaptureId();
  assert.equal(isCaptureId(id), true);
  assert.notEqual(id, newCaptureId());
  assert.equal(isCaptureId("ABCDEF123456"), false);
  assert.equal(isCaptureId("abc"), false);
  assert.equal(isCaptureId(null), false);
  assert.equal(parseAfter("1700000000123"), 1700000000123);
  assert.equal(parseAfter("-5"), 0);
  assert.equal(parseAfter("abc"), 0);
  assert.equal(parseAfter(null), 0);
  assert.equal(nextDelayMs({ mode: "idle" }) > nextDelayMs({ mode: "preview" }), true);
  assert.equal(nextDelayMs({ mode: "capture", id: "x" }), 0);
});

/** A store on a fake clock, so expiry can be tested without waiting. */
function makeStore() {
  const clock = { t: 1_000_000 };
  const now = () => clock.t;
  return { store: createCamStore(createMemoryExec(now), now), clock, advance: (seconds) => (clock.t += seconds * 1000) };
}

test("store: the camera idles until a phone looks, then previews", async () => {
  const { store, advance } = makeStore();
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "idle" });
  assert.deepEqual(await store.pollPreview("cam", 0), { status: "none", online: false });
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "preview" });
  advance(16); // the phone stopped polling
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "idle" });
});

test("store: a preview reaches the phone once, and expires", async () => {
  const { store, advance } = makeStore();
  await store.pollPreview("cam", 0);
  assert.deepEqual(await store.deviceTick("cam", { kind: "preview", jpeg: "AAAA" }), { mode: "preview" });

  const first = await store.pollPreview("cam", 0);
  assert.equal(first.status, "frame");
  assert.equal(first.jpeg, "AAAA");
  assert.equal(first.online, true);
  assert.deepEqual(await store.pollPreview("cam", first.seq), { status: "same", online: true });

  advance(1);
  await store.deviceTick("cam", { kind: "preview", jpeg: "BBBB" });
  const second = await store.pollPreview("cam", first.seq);
  assert.equal(second.status, "frame");
  assert.equal(second.jpeg, "BBBB");
  assert.notEqual(second.seq, first.seq);

  advance(9);
  assert.equal((await store.pollPreview("cam", second.seq)).online, true);
  advance(2); // a preview older than ~10 s is a leftover, not a live view
  assert.equal((await store.pollPreview("cam", second.seq)).online, false);
  advance(60);
  assert.deepEqual(await store.pollPreview("cam", second.seq), { status: "none", online: false });
});

test("parseFlash: only an explicit on/off counts, anything else is auto", () => {
  assert.equal(parseFlash("on"), "on");
  assert.equal(parseFlash("off"), "off");
  assert.equal(parseFlash("auto"), "auto");
  assert.equal(parseFlash(null), "auto");
  assert.equal(parseFlash("ON"), "auto");
  assert.equal(parseFlash("1"), "auto");
  assert.equal(parseFlash("on; drop"), "auto");
});

test("store: the phone's flash choice reaches the camera while the phone looks, and ends with it", async () => {
  const { store, advance } = makeStore();
  await store.pollPreview("cam", 0, "on");
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "preview", flash: "on" });
  await store.pollPreview("cam", 0, "off");
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "preview", flash: "off" });
  // "auto" (and a poll that does not say) leaves the choice to the camera's own setting: no flash field at all.
  await store.pollPreview("cam", 0, "auto");
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "preview" });
  await store.pollPreview("cam", 0);
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "preview" });
  // The choice dies with "someone is looking".
  await store.pollPreview("cam", 0, "on");
  advance(16);
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "idle" });
});

test("store: a Capture carries the phone's flash choice", async () => {
  const { store } = makeStore();
  const id = await store.requestCapture("cam", "on");
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "capture", id, flash: "on" });
  assert.deepEqual(await store.deviceTick("cam", { kind: "capture", id, jpeg: "FULL" }), { mode: "preview", flash: "on" });
  const plain = await store.requestCapture("cam");
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "capture", id: plain });
});

test("store: the camera reports whether its LED is lit, and the phone sees it with each poll", async () => {
  const { store, advance } = makeStore();
  await store.pollPreview("cam", 0);
  // A camera that does not report (older firmware) leaves the field out.
  await store.deviceTick("cam", { kind: "preview", jpeg: "AAAA" });
  const unknown = await store.pollPreview("cam", 0);
  assert.equal(unknown.status, "frame");
  assert.equal("flash" in unknown, false);

  advance(1);
  await store.deviceTick("cam", { kind: "preview", jpeg: "BBBB", flash: true });
  const lit = await store.pollPreview("cam", 0);
  assert.equal(lit.status, "frame");
  assert.equal(lit.flash, true);
  // Also on a poll that has nothing new to send, so the phone's button keeps up.
  const same = await store.pollPreview("cam", lit.seq);
  assert.deepEqual(same, { status: "same", online: true, flash: true });

  advance(1);
  await store.deviceTick("cam", { kind: "preview", jpeg: "CCCC", flash: false });
  assert.equal((await store.pollPreview("cam", lit.seq)).flash, false);
});

test("store: Capture is asked once, answered with its own id, and then finished", async () => {
  const { store, advance } = makeStore();
  await store.pollPreview("cam", 0);
  const id = await store.requestCapture("cam");
  assert.equal(isCaptureId(id), true);

  assert.equal(await store.readCapture("cam", id), null);
  // Until the photo arrives the camera keeps being told to take it.
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "capture", id });
  assert.deepEqual(await store.deviceTick("cam", { kind: "preview", jpeg: "PREV" }), { mode: "capture", id });

  assert.deepEqual(await store.deviceTick("cam", { kind: "capture", id, jpeg: "FULL" }), { mode: "preview" });
  assert.equal(await store.readCapture("cam", id), "FULL");
  assert.deepEqual(await store.deviceTick("cam", null), { mode: "preview" });

  advance(61);
  assert.equal(await store.readCapture("cam", id), null);
});

test("store: an old Capture answer does not cancel a newer request", async () => {
  const { store } = makeStore();
  const first = await store.requestCapture("cam");
  const second = await store.requestCapture("cam");
  assert.notEqual(first, second);
  assert.deepEqual(await store.deviceTick("cam", { kind: "capture", id: first, jpeg: "OLD" }), { mode: "capture", id: second });
  assert.equal(await store.readCapture("cam", first), "OLD");
  assert.deepEqual(await store.deviceTick("cam", { kind: "capture", id: second, jpeg: "NEW" }), { mode: "preview" });
});

test("store: an unanswered Capture is dropped after its time is up", async () => {
  const { store, advance } = makeStore();
  const id = await store.requestCapture("cam");
  advance(31);
  assert.equal((await store.deviceTick("cam", null)).mode === "capture", false);
  assert.equal(await store.readCapture("cam", id), null);
});

test("store: cameras do not see each other's photos", async () => {
  const { store } = makeStore();
  await store.pollPreview("a", 0);
  await store.deviceTick("a", { kind: "preview", jpeg: "AAAA" });
  assert.deepEqual(await store.pollPreview("b", 0), { status: "none", online: false });
  assert.deepEqual(await store.deviceTick("b", null), { mode: "preview" }); // b's own phone poll just now
});

test("memory exec: unknown commands fail loudly", async () => {
  await assert.rejects(createMemoryExec()([["FLUSHALL"]]), /Unsupported command/);
});

test("upstashFromEnv: accepts Upstash's names and Vercel's integration names, never the read-only token", () => {
  assert.deepEqual(upstashFromEnv({ UPSTASH_REDIS_REST_URL: "https://a", UPSTASH_REDIS_REST_TOKEN: "t1" }), { url: "https://a", token: "t1" });
  assert.deepEqual(upstashFromEnv({ KV_REST_API_URL: "https://b", KV_REST_API_TOKEN: "t2" }), { url: "https://b", token: "t2" });
  // Upstash's own names win when both are set.
  assert.deepEqual(
    upstashFromEnv({ UPSTASH_REDIS_REST_URL: "https://a", UPSTASH_REDIS_REST_TOKEN: "t1", KV_REST_API_URL: "https://b", KV_REST_API_TOKEN: "t2" }),
    { url: "https://a", token: "t1" },
  );
  // The read-only token cannot write, so it must not count as a token.
  assert.equal(upstashFromEnv({ KV_REST_API_URL: "https://b", KV_REST_API_READ_ONLY_TOKEN: "ro" }), null);
  assert.equal(upstashFromEnv({ KV_URL: "rediss://x", REDIS_URL: "rediss://y" }), null);
  assert.equal(upstashFromEnv({}), null);
  assert.equal(upstashFromEnv({ UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" }), null);
});

test("upstash exec: sends one pipelined request and unwraps the answers", async () => {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json([{ result: "OK" }, { result: null }, { result: ["x", null] }]);
  };
  try {
    const exec = createUpstashExec("https://example.upstash.io/", "secret-token");
    const answers = await exec([["SET", "k", "v", "EX", 15], ["GET", "k"], ["MGET", "a", "b"]]);
    assert.deepEqual(answers, ["OK", null, ["x", null]]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://example.upstash.io/pipeline");
    assert.equal(calls[0].init.headers.Authorization, "Bearer secret-token");
    assert.deepEqual(JSON.parse(calls[0].init.body), [["SET", "k", "v", "EX", "15"], ["GET", "k"], ["MGET", "a", "b"]]);

    globalThis.fetch = async () => Response.json([{ error: "ERR boom" }]);
    await assert.rejects(exec([["GET", "k"]]), /Upstash: ERR boom/);
    globalThis.fetch = async () => new Response("nope", { status: 500 });
    await assert.rejects(exec([["GET", "k"]]), /500/);
  } finally {
    globalThis.fetch = real;
  }
});
