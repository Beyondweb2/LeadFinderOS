/**
 * Barber-facing identity shown on the claim / login pages.
 *
 * IMPORTANT: this is what a barber sees — it must NEVER say "LeadFinder" or
 * reference the lead-hunting product. It exists to reassure a barber that the
 * cold claim link is from a real person they can reach.
 */

/** Who set up the site (shown as "Set up by {name}"). */
export const SETUP_BY_NAME = "Paul";

/**
 * Contact for barber questions — an email or a phone number. Leave empty to hide
 * the "questions?" part. Set this before sending links to real barbers.
 */
export const SUPPORT_CONTACT: string = "beyondwebcraft@outlook.com";

/** mailto:/tel: href derived from SUPPORT_CONTACT (undefined when unset). */
export const supportContactHref = SUPPORT_CONTACT
  ? SUPPORT_CONTACT.includes("@")
    ? `mailto:${SUPPORT_CONTACT}`
    : `tel:${SUPPORT_CONTACT.replace(/[^\d+]/g, "")}`
  : undefined;
