"use client";

import Image from "next/image";
import { useId, useRef } from "react";
import type { Pesticide } from "@/lib/pests";
import ProductIllustration from "./ProductIllustration";

const typeStyles: Record<Pesticide["type"], string> = {
  Organic: "bg-leaf-100 text-leaf-800",
  Biological: "bg-teal-100 text-teal-800",
  Chemical: "bg-amber-100 text-amber-800",
};

/** One recommended pesticide, with a button that opens a modal explaining why it is a good choice. */
export default function PesticideCard({
  pesticide: p,
  compact = false,
  aiPick = false,
}: {
  pesticide: Pesticide;
  compact?: boolean;
  /** True when the suggested treatment plan chose this product; it gets a "Suggested" tag. */
  aiPick?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <li className={`rounded-2xl border border-leaf-900/10 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start gap-3">
        {/* The picture opens the same details as the button below. */}
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          aria-label={`Picture of ${p.name}. Open details`}
          className={`relative shrink-0 overflow-hidden rounded-xl bg-leaf-100 ring-1 ring-leaf-900/10 transition hover:ring-leaf-500 ${
            compact ? "h-14 w-14" : "h-20 w-20"
          }`}
        >
          {p.image ? (
            <Image
              src={p.image.src}
              alt=""
              fill
              sizes="80px"
              className={p.image.fit === "contain" ? "bg-white object-contain" : "object-cover"}
            />
          ) : (
            <ProductIllustration pesticide={p} showName={false} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-leaf-950">{p.name}</h4>
            <TypeBadge type={p.type} />
          </div>
          {p.brand && <p className="mt-0.5 text-xs text-leaf-900/60">Example product: {p.brand}</p>}
          {aiPick && (
            <span className="mt-1.5 inline-block rounded-full bg-leaf-700 px-2 py-0.5 text-[11px] font-medium text-white">
              Suggested
            </span>
          )}
        </div>
      </div>
      <p className="mt-2.5 text-sm text-leaf-900/70">{p.note}</p>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-leaf-100 px-3.5 py-1.5 text-sm font-medium text-leaf-800 transition hover:bg-leaf-200 active:scale-[0.98]"
      >
        <InfoIcon className="h-4 w-4" /> Why use this?
      </button>

      {/* Clicks on the backdrop land on the <dialog> itself (it has no padding), so they close it. */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-3xl bg-white p-0 text-leaf-950 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="max-h-[90dvh] overflow-y-auto">
          <PesticidePhoto pesticide={p} />

          <div className="space-y-5 p-6">
            <header>
              <div className="flex items-start justify-between gap-3">
                <h3 id={titleId} className="text-xl font-semibold tracking-tight">
                  {p.name}
                </h3>
                <TypeBadge type={p.type} />
              </div>
              {p.brand && <p className="mt-1 text-sm text-leaf-900/70">Example product: {p.brand}</p>}
            </header>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-leaf-600">Why it is a good choice</h4>
              <ul className="space-y-2">
                {p.why.map((reason) => (
                  <li key={reason} className="flex gap-2.5 text-sm text-leaf-900/80">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-400" />
                    {reason}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-leaf-600">How to use</h4>
              <p className="text-sm text-leaf-900/80">{p.note}</p>
            </section>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-leaf-600">Where to find it</h4>
              <p className="text-sm text-leaf-900/80">{p.where}</p>
            </section>

            {p.type !== "Organic" && (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                Read the label first. Wear gloves, a mask and long sleeves when mixing and spraying, keep it away from
                ponds and children, and wait out the pre-harvest interval before picking.
              </p>
            )}

            {/* method="dialog" closes the modal without any JavaScript. */}
            <form method="dialog">
              <button type="submit" className="btn-primary w-full">
                Close
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </li>
  );
}

function TypeBadge({ type }: { type: Pesticide["type"] }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${typeStyles[type]}`}>{type}</span>
  );
}

/** An external link, or plain text when there is no URL. */
function MaybeLink({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

/** The pesticide's photo with its credit, or a drawn bottle while there is no photo. */
function PesticidePhoto({ pesticide: p }: { pesticide: Pesticide }) {
  if (!p.image) {
    return (
      <div className="bg-leaf-100">
        <div className="mx-auto h-48 w-40 py-3">
          <ProductIllustration pesticide={p} />
        </div>
        <p className="px-6 pb-4 text-center text-xs text-leaf-800/70">
          Illustration only. The pack you find may look different.
          {p.brand ? ` Look for the name “${p.brand}” on the label.` : " Check the active ingredient on the label."}
        </p>
      </div>
    );
  }
  const contain = p.image.fit === "contain";
  return (
    <figure className="bg-leaf-950">
      <div className={`relative ${contain ? "aspect-square bg-white" : "aspect-[4/3]"}`}>
        <Image
          src={p.image.src}
          alt={p.image.alt}
          fill
          sizes="(min-width: 448px) 448px, 100vw"
          className={contain ? "object-contain" : "object-cover"}
        />
      </div>
      <figcaption className="bg-white px-4 py-2 text-[10px] text-leaf-900/60">
        Photo: <MaybeLink href={p.image.sourceUrl}>{p.image.credit}</MaybeLink>,{" "}
        <MaybeLink href={p.image.licenseUrl}>{p.image.license}</MaybeLink>
      </figcaption>
    </figure>
  );
}

type IconProps = { className?: string };
const svg = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24" } as const;

function InfoIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

