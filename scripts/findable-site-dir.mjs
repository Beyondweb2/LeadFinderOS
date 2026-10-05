/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHICH findable-site CHECKOUT THE CROSS-REPO TESTS READ — one place (2026-10-05).

   Developer tooling only: the tests that compare LeadFinderOS with findable-site SOURCE (the sync
   check, the onboarding copy, the audit fields, the sales / self-sourced pages) all resolve the folder
   here. Production code never reads it.

     1. FINDABLE_SITE_DIR            an explicit checkout (unchanged override — always wins)
     2. ../findable-site-current     the CLEAN clone of findable-site origin/master
                                     (C:/Users/paulj/findable-site-current; LeadFinderOS-wt/ has a
                                     junction of the same name to it)
     3. ../findable-site             the old sibling — on this machine a stale mirror (the 2026-10-05
                                     manual-onboarding "failure" was this copy 3 commits behind master)

   Refresh the clean clone after a findable-site merge:
     git -C C:/Users/paulj/findable-site-current pull --ff-only
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { existsSync } from 'node:fs';
import path from 'node:path';

export function findableSiteDir(root) {
  if (process.env.FINDABLE_SITE_DIR) return path.resolve(process.env.FINDABLE_SITE_DIR);
  const current = path.resolve(root, '..', 'findable-site-current');
  if (existsSync(path.join(current, 'src'))) return current;
  return path.resolve(root, '..', 'findable-site');
}
