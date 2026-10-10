import Scanner from '@/components/Scanner';

const detectable = [
  'Aphids',
  'Flea beetle',
  'Fruit & shoot borer',
  'Thrips',
  'Healthy leaf',
  'Healthy plant',
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-leaf-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-leaf-700 text-white">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4"
            >
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
          </span>
          EggplantCare
        </span>
      </nav>

      <section className="mx-auto w-full max-w-5xl px-5 pb-8 pt-6 text-center sm:pt-12">
        <h1 className="text-4xl font-semibold tracking-tight text-leaf-950 sm:text-5xl">
          Identify eggplant pests
          <span className="block text-leaf-500">in seconds.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-leaf-900/70">
          Snap a photo of a leaf or fruit. Get the diagnosis, the right
          pesticide and a step-by-step treatment plan.
        </p>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 pb-16">
        <Scanner />
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 pb-16">
        <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-leaf-600">
          What it can detect
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {detectable.map((d) => (
            <span
              key={d}
              className="rounded-full bg-white px-4 py-2 text-sm text-leaf-800 ring-1 ring-leaf-900/10"
            >
              {d}
            </span>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-leaf-900/5 py-6 text-center text-xs text-leaf-900/50">
        Developed By Iyam Laman
      </footer>
    </main>
  );
}
