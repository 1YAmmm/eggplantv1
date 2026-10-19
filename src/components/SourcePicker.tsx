"use client";

import type { Link, Source } from "@/lib/camPrefs";
import { isWellFormedCode } from "@/lib/camRelay";

const OPTIONS: { value: Source; label: string }[] = [
  { value: "phone", label: "Phone camera" },
  { value: "esp32", label: "ESP32 camera" },
];

const LINKS: { value: Link; label: string }[] = [
  { value: "wifi", label: "Wi-Fi" },
  { value: "bluetooth", label: "Bluetooth" },
];

/**
 * Chooses where the photo comes from. The ESP32 option also asks how the camera connects (Wi-Fi through the site, or
 * Bluetooth straight to the phone) and for the camera code that pairs this phone with it; both links use the same code.
 */
export default function SourcePicker({
  source,
  onSourceChange,
  link,
  onLinkChange,
  canUseBluetooth,
  code,
  onCodeChange,
}: {
  source: Source;
  onSourceChange: (source: Source) => void;
  link: Link;
  onLinkChange: (link: Link) => void;
  /** False in browsers without Web Bluetooth (iPhone, Firefox): the Bluetooth choice is then disabled. */
  canUseBluetooth: boolean;
  code: string;
  onCodeChange: (code: string) => void;
}) {
  const showCodeHint = source === "esp32" && !isWellFormedCode(code);

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Photo source" className="grid grid-cols-2 gap-1 rounded-2xl bg-leaf-100 p-1">
        {OPTIONS.map((option) => {
          const selected = option.value === source;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSourceChange(option.value)}
              className={`h-11 rounded-xl text-sm font-medium transition ${
                selected ? "bg-white text-leaf-950 shadow-sm" : "text-leaf-700 hover:text-leaf-950"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {source === "esp32" && (
        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-leaf-900/10">
          <p id="camera-link-label" className="text-sm font-medium text-leaf-900">
            Connect by
          </p>
          <div
            role="radiogroup"
            aria-labelledby="camera-link-label"
            className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-leaf-50 p-1 ring-1 ring-leaf-900/10"
          >
            {LINKS.map((option) => {
              const selected = option.value === link;
              const unavailable = option.value === "bluetooth" && !canUseBluetooth;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={unavailable}
                  onClick={() => onLinkChange(option.value)}
                  className={`h-9 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    selected ? "bg-white text-leaf-950 shadow-sm" : "text-leaf-700 hover:text-leaf-950"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {!canUseBluetooth && (
            <p className="mt-1.5 text-xs text-leaf-900/60">Bluetooth works in Chrome on Android (not on iPhone).</p>
          )}

          <label htmlFor="camera-code" className="mt-3 block text-sm font-medium text-leaf-900">
            Camera code
          </label>
          <input
            id="camera-code"
            type="text"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={showCodeHint && code.length > 0}
            aria-describedby="camera-code-help"
            placeholder="The code you set up for your camera"
            className="mt-1.5 h-11 w-full rounded-xl bg-leaf-50 px-3 font-mono text-sm text-leaf-950 outline-none ring-1 ring-leaf-900/10 placeholder:font-sans placeholder:text-leaf-900/40 focus:ring-2 focus:ring-leaf-500"
          />
          <p id="camera-code-help" className="mt-2 text-xs text-leaf-900/60">
            {showCodeHint
              ? "Enter the camera code (16 or more letters and numbers) to scan with the ESP32 camera."
              : link === "bluetooth"
                ? "Turn on Bluetooth and stay within about 10 m of the camera. Pick EggplantCam-… in the list, and allow “Nearby devices” if asked."
                : "The camera must be on Wi-Fi with internet. A phone hotspot works: use its 2.4 GHz band (on iPhone, turn on Maximize Compatibility)."}
          </p>
        </div>
      )}
    </div>
  );
}
