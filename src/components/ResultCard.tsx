import { LOW_CONFIDENCE, type Opinion } from "@/lib/assist";
import type { Lighting } from "@/lib/lighting";
import type { Prediction } from "@/lib/model";
import { getPest, type Pesticide } from "@/lib/pests";
import { useAdvice, type AdviceState } from "@/lib/useAdvice";
import AiOpinion from "./AiOpinion";
import LightingNotice from "./LightingNotice";
import NearbyShops from "./NearbyShops";
import PestGallery from "./PestGallery";
import PesticideCard from "./PesticideCard";

/** Runner-up diagnoses only get pesticide and treatment advice at or above this probability. */
const MIN_ADVICE = 0.3;

/**
 * `predictions` already has the AI's correction applied (see applyOpinion), and `opinion` says what the AI second
 * opinion found; `localLabel` is what the on-device model said.
 */
export default function ResultCard({
  predictions,
  lighting,
  opinion,
  localLabel,
}: {
  predictions: Prediction[];
  lighting: Lighting;
  opinion?: Opinion | null;
  localLabel: string;
}) {
  const top = predictions[0];
  const pest = getPest(top.label);
  const confidence = Math.round(top.probability * 100);
  const aiResolved = opinion?.kind === "confirmed" || opinion?.kind === "corrected";
  const lowConfidence = top.probability < LOW_CONFIDENCE && !aiResolved;
  // Wait for the second opinion first: it may change the pest, and then the plan would be for the wrong one.
  const advice = useAdvice(
    pest.label,
    !pest.healthy && pest.pesticides.length > 0 && top.probability >= MIN_ADVICE && opinion?.kind !== "checking",
  );
  const picked = advice.status === "ready" ? advice.advice.picks.map((p) => p.name) : [];

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-leaf-900/5 ring-1 ring-leaf-900/5">
      {/* Header */}
      <header className={`px-6 py-6 ${pest.healthy ? "bg-leaf-600" : "bg-leaf-900"} text-white`}>
        <div className="flex items-center justify-between gap-4">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium uppercase tracking-wider">
            {pest.healthy ? "Healthy" : pest.severity === "high" ? "High risk pest" : "Pest detected"}
          </span>
          <span className="text-sm text-white/80">{opinion?.kind === "corrected" ? "AI-checked" : `${confidence}% match`}</span>
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">{pest.name}</h2>
        {pest.scientific && <p className="mt-1 text-sm italic text-white/70">{pest.scientific}</p>}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-leaf-300" style={{ width: `${confidence}%` }} />
        </div>
      </header>

      <AiOpinion opinion={opinion} localLabel={localLabel} />

      {pest.images && pest.images.length > 0 && <PestGallery key={pest.label} images={pest.images} />}

      <div className="space-y-8 px-6 py-6">
        <LightingNotice lighting={lighting} />
        {lowConfidence && (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Low confidence. Try again closer to the leaf or fruit, in good light, with a plain background.
          </p>
        )}

        <p className="text-leaf-900/80">{pest.summary}</p>

        {pest.pesticides.length > 0 && (
          <Section title="Recommended pesticides">
            <PesticideList pesticides={pest.pesticides} picked={picked} />
          </Section>
        )}

        {pest.pesticides.length > 0 && (
          <Section title="Where to buy">
            <NearbyShops />
          </Section>
        )}

        <AiPlan state={advice} />

        <Section title={pest.healthy ? "What to do" : "Treatment steps"}>
          {advice.status === "ready" ? (
            <details className="group rounded-2xl border border-leaf-900/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-leaf-800 [&::-webkit-details-marker]:hidden">
                Standard steps from the app
                <ChevronIcon className="h-4 w-4 shrink-0 text-leaf-900/40 transition group-open:rotate-90" />
              </summary>
              <div className="border-t border-leaf-900/10 px-4 py-4">
                <TreatmentSteps steps={pest.treatment} />
              </div>
            </details>
          ) : (
            <TreatmentSteps steps={pest.treatment} />
          )}
        </Section>

        <div className="grid gap-8 sm:grid-cols-2">
          <Section title={pest.healthy ? "Signs of health" : "Symptoms"}>
            <Bullets items={pest.symptoms} />
          </Section>
          <Section title="Prevention">
            <Bullets items={pest.prevention} />
          </Section>
        </div>

        <Section title="Other possibilities">
          <p className="-mt-1 mb-3 text-xs text-leaf-900/50">Advice is only shown for matches of 30% or more.</p>
          <ul className="space-y-2">
            {predictions.slice(1, 4).map((p) => (
              <Alternative key={p.label} prediction={p} />
            ))}
          </ul>
        </Section>

        {!pest.healthy && (
          <p className="border-t border-leaf-900/10 pt-5 text-xs leading-relaxed text-leaf-900/50">
            Always read and follow the product label, wear protective equipment, respect the pre-harvest interval, and
            check which products are registered in your country. Consult a local agricultural extension officer for
            severe infestations.
          </p>
        )}
      </div>
    </article>
  );
}

/** A runner-up diagnosis with its own recommendations; expanded by default when it is a real contender. */
function Alternative({ prediction }: { prediction: Prediction }) {
  const pest = getPest(prediction.label);
  const hasDetails = prediction.probability >= MIN_ADVICE && (pest.pesticides.length > 0 || pest.treatment.length > 0);
  const row = (
    <>
      <span className="w-36 shrink-0 text-leaf-900/80">{pest.name}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-leaf-100">
        <span className="block h-full rounded-full bg-leaf-500" style={{ width: `${prediction.probability * 100}%` }} />
      </span>
      <span className="w-10 text-right tabular-nums text-leaf-900/60">{Math.round(prediction.probability * 100)}%</span>
    </>
  );

  if (!hasDetails) {
    return <li className="flex items-center gap-3 px-3 py-2.5 text-sm">{row}</li>;
  }
  return (
    <li>
      <details open className="group rounded-2xl border border-leaf-900/10">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
          {row}
          <ChevronIcon className="h-4 w-4 shrink-0 text-leaf-900/40 transition group-open:rotate-90" />
        </summary>
        <div className="space-y-5 border-t border-leaf-900/10 px-4 py-4">
          <p className="text-sm text-leaf-900/70">{pest.summary}</p>
          {pest.pesticides.length > 0 && (
            <Section title="Recommended pesticides" level="h4">
              <PesticideList pesticides={pest.pesticides} compact />
            </Section>
          )}
          <Section title={pest.healthy ? "What to do" : "Treatment steps"} level="h4">
            <TreatmentSteps steps={pest.treatment} />
          </Section>
        </div>
      </details>
    </li>
  );
}

/** `picked` are the names the suggested plan chose; they come first and get a "Suggested" tag. */
function PesticideList({
  pesticides,
  compact = false,
  picked = [],
}: {
  pesticides: Pesticide[];
  compact?: boolean;
  picked?: string[];
}) {
  const ordered = [...pesticides].sort((a, b) => Number(picked.includes(b.name)) - Number(picked.includes(a.name)));
  return (
    <ul className={compact ? "space-y-2" : "grid gap-3 sm:grid-cols-2"}>
      {ordered.map((p) => (
        <PesticideCard key={p.name} pesticide={p} compact={compact} aiPick={picked.includes(p.name)} />
      ))}
    </ul>
  );
}

/** The AI-written "Suggested treatment plan". The static steps below it stay as the fallback, so only a ready plan shows here. */
function AiPlan({ state }: { state: AdviceState }) {
  if (state.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2.5 rounded-2xl bg-leaf-50 px-4 py-3 text-sm text-leaf-800">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-leaf-500" />
        Writing a suggested treatment plan for this pest…
      </p>
    );
  }
  if (state.status === "unavailable") {
    return (
      <p className="rounded-2xl bg-leaf-50 px-4 py-3 text-sm text-leaf-900/60">
        The suggested plan is not available right now. The standard guide below still applies.
      </p>
    );
  }
  if (state.status !== "ready") return null;

  const { advice, by } = state;
  return (
    <Section title="Suggested treatment plan">
      <div className="space-y-4 rounded-2xl bg-leaf-50 p-4 ring-1 ring-leaf-900/5">
        <p className="text-sm text-leaf-900/80">{advice.intro}</p>
        {advice.picks.length > 0 && (
          <ul className="space-y-1.5 text-sm text-leaf-900/80">
            {advice.picks.map((p) => (
              <li key={p.name}>
                <span className="font-medium text-leaf-950">{p.name}</span>
                {p.why && `: ${p.why}`}
              </li>
            ))}
          </ul>
        )}
        <TreatmentSteps steps={advice.steps} />
        {advice.watchFor && (
          <p className="text-sm text-leaf-900/80">
            <strong className="font-medium text-leaf-900">Watch for: </strong>
            {advice.watchFor}
          </p>
        )}
        {advice.schedule && (
          <p className="text-sm text-leaf-900/80">
            <strong className="font-medium text-leaf-900">Spray schedule: </strong>
            {advice.schedule}
          </p>
        )}
        <p className="text-xs text-leaf-900/50">
          Written by {by} using only this app&apos;s checked product list. Doses are on the product cards: always follow the
          product label.
        </p>
      </div>
    </Section>
  );
}

function TreatmentSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={`${i}-${step}`} className="flex gap-3 text-leaf-900/80">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-xs font-semibold text-leaf-800">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Section({ title, level: Heading = "h3", children }: { title: string; level?: "h3" | "h4"; children: React.ReactNode }) {
  return (
    <section>
      <Heading className="mb-3 text-xs font-semibold uppercase tracking-wider text-leaf-600">{title}</Heading>
      {children}
    </section>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li key={s} className="flex gap-2.5 text-sm text-leaf-900/80">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-400" />
          {s}
        </li>
      ))}
    </ul>
  );
}
