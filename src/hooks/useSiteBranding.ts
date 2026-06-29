import { useEffect } from "react";
import { getTemplateDef } from "@/templates/registry";

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
 * separate branding hooks — which would fight over the favicon. The favicon for
 * each vertical is resolved from the template registry (one place to add more).
 */

export function useSiteBranding(title: string | null, template: string) {
  const favicon = getTemplateDef(template).favicon;
  useEffect(() => {
    // Favicon — set immediately (depends only on the template, not on loaded data).
    // index.html declares type="image/png"; our template favicons are SVG data-URIs.
    // Without updating the type some browsers keep the PNG and the swap silently
    // no-ops (the page then shows LeadFinder's icon). Set + restore it too.
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
    link.setAttribute("href", favicon);

    // Title — only set once we actually HAVE one. While `title` is null (data still
    // loading) we leave the document title untouched, so the correct per-barber title
    // the edge function put in the served HTML never flashes to a fallback first.
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
  }, [title, favicon]);
}
