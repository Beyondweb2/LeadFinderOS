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
// file needed, works across the SPA).
const FAVICON_HREF = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0E0E10"/><g transform="translate(4 4)" fill="none" stroke="#E6A24B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></g></svg>`,
)}`;

export function useBarberBranding(title: string) {
  useEffect(() => {
    const prevTitle = document.title;

    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    const created = !link;
    const prevHref = link?.getAttribute("href") ?? null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }

    document.title = title;
    link.setAttribute("href", FAVICON_HREF);

    return () => {
      document.title = prevTitle;
      if (created) {
        link?.remove();
      } else if (link && prevHref) {
        link.setAttribute("href", prevHref);
      }
    };
  }, [title]);
}
