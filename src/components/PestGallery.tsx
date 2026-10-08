"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { PestImage } from "@/lib/pests";

export default function PestGallery({ images }: { images: PestImage[] }) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const current = images[active];

  function goTo(i: number) {
    const track = trackRef.current;
    if (!track) return;
    const index = (i + images.length) % images.length;
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
    setActive(index);
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (index !== active) setActive(index);
  }

  return (
    <figure className="bg-leaf-950">
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((img, i) => (
            <div key={img.src} className="relative h-full w-full shrink-0 snap-center">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(min-width: 672px) 672px, 100vw"
                className="object-cover"
                priority={i === 0}
              />
            </div>
          ))}
        </div>

        <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-leaf-900 backdrop-blur">
          Reference photo · {active + 1}/{images.length}
        </span>

        <button
          type="button"
          onClick={() => goTo(active - 1)}
          aria-label="Previous photo"
          className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-leaf-900 shadow backdrop-blur transition hover:bg-white sm:flex"
        >
          <Chevron className="h-4 w-4 rotate-180" />
        </button>
        <button
          type="button"
          onClick={() => goTo(active + 1)}
          aria-label="Next photo"
          className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-leaf-900 shadow backdrop-blur transition hover:bg-white sm:flex"
        >
          <Chevron className="h-4 w-4" />
        </button>

        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-2 pt-8 text-white">
          <p className="text-sm font-medium">{current.alt}</p>
          <p className="pointer-events-auto mt-0.5 text-[10px] text-white/75">
            Photo:{" "}
            <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
              {current.credit}
            </a>
            ,{" "}
            <a href={current.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
              {current.license}
            </a>
          </p>
        </figcaption>
      </div>

      <div className="flex gap-2 overflow-x-auto bg-white px-4 py-3 [scrollbar-width:none]">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show photo ${i + 1}`}
            aria-current={i === active}
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl transition ${
              i === active ? "ring-2 ring-leaf-600 ring-offset-2" : "opacity-60 hover:opacity-100"
            }`}
          >
            <Image src={img.src} alt="" fill sizes="56px" className="object-cover" />
          </button>
        ))}
      </div>
    </figure>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
