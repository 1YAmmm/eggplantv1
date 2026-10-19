import { useSyncExternalStore } from "react";

/** Where the photo comes from: the phone's own camera, or an ESP32-CAM relayed through the server. */
export type Source = "phone" | "esp32";

/** How the ESP32 camera reaches the phone: through the site over Wi-Fi, or directly over Bluetooth (Android). */
export type Link = "wifi" | "bluetooth";

const SOURCE_KEY = "eggplant.photoSource";
const CODE_KEY = "eggplant.camCode";
const LINK_KEY = "eggplant.camLink";

/*
 * The chosen source, link and camera code are remembered on this phone only (localStorage). Storage can be missing
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
    if (e.key === SOURCE_KEY || e.key === CODE_KEY || e.key === LINK_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Web Bluetooth: Chrome on Android (and on computers). iPhone browsers do not have it. */
export function hasBluetooth(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

const noChange = () => () => {};

/**
 * The saved source, link and code. The server render (and first paint) uses the defaults, so nothing mismatches. A
 * saved Bluetooth link counts as Wi-Fi in a browser without Bluetooth.
 */
export function useCamPrefs() {
  const source: Source = useSyncExternalStore(
    subscribe,
    () => (read(SOURCE_KEY) === "esp32" ? "esp32" : "phone"),
    () => "phone",
  );
  const code = useSyncExternalStore(subscribe, () => read(CODE_KEY), () => "");
  const canUseBluetooth = useSyncExternalStore(noChange, hasBluetooth, () => false);
  const link: Link = useSyncExternalStore(
    subscribe,
    () => (read(LINK_KEY) === "bluetooth" && hasBluetooth() ? "bluetooth" : "wifi"),
    () => "wifi",
  );
  return {
    source,
    code,
    link,
    canUseBluetooth,
    setSource: (next: Source) => write(SOURCE_KEY, next),
    setLink: (next: Link) => write(LINK_KEY, next),
    setCode: (next: string) => write(CODE_KEY, next.replace(/\s/g, "")),
  };
}
