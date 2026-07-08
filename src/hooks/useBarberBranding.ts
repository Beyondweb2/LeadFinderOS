import { useEffect } from "react";

/**
 * Per-route browser branding for barber-facing pages.
 *
 * The app's index.html sets a global LeadFinder <title> and favicon (the right
 * thing for LeadFinder users, the wrong thing for a barber). This hook swaps the
 * document title and favicon to a barber-appropriate one while a barber page is
 * mounted, and RESTORES the originals on unmount — so LeadFinder's own pages keep
 * their branding untouched.
 */

// Amber scissors on a dark rounded tile, inline as an SVG data URI (no asset
// file needed, works across the SPA). DEFAULT favicon — used by the barber booking
// pages (BookingHome, Claim) that don't pass their own.
const FAVICON_HREF = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0E0E10"/><g transform="translate(4 4)" fill="none" stroke="#E6A24B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></g></svg>`,
)}`;

// Neutral, TRADE-AGNOSTIC mark (a simple globe on the same dark rounded tile) for
// yoursites-generic pages that serve every business (the customer login + the owner
// dashboard), so they don't show a barber-specific scissors icon. Callers pass this
// to useBarberBranding's optional 2nd arg; the default stays the scissors above.
export const NEUTRAL_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0E0E10"/><g transform="translate(16 16)" fill="none" stroke="#E2E8F0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="0" r="9"/><path d="M-9 0h18M0 -9v18"/><ellipse cx="0" cy="0" rx="4" ry="9"/></g></svg>`,
)}`;

export function useBarberBranding(title: string | null, faviconHref: string = FAVICON_HREF) {
  useEffect(() => {
    // Favicon — set immediately (no data needed). index.html declares type="image/png";
    // our favicon is an SVG data-URI. If we don't also update the type, some browsers
    // keep the PNG and the swap silently no-ops (page then shows LeadFinder's icon).
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    const created = !link;
    const prevHref = link?.getAttribute("href") ?? null;
    const prevType = link?.getAttribute("type") ?? null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.setAttribute("type", "image/svg+xml");
    link.setAttribute("href", faviconHref);

    // Title — only set once we actually HAVE one; while `title` is null we leave the
    // current title untouched (no flash of a fallback over a correct title).
    const prevTitle = document.title;
    if (title) document.title = title;

    return () => {
      if (title) document.title = prevTitle;
      if (created) {
        link?.remove();
      } else if (link) {
        if (prevHref) link.setAttribute("href", prevHref);
        if (prevType) link.setAttribute("type", prevType); else link.removeAttribute("type");
      }
    };
  }, [title, faviconHref]);
}
