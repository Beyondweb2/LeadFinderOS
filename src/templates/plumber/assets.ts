/**
 * Stock placeholders for the plumber template.
 *
 * Unlike the barber/salon templates (which bundle photographic .jpg stock), the
 * plumber template ships SELF-CONTAINED, branded SVG placeholders as data URIs —
 * Deep-Marine gradient panels that mark each image slot. There is NO external
 * request and nothing to break. Real photography is supplied later by the
 * separate Apify image build (operator picks Google/Maps images); these are the
 * "designed-in image areas" until then.
 */

const NAVY = "#0F2233";
const TEAL = "#0E7490";
const CYAN = "#06B6D4";

/** Build a compact branded gradient placeholder as an SVG data URI. */
function placeholder(label: string, w: number, h: number): string {
  const min = Math.min(w, h);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='xMidYMid slice'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${NAVY}'/><stop offset='1' stop-color='${TEAL}'/></linearGradient></defs>` +
    `<rect width='${w}' height='${h}' fill='url(#g)'/>` +
    `<circle cx='${w * 0.82}' cy='${h * 0.18}' r='${min * 0.22}' fill='${CYAN}' opacity='0.16'/>` +
    `<circle cx='${w * 0.12}' cy='${h * 0.88}' r='${min * 0.14}' fill='${CYAN}' opacity='0.12'/>` +
    `<text x='50%' y='50%' fill='#CFE8F0' opacity='0.85' text-anchor='middle' dominant-baseline='middle' ` +
    `font-family='system-ui,-apple-system,sans-serif' font-weight='700' font-size='${Math.round(min * 0.07)}'>${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const STOCK_HERO = placeholder("Your photo here", 1200, 1000);
export const STOCK_ABOUT = placeholder("About us", 900, 1100);
export const STOCK_APPROACH = placeholder("Our work", 960, 1040);

/** Per-service fallback images (index-aligned to the default service order). */
export const STOCK_SERVICES: string[] = [
  placeholder("Bathroom & kitchen", 800, 600),
  placeholder("Blocked drains", 800, 600),
  placeholder("Leaks & repairs", 800, 600),
  placeholder("Boilers & heating", 800, 600),
  placeholder("Emergency call-outs", 800, 600),
  placeholder("General plumbing", 800, 600),
];

/** Stable fallback for a service card by position (wraps the list). */
export function stockServiceImage(index: number): string {
  return STOCK_SERVICES[index % STOCK_SERVICES.length];
}
