import type { Opinion } from "@/lib/assist";
import { getPest } from "@/lib/pests";

/** One line under the result header telling the user what the AI second opinion said. */
export default function AiOpinion({ opinion, localLabel }: { opinion: Opinion | null | undefined; localLabel: string }) {
  if (!opinion || opinion.kind === "not_eggplant") return null;

  if (opinion.kind === "checking") {
    return (
      <p role="status" className="flex items-center gap-2.5 bg-leaf-50 px-6 py-3 text-sm text-leaf-800">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-leaf-500" />
        Asking an AI for a second opinion on this photo…
      </p>
    );
  }

  const text =
    opinion.kind === "confirmed"
      ? `${opinion.by} checked the photo and agrees with this result.`
      : opinion.kind === "corrected"
        ? `${opinion.by} checked the photo and disagrees with the on-device model, which said ${getPest(localLabel).name}. This is the AI's answer: if it looks wrong, try a clearer photo.`
        : opinion.kind === "unsure"
          ? `${opinion.by} was not sure either, so this is the on-device result.`
          : "The AI second opinion is not available right now, so this is the on-device result.";
  const tone =
    opinion.kind === "confirmed"
      ? "bg-leaf-50 text-leaf-800"
      : opinion.kind === "corrected"
        ? "bg-amber-50 text-amber-900"
        : "bg-leaf-50 text-leaf-900/60";

  return (
    <p role="status" className={`px-6 py-3 text-sm ${tone}`}>
      {text}
    </p>
  );
}
