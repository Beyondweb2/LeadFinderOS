/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS A PHOTOGRAPH, THEIR LOGO, OR A CREDENTIAL BADGE?

   🔴 PAUL'S CORRECTION, 2026-09-11, AND IT REVERSED WHAT THIS CODE USED TO DO. The harvester and
   the pool both treated anything matching /logo|badge/ as FURNITURE and dropped it. They are the
   opposite of junk:
     · THEIR OWN LOGO is better than anything we could generate, and a prospect seeing it on the
       mockup understands instantly that the page is theirs.
     · THE DIRECTORY BADGES (Bark, Checkatrade, Yell, MyBuilder) are CREDENTIAL PROOF that nothing
       else in this system can source — no scraper reads accreditations.
   So they are kept and SEPARATED, never discarded.

   ⛔ AND A BADGE MUST NEVER BE OFFERED AS A HERO OR A GALLERY PHOTO. A 170x99 Yell badge stretched
   across a hero is the most obviously broken thing this generator could produce. Enforced by
   `assetAllowedInSlot`, server-side, the same way stock is refused in the hero.

   ════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 THE SIGNAL ORDER IS MEASURED, AND IT IS NOT THE ORDER YOU WOULD GUESS. Measured over
   First4locks' real 29-image pool (dimensions, aspect and alpha channel read from the actual
   bytes, 2026-09-11):

     · NAME AND ALT TEXT ARE DECISIVE. All five non-photographs were caught by filename or alt
       alone — "bark-reviews.png"/"Bark logo", "reviews yell_PNG.png"/"Yell.com logo",
       "reviews my builder_PNG.png"/"My Builder logo", and "First 4 Locks.jpg" twice.
     · ⛔ TRANSPARENCY IS A WEAK SIGNAL HERE AND WOULD HAVE MISCLASSIFIED IN BOTH DIRECTIONS.
       bark-reviews.png has NO alpha channel, while two genuine PHOTOGRAPHS do
       ("new image for home page_PNG.png" — a door with a locksmith — and "shop shutter_PNG.png").
       Alpha alone would have dropped a real badge and promoted two real photos.
     · ⛔ SMALL DIMENSIONS ARE CURRENTLY UNSAFE. The badges are 116x99 to 232x99 — but two real
       photographs measured 146x98 and 147x98, because they are Wix LQIP placeholders. Size would
       have called those badges. It becomes usable once the pool is re-gathered with the
       placeholder fix, which is exactly why it is a corroborating hint and never a verdict.
     · Aspect ratio separates a wide logo (2.48) from most photographs, but a 1.5 photo and a 1.17
       badge overlap, so it cannot decide alone either.

   ⛔ THEREFORE: a NAME/ALT match classifies. The shape hints can only CORROBORATE a name match or
   mark something as UNCERTAIN for the operator to glance at. They never reclassify on their own.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type AssetKind = "photo" | "logo" | "badge";

export interface PoolAsset {
  url: string;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  /** Whether the file carries an alpha channel, when it has been measured. */
  alpha?: boolean | null;
}

export interface AssetVerdict {
  kind: AssetKind;
  /** Shown to the operator so a wrong call is correctable rather than mysterious. */
  reason: string;
  /** True when the shape hints disagree with the verdict — worth a glance, never auto-changed. */
  uncertain?: boolean;
}

/* ── The directories whose badges are worth having ───────────────────────────────────────────
   ⚠️ MATCHED ON A NORMALISED STRING (lowercased, non-alphanumerics stripped) because the real
   filenames are "reviews my builder_PNG.png" and "reviews yell_PNG.png" — spaced, cased and
   suffixed. Normalising is what turns "my builder" into "mybuilder". */
const DIRECTORY_TOKENS = [
  "checkatrade", "yell", "bark", "trustpilot", "mybuilder", "ratedpeople",
  "mla", "nsi", "safecontractor", "trustatrader", "which",
];

/* ⛔ THE SHORT TOKENS NEED A STRONGER FORM, because this project has been fooled by substrings
   twice already ("bing" matches plum-BING, "acca" matches M-ACCA-Gas). "which" appears inside
   ordinary words and "mla" and "nsi" inside plenty of filenames, so those three only match when
   they stand alone or carry a directory-ish qualifier. */
const NEEDS_QUALIFIER = new Set(["which", "mla", "nsi"]);
const QUALIFIERS = ["approved", "member", "registered", "trusted", "trader", "logo", "badge",
  "accredited", "certified", "couk", "com"];

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function fileAndAlt(a: PoolAsset): string {
  let file = "";
  try { file = decodeURIComponent(new URL(a.url).pathname.split("/").pop() ?? ""); } catch { file = a.url; }
  return norm(`${file} ${a.alt ?? ""}`);
}

/** Which directory this looks like, or null. */
export function directoryBadge(a: PoolAsset): string | null {
  const hay = fileAndAlt(a);
  for (const token of DIRECTORY_TOKENS) {
    if (!hay.includes(token)) continue;
    if (!NEEDS_QUALIFIER.has(token)) return token;
    /* A qualifier must be present for the ambiguous short tokens. */
    if (QUALIFIERS.some((q) => hay.includes(q))) return token;
  }
  return null;
}

/** Does this look like the business's OWN logo? */
export function looksLikeOwnLogo(a: PoolAsset, businessName: string | null | undefined): boolean {
  const hay = fileAndAlt(a);
  if (/\blogo\b/i.test(String(a.alt ?? "")) || hay.includes("logo")) {
    /* "logo" in the name is only THEIR logo if it is not a directory's. */
    if (!directoryBadge(a)) return true;
  }
  /* The business name, normalised. "First4locks Ltd - Locksmiths Speke" -> "first4locks…", and
     the file is "First 4 Locks.jpg" -> "first4locks". The trade and legal-form words are stripped
     so a match is on the DISTINCTIVE part rather than on the word "locksmiths". */
  const core = norm(String(businessName ?? "")
    .replace(/\b(ltd|limited|llp|plc|co|company|services?|locksmiths?|security|the|and)\b/gi, " ")
    .split(/[-–—,|]/)[0]);
  if (core.length >= 4 && hay.includes(core)) return true;
  return false;
}

/** Shape hints. Deliberately advisory — see the header. */
function shapeSaysNotPhoto(a: PoolAsset): boolean {
  const w = Number(a.width) || 0, h = Number(a.height) || 0;
  if (a.alpha === true) return true;
  if (w && h) {
    if (Math.max(w, h) <= 260) return true;             // badge-scale
    if (w / h >= 2.2) return true;                      // a wide lockup, not a photograph
  }
  try { if (/\.svg(?:$|\?)/i.test(new URL(a.url).pathname)) return true; } catch { /* ignore */ }
  return false;
}

/**
 * Classify one pool image.
 *
 * ⛔ ORDER MATTERS: a directory badge is checked BEFORE the own-logo test, because "Yell.com logo"
 * contains the word "logo" and is emphatically not their logo.
 */
export function classifyPoolImage(a: PoolAsset, businessName?: string | null): AssetVerdict {
  const dir = directoryBadge(a);
  if (dir) {
    return { kind: "badge", reason: `${dir} badge`, uncertain: !shapeSaysNotPhoto(a) };
  }
  if (looksLikeOwnLogo(a, businessName)) {
    return { kind: "logo", reason: "their own logo", uncertain: !shapeSaysNotPhoto(a) };
  }
  /* ⛔ A SHAPE HINT ALONE NEVER RECLASSIFIES — it would have called two of First4locks' real
     photographs badges, purely because they were Wix placeholders at 146x98. */
  return { kind: "photo", reason: "photograph", uncertain: shapeSaysNotPhoto(a) };
}

/* ── Slots ───────────────────────────────────────────────────────────────────────────────────
   The template declares slot NAMES freely (that is the contract), so this works on names rather
   than on a registry: a slot called `logo` takes the logo, `badges` takes badges, everything else
   takes photographs. */

/** Slot names that take the business's own logo. */
export const LOGO_SLOTS = ["logo", "header_logo", "brand"];
/** Slot names that take credential badges, and take SEVERAL. */
export const BADGE_SLOTS = ["badges", "badge_row", "accreditations"];

export function slotWants(slot: string): AssetKind {
  const s = String(slot ?? "").trim().toLowerCase();
  if (LOGO_SLOTS.includes(s)) return "logo";
  if (BADGE_SLOTS.includes(s)) return "badge";
  return "photo";
}

/** Does a slot take more than one image? */
export function slotIsMulti(slot: string): boolean {
  return BADGE_SLOTS.includes(String(slot ?? "").trim().toLowerCase());
}

/**
 * May this asset go in this slot?
 *
 * 🔴 THE RULE THAT MATTERS: a badge is never a hero and never a gallery photograph. A 170x99 Yell
 * badge stretched across a hero is the most obviously broken output this generator could make —
 * and unlike a wrong photo, it would be obviously wrong to the prospect too.
 * ⚠️ A LOGO IS ALLOWED IN A LOGO SLOT ONLY. It is a lockup on a transparent-ish background, not a
 * photograph, so it fails in a hero for exactly the same reason.
 */
export function assetAllowedInSlot(kind: AssetKind, slot: string): { ok: boolean; detail: string } {
  const wants = slotWants(slot);
  if (wants === kind) return { ok: true, detail: "" };
  if (wants === "photo") {
    return { ok: false, detail: `'${slot}' takes a photograph — a ${kind} there would be stretched and obviously wrong` };
  }
  return { ok: false, detail: `'${slot}' takes ${wants === "badge" ? "credential badges" : "the business's own logo"}, not a ${kind}` };
}
