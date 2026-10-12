"use client";

import type { Source } from "@/lib/camPrefs";
import { isWellFormedCode } from "@/lib/camRelay";

const OPTIONS: { value: Source; label: string }[] = [
  { value: "phone", label: "Phone camera" },
  { value: "esp32", label: "ESP32 camera" },
];

/** Chooses where the photo comes from. The ESP32 option also asks for the camera code that pairs this phone with it. */
export default function SourcePicker({
  source,
  onSourceChange,
  code,
  onCodeChange,
}: {
  source: Source;
  onSourceChange: (source: Source) => void;
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
          <label htmlFor="camera-code" className="text-sm font-medium text-leaf-900">
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
              : "The camera must be on Wi-Fi with internet. A phone hotspot works: use its 2.4 GHz band (on iPhone, turn on Maximize Compatibility)."}
          </p>
        </div>
      )}
    </div>
  );
}
