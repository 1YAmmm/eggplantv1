import { useCallback, useEffect, useState } from "react";

/** Sliding-window limiter: at most `max` clicks per `windowMs`. Plain code, so it works without React. */
export function createClickLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  let clicks: number[] = [];
  const prune = () => {
    const t = now();
    clicks = clicks.filter((c) => t - c < windowMs);
  };
  return {
    /** Milliseconds until another click is allowed; 0 when one is allowed now. */
    waitMs(): number {
      prune();
      return clicks.length >= max ? clicks[0] + windowMs - now() : 0;
    },
    /** Counts a click. */
    record() {
      prune();
      clicks.push(now());
    },
  };
}

/**
 * Click limit for a button that calls a server or a paid API, so it cannot be spammed. Call `record()` when a
 * request is actually sent; `waitSeconds` counts down while the button must stay disabled. The server keeps its
 * own limits too: this one is only to stop accidental or rapid clicking from the page itself.
 */
export function useClickLimit(max: number, windowMs: number) {
  const [limiter] = useState(() => createClickLimiter(max, windowMs));
  const [waitSeconds, setWaitSeconds] = useState(0);

  const sync = useCallback(() => {
    const wait = limiter.waitMs();
    setWaitSeconds(wait > 0 ? Math.ceil(wait / 1000) : 0);
  }, [limiter]);

  const limited = waitSeconds > 0;
  useEffect(() => {
    if (!limited) return;
    const timer = setInterval(sync, 500);
    return () => clearInterval(timer);
  }, [limited, sync]);

  const record = useCallback(() => {
    limiter.record();
    sync();
  }, [limiter, sync]);
  const isLimited = useCallback(() => limiter.waitMs() > 0, [limiter]);

  return { waitSeconds, record, isLimited };
}
