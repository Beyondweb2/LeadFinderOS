/**
 * Decorative graphics for the plumber template — recreated as inline SVG to match
 * the reference theme's richness (gears, tool sketches, topographic lines, water
 * drops, line squares), recoloured to the Deep Marine palette
 * (navy #0F2233 / teal #0E7490 / cyan #06B6D4).
 *
 * All are purely decorative: aria-hidden, pointer-events-none, low opacity, and
 * positioned by the caller via `className`. Plumber-scoped — nothing here is used
 * by the barber/salon templates.
 */
import { Wrench, ShowerHead, Waves, Droplet } from "lucide-react";

const NAVY = "#0F2233";
const TEAL = "#0E7490";
const CYAN = "#06B6D4";

/** One outlined cog (concentric rings + radial teeth). */
function Cog({ cx, cy, r, teeth = 10, stroke = TEAL, w = 2 }: { cx: number; cy: number; r: number; teeth?: number; stroke?: string; w?: number }) {
  const inner = r * 0.6;
  const ticks = Array.from({ length: teeth }, (_, i) => {
    const a = (i / teeth) * Math.PI * 2;
    return { x1: cx + Math.cos(a) * inner, y1: cy + Math.sin(a) * inner, x2: cx + Math.cos(a) * r, y2: cy + Math.sin(a) * r };
  });
  return (
    <g fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round">
      <circle cx={cx} cy={cy} r={inner} />
      <circle cx={cx} cy={cy} r={r * 0.28} />
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
      ))}
    </g>
  );
}

/** Cluster of cogs — used top-right of the About image. */
export function Gears({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 140" className={className} aria-hidden style={{ opacity: 0.14 }}>
      <Cog cx={104} cy={44} r={36} teeth={12} stroke={TEAL} />
      <Cog cx={44} cy={92} r={26} teeth={10} stroke={CYAN} />
    </svg>
  );
}

/** Faint hand-drawn-style tool sketches for the Services section background. Built
 *  from large, low-opacity line icons so it reads as background sketch texture. */
export function ToolSketches({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden style={{ color: TEAL }}>
      <ShowerHead className="absolute h-40 w-40" style={{ top: "6%", left: "4%", opacity: 0.06 }} />
      <Wrench className="absolute h-56 w-56 -rotate-12" style={{ top: "30%", right: "3%", opacity: 0.05 }} />
      <Waves className="absolute h-44 w-44" style={{ bottom: "6%", left: "30%", opacity: 0.05 }} />
      <Droplet className="absolute h-28 w-28" style={{ top: "12%", left: "52%", opacity: 0.06 }} />
    </div>
  );
}

/** Topographic contour lines for the dark FAQ/contact section. */
export function TopoLines({ className = "" }: { className?: string }) {
  const lines = Array.from({ length: 9 }, (_, row) => {
    const baseY = 30 + row * 34;
    const amp = 10 + (row % 3) * 5;
    const pts: string[] = [];
    for (let x = 0; x <= 1200; x += 40) {
      const y = baseY + Math.sin((x / 1200) * Math.PI * 4 + row) * amp;
      pts.push(`${x === 0 ? "M" : "L"}${x},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  });
  return (
    <svg viewBox="0 0 1200 340" preserveAspectRatio="none" className={className} aria-hidden style={{ opacity: 0.14 }}>
      {lines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={CYAN} strokeWidth={1.5} />
      ))}
    </svg>
  );
}

const DROP_PATH = "M12 2s7 8 7 13a7 7 0 1 1-14 0c0-5 7-13 7-13z";

/** Scattered grey/cyan water-drop shapes for the Why-Us background. */
export function DropField({ className = "" }: { className?: string }) {
  const drops = [
    { x: 8, y: 16, s: 2.2, o: 0.10 },
    { x: 78, y: 10, s: 3.0, o: 0.08 },
    { x: 90, y: 64, s: 1.8, o: 0.10 },
    { x: 20, y: 74, s: 2.6, o: 0.07 },
    { x: 54, y: 40, s: 1.4, o: 0.08 },
    { x: 40, y: 88, s: 1.6, o: 0.09 },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      {drops.map((d, i) => (
        <g key={i} transform={`translate(${d.x} ${d.y}) scale(${d.s})`}>
          <path d={DROP_PATH} fill={i % 2 ? CYAN : NAVY} fillOpacity={d.o} />
        </g>
      ))}
    </svg>
  );
}

/** Outlined rounded squares — the hero's left-side line decoration. */
export function SquareLines({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden style={{ opacity: 0.5 }}>
      <g fill="none" stroke={TEAL} strokeOpacity={0.35} strokeWidth={2}>
        <rect x={14} y={14} width={70} height={70} rx={18} transform="rotate(8 49 49)" />
        <rect x={34} y={34} width={70} height={70} rx={18} transform="rotate(-6 69 69)" stroke={CYAN} strokeOpacity={0.3} />
      </g>
    </svg>
  );
}

/** Decorative play glyph (matches the reference's circular-hero play button). Purely
 *  visual — no video, no action, not focusable. */
export function PlayGlyph({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none grid place-items-center rounded-full ${className}`}
      style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 12px 30px -10px rgba(15,34,51,0.5)" }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ marginLeft: 2 }} fill={TEAL} aria-hidden>
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}
