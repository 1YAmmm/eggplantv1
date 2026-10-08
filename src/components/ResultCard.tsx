import type { Prediction } from "@/lib/model";
import { getPest, type Pesticide } from "@/lib/pests";
import PestGallery from "./PestGallery";

const LOW_CONFIDENCE = 0.6;

const typeStyles: Record<Pesticide["type"], string> = {
  Organic: "bg-leaf-100 text-leaf-800",
  Biological: "bg-teal-100 text-teal-800",
  Chemical: "bg-amber-100 text-amber-800",
};

export default function ResultCard({ predictions }: { predictions: Prediction[] }) {
  const top = predictions[0];
  const pest = getPest(top.label);
  const confidence = Math.round(top.probability * 100);
  const lowConfidence = top.probability < LOW_CONFIDENCE;

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-leaf-900/5 ring-1 ring-leaf-900/5">
      {/* Header */}
      <header className={`px-6 py-6 ${pest.healthy ? "bg-leaf-600" : "bg-leaf-900"} text-white`}>
        <div className="flex items-center justify-between gap-4">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium uppercase tracking-wider">
            {pest.healthy ? "Healthy" : pest.severity === "high" ? "High risk pest" : "Pest detected"}
          </span>
          <span className="text-sm text-white/80">{confidence}% match</span>
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">{pest.name}</h2>
        {pest.scientific && <p className="mt-1 text-sm italic text-white/70">{pest.scientific}</p>}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-leaf-300" style={{ width: `${confidence}%` }} />
        </div>
      </header>

      {pest.images && pest.images.length > 0 && <PestGallery key={pest.label} images={pest.images} />}

      <div className="space-y-8 px-6 py-6">
        {lowConfidence && (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Low confidence. Try again closer to the leaf or fruit, in good light, with a plain background.
          </p>
        )}

        <p className="text-leaf-900/80">{pest.summary}</p>

        {pest.pesticides.length > 0 && (
          <Section title="Recommended pesticides">
            <ul className="grid gap-3 sm:grid-cols-2">
              {pest.pesticides.map((p) => (
                <li key={p.name} className="rounded-2xl border border-leaf-900/10 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-leaf-950">{p.name}</h4>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${typeStyles[p.type]}`}>
                      {p.type}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-leaf-900/70">{p.note}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={pest.healthy ? "What to do" : "Treatment steps"}>
          <ol className="space-y-3">
            {pest.treatment.map((step, i) => (
              <li key={step} className="flex gap-3 text-leaf-900/80">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-xs font-semibold text-leaf-800">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
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
          <ul className="space-y-2">
            {predictions.slice(1, 4).map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 text-leaf-900/80">{getPest(p.label).name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-leaf-100">
                  <span className="block h-full rounded-full bg-leaf-500" style={{ width: `${p.probability * 100}%` }} />
                </span>
                <span className="w-10 text-right tabular-nums text-leaf-900/60">{Math.round(p.probability * 100)}%</span>
              </li>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-leaf-600">{title}</h3>
      {children}
    </section>
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
