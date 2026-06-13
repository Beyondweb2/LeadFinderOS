import { useEffect } from "react";

/**
 * Per-route browser branding for a public generated site (/p/:slug), unified
 * across templates.
 *
 * The app's index.html sets a global LeadFinder <title> and favicon (right for
 * LeadFinder users, wrong for a barber/salon). This hook swaps the document
 * title and the favicon to a template-appropriate one while the page is mounted,
 * and RESTORES the originals on unmount — so LeadFinder's own pages keep their
 * branding untouched.
 *
 * It is a SINGLE effect (one favicon set per render), unlike calling two
 * separate branding hooks — which would fight over the favicon.
 */

type Template = "barber" | "salon";

// Amber scissors on a dark tile — the barber mark (kept identical to the
// original useBarberBranding favicon).
const BARBER_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0E0E10"/><g transform="translate(4 4)" fill="none" stroke="#E6A24B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></g></svg>`,
)}`;

// Rose bloom on a warm off-white tile — the salon mark.
const SALON_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#FAF6F3"/><g transform="translate(16 16)" fill="none" stroke="#C08497" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="0" r="2.6"/><path d="M0 -2.6V-8M0 2.6V8M2.6 0H8M-2.6 0H-8M1.84 -1.84 5.66 -5.66M-1.84 1.84 -5.66 5.66M1.84 1.84 5.66 5.66M-1.84 -1.84 -5.66 -5.66"/></g></svg>`,
)}`;

export function useSiteBranding(title: string, template: Template) {
  const favicon = template === "salon" ? SALON_FAVICON : BARBER_FAVICON;
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
    link.setAttribute("href", favicon);

    return () => {
      document.title = prevTitle;
      if (created) {
        link?.remove();
      } else if (link && prevHref) {
        link.setAttribute("href", prevHref);
      }
    };
  }, [title, favicon]);
}
