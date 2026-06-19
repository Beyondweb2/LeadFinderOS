/**
 * Count-up primitive shared by site templates.
 *
 * Rebuilds the odometer "0 → N" number roll used in the reference themes, natively
 * via requestAnimationFrame (no odometer.js). Pass `start` (typically a reveal's
 * `visible`) so the count begins when the stat scrolls into view. Honours
 * `prefers-reduced-motion`: reduced-motion users jump straight to the target.
 *
 * Uses requestAnimationFrame timestamps only (no Date.now), so it is safe in this
 * environment and resilient to tab backgrounding.
 */
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./useReveal";

interface UseCountUpOptions {
  /** Animation length in ms. */
  duration?: number;
  /** Begin counting when true (e.g. once the element is revealed). */
  start?: boolean;
}

export function useCountUp(target: number, options: UseCountUpOptions = {}): number {
  const { duration = 1500, start = true } = options;
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    if (reduced || typeof requestAnimationFrame === "undefined") {
      setValue(target);
      return;
    }
    let raf = 0;
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const progress = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start, reduced]);

  return value;
}
