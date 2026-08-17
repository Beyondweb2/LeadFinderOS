/* RELATIVE imports only, with explicit .ts extensions, if this file ever gains any. It is imported
   by supabase/functions/findable-checkout and notify-onboarding-submit, and Deno cannot resolve the
   Vite "@/" alias — there is no deno.json here. Today it imports nothing at all, which is the point:
   a pure decision function with no dependencies can be read by anything. */

/* ============================================================
   CAN WE ACTUALLY SERVE THIS CUSTOMER?

   Delivery works exactly two ways, and there is no third:

     1. Their site is WordPress and we can have access — pages publish to it automatically.
     2. They let us move their site to our hosting, copied exactly as it is — automated from then on.

   Hand-editing a Wix or Squarespace site is about fifteen minutes a page, forever, and does not work
   at a £99 one-off. So somebody who will NOT move and is NOT WordPress-with-access cannot be served,
   and must not be able to pay. Taking their money would mean doing half a job.

   ── THE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────────────────────────────
   A BLOCK ONLY FIRES WHEN WE ARE CERTAIN. Everything uncertain is a conversation, not a rejection.
   Three consequences, each of which was a live bug waiting to happen:

   · The platform question is OPTIONAL. A skip and "not sure" mean WE DON'T KNOW, never "not
     WordPress" — and most owners genuinely do not know what their site is built on. Treating a skip
     as a rejection would turn away WordPress customers we could have delivered for, on the strength
     of a question they were told they could skip.
   · "WordPress with access" means websiteManager === 'direct_access' SPECIFICALLY. "A web company
     looks after it" is plausible, not certain — the web company can refuse. "Nobody, deal with me"
     means there is no web person, not that no access exists. Both are a phone call, so both flag.
   · NO WEBSITE AT ALL IS OUR BEST CASE, NOT A MARGINAL ONE. We build them a site on our hosting:
     nothing to migrate, no platform to work around, fully automated. It serves outright.

   ── DERIVED, NEVER STORED ───────────────────────────────────────────────────────────────────────
   There is deliberately no serve_decision column. A stored verdict freezes old rows at whatever the
   rule was on the day they submitted, and lets the callers drift apart. This function is the single
   source of truth, imported by the questionnaire's save, the checkout's refusal and the notifier's
   labelling, so all three can only ever agree.

   ⚠️ CROSS-REPO SEAM. findable-site carries its own copy of this logic in
   src/lib/serveGate.ts — the two repos cannot import each other. Changing the rule here means a
   matching pass there, the same discipline as findableOffer.ts / site.ts. The SERVER copy is the one
   that actually gates payment; the site's copy only decides what the visitor sees.
   ============================================================ */

/** What their website runs on. `null` = they skipped the question, which is a real and common
 *  answer and must never be read as "not WordPress". */
export type WebsitePlatform =
  | "wordpress" | "wix" | "squarespace" | "godaddy" | "shopify" | "other" | "not_sure" | "no_website";

/** Who can change the site. Only `direct_access` is access we control. */
export type WebsiteManager = "direct_access" | "web_company" | "owner_only";

/** Whether they will let us move the site to our hosting. `null` = not answered. */
export type WillingToMigrate = "yes" | "not_sure" | "no";

export interface ServeInput {
  platform: WebsitePlatform | null;
  manager: WebsiteManager | null;
  migrate: WillingToMigrate | null;
  /** Their own words when platform === 'other'. Used in the reason line and on the refusal screen
   *  so a refusal names the actual platform rather than "another platform". */
  platformOther?: string | null;
}

export type ServeVerdict = "serve" | "flag" | "block";

export interface ServeDecision {
  verdict: ServeVerdict;
  /** Why, in one plain sentence. Shown to Paul in the notification, never to the customer. */
  reason: string;
  /** Machine-readable cause, for the refusal record. */
  code: string;
}

/** Platforms we KNOW we cannot publish to programmatically. Deliberately excludes null, 'not_sure'
 *  and 'no_website': those are not evidence of anything blockable. */
const HAND_EDIT_PLATFORMS = new Set<WebsitePlatform>(["wix", "squarespace", "godaddy", "shopify", "other"]);

/** Human label for the platform, for the reason line and the customer-facing screen. */
export function platformLabel(p: WebsitePlatform | null, other?: string | null): string {
  switch (p) {
    case "wordpress": return "WordPress";
    case "wix": return "Wix";
    case "squarespace": return "Squarespace";
    case "godaddy": return "GoDaddy";
    case "shopify": return "Shopify";
    case "other": return (other ?? "").trim() || "another platform";
    case "not_sure": return "a platform they aren't sure of";
    case "no_website": return "no website yet";
    default: return "a platform they didn't say";
  }
}

/**
 * The gate. Pure, total, and ordered so the SERVE cases are decided before anything can block.
 *
 * Read the order as the argument: every route to yes is checked first, so a block is only ever
 * reached by elimination — which is what "only when certain" means in code.
 */
export function serveDecision(input: ServeInput): ServeDecision {
  const { platform, manager, migrate, platformOther } = input;

  /* ── ROUTES TO YES ─────────────────────────────────────────────────────────────────────────── */

  // No site at all: we build one, on our hosting. The best case there is.
  if (platform === "no_website") {
    return {
      verdict: "serve",
      code: "no_website_we_build_it",
      reason: "No website yet, so we build one on our hosting. Nothing to migrate.",
    };
  }

  // Delivery route 1: WordPress we can get into.
  if (platform === "wordpress" && manager === "direct_access") {
    return {
      verdict: "serve",
      code: "wordpress_with_access",
      reason: "WordPress and we can have access, so pages publish automatically.",
    };
  }

  // Delivery route 2: they will let us move it. Platform stops mattering entirely.
  if (migrate === "yes") {
    return {
      verdict: "serve",
      code: "willing_to_migrate",
      reason: "Happy for us to move the site to our hosting, so the platform doesn't matter.",
    };
  }

  /* ── UNCERTAIN: SERVE, AND TELL PAUL ──────────────────────────────────────────────────────── */

  // They asked to have it explained. That is interest, not refusal.
  if (migrate === "not_sure") {
    return {
      verdict: "flag",
      code: "migrate_not_sure",
      reason: `Not sure about moving the site and wants it explained (on ${platformLabel(platform, platformOther)}). Worth a call.`,
    };
  }

  /* WORDPRESS, BUT THE ACCESS IS NOT CONFIRMED. A web company may hand over a login, and "nobody,
     deal with me" usually means the owner has one. Neither is certain, so neither blocks. */
  if (platform === "wordpress") {
    return {
      verdict: "flag",
      code: "wordpress_access_unconfirmed",
      reason: manager === "web_company"
        ? "WordPress, but a web company controls it and they won't move it. Ask whether the web company will give us access."
        : "WordPress, and they won't move it, but nobody manages the site — the owner probably has a login. Worth asking.",
    };
  }

  /* PLATFORM UNKNOWN. A skip or "not sure" is not evidence of a platform we cannot serve, and it is
     a two-minute check by hand. Refusing money over an unanswered optional question would be the
     worst kind of false negative. */
  if (platform === null || platform === "not_sure") {
    /* Reaching here, migrate is "no" OR null — and since the questionnaire split (2026-08-13) the
       website questions are asked AFTER payment, so every pre-pay row arrives all-null and lands
       exactly on this branch. The old single sentence said "Won't move the site" for an answer
       that was never given; Paul read it as the flow having declined a warm prospect (Ronnie's,
       2026-08-17). An absent answer must never be worded as a refusal. */
    return {
      verdict: "flag",
      code: "platform_unknown",
      reason: migrate === "no"
        ? "Won't move the site and we don't know what it's built on. Check the site by hand before ruling it out."
        : "Website questions not asked yet — they come after payment. Nothing known about the platform, which is normal for a new submission.",
    };
  }

  /* ── CERTAIN WE CANNOT SERVE ───────────────────────────────────────────────────────────────── */

  if (HAND_EDIT_PLATFORMS.has(platform) && migrate === "no") {
    return {
      verdict: "block",
      code: "hand_edit_platform_wont_migrate",
      reason: `On ${platformLabel(platform, platformOther)}, which is hand-editing every page, and will not move it. Cannot deliver at this price.`,
    };
  }

  /* MIGRATE UNANSWERED ON A HAND-EDIT PLATFORM. Reachable only if the question was somehow not
     answered — it is required in the flow, but a direct API call could omit it. Not a block: we
     have not actually been told no. */
  return {
    verdict: "flag",
    code: "migrate_unanswered",
    reason: `On ${platformLabel(platform, platformOther)} and didn't answer whether we can move it. Ask before quoting.`,
  };
}

/** Convenience for the two callers that only care whether payment is allowed. */
export function canReachPayment(input: ServeInput): boolean {
  return serveDecision(input).verdict !== "block";
}

/** Row shape both edge functions read, so neither has to restate the column names. */
export interface ServeGateRow {
  website_platform?: string | null;
  website_platform_other?: string | null;
  website_manager?: string | null;
  willing_to_migrate?: string | null;
}

const PLATFORMS = new Set<string>([
  "wordpress", "wix", "squarespace", "godaddy", "shopify", "other", "not_sure", "no_website",
]);
const MANAGERS = new Set<string>(["direct_access", "web_company", "owner_only"]);
const MIGRATES = new Set<string>(["yes", "not_sure", "no"]);

/** Read a stored row into the gate's inputs. Anything unrecognised becomes null — an unknown value
 *  must degrade to "we don't know", never to a block. */
export function serveInputFromRow(row: ServeGateRow): ServeInput {
  const p = row.website_platform ?? "";
  const m = row.website_manager ?? "";
  const w = row.willing_to_migrate ?? "";
  return {
    platform: PLATFORMS.has(p) ? (p as WebsitePlatform) : null,
    manager: MANAGERS.has(m) ? (m as WebsiteManager) : null,
    migrate: MIGRATES.has(w) ? (w as WillingToMigrate) : null,
    platformOther: row.website_platform_other ?? null,
  };
}
