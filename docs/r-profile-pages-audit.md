# The /r/<slug> "listing" pages: read-only audit (2026-10-01)

**What I did:** a read-only audit, with no change to `/r/` itself. Same day, I fixed the Dashboard
Submissions link (`?leadId=` → `?lead=`, via `outreachLeadLink`; guarded in
`dashboard-links.test.ts`).

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

## Recommendation (needs Paul's decision; not built)
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
