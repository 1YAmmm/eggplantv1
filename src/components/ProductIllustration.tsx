import type { Pesticide } from "@/lib/pests";

const LABEL_COLORS: Record<Pesticide["type"], string> = {
  Organic: "#418a57", // leaf-500
  Biological: "#0f766e", // teal-700
  Chemical: "#b45309", // amber-700
};

/** The name that goes on the bottle: the brand without the maker, e.g. "Prevathon® 5SC (FMC)" -> "Prevathon® 5SC". */
function labelLines(p: Pesticide): string[] {
  const text = (p.brand ?? p.name).replace(/\s*\(.*?\)\s*/g, " ").trim();
  const words = text.split(/\s+/);
  if (words.length === 1) return [words[0]];
  // Two lines: the first word, then the rest.
  return [words[0], words.slice(1).join(" ")];
}

/**
 * A generic bottle drawn with the product's name, for products that have no free-licensed photo. It is an
 * illustration only: the real pack looks different, so callers should say so.
 */
export default function ProductIllustration({ pesticide: p, showName = true }: { pesticide: Pesticide; showName?: boolean }) {
  const color = LABEL_COLORS[p.type];
  const lines = labelLines(p);
  const longest = Math.max(...lines.map((l) => l.length));
  // Keep the text inside the 40-unit-wide label.
  const fontSize = Math.min(8, 37 / (longest * 0.6));

  return (
    <svg viewBox="0 0 100 120" role="img" aria-label={`Illustration of a bottle of ${p.brand ?? p.name}`} className="h-full w-full">
      {/* cap and neck */}
      <rect x="39" y="5" width="22" height="13" rx="3" fill="#1d3b28" />
      <rect x="43" y="18" width="14" height="9" fill="#dfeee2" stroke="#1d3b28" strokeWidth="1.4" />
      {/* bottle body with a little liquid showing */}
      <path
        d="M30 36c0-6 3-9 9-9h22c6 0 9 3 9 9v72c0 5-3 8-8 8H38c-5 0-8-3-8-8Z"
        fill="#f2f8f3"
        stroke="#1d3b28"
        strokeWidth="1.8"
      />
      <path d="M32 100h36v8c0 4-2 6-6 6H38c-4 0-6-2-6-6Z" fill="#c1dec8" />
      {/* label */}
      <rect x="30" y="46" width="40" height="46" fill={color} />
      <rect x="30" y="46" width="40" height="6" fill="#ffffff" opacity="0.22" />
      {showName ? (
        <g fill="#ffffff" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700">
          {lines.map((line, i) => (
            <text key={i} x="50" y={lines.length === 1 ? 74 : 68 + i * (fontSize + 3)} fontSize={fontSize}>
              {line}
            </text>
          ))}
        </g>
      ) : (
        <circle cx="50" cy="70" r="7" fill="#ffffff" opacity="0.85" />
      )}
    </svg>
  );
}
