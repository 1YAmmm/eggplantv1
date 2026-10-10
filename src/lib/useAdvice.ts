import { useEffect, useState } from "react";
import type { Advice } from "./advice";

export type AdviceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; advice: Advice; by: string }
  | { status: "unavailable" };

/**
 * Fetches the suggested (AI-written) treatment plan for a diagnosed pest. The static advice is already on screen, so "unavailable"
 * (AI down, out of quota, rate-limited, or a reply that failed the server's checks) just means it stays that way.
 */
export function useAdvice(label: string, enabled: boolean): AdviceState {
  const [done, setDone] = useState<{ label: string; state: AdviceState } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { advice?: Advice; by?: string } | null;
        const state: AdviceState =
          res.ok && data?.advice ? { status: "ready", advice: data.advice, by: data.by ?? "AI" } : { status: "unavailable" };
        setDone({ label, state });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDone({ label, state: { status: "unavailable" } });
      });
    return () => controller.abort();
  }, [label, enabled]);

  if (!enabled) return { status: "idle" };
  return done?.label === label ? done.state : { status: "loading" };
}
