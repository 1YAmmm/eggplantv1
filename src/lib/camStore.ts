import { CAPTURE_TTL_S, FRAME_TTL_S, ONLINE_WINDOW_MS, WANTED_TTL_S, newCaptureId, type Want } from "./camRelay";

/*
 * Where the ESP32-CAM relay keeps its photos for the few seconds between the camera uploading one and the phone
 * fetching it. The rules (who wants what, when a capture is done) are written once on top of a tiny Redis-style
 * `Exec`, and run on either Upstash Redis (production) or an in-memory map (`npm run dev` without Upstash).
 *
 * Keys per camera (all expire by themselves, so nothing lingers):
 *   wanted       a phone is looking; renewed by every phone poll
 *   capture      id of the Capture the phone is waiting for
 *   meta, jpg    the newest preview: its sequence number / time, and the JPEG as base64
 *   cap:<id>     the photo taken for one Capture request
 */

/** One Redis command, for example ["SET", key, value, "EX", 60]. */
export type Command = (string | number)[];
/** Runs commands in order, in one round trip, and returns each result. */
export type Exec = (commands: Command[]) => Promise<unknown[]>;

export type DeviceFrame = { kind: "preview"; jpeg: string } | { kind: "capture"; id: string; jpeg: string };

export type PreviewPoll =
  | { status: "none"; online: false }
  | { status: "same"; online: boolean }
  | { status: "frame"; online: boolean; seq: number; jpeg: string };

export type CamStore = ReturnType<typeof createCamStore>;

const key = (cam: string, name: string) => `eggcam:${cam}:${name}`;

function parseMeta(raw: unknown): { seq: number; at: number } | null {
  if (typeof raw !== "string") return null;
  try {
    const meta = JSON.parse(raw) as { seq?: unknown; at?: unknown };
    return typeof meta.seq === "number" && typeof meta.at === "number" ? { seq: meta.seq, at: meta.at } : null;
  } catch {
    return null;
  }
}

export function createCamStore(exec: Exec, now: () => number = Date.now) {
  return {
    /**
     * The camera's request: stores the photo it sent (if any) and says what it should send next. A Capture is
     * finished when its photo arrives; the request is then removed so the camera does not take it twice.
     */
    async deviceTick(cam: string, frame: DeviceFrame | null): Promise<Want> {
      const commands: Command[] = [];
      if (frame?.kind === "preview") {
        const meta = JSON.stringify({ seq: now(), at: now() });
        commands.push(["SET", key(cam, "meta"), meta, "EX", FRAME_TTL_S], ["SET", key(cam, "jpg"), frame.jpeg, "EX", FRAME_TTL_S]);
      } else if (frame) {
        commands.push(["SET", key(cam, `cap:${frame.id}`), frame.jpeg, "EX", FRAME_TTL_S]);
      }
      commands.push(["MGET", key(cam, "wanted"), key(cam, "capture")]);

      const results = await exec(commands);
      const [wanted, pending] = results[results.length - 1] as (string | null)[];

      let capture = pending;
      if (frame?.kind === "capture" && pending === frame.id) {
        await exec([["DEL", key(cam, "capture")]]);
        capture = null;
      }
      if (capture) return { mode: "capture", id: capture };
      return { mode: wanted ? "preview" : "idle" };
    },

    /** The phone's poll: tells the camera someone is looking, and returns the newest preview unless the phone has it. */
    async pollPreview(cam: string, after: number): Promise<PreviewPoll> {
      const [, rawMeta] = await exec([["SET", key(cam, "wanted"), "1", "EX", WANTED_TTL_S], ["GET", key(cam, "meta")]]);
      const meta = parseMeta(rawMeta);
      if (!meta) return { status: "none", online: false };

      const online = now() - meta.at < ONLINE_WINDOW_MS;
      if (meta.seq === after) return { status: "same", online };
      const [jpeg] = await exec([["GET", key(cam, "jpg")]]);
      // The photo can expire between the two calls; the next poll sorts it out.
      if (typeof jpeg !== "string") return { status: "same", online };
      return { status: "frame", online, seq: meta.seq, jpeg };
    },

    /** The Capture button: asks the camera for one full photo and returns the id to wait for. */
    async requestCapture(cam: string): Promise<string> {
      const id = newCaptureId();
      await exec([["SET", key(cam, "capture"), id, "EX", CAPTURE_TTL_S], ["SET", key(cam, "wanted"), "1", "EX", WANTED_TTL_S]]);
      return id;
    },

    /** The photo for a Capture request, or null while the camera has not sent it yet. */
    async readCapture(cam: string, id: string): Promise<string | null> {
      const [jpeg] = await exec([["GET", key(cam, `cap:${id}`)]]);
      return typeof jpeg === "string" ? jpeg : null;
    },
  };
}

type Entry = { value: string; expires: number };
const MEMORY_LIMIT = 200;

/** A tiny in-memory stand-in for Redis (SET with EX, GET, MGET, DEL): enough for local development and tests. */
export function createMemoryExec(now: () => number = Date.now, entries: Map<string, Entry> = new Map()): Exec {
  const read = (name: string) => {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.expires <= now()) {
      entries.delete(name);
      return null;
    }
    return entry.value;
  };

  return async (commands) =>
    commands.map(([command, ...args]) => {
      switch (command) {
        case "SET": {
          const [name, value, option, seconds] = args;
          const expires = option === "EX" ? now() + Number(seconds) * 1000 : Infinity;
          entries.set(String(name), { value: String(value), expires });
          if (entries.size > MEMORY_LIMIT) for (const stored of entries.keys()) read(stored);
          return "OK";
        }
        case "GET":
          return read(String(args[0]));
        case "MGET":
          return args.map((name) => read(String(name)));
        case "DEL":
          return entries.delete(String(args[0])) ? 1 : 0;
        default:
          throw new Error(`Unsupported command ${command}`);
      }
    });
}

/** Upstash Redis over its REST API (no SDK needed): several commands go out as one pipelined request. */
export function createUpstashExec(url: string, token: string): Exec {
  return async (commands) => {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((command) => command.map(String))),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Upstash answered ${res.status}`);
    const answers = (await res.json()) as { result?: unknown; error?: string }[];
    return answers.map((answer) => {
      if (answer.error) throw new Error(`Upstash: ${answer.error}`);
      return answer.result ?? null;
    });
  };
}

/**
 * Where Upstash lives, from the environment. Upstash's own docs name the variables UPSTASH_REDIS_REST_URL / _TOKEN;
 * Vercel's Upstash integration names them KV_REST_API_URL / KV_REST_API_TOKEN. Either works. The read-only token
 * (KV_REST_API_READ_ONLY_TOKEN) is never used: the relay has to write.
 */
export function upstashFromEnv(env: Record<string, string | undefined>): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

/** Kept on globalThis because `next dev` can load this file once per route, and the routes must share one map. */
const shared = globalThis as typeof globalThis & { __eggcamMemory?: Map<string, Entry> };

/**
 * The store the routes use: Upstash when its URL and token are set, an in-memory map during development, and null in
 * production without Upstash (instances do not share memory there, so the relay would lose photos).
 */
export function getCamStore(): CamStore | null {
  const upstash = upstashFromEnv(process.env);
  if (upstash) return createCamStore(createUpstashExec(upstash.url, upstash.token));
  if (process.env.NODE_ENV === "production") return null;
  shared.__eggcamMemory ??= new Map();
  return createCamStore(createMemoryExec(Date.now, shared.__eggcamMemory));
}
