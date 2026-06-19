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

export function useSiteBranding(title: string, template: string) {
  const favicon = getTemplateDef(template).favicon;
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
