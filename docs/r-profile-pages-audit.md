# The /r/<slug> "listing" pages: audit, then RETIRED (2026-10-01)

**Status: ✅ RETIRED 2026-10-01 (Paul), main `3ecc83cd`.** See "Retirement" at the end. The audit
below is the evidence it was based on, kept as written. Same day, separately: the Dashboard
Submissions link was fixed (`?leadId=` → `?lead=`, via `outreachLeadLink`; `dashboard-links.test.ts`).

## What they are
`functions/r/[slug].ts` is a Cloudflare Pages Function. It reads a `status='published'` row from
`business_reports` (anon key, public RLS) and renders it as a full HTML "business profile" page:
- Unsplash stock hero and mid-page images.
- Canonical and og:url are `https://yoursites.uk/r/<slug>`.
- No robots meta, no `X-Robots-Tag`, `cache-control: public, max-age=300`.
- JSON-LD from the model (Article + Organization + the trade type, e.g. `RoofingContractor`). The
  Article's **author and publisher are the business itself**, although we wrote and host it.
- Footer: "profile compiled from public business data". No LeadFinder, Findable or barber branding.

It is a **different thing from findable.live/r/<code>**. That route lives in the findable-site repo
and is the short audit-report link sent to prospects.

## How a page gets made
1. An audit finishes in `process-ai-audit-queue`.
2. **Auto-report**: if the lead is "engaged" (replied or beyond, or paid), it is not a market audit or
   a weekly check, and no profile exists yet, the queue calls `generate-report` (CRON_SECRET).
   This engaged-lead gate dates from Paul, 2026-09-16.
3. `generate-report` runs gpt-4o tool-calling with a prompt to write a profile "optimised to be CITED
   by AI search engines", and inserts a published `business_reports` row.
4. **Manual**: AI Audit → Deliverables → "Generate listing" (admin JWT). "View listing" opens
   `https://yoursites.uk/r/<slug>` (hardcoded in `AiAudit.tsx`).

## Measured (2026-10-01)
| | Count |
|---|---|
| Published | 1,295 (+1 archived) |
| By month | Jul 115, Aug 344, Sep 836 |
| Since the 2026-09-16 gate | 320; newest 2026-09-30 |
| Paid clients | 9 |
| No lead | 7 |
| No audit | 30 |
| Lead unpaid | 1,250 |
| `generate-report` spend logged | 343 calls, **$4.40**, 2026-09-16 → 09-30 |
| `yoursites.uk/r/` links ever sent by WhatsApp | **0** |
| Mentions in `lead_activity` / notifications | 0 |
| Recorded AI answers since 2026-07-15 that cite yoursites.uk | **0 of 8,316** |
| `site:yoursites.uk` web search | nothing indexed found (weak evidence) |

For comparison, the yoursites.uk links that **were** sent are `/a/` (100, last 2026-09-02, now a 301 to
findable.live/report) and `/s/` (39, July 2026).

There is no page-view logging for `/r/` anywhere we can read. The Cloudflare project that serves
yoursites.uk is not in the account wrangler uses here.

## Load-bearing facts
- **`business_reports` rows are not only these pages.** `render-audit-report` resolves the legacy
  `name-<8hex>` report slug through them (`slug like '%-<code>'`, published). 69 rows have that
  shape. Deleting or unpublishing rows would 404 old report links. Retire the PAGE, never the ROWS.
- yoursites.uk is a **separate, frozen deploy**. Its home page and robots.txt are still the pre-2026-10-01
  files, while `/a/` 301s. Pushing main does NOT change yoursites.uk. A change to `functions/r/[slug].ts`
  reaches it only if that project is redeployed.
- The same function also answers on `app.leadfinderos.com/r/<slug>` and `leadfinderos-next.pages.dev`
  (canonical still yoursites.uk).

## Classification
**C — legacy functionality, still being generated, no evidence of use.**
- Nobody has been sent one.
- No AI answer has cited one.
- It is the profile/listing idea from before "presence in the sources AI reads" became the only
  supported lever (`docs/findings.md`).
- Publishing, in the business's name, a profile they did not write or approve — hosted on a domain
  that isn't theirs or ours-by-brand — is search manipulation by the brief's own definition, and its
  schema misattributes authorship.

## Recommendation (as written before Paul decided; superseded by "Retirement" below)
1. **Stop generating.** Remove the auto-report call in `process-ai-audit-queue` and the
   "Generate listing" item.
2. **Keep every URL resolving but noindex.** Add `X-Robots-Tag: noindex` and a robots meta to
   `functions/r/[slug].ts`, and drop the canonical to yoursites.uk. Redeploy the yoursites.uk
   project as well as main (it is frozen).

   Alternatively: 301 `/r/<slug>` to the business's own website when known, else to
   `findable.live/report/<audit_id>` where `audit_id` is set, else 410.
3. **Never delete `business_reports` rows** (report-slug resolution).
4. If a public profile is ever wanted for a PAYING client, put it under the client's own domain (the
   page generator / website build). Not on a third-party host, and not on app.leadfinderos.com (the
   private operator app).

## Retirement (2026-10-01, Paul; main `3ecc83cd`, merge of `5f6f8631`)
What stopped:
- **Auto-report.** `process-ai-audit-queue` no longer calls `generate-report`. The
  `AUTO_REPORT_ENABLED` switch is no longer read. Redeployed; the live bundle has no
  `functions/v1/generate-report` and carries the "NO AUTO-REPORT" marker. The 30 s cron answers 200.
- **`generate-report`** is a stub: every POST answers `410 {"error":"retired"}`; there is no model
  call and no insert. Its `config.toml` entry stays. Verified live.
- **AI Audit** lost "Generate listing" / "View listing", "Credentials for listing" and its panel,
  both `business_reports` reads, and the list's `report` pill (`AuditLite.report_slug`). Verified in
  the live AiAudit chunk. `ai_audits.credentials` stays as a column (re-audit still copies it);
  nothing reads it now.

What `/r/<slug>` returns:
- **410 Gone**, `X-Robots-Tag: noindex, nofollow` plus a robots meta, a 419-byte page, no database
  read. Live on app.leadfinderos.com and leadfinderos-next.pages.dev.
- ✅ **yoursites.uk/r/: closed 2026-10-01 by dropping the public read policy (Paul chose option A).**
  - **Why a policy and not a deploy.** yoursites.uk is the legacy `leadfinderos` Pages project (same
    bundle as leadfinderos.pages.dev). It is not in the Cloudflare account wrangler reaches here, and
    Paul chose not to redeploy it. Its frozen `/r/` function read profile content with the anon key
    through one policy.
  - **Dependency check just before the drop (read-only).**
    - Code, in all three repos: the only live read of `business_reports` was `render-audit-report`,
      which uses `SUPABASE_SERVICE_ROLE_KEY`.
    - Database: no views, SQL functions or triggers on the table.
    - The only anonymous reader was the frozen yoursites.uk function being retired.
  - **Dropped:** `drop policy "Public can read published reports" on public.business_reports;`. It
    was PERMISSIVE, SELECT, roles `{anon,authenticated}`, using `(status = 'published'::text)`, with
    no WITH CHECK. To restore it:
    `create policy "Public can read published reports" on public.business_reports for select to anon, authenticated using (status = 'published');`
  - **Unchanged, read back:** `"Admins manage business_reports"` (ALL, authenticated,
    `has_role(auth.uid(),'admin')`); RLS enabled; table grants identical before and after; service
    role bypasses RLS.
  - **Rows:** before and after the same — 1,296 total, 1,295 published, 69 legacy-slug published,
    last update 2026-09-30 17:31:33.
  - **Live results after the drop:**
    - An anonymous REST read returns `[]`.
    - yoursites.uk/r/<slug> answers GET 404 "Report not found", `<meta name="robots"
      content="noindex">`, `max-age=0`, no profile content. HEAD still gets 200, because the frozen
      function handles GET only and HEAD falls to the SPA shell, which holds no profile.
    - app.leadfinderos.com/r and leadfinderos-next/r still answer 410.
    - These are all unchanged, same status, bytes and marker: findable.live/r/<code>,
      /report/<uuid>, /report/<name-8hex> (legacy), render-audit-report `?slug=`, yoursites.uk/a/
      and app/a/ (301 to findable.live), and `/s/` on both hosts.

What is unchanged and verified, before and after (same status, bytes and marker):
- findable.live/r/<code>, findable.live/report/<uuid>, findable.live/report/<name-8hex> (legacy),
  and render-audit-report `?slug=`.
- yoursites.uk/a/<uuid> and app.leadfinderos.com/a/<uuid> (301 to findable.live/report).
- `/s/` on both hosts. It is the SPA shell; the barber viewer was deleted 2026-09-09, so these
  links already showed the app's not-found screen before this change.

Rows: 1,296 (1,295 published, 69 legacy-slug). None deleted or updated; the last update is still
2026-09-30. Guard: `scripts/r-profile-retired.test.ts`.

Left alone: findable-directory's unused `reportsOrigin()` helper (its own repo, nothing calls it) and
the historical `openai_generate_report` spend label in `apiCostLabels.ts`.
