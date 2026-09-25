/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CLOUDFLARE PAGES — how a client site reaches its preview and production, per deployment mode.

   One place writes the deploy steps for every prompt and command block (Build Execution, Retry,
   Preview Deployment, Production Deployment and the PowerShell packs). Before this (BS4 pilot,
   2026-09-25, F17) every one of them hard-coded Wrangler direct upload, while the normal Findable
   client project is Git-connected in the operator's own Cloudflare account — which Wrangler on
   this machine cannot see, and which a direct upload cannot deploy to at all.

   ⛔ GIT-CONNECTED needs no Wrangler sign-in: a push to a branch IS the deploy. The project is
      linked in the Cloudflare dashboard by the operator; if it is not linked yet, the build STOPS
      and prints the exact dashboard steps. A push made before the link does not build — so after
      the operator confirms, push again (an empty commit when nothing changed). All learned on BS4.
   ⛔ The production branch holds only a placeholder until go-live, so linking the project can never
      publish the site to production.
   ⛔ '' (not chosen) is refused, never read as a default mode.
   Browser-only (no edge function reaches it).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { CLOUDFLARE_MODE_LABELS, type WebsiteBuildState } from './websiteBuildState.ts';

export const DEFAULT_PREVIEW_BRANCH = 'preview';
/** Git-connected: production is a separate branch that stays a placeholder until go-live. */
export const DEFAULT_GIT_PRODUCTION_BRANCH = 'live';
export const DEFAULT_UPLOAD_PRODUCTION_BRANCH = 'main';

const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

export function cloudflareBranches(s: WebsiteBuildState): { production: string; preview: string } {
  const production = s.cloudflare_production_branch.trim() || (s.cloudflare_mode === 'git_connected' ? DEFAULT_GIT_PRODUCTION_BRANCH : DEFAULT_UPLOAD_PRODUCTION_BRANCH);
  const preview = s.cloudflare_preview_branch.trim() || DEFAULT_PREVIEW_BRANCH;
  return { production, preview };
}

/** The address that stays the same between preview builds: the preview branch's alias. */
export function stablePreviewUrl(s: WebsiteBuildState, project = s.cloudflare_project): string {
  const alias = cloudflareBranches(s).preview.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);
  return 'https://' + alias + '.' + project + '.pages.dev';
}

/** What stops a deployment being described. '' = fine. */
export function cloudflareModeProblem(s: WebsiteBuildState): string {
  if (!s.cloudflare_mode) return 'Cloudflare deployment mode not chosen (Project details → Preview)';
  const b = cloudflareBranches(s);
  if (!BRANCH.test(b.production) || !BRANCH.test(b.preview)) return 'Cloudflare branch names may use letters, numbers, . _ / - only';
  if (b.production === b.preview) return 'The Cloudflare preview branch must not be the production branch';
  if (s.cloudflare_mode === 'git_connected' && b.production === 'main') return 'Git-connected: the production branch must not be main — main would publish every push to production. Use a separate branch (e.g. live) that stays a placeholder until go-live';
  return '';
}

export const modeLabel = (s: WebsiteBuildState) => (s.cloudflare_mode ? CLOUDFLARE_MODE_LABELS[s.cloudflare_mode] : 'NOT CHOSEN');

export interface DeployInput { s: WebsiteBuildState; project: string; path: string; remote: string; owner: string; repo: string; buildCommand: string; outputDir: string }

/** The operator's one-time dashboard steps for a Git-connected project. */
export function dashboardSetupSteps(d: DeployInput): string[] {
  const b = cloudflareBranches(d.s);
  const acct = d.s.cloudflare_account.trim();
  return [
    '1. dash.cloudflare.com' + (acct ? ' — switch to the "' + acct + '" account (account switcher, top left).' : ' — make sure you are in the client\'s Cloudflare account.'),
    '2. Workers & Pages → Create → Pages → Import an existing Git repository.',
    '3. Connect GitHub as ' + d.owner + '. If ' + d.repo + ' is not listed: Configure GitHub App and give it access to that repository only.',
    '4. Select ' + d.repo + ' → Begin setup.',
    '5. Project name: ' + d.project + ' (exactly). Production branch: ' + b.production + '. Framework preset: Astro. Build command: ' + d.buildCommand + '. Build output directory: ' + d.outputDir + '. Root directory and environment variables: leave blank.',
    '6. Save and Deploy. The first ' + b.production + ' build shows as failed or skipped — expected: that branch is only a placeholder.',
    '7. Do NOT add a custom domain and do NOT touch DNS.',
  ];
}

/** Build Execution / Preview Deployment: how to get the PREVIEW up, per mode. Prompt lines. */
export function previewDeploySteps(d: DeployInput): string[] {
  const s = d.s, b = cloudflareBranches(s), url = stablePreviewUrl(s, d.project);
  if (!s.cloudflare_mode) return ['- ⛔ The deployment mode is not chosen in LeadFinderOS. Do NOT deploy: set status "built" and put "Cloudflare deployment mode not chosen" in errors.'];
  if (s.cloudflare_mode === 'manual') return [
    '- Deployment is MANUAL / not configured for this client. Do NOT deploy anything and do not create a Cloudflare project.',
    '- Push the code, set status "built", and put "Preview deployment not configured (manual mode)" in errors.',
  ];
  if (s.cloudflare_mode === 'direct_upload') return [
    '- Mode: Direct Wrangler upload' + (s.cloudflare_account ? ' (account: ' + s.cloudflare_account + ')' : '') + '.',
    '- npx wrangler whoami. If wrangler is not signed in / not authorised, or shows a different account: do NOT guess credentials — set status "built" and put the exact operator step in errors ("run npx wrangler login in ' + d.path + '").',
    '- Project ' + d.project + ': if it does not exist, npx wrangler pages project create ' + d.project + ' --production-branch ' + b.production + ' (a new project for THIS client; never reuse another client\'s).',
    '- Build with tracking OFF for the preview (no analytics / ads tags emitted, whatever the config holds): "' + d.buildCommand + '".',
    '- Deploy the preview: npx wrangler pages deploy ' + d.outputDir + ' --project-name ' + d.project + ' --branch ' + b.preview + '. The stable preview address is ' + url + '. Record the deployment ID.',
  ];
  return [
    '- Mode: GIT-CONNECTED Cloudflare Pages' + (s.cloudflare_account ? ' in the "' + s.cloudflare_account + '" account' : '') + '. A push to a branch IS the deploy. ⛔ Do not use Wrangler and do not ask for a Wrangler sign-in.',
    '- Branches: production = ' + b.production + ' (⛔ never push the site to it — go-live is a separate, approved step); preview = ' + b.preview + '.',
    '- If ' + b.production + ' does not exist on origin yet, create it as a PLACEHOLDER so linking the project publishes nothing: an orphan branch holding only a README ("Production branch — nothing is published here until go-live"), commit message ending "[CI Skip]", pushed with "git push origin ' + b.production + '". Then switch back to main.',
    '- Build locally first with tracking OFF (no analytics / ads tags emitted): "' + d.buildCommand + '" must pass.',
    '- Push the site: git push origin main, then git push origin main:' + b.preview + ' (the preview branch follows main).',
    '- Is the Pages project connected? Fetch ' + url + ' (retry for up to 3 minutes). An SSL / connection error, or a Cloudflare 522 / 404 for the whole host, means the project is not linked to ' + d.remote + ' yet.',
    '- If it is NOT connected: STOP. Set status "built", put "Cloudflare Pages project not connected to GitHub yet" in errors, and put these exact dashboard steps in warnings for Paul:',
    ...dashboardSetupSteps(d).map((x) => '      ' + x),
    '  After Paul confirms, push the preview branch AGAIN — a push made before the link does not build: git commit --allow-empty -m "Trigger preview build" then git push origin main main:' + b.preview + '.',
    '- If it IS connected: wait for the build (poll ' + url + ' every 15 seconds for up to 10 minutes) and confirm it serves THIS commit (look for something only this build contains). The stable preview address is ' + url + '. The deployment ID is shown only in the Cloudflare dashboard — leave it "" rather than guess.',
    '- Every *.pages.dev address must be noindexed: public/_headers with "https://:project.pages.dev/*" and "https://:branch.:project.pages.dev/*" → X-Robots-Tag: noindex. The production domain stays indexable.',
  ];
}

/** Production deployment steps (prompt lines), per mode. Only ever used after Paul approves the preview. */
export function productionDeploySteps(d: DeployInput): string[] {
  const s = d.s, b = cloudflareBranches(s);
  if (!s.cloudflare_mode) return ['⛔ The deployment mode is not chosen in LeadFinderOS — do not deploy.'];
  if (s.cloudflare_mode === 'manual') return ['⛔ Deployment is manual / not configured for this client — do not deploy. Tell Paul.'];
  if (s.cloudflare_mode === 'direct_upload') return ['npx wrangler pages deploy ' + d.outputDir + ' --project-name ' + d.project + ' --branch ' + b.production];
  return [
    'Git-connected: production builds from the ' + b.production + ' branch, which holds only a placeholder until go-live. No Wrangler, no force push.',
    'At go-live — ONLY with Paul\'s explicit approval — in the Cloudflare dashboard: Workers & Pages → ' + d.project + ' → Settings → Builds → Branch control → Production branch: main → Save.',
    'Then push main (or press Retry deployment on the latest main build). Cloudflare publishes it at https://' + d.project + '.pages.dev. Record main as the production branch in LeadFinderOS.',
  ];
}

/** PowerShell for the preview, per mode (the Commands pack). */
export function previewCommandLines(d: DeployInput): string[] {
  const s = d.s, b = cloudflareBranches(s), url = stablePreviewUrl(s, d.project);
  if (!s.cloudflare_mode) return ['# Choose the Cloudflare deployment mode in Project details first (Git-connected is the normal Findable setup).'];
  if (s.cloudflare_mode === 'manual') return ['# Deployment is set to Manual / not configured — there is nothing to run here.'];
  if (s.cloudflare_mode === 'direct_upload') return [
    '# -- 1. Confirm which Cloudflare account wrangler will use (it prints the account name) --',
    'npx wrangler whoami',
    '',
    '# -- 2. FIRST TIME ONLY: create the Pages project in that account --',
    '#    If it says the project already exists, that is fine — go to step 3.',
    'npx wrangler pages project create ' + d.project + ' --production-branch ' + b.production,
    '',
    '# -- 3. Build and upload as a PREVIEW (not production) --',
    d.buildCommand,
    'npx wrangler pages deploy ' + d.outputDir + ' --project-name ' + d.project + ' --branch ' + b.preview,
    '',
    '# The address that stays the same between previews is:',
    '#     ' + url,
  ];
  return [
    '# Git-connected Pages: a push IS the deploy. No wrangler needed.',
    '# -- 1. FIRST TIME ONLY, in the browser (Claude prints these if the project is not linked yet) --',
    ...dashboardSetupSteps(d).map((x) => '#    ' + x),
    '',
    '# -- 2. Push the site to the preview branch (it follows main) --',
    'git push origin main main:' + b.preview,
    '',
    '# If the project was linked AFTER the last push, push once more so Cloudflare builds it:',
    'git commit --allow-empty -m "Trigger preview build"',
    'git push origin main main:' + b.preview,
    '',
    '# The preview (noindexed) appears a minute or two later at:',
    '#     ' + url,
  ];
}
