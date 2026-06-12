import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Globe, Calendar, MessageSquare, Bell, Check, type LucideIcon } from "lucide-react";
import { prefersReducedMotion } from "./london";

const SHELL_BG =
  "radial-gradient(1100px 600px at 85% -8%, rgba(230,162,75,0.10), transparent 60%)," +
  "radial-gradient(800px 500px at -10% 8%, rgba(230,162,75,0.05), transparent 55%)";

/** Fire `inView` once the element first scrolls into view. */
function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** Eased count-up from 0 → `to`, started when `start` flips true. Honours
 *  prefers-reduced-motion (jumps straight to the final value). */
function CountUp({ to, suffix = "", duration = 1400, start }: {
  to: number; suffix?: string; duration?: number; start: boolean;
}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion()) { setVal(to); return; }
    let raf = 0;
    let t0 = 0;
    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, to, duration]);
  return <>{val}{suffix}</>;
}

function FeaturePill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-zinc-200">
      <Icon className="h-4 w-4 text-amber" />
      {label}
    </span>
  );
}

function MiniStat({ prefix, to, suffix, label, start }: {
  prefix?: string; to: number; suffix: string; label: string; start: boolean;
}) {
  return (
    <div>
      <div className="font-display text-2xl text-amber sm:text-3xl">
        {prefix ? <span className="mr-1 align-middle text-base text-amber-soft sm:text-lg">{prefix}</span> : null}
        <CountUp to={to} suffix={suffix} start={start} />
      </div>
      <div className="mt-0.5 text-xs text-zinc-400">{label}</div>
    </div>
  );
}

/** Honest "coming soon" upsell for online booking + SMS reminders. Register-
 *  interest only (no buy-now); stats are general appointment-reminder research,
 *  cited and labelled as not barbershop-specific. */
export function BookingUpsell({ onNotify, interested }: { onNotify: () => void; interested: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-2xl border border-amber/25 bg-ink-card p-6 sm:p-8"
      style={{ backgroundImage: SHELL_BG }}
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-soft">
        Coming soon
      </div>

      <h2 className="mt-4 font-display text-3xl uppercase tracking-wide text-white sm:text-4xl">
        Get more clients, stop the no-shows
      </h2>

      <div className="mt-5 flex flex-wrap gap-2">
        <FeaturePill icon={Globe} label="Custom domain" />
        <FeaturePill icon={Calendar} label="Online booking (24/7)" />
        <FeaturePill icon={MessageSquare} label="SMS reminders" />
      </div>

      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
        <MiniStat prefix="up to" to={38} suffix="%" start={inView} label="fewer no-shows with SMS reminders" />
        <MiniStat prefix="~" to={34} suffix="%" start={inView} label="average drop in missed appointments" />
      </div>

      <div className="mt-6">
        <Button
          onClick={onNotify}
          disabled={interested}
          className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft disabled:opacity-100"
        >
          {interested ? (
            <><Check className="mr-2 h-4 w-4" /> We'll notify you</>
          ) : (
            <><Bell className="mr-2 h-4 w-4" /> I'm interested — notify me</>
          )}
        </Button>
      </div>

      <p className="mt-5 text-[11px] leading-snug text-zinc-600">
        Figures are from general appointment-reminder research, not barbershop-specific — Imperial
        College London study; systematic review of reminder studies.
      </p>
    </div>
  );
}
