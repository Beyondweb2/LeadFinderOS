# Website Build — pilot hardening (2026-09-25)

The first real end-to-end pilot (BS4 Electrical Services Ltd: recon → approvals → architecture →
build → GitHub → Git-connected Cloudflare preview → Build Result import → Preview Ready) found six
issues worth fixing before the next client. All fixed in one branch, `pilot-hardening`.

## F13 — a fact edit could be lost, and Approve could verify the stale value

**What happened.** Services held 26 operator-entered strings. The operator cut them to 11, the
header said Saved, a reload brought the 26 back, and Approve then verified the 26.

**Root cause.** `FactRowEditor` (and `MappedFieldRow`) kept the edited value in the row's own
`useState` draft. It never entered the Website Build state that autosaves, so "Saved" described
everything except the edit; a reload or a remount of the row dropped it; Approve then approved what
was stored. A second, latent hole: two autosaves could be in flight at once and land out of order.

**Fix.**
- No local draft of a fact value anywhere. Every keystroke goes through `editFact()` into the stored
  fact as **needs approval** (an edit is never a verification; editing a verified value un-verifies
  it). The input shows the stored value, so Saved means the edit is on the server and Approve
  approves exactly what is shown (edit + approval travel in one whole-state save).
- `src/lib/saveQueue.ts`: one save at a time; a change made during a save is sent right after it;
  "saved" only when the newest state is acknowledged; a failure reports "Not saved — your edits are
  kept on this screen" with Retry, keeps the edit, and nothing reloads over it (the re-crawl reload
  refuses while an edit is unsaved).
- Undo edit restores the stored decision (`storedFact`) or, for an undecided row, the candidate.
- The fact list keeps a stable order while typing, and a row edited in this visit stays in the open
  filter (editing a verified row no longer jumps it to the top mid-keystroke).
- Only the project field (the domain) keeps a draft + Save button.

Tests: `scripts/fact-edit-persistence.test.ts` (26 → 11 → save → reload → approve → reload = 11
verified; base town as a scalar; un-verify on edit; Undo; the queue's order / failure / retry;
a source guard against local drafts).

## F11 — recon towns never reached the Service areas fact

The recon's 20 towns lived in `recon.towns`, read only by the template mapping's Locations panel,
so a bespoke build could not approve them. New **Service areas — recon candidates** panel in Intake
(`src/lib/serviceAreaCandidates.ts`): verified areas, the list awaiting approval, every recon town
with its evidence and status. Found is never verified. **Add** proposes a town while the list is
unverified; **Approve** adds one town to a verified list (the verified towns stay verified — Add is
refused there because a single-string fact would un-verify them); **Ignore** = "does not serve"
(`mapping.locations[town].serves = false`, the same key the Locations panel uses). Case-insensitive
dedupe. No page is ever created — serving an area is wording and schema; town pages stay an
Architecture decision.

## F12 — only slot-assigned USE assets reached the build

`assetsToDownload` kept only slot-assigned assets for template builds and for bespoke builds with any
slot filled (BS4: 2 of 12 approved photos). Now `AssetPlan` = `assigned` (slot named) +
`approvedAdditional` (every other USE asset — gallery / project / service evidence), never REVIEW or
IGNORE, and an unassigned USE logo / favicon is not downloaded (which logo the site uses is a slot
decision). The Build Execution X3 section and the Asset Download prompt print both lists and the
REVIEW / IGNORE counts.

## F17 — every deploy text assumed Wrangler direct upload

New Project-details fields (Preview group and the Preview step): **Cloudflare deployment** (Git-
connected Pages — recommended / Direct Wrangler upload / Manual — not configured), Cloudflare account
**label**, production branch, preview branch. No credential is ever stored. `''` blocks the build
("deployment mode not chosen"). `src/lib/cloudflareDeploy.ts` writes the steps for every place that
had them (Build Execution X8, Retry, Preview Deployment, Production Deployment, both PowerShell
packs, the V1 brief). Git-connected: no Wrangler; a README-only production-branch placeholder
(`live` by default, `[CI Skip]`) so linking publishes nothing; push main + the preview branch; if the
project is not linked, STOP with the exact dashboard steps; after the operator links it, re-push (an
empty commit) because a push before the link does not build; noindex every `*.pages.dev` via
`public/_headers`. Git mode refuses `main` as the production branch. Production in Git mode = switch
the production branch to main in the dashboard (no Wrangler, no force push).

**Deploy order:** the new fields go through the shared save rule (`normaliseWebsiteBuild`), so
`paid-client-hub` is deployed BEFORE the SPA — an old server would strip them on save.

## F1 — the locksmith template was recommended to an electrician

`templateSuitsTrade` was fed the template's descriptive "business types" list (it names
electricians, plumbers, roofers…). Templates now declare `primaryTrade` + `supportedTrades`; one rule
(`tradeFit` / `recommendedTemplates` / `recommendedRoute` in `websiteTemplates.ts`) decides
"recommended". No compatible template → **Bespoke / new trade** is the recommended route. Choosing a
weak-fit template deliberately is allowed, with a warning. The descriptive list is shown as "Could be
adapted for (never a recommendation)".

## F14 / F15 — contradictory status copy

- **F14:** the Build pack stage demanded every fact decided ("Finish intake and architecture first")
  while the mapping said Ready to build (held claims are allowed — they are left out). Now the stage,
  the Build preparation badge and the Build website card all read `executionBlockers` — the list that
  already gates the prompt — plus page-plan errors. Ready → "Ready to build"; blocked → the real count.
- **F15:** the prompt printed `capture.status` ("not started") after a 298-page recon import.
  `captureSummary()` is the one wording for the stage and the prompts; an imported recon reads as
  "Recon imported <date> · N URLs · M assets" with no manual tick.

Tests: `scripts/pilot-hardening.test.ts` (BS4-like fixture: electrician, bespoke, 20 recon towns,
12 USE photos with 2 in slots, Git-connected, imported recon, Ready to Build). Older fixtures that
assert Wrangler text now declare `cloudflare_mode: 'direct_upload'`.
