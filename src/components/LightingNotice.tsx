import type { Lighting } from "@/lib/lighting";

const MESSAGES = {
  dark: {
    title: "This photo looks too dark.",
    body: "Dim light hides small insects and damage, so the result may be wrong. Move to a brighter spot, or turn on the Flash button in the camera view, and scan again.",
  },
  bright: {
    title: "This photo looks too bright.",
    body: "Glare or direct sun washes out the colours, so the result may be wrong. Step into the shade and scan again.",
  },
} as const;

/** Amber warning shown with a result when the photo's lighting is likely to affect it. */
export default function LightingNotice({ lighting }: { lighting: Lighting }) {
  if (lighting === "ok") return null;
  const { title, body } = MESSAGES[lighting];
  return (
    <p role="status" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <strong className="font-semibold">{title}</strong> {body}
    </p>
  );
}
