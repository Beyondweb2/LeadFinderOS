/**
 * Lightweight, dependency-free carousel shared by site templates.
 *
 * Replaces Swiper for the service slider / review rail in the reference themes.
 * Pure CSS scroll-snap for the track (native touch/trackpad swipe) plus optional
 * prev/next buttons and dot pagination driven by a scroll listener. Theme-agnostic:
 * the consumer supplies all classNames so each template skins it (no shared colours).
 *
 * Usage:
 *   <Carousel slideClassName="basis-full sm:basis-1/2 lg:basis-1/3" gapClassName="gap-6">
 *     {items.map(it => <Card key={it.id} … />)}
 *   </Carousel>
 */
import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface CarouselProps {
  children: ReactNode;
  /** Per-slide width via flex-basis utilities, e.g. "basis-full sm:basis-1/2". */
  slideClassName?: string;
  /** Gap utility between slides, e.g. "gap-6". */
  gapClassName?: string;
  /** Extra classes on the outer wrapper. */
  className?: string;
  /** Extra classes on the scroll track. */
  trackClassName?: string;
  showArrows?: boolean;
  showDots?: boolean;
  /** Class for the prev/next buttons (template-skinned). */
  arrowClassName?: string;
  /** Class for an inactive dot. */
  dotClassName?: string;
  /** Class added to the active dot. */
  dotActiveClassName?: string;
  ariaLabel?: string;
}

export function Carousel({
  children,
  slideClassName = "basis-full",
  gapClassName = "gap-6",
  className = "",
  trackClassName = "",
  showArrows = true,
  showDots = true,
  arrowClassName = "",
  dotClassName = "",
  dotActiveClassName = "",
  ariaLabel = "carousel",
}: CarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slides = Children.toArray(children);
  const [active, setActive] = useState(0);

  // Track which slide is centred-most as the user scrolls/swipes.
  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const children = Array.from(track.children) as HTMLElement[];
    if (children.length === 0) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    children.forEach((child, i) => {
      const childCenter = child.offsetLeft + child.clientWidth / 2;
      const dist = Math.abs(childCenter - center);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    setActive(nearest);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.addEventListener("scroll", handleScroll, { passive: true });
    return () => track.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const children = Array.from(track.children) as HTMLElement[];
    const target = children[Math.max(0, Math.min(index, children.length - 1))];
    if (target) {
      track.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    }
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => scrollToIndex(active + dir),
    [active, scrollToIndex],
  );

  return (
    <div className={`relative ${className}`} role="group" aria-label={ariaLabel}>
      <div
        ref={trackRef}
        className={`flex ${gapClassName} overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${trackClassName}`}
      >
        {slides.map((slide, i) => (
          <div key={i} className={`shrink-0 grow-0 snap-start ${slideClassName}`}>
            {slide}
          </div>
        ))}
      </div>

      {showArrows && slides.length > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => step(-1)}
            className={arrowClassName}
          >
            <span aria-hidden="true">&larr;</span>
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => step(1)}
            className={arrowClassName}
          >
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      )}

      {showDots && slides.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === active}
              onClick={() => scrollToIndex(i)}
              className={`${dotClassName} ${i === active ? dotActiveClassName : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
