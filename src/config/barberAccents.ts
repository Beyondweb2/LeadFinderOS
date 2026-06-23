/**
 * Barber site accent colours — the ONE place to edit the palette options offered
 * to barbers (pre-sign-in swatch dock on /s/:token AND the post-auth Site Editor).
 *
 * Add / remove / reorder freely; both surfaces read from this list. `hex` drives
 * the site's `content.accentColor` (the template derives the whole palette from it).
 * The first entry is treated as the default amber.
 */
export interface BarberAccent {
  name: string;
  hex: string;
}

/** Default amber — selecting this means "inherit the default" (no override stored). */
export const BARBER_ACCENT_DEFAULT_HEX = "#E6A24B";

export const BARBER_ACCENTS: BarberAccent[] = [
  { name: "Amber", hex: "#E6A24B" },
  { name: "Barber red", hex: "#CE4B45" },
  { name: "Steel blue", hex: "#5B8FC9" },
  { name: "Forest green", hex: "#46A06A" },
  { name: "Burgundy", hex: "#A8455F" },
  { name: "Slate", hex: "#8C97AB" },
];
