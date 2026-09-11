/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DERIVATION — raw business facts in, template variables out.

   🔴 THIS REPO OWNS THIS LOGIC. Paul's call, 2026-09-11, and the reason is structural rather than
   tidiness: when a prospect replies, the mockup renders inside a Supabase EDGE FUNCTION, so the
   logic has to live where the server can reach it. It was ported from the design session's
   `src/render.mjs` (`buildData`), which is now downstream of this file — two copies would drift
   and the design preview would stop matching what a prospect actually receives.

   ⛔ THE DIVISION OF LABOUR, AND IT IS THE WHOLE CONTRACT:
     · THIS file decides what a value IS.           (is there a price? is the fee known?)
     · The TEMPLATE decides what it looks like.     (mockupRender.ts substitutes, and derives nothing)
   A template must never need to compute, and this file must never emit markup.

   ⛔ PAIRED BOOLEANS EXIST BECAUSE `{{#if}}` HAS NO `{{else}}`. `fee.none` / `fee.charged` /
   `fee.unknown`, `areas_timed` / `areas_untimed`, `reviews_linked` / `reviews_unlinked`,
   `services_flat`, `no_owner_name`, `prices_none`, `img.no_hero`. They are not redundancy — the
   renderer deliberately supports only four constructs, so the alternative branch has to be a
   value.

   🔴 ABSENCE IS NEVER A CLAIM, AND ON THIS PAGE THAT RULE HAS TEETH. `no_callout_fee` has THREE
   states: true = "no call-out fee", false = "there is one, and you are told first", absent = we
   have not asked, so the page asserts NEITHER. Collapsing absent into either direction is how
   "no call-out fee" gets printed for a business that charges one.
   ⛔ AND `dbs_checked` / `mla_member` ARE NEVER SET WITHOUT EVIDENCE (Paul, explicitly,
   2026-09-11). They are credentials. Inventing one is the single worst thing this generator
   could do, and "never claim MLA" is already on RG Locksmiths' must-not-say list.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { MOCKUP_STOCK, type StockImage } from "./mockupStock.ts";
import { classifyPoolImage } from "./mockupAsset.ts";

/* ── Caps ────────────────────────────────────────────────────────────────────────────────────
   ⚠️ THESE ARE THE TEMPLATE'S CAPS, NOT THE SCRAPER'S, and they are deliberately separate from
   MOCKUP_MAX_* in mockupNiche.ts. The scraper's caps bound what is STORED; these bound what is
   LAID OUT, and the layout is why the numbers differ — see AREA cap below. */
export const CAP_SERVICES = 6;
/** ⚠️ SIX, not the registry's MOCKUP_MAX_AREAS of 8. `area_rows` renders the home town PLUS the
 *  areas, so 6 areas is already a 7-row panel. Raising it is a layout decision, not a data one. */
export const CAP_AREAS = 6;
export const CAP_PRICES = 6;
/** The gallery is a 4x2 grid: one 2x2 feature cell plus four singles fills it exactly. */
export const PHOTO_SLOTS = 5;

/* ── Types ──────────────────────────────────────────────────────────────────────────────────── */

export interface RawBusiness {
  name?: string; trade?: string; town?: string;
  owner_first_name?: string; postcode?: string; phone?: string; whatsapp?: string;
  address?: string; email?: string; hours?: string;
  rating?: string | number; review_count?: string | number;
  established?: string | number; response_time?: string; google_reviews_url?: string;
}
export interface RawService { name?: string; price?: string; description?: string; category?: string }
export interface RawPrice { label?: string; amount?: string; note?: string }
export interface RawPoolImage { url: string; local?: string; alt?: string | null; width?: number | null }

export interface MockupRaw {
  business?: RawBusiness;
  services?: RawService[];
  areas?: string[];
  prices?: RawPrice[];
  /** The ranked pool. ⛔ ALREADY ORDERED BY THE PICKER — this file never re-ranks. */
  images?: RawPoolImage[];
  /** Operator-PLACED images, slot name → URL. Always wins over the pool. */
  img?: Record<string, string>;
  photo_captions?: Record<string, string | { caption?: string; alt?: string }>;
  headline_price?: { service?: string; from?: string } | null;
  owner_bio?: string;
  /** 🔴 THREE-STATE. true / false / absent are three different pages. */
  no_callout_fee?: boolean | null;
  /** 🔴 CREDENTIALS. Never set without evidence. */
  dbs_checked?: boolean | null;
  mla_member?: boolean | null;
  area_times?: Record<string, string>;
  /** 🔴 Typed testimonials. Never set on the product path — see the derivation's note. */
  reviews?: Array<{ quote?: string; name?: string; place?: string; role?: string; placeholder?: boolean }>;
  /** Where stock images are served from. */
  stock_base?: string;
  /** Off by default: the photo SECTION, not the hero. */
  photo_section?: boolean;
}

/** Required, and the render REFUSES rather than shipping a blank. Mirrors mockupRender's rule. */
export const DERIVE_REQUIRED = ["business.name", "business.trade", "business.town"] as const;

export class MissingRaw extends Error {
  constructor(public readonly fields: string[]) {
    super(`render refused: required field(s) missing — ${fields.join(", ")}`);
    this.name = "MissingRaw";
  }
}

/* ── Helpers, ported to match the source's semantics exactly ─────────────────────────────────── */

/** Absence is absence. Ported verbatim: an empty array/object/blank string is all falsey. */
export function truthy(v: unknown): boolean {
  if (v == null || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return v !== 0 && Number.isFinite(v);
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return String(v).trim() !== "";
}

/** Digits (and a leading +) for tel: and wa.me links. */
const digits = (s: unknown): string => (s ? String(s).replace(/[^\d+]/g, "") : "");

/* Names that are site furniture rather than photographs of the work.
   🔴 `logo` AND `badge` ARE NOT HERE. They are kept in the pool and excluded from the GALLERY by
   classification instead (classifyPoolImage), because the operator places them in their own
   slots — a badge is credential proof, not junk, but it is emphatically not a gallery photo.
   ⚠️ The social names stay: a Facebook glyph is furniture in both senses. */
const POOL_FURNITURE =
  /(?:sprite|icon|favicon|pixel|spacer|placeholder|1x1|blank|loader|spinner|avatar|flag|arrow|chevron|star|cookie|facebook|twitter|instagram|linkedin|whatsapp|youtube|watermark)/i;

/* ── The monogram ────────────────────────────────────────────────────────────────────────────
   Trade and legal-form words carry no identity, so they are skipped: "First4locks Ltd -
   Locksmiths Speke" is F, not FL. */
const MARK_SKIP = new Set(["the", "and", "of", "ltd", "limited", "co", "company", "services",
  "service", "locksmith", "locksmiths", "security", "locks", "lock", "auto", "mobile",
  "emergency", "key", "keys", "24", "7"]);

export function markInitials(name: unknown): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  const words = raw.split(/[\s\-–—]+/).filter(Boolean);
  if (!words.length) return "";
  /* ⚠️ DIGITS COUNT. "A1 Locksmiths" is branded A1, and stripping the 1 left a single letter
     "A" — a weaker mark than the one the business already uses. */
  const first = words[0].replace(/[^A-Za-z0-9]/g, "");
  if (/^[A-Z0-9]{2,3}$/.test(first) && /[A-Z]/.test(first)) return first;
  const pick = words.map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter((w) => w && !MARK_SKIP.has(w.toLowerCase()));
  const use = (pick.length ? pick : words.map((w) => w.replace(/[^A-Za-z]/g, "")).filter(Boolean)).slice(0, 2);
  return use.map((w) => w[0].toUpperCase()).join("");
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const str = (v: unknown) => String(v ?? "").trim();

/* ── The derivation ─────────────────────────────────────────────────────────────────────────── */

export function deriveMockup(raw: MockupRaw, opts: { now?: Date } = {}): Record<string, unknown> {
  const b = raw.business ?? {};
  const missing = DERIVE_REQUIRED.filter((p) => {
    const key = p.split(".")[1] as keyof RawBusiness;
    return !truthy(b[key]);
  });
  if (missing.length) throw new MissingRaw(missing as unknown as string[]);

  const now = opts.now ?? new Date();
  const year = now.getUTCFullYear();

  const services = (raw.services ?? []).slice(0, CAP_SERVICES);
  const areas = (raw.areas ?? []).slice(0, CAP_AREAS);
  const prices = (raw.prices ?? []).slice(0, CAP_PRICES);

  /* ⛔ STOCK NEVER ENTERS THE HERO, by construction rather than by a conditional someone could
     later "fix": there is simply no stock branch for it. img.hero is only ever an
     operator-placed real photograph. */
  const placed = raw.img ?? {};
  const img: Record<string, string | boolean> = {
    hero: placed.hero ?? "",
    work: placed.work ?? "",
    proof: placed.proof ?? "",
  };
  /* The hero's CSS-only art layer is OPAQUE, so it must not render when a real photo exists —
     it painted straight over the photograph on the design session's first build. */
  img.no_hero = !truthy(img.hero);
  for (const slot of ["bg_urgent", "bg_prices", "bg_faq", "bg_contact", "owner"]) {
    img[slot] = placed[slot] ?? "";
  }

  /* Photos: real first, stock fills the gap, stock is never captioned as their work. */
  const heroUrls = new Set(Object.values(placed).filter(Boolean));
  /* 🔴 THE FURNITURE FILTER IS BELT-AND-BRACES AND A GOLDEN DIFF PROVED IT NECESSARY. The first
     port assumed the caller hands over an already-cleaned pool — true on the product path, where
     the harvester's IMG_SKIP and the pool's demoteReason have both run. But run against the
     design session's own sample input it put `twitter.png`, `facebook.png` and `logo.svg` into
     the gallery AS THE BUSINESS'S PHOTOGRAPHS. "The layer above cleaned it" is the assumption
     this project has been bitten by repeatedly; the filter costs nothing and makes the function
     correct on its own. */
  const realPool = (raw.images ?? [])
    .filter((p) => p && typeof p.url === "string" && !heroUrls.has(p.url))
    .filter((p) => !POOL_FURNITURE.test(p.url))
    /* ⛔ ONLY PHOTOGRAPHS REACH THE GALLERY. A Yell badge in a photo grid reads as a stray advert
       for Yell on the prospect's own page. It still lives in the pool for its own slot. */
    .filter((p) => classifyPoolImage({ url: p.url, alt: p.alt ?? null, width: p.width ?? null },
                                     raw.business?.name).kind === "photo");
  const photos = raw.photo_section === false
    ? []
    : buildPhotos(realPool, raw.photo_captions ?? {}, raw.stock_base ?? "/mockup-stock/");

  const areasLine = areas.length
    ? (areas.length === 1 ? areas[0] : `${areas.slice(0, -1).join(", ")} and ${areas[areas.length - 1]}`)
    : "";

  return {
    year,
    business: {
      ...b,
      phone_digits: digits(b.phone),
      whatsapp_digits: digits(b.whatsapp),
      // A rating means nothing without a count behind it, and vice versa.
      has_reviews: truthy(b.rating) && truthy(b.review_count),
      reviews_linked: truthy(b.rating) && truthy(b.review_count) && truthy(b.google_reviews_url),
      reviews_unlinked: truthy(b.rating) && truthy(b.review_count) && !truthy(b.google_reviews_url),
      no_owner_name: !truthy(b.owner_first_name),
      no_reviews: !(truthy(b.rating) && truthy(b.review_count)),
      mark: markInitials(b.name),
    },
    services: services.map((s, i) => ({ ...s, index: pad2(i + 1) })),
    /* The three the hero leads with. `no_price` is a paired flag, not an absence — a service
       with no price must render as itself rather than as a blank cell. */
    services_top3: services.slice(0, 3).map((s, i) => ({
      ...s, index: pad2(i + 1), no_price: !truthy(s.price),
    })),
    ...deriveServiceGroups(services),
    headline_price: deriveHeadlinePrice(raw, prices),
    owner: deriveOwner(raw, b, year),
    /* ── TRUST: TWO FIXED, TWO TYPED ───────────────────────────────────────────────────────
       FIXED is template copy describing a TECHNIQUE and a PROCESS, not a promise about a
       specific firm. TYPED is data, and absent means NO CLAIM AT ALL. */
    trust_fixed: [
      { title: "Non-destructive entry", icon: "pick",
        note: "The lock is picked or bypassed, so it still works afterwards." },
      { title: "Price agreed before work starts", icon: "tag",
        note: "You get the figure first. Nothing starts until you have it." },
    ],
    trust_typed: [
      ...(raw.no_callout_fee === true
        ? [{ title: "No call-out fee", icon: "coin", note: "You are quoted for the job, not for turning up." }] : []),
      ...(raw.dbs_checked === true
        ? [{ title: "DBS checked", icon: "shield", note: "Certificate available on request before work starts." }] : []),
      /* ⚠️ "member … verifiable on the register", NEVER "approved" or "inspected" — those are
         specific MLA grades and claiming the wrong one is the DBS mistake in a new coat. */
      ...(raw.mla_member === true
        ? [{ title: "Master Locksmiths Association", icon: "rosette", note: "Member — verifiable on the MLA register." }] : []),
    ],
    /* ── TESTIMONIALS ─────────────────────────────────────────────────────────────────────
       🔴 TYPED ONLY, AND THE PRODUCT PATH NEVER SETS THEM. `rawFromMockupRow` does not populate
       `reviews`, so a prospect mockup renders NO testimonials at all. Fabricating a customer
       quote for a business is inventing a record about a third party — the single clearest
       version of the no-invented-data rule.
       ⛔ THE PLACEHOLDER FLAG DEFAULTS TO "PLACEHOLDER" (`!== false`, not `=== true`), which is
       the safe direction: a quote must PROVE it is real to be presented as real. The design
       session's samples carry placeholder quotes so the layout can be judged; they are marked as
       such and this repo carries the same rule rather than a different one. */
    reviews: (raw.reviews ?? []).slice(0, 3).map((r) => {
      const name = str(r?.name);
      return {
        quote: str(r?.quote),
        name,
        place: str(r?.place),
        role: str(r?.role),
        /* An initial in a circle rather than a customer photograph: we have none and will not
           fake one, and an initial is derived from a name we were given rather than invented. */
        initial: name ? name[0].toUpperCase() : "",
        placeholder: r?.placeholder !== false,
      };
    }).filter((r) => truthy(r.quote)),
    reviews_are_placeholder: (raw.reviews ?? []).some((r) => r?.placeholder !== false),
    fee: {
      none: raw.no_callout_fee === true,
      charged: raw.no_callout_fee === false,
      unknown: raw.no_callout_fee !== true && raw.no_callout_fee !== false,
    },
    /* Their own words in the hero sentence. The template used to hardcode "lock openings, lock
       changes and uPVC door repairs", which is simply wrong for an auto locksmith who cuts car
       keys — and one of the real test businesses is exactly that. */
    services_lead: (() => {
      const t = services.slice(0, 3).map((x) => str(x.name)).filter(Boolean).join(", ").toLowerCase();
      return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
    })(),
    areas,
    areas_line: areasLine,
    prices,
    prices_none: prices.length === 0,
    photos,
    has_real_photos: photos.some((p) => !p.is_stock),
    photos_all_stock: photos.length > 0 && photos.every((p) => p.is_stock),
    img,
    ...deriveAreaRows(b, areas, raw.area_times ?? {}),
    /* ⛔ THE MAP PANEL IS OFF AND STAYS OFF HERE. It needs a Static Maps key, and Google's terms
       restrict storing and republishing Places content — a map baked into an asset we send is
       exactly the case to avoid. The template renders correctly with it off. */
    map: { enabled: false, off: true, image: "", year, areas_line: areasLine },
  };
}

/* ── Service groups ──────────────────────────────────────────────────────────────────────────
   ⛔ A CATEGORY IS NEVER GUESSED FROM A NAME. "Car Key Replacement" looks automotive and
   "Emergency Door Opening" looks like emergency, but a keyword rule would file "Emergency car key
   replacement" under whichever word it happened to test first, and silently mis-file every
   service whose wording does not match its list. No category on the row → no group.
   ORDER: emergency leads, because a locksmith's most urgent customer is the one standing outside
   their own door. Automotive is last — a different customer, not a worse one. */
function deriveServiceGroups(services: RawService[]) {
  const ORDER = ["emergency", "residential", "commercial", "automotive"];
  const LABEL: Record<string, string> = { residential: "Residential", commercial: "Commercial",
    automotive: "Automotive", emergency: "Emergency" };
  const keyed = services.map((x, i) => ({
    ...x, index: pad2(i + 1),
    _cat: typeof x.category === "string" ? x.category.trim().toLowerCase() : "",
  }));
  if (!keyed.some((x) => x._cat)) return { service_groups: [], services_flat: true };
  const groups: Array<{ label: string; items: typeof keyed; unlabelled?: boolean }> = [];
  for (const cat of ORDER) {
    const items = keyed.filter((x) => x._cat === cat);
    if (items.length) groups.push({ label: LABEL[cat], items });
  }
  /* A blank category, or a word outside the four, keeps its place at the END with no heading
     rather than being assigned a guess. */
  const rest = keyed.filter((x) => !ORDER.includes(x._cat));
  if (rest.length) groups.push({ label: "", items: rest, unlabelled: true });
  return { service_groups: groups, services_flat: false };
}

/* ── The headline price ──────────────────────────────────────────────────────────────────────
   A typed one wins outright; otherwise it is the LOWEST plain published band, with its own label.
   ⛔ SURCHARGES ARE EXCLUDED. An amount containing "+" is an addition to another price, not a
   price — taking the lowest band blindly printed "Out of hours surcharge from +£25", which is
   both meaningless and the cheapest-looking number on the page.
   ⛔ NOTHING IS INVENTED: no prices → no headline price → the clause drops out of the subhead. */
function deriveHeadlinePrice(raw: MockupRaw, prices: RawPrice[]) {
  const typed = raw.headline_price;
  if (typed && typeof typed === "object" && truthy(typed.service) && truthy(typed.from)) {
    return { service: str(typed.service), from: str(typed.from) };
  }
  let best: { n: number; service: string; from: string } | null = null;
  for (const band of prices) {
    const amount = str(band?.amount);
    const label = str(band?.label);
    if (!amount || !label || amount.includes("+")) continue;
    const n = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (!best || n < best.n) best = { n, service: label, from: amount };
  }
  return best ? { service: best.service, from: best.from } : null;
}

/* ── The owner ───────────────────────────────────────────────────────────────────────────────
   ⛔ TYPED, NEVER GENERATED. No model writes this and nothing infers it from the trade — an
   invented sentence about who somebody IS would be the worst thing on their own site. The bio is
   the only requirement; the portrait and the year are optional inside it. */
function deriveOwner(raw: MockupRaw, b: RawBusiness, nowYear: number) {
  const bio = str(raw.owner_bio);
  if (!bio) return null;
  const y = parseInt(String(b.established ?? ""), 10);
  return {
    bio,
    name: str(b.owner_first_name),
    established: str(b.established),
    /* Only a plausible year AND at least two back: "1 year" reads worse than saying nothing, and
       a typo like 20111 must never print "18095 years". */
    years: Number.isFinite(y) && y > 1900 && y <= nowYear - 2 ? String(nowYear - y) : "",
  };
}

/* ── Response times by area ──────────────────────────────────────────────────────────────────
   ⛔ A TIME IS NEVER INVENTED. `area_times` is typed per business and keyed by area name. An area
   with no entry renders blank, and if NO area has a time the section renders the areas alone.
   Absent means absent, in both directions. */
function deriveAreaRows(b: RawBusiness, areas: string[], areaTimes: Record<string, string>) {
  const lookup: Record<string, string> = {};
  for (const [k, v] of Object.entries(areaTimes)) lookup[k.trim().toLowerCase()] = str(v);
  const mk = (area: string | undefined, home: boolean) => ({
    area, time: lookup[str(area).toLowerCase()] ?? "", home, no_time: false,
  });
  const rows = [mk(b.town, true), ...areas.map((a) => mk(a, false))];
  const anyTime = rows.some((r) => truthy(r.time));
  /* "Ask when you call" only when OTHER areas do have times — a blank beside five filled rows
     reads as missing data, but on a list with no times at all there is no column to explain. */
  if (anyTime) for (const r of rows) r.no_time = !truthy(r.time);
  return { area_rows: rows, areas_timed: anyTime, areas_untimed: !anyTime };
}

/* ── The photo section ───────────────────────────────────────────────────────────────────────
   Real photos always beat stock; stock fills the gap and NEVER enters the hero.
   ⚠️ Stock comes from src/lib/mockupStock.ts, NOT from a directory listing — the design session
   reads the folder because it has one, but an edge function has no filesystem, and one hardcoded
   source is what stops the two sets diverging. */
function buildPhotos(
  realPool: RawPoolImage[],
  captions: Record<string, string | { caption?: string; alt?: string }>,
  base: string,
) {
  const photos: Array<{ src: string; caption: string; alt: string; is_stock: boolean; uncaptioned: boolean }> = [];
  for (const p of realPool) {
    if (photos.length >= PHOTO_SLOTS) break;
    /* A REAL photo may carry a SPECIFIC caption — it is their own work — and it is
       OPERATOR-TYPED. Nothing scrapes a caption: inventing one would be captioning a photograph
       nobody here has seen. Keyed by URL so it survives re-ordering. */
    const c = captions[p.url] ?? {};
    const caption = typeof c === "string" ? c : (c.caption ?? "");
    photos.push({
      src: p.local ?? p.url,
      caption,
      /* Alt falls back to the SUBJECT, never a claim about whose work it is. */
      alt: (typeof c === "object" ? c.alt : undefined) ?? caption ?? "Lock work",
      is_stock: false,
      uncaptioned: !truthy(caption),
    });
  }
  for (const s of MOCKUP_STOCK as StockImage[]) {
    if (photos.length >= PHOTO_SLOTS) break;
    /* ⛔ A PLACEHOLDER IS NEVER A PHOTOGRAPH. Three of the six stock files are still labelled
       SVGs reading "REPLACE WITH stock-0N"; without this the gallery would ship two of them to a
       prospect. A short honest gallery beats a padded one. */
    if (s.placeholder) continue;
    photos.push({ src: `${base.replace(/\/$/, "")}/${s.path.split("/").pop()}`,
      caption: s.caption, alt: s.alt, is_stock: true, uncaptioned: false });
  }
  return photos;
}
