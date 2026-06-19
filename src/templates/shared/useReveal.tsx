/**
 * Scroll-reveal primitive shared by site templates.
 *
 * Rebuilds the "rise into view" feel of the classic WOW.js/animate.css
 * fadeInUp/fadeInLeft scroll reveals — but natively, with an IntersectionObserver
 * and CSS transitions (no jQuery/WOW dependency). Honours
 * `prefers-reduced-motion`: reduced-motion users get the content immediately,
 * fully visible, with no transform/transition.
 *
 * Usage:
 *   <Reveal direction="up" delay={120}>…section…</Reveal>
 *   const { ref, visible } = useReveal();   // for bespoke cases (e.g. count-up trigger)
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

/** True when the user has asked the OS to reduce motion. Reactive to changes. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

interface UseRevealOptions {
  /** Fraction of the element visible before it triggers (0–1). */
  threshold?: number;
  /** Reveal only once (default) or re-hide when scrolled away. */
  once?: boolean;
  /** Observer root margin — default fires slightly before fully in view. */
  rootMargin?: string;
}

/** Observe an element and report when it scrolls into view. */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseRevealOptions = {},
) {
  const { threshold = 0.15, once = true, rootMargin = "0px 0px -10% 0px" } = options;
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No IntersectionObserver (very old browser / SSR) → just show it.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) obs.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        });
      },
      { threshold, rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once, rootMargin]);

  return { ref, visible };
}

type RevealDirection = "up" | "left" | "right" | "none";

interface RevealProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Slide-in direction for the reveal (fade is always applied). */
  direction?: RevealDirection;
  /** Travel distance in px before settling. */
  distance?: number;
  /** Stagger delay in ms (mirrors data-wow-delay). */
  delay?: number;
  /** Transition duration in ms. */
  duration?: number;
  /** Trigger only once (default) or repeat on re-entry. */
  once?: boolean;
}

function offsetFor(direction: RevealDirection, distance: number): string {
  switch (direction) {
    case "up":
      return `0, ${distance}px`;
    case "left":
      return `-${distance}px, 0`;
    case "right":
      return `${distance}px, 0`;
    default:
      return "0, 0";
  }
}

/**
 * Wrapper that fades + slides its children into view on scroll. Defaults give the
 * gentle "rise into view" feel (fade + 24px up over 700ms). Reduced-motion users
 * see it instantly with no animation.
 */
export function Reveal({
  children,
  direction = "up",
  distance = 24,
  delay = 0,
  duration = 700,
  once = true,
  style,
  ...rest
}: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const { ref, visible } = useReveal<HTMLDivElement>({ once });

  // Reduced motion → render plainly, no transform/transition.
  const revealStyle: CSSProperties = reduced
    ? {}
    : {
        opacity: visible ? 1 : 0,
        transform: visible ? "translate(0, 0)" : `translate(${offsetFor(direction, distance)})`,
        transition: `opacity ${duration}ms cubic-bezier(0.2, 0.6, 0.2, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.2, 0.6, 0.2, 1) ${delay}ms`,
        willChange: "opacity, transform",
      };

  return (
    <div ref={ref} style={{ ...revealStyle, ...style }} {...rest}>
      {children}
    </div>
  );
}
