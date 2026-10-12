import { useSyncExternalStore } from "react";

/** Where the photo comes from: the phone's own camera, or an ESP32-CAM relayed through the server. */
export type Source = "phone" | "esp32";

const SOURCE_KEY = "eggplant.photoSource";
const CODE_KEY = "eggplant.camCode";

/*
 * The chosen source and the camera code are remembered on this phone only (localStorage). Storage can be missing
 * (private windows, blocked site data), so every access is guarded and a failed write is kept in memory for the page.
 */
const unsaved: Record<string, string> = {};
const listeners = new Set<() => void>();

function read(key: string): string {
  try {
    const value = localStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // fall through to the in-memory copy
  }
  return unsaved[key] ?? "";
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    unsaved[key] = value;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SOURCE_KEY || e.key === CODE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved source and code. The server render (and first paint) uses the defaults, so nothing mismatches. */
export function useCamPrefs() {
  const source: Source = useSyncExternalStore(
    subscribe,
    () => (read(SOURCE_KEY) === "esp32" ? "esp32" : "phone"),
    () => "phone",
  );
  const code = useSyncExternalStore(subscribe, () => read(CODE_KEY), () => "");
  return {
    source,
    code,
    setSource: (next: Source) => write(SOURCE_KEY, next),
    setCode: (next: string) => write(CODE_KEY, next.replace(/\s/g, "")),
  };
}
