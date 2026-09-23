# Cold Call Playbook v1 (2026-09-23)

A read-only call guide for one lead, opened from **Inbox** (the "Cold Call Playbook" pill in the
selected conversation's header) and **Outreach** (the row's Call options menu, and the lead detail
dialog). One shared panel: `src/components/ColdCallPlaybook.tsx`.

## What it is built from — stored evidence only

| Piece | Source (reused, not restated) |
|---|---|
| Report link | `resolveLeadReportAudit` (`auditReportResolver.ts`), the Inbox rule → `findable.live/r/<short_code>` |
| AI evidence | `buildReportData` on that audit's latest run + queue rows — the hook gap first (`hook.gap`: question, engine, cleaned `namedInstead`, `answerExcerpt`), else the first not-named question in `questionBreakdown` |
| Competitors | whatever the report would print (junk filter + run-level suppression), minus a self-match (`excludeSelfRivals`) |
| Excerpt | quoted only if it passes `isJunkAnswer` AND `isMapCardAnswer` — the report's hook-card rule |
| Website findings | `resolveFindingsSource` (`siteFindings.ts`) — the SAME loop the `ai_site_findings_v2` {{6}} uses; `resolveSiteFindingsDetailed` is now written in terms of it (behaviour unchanged). Up to `MAX_SITE_FINDINGS`, strongest first, words from `candidateFindings`, proof from the stored signals/evidence |
| Follow-up | `whatsapp_messages` by lead id or WhatsApp phone; any real send (`isRealSend`) or inbound → FOLLOW-UP; report sent = a `REPORT_LINK_TEMPLATES` send |
| Offer | `FINDABLE_OFFER_SUMMARY` (£99 to start, then £99/month, 12-month minimum) + `FINDABLE_GUARANTEE` + Paul's build terms line (since 2026-09-23) |

The loader (`src/hooks/useColdCallPlaybook.ts`) is SELECTs only through the operator session, and
loads only while the panel is open. `scripts/cold-call-playbook.test.ts` fails the build if the
hook, panel or builder gains an invoke, rpc, write or raw fetch.

## Rules it keeps

- Opening leads with the AI result; names only real stored competitors; with none, "your business
  didn't come up in the answer it gave". No audit → the opening claims no result.
- A website finding "could be contributing" — never the cause.
- AI result older than `PLAYBOOK_AUDIT_STALE_DAYS` and crawls past `CRAWL_FRESH_MS` are flagged, never re-run.
- The guarantee objection promises the measurement and the refund, with no "can't promise" beside it.

## Open at ship time

- ✅ **Resolved 2026-09-23**: Paul confirmed £99/month with a 12-month minimum. The playbook now
  quotes `FINDABLE_OFFER_SUMMARY`; see `docs/business-and-offer.md` §0.
- Deep-crawl evidence (`evidence` on crawl rows) exists on ~1 of 241 stored crawls, so most leads
  show signal findings (thin pages etc.) or none.
- Stage 2 (not built): call outcome tracking, follow-up scheduling.
