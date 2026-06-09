import { BarberSiteTemplate } from "@/templates/barber/BarberSiteTemplate";
import { demoContent } from "@/templates/barber/demoContent";

/**
 * Public, unauthenticated barber site preview at /p/:slug.
 * For now this always renders the placeholder demo content;
 * real per-slug data wiring comes later.
 */
export default function BarberSite() {
  return <BarberSiteTemplate content={demoContent} />;
}
