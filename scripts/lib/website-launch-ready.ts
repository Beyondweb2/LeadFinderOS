/* A Website Build record that has GENUINELY cleared every launch gate (src/lib/websiteLaunch.ts
   productionReadiness), for the suites that assert what production generates once it is allowed.
   Fix workstream 6 (2026-10-04): production used to unlock on a recorded preview URL alone, so the old
   tests only had to record project + preview + domain. Now the build result must be PREVIEW READY by
   LeadFinderOS's own gate, every preview QA tick set, and the form switched on when the site has one —
   this fixture says all of that explicitly, so a test never passes by leaving a gate unread.
   Raw (pre-parse) shape: the suites build their state with parseWebsiteBuild.
   Ranking protection (2026-10-10, oldPages.ts): an existing-site fixture records its old home page and a
   passing preview fetch of it; a no-old-site fixture records "no old site" explicitly — never left out. */

import { QA_ITEMS } from '../../src/lib/websiteBuildState.ts';
import { CONTENT_INTENTS } from '../../src/lib/websiteQuality.ts';

export function clearedForProduction(raw: Record<string, unknown>, opts: { existingSite: boolean }): Record<string, unknown> {
  const project = String(raw.cloudflare_project ?? '');
  const preview = String(raw.preview_url ?? '');
  const oldSite = String(raw.source_site_url ?? '') || 'https://old-site.example';
  const oldPages = opts.existingSite
    ? { site_url: oldSite, recorded_at: '2026-10-04T08:00:00Z', read_from: 'full_crawl', urls: [{ path: '/', source: 'crawl', important: true, reasons: ['homepage'], target: '/', home_reason: '' }] }
    : { none_at: '2026-10-04T08:00:00Z', none_reason: 'Fixture: the client has never had a website', urls: [] };
  const oldCheck = opts.existingSite ? { base: preview, results: [{ path: '/', target: '/', hops: [], final_status: 200, final_path: '/', soft_404: false, noindex: false, problem: '' }] } : undefined;
  return {
    ...raw,
    /* A state that already RECORDS its old pages (or no old site) keeps them; an empty record gets the fixture's. */
    old_pages: (raw.old_pages as { urls?: unknown[]; none_at?: string } | undefined)?.urls?.length || (raw.old_pages as { none_at?: string } | undefined)?.none_at ? raw.old_pages : oldPages,
    preview_status: 'deployed', preview_noindex_confirmed: true,
    qa: Object.fromEntries(QA_ITEMS.filter((q) => q.group === 'preview').map((q) => [q.key, true])),
    quality: {
      strengths: [], strengths_reviewed: true,
      intents: Object.fromEntries(CONTENT_INTENTS.map((k) => [k, { need: 'not_needed', page: '', note: 'not needed for this fixture' }])),
    },
    form: { enabled: true, site_key: project || 'fixture-site', recipient: 'owner@example.co.uk', thanks_path: '', enabled_at: '2026-10-04T00:00:00Z' },
    build_execution: {
      started_at: '2026-10-04T09:00:00Z', completed_at: '2026-10-04T10:00:00Z',
      result_imported_at: '2026-10-04T10:00:00Z', result_status: 'preview_ready',
      preview_url: preview, cloudflare_project: project, noindex_confirmed: true, commit_hash: 'abc1234',
      qa: { buildPassed: true, seedContaminationPassed: true, linksPassed: true, responsivePassed: true, schemaPassed: true },
      pages: ['/'],
      ...(oldCheck ? { old_urls: oldCheck } : {}),
      ...(opts.existingSite ? { upgrade: { verdict: 'upgrade', widths: [1440, 390], still_stronger: [], notes: '' } } : {}),
      standard: {
        heroImage: 'genuine', mobileHero: 'integrated', areasVisual: 'map', reviews: 'shown', rating: 'shown', ratingAsOf: 'October 2026',
        form: 'site_enquiry', formTest: 'passed', credentialsProminent: true, photographyPreserved: true, photosUsed: 3, repeatedImages: [],
      },
    },
  };
}
