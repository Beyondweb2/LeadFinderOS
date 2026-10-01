/* What a quick (hook) audit's questions were written around (2026-10-01): the services verified on the
   business's own website (serviceEvidence.ts, via _shared/hook-services.ts), or the trade + town fallback
   and why. Stored on the run as results.hook.basis and shown as "Audit based on …". A type-only leaf. */
export interface QuestionBasis {
  source: 'crawl' | 'fallback';
  /** The verified services the questions were written around (crawl), most prominent first. */
  services: string[];
  /** Why the fallback was used: no_website · crawl_failed · no_services_found · not_checked. */
  reason: string | null;
  /** The crawl row the services came from. */
  crawledAt: string | null;
  /** True when a fresh stored crawl was reused (no new crawl). */
  reused: boolean;
}
