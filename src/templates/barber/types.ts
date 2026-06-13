/**
 * Content contract for the barbershop site template.
 *
 * The actual shape now lives in the shared, presentation-agnostic
 * `../shared/content.ts` (so the salon template can reuse the exact same
 * payload). This file preserves the historical `Barber*` names as thin aliases
 * so every existing import (`BarberSiteContent`, `BarberService`, …) keeps
 * working unchanged.
 */

export type {
  SiteService as BarberService,
  SiteOpeningHours as BarberOpeningHours,
  SiteStat as BarberStat,
  SiteContent as BarberSiteContent,
} from "../shared/content";
