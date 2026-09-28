# Domain ownership / authority for the new-website service (2026-09-28)

Paul's rule: **we only build and connect the standard new site where the client confirms they own or
control the domain and have authority to authorise the change.** If that turns out to be wrong, Findable
may stop the work / site; the £99 is not refunded for that reason; no further monthly payments are taken
once Findable ends the service for it.

## Paul's decisions (2026-09-28, not to be re-asked)

1. **Faithful / modernised rebuilds stay**, but only where the client confirms their business owns, or
   may reuse, the current design, text and images. Otherwise a genuinely new Findable-template build using
   business facts and client-owned material only. A visible asset is never assumed to be the client's.
2. **Moving a site to our hosting** only where they own it; otherwise a fresh build.
3. **Billing stop = record + alert**: the app never moves money. Ending the service records it and emails
   Paul to cancel the subscription in Stripe.
4. **A brand-new domain is registered by the client**, in the business's own name.
5. Later the same day: the domain questions are **separate pages**, not one long page, and the pay screen
   text was cut ("already mentioned elsewhere").

## The rule — ONE file, both repos

`src/lib/domainAuthority.ts`, byte-identical in LeadFinderOS and findable-site;
`scripts/check-cross-repo-sync.mjs` (`SAME_FILES`) fails on drift. Derived, never stored.
- Applies only to the new-site path (`website_addon` / route `new_site` / `rebuild_existing`). Optimising
  their own site: NOT NEEDED.
- Existing domain: owned = yes AND third party = no AND access yes / agency. No / not sure / third party /
  no access = **stop**. Plus: authority (if there is a current site), DNS permission, materials.
- New domain: only DNS permission + materials (the client registers it).
- `mayReuseExistingSite` = a current site AND `site_rights = 'yes'`.
- `domainInputFromRow` maps a stored onboarding row once; `DOMAIN_ROW_COLUMNS` is what to select.

## Where it is enforced

| Place | What |
|---|---|
| findable-site onboarding | Pages after "Your website", new-site path only: **Who owns your domain?** (owned, then third party) · **Access to your domain** · **Your current website** (site rights, if they have one) · **Before we build your new site** (the confirmations). A stop shows the message, `paul@move37.fun` and "Ask Findable to check my setup with me" (a bail that stamps `domain_escalated_at`). No password is ever asked. |
| `findable-onboarding` | saves the 7 answers + escalation (answers / NEWER_COLS / optional) |
| `findable-checkout` | refuses `domain_unresolved` (403) after the already-paid checks, re-derived from the ROW |
| `notify-onboarding-submit` | NEEDS YOU: DOMAIN / AGENCY ISSUE, and the escalation |
| Paid Clients (`paid-client-hub`, `handoffReadiness`) | item "Domain / authority" — DOMAIN READY / DOMAIN / AGENCY ISSUE (reasons) / NOT NEEDED; no onboarding = not answered, never ready; a terminated service is never ready. `ClientHandoffCard` shows it, Sales' A/B/C/D, the escalation, and **End service (domain / authority dispute)** |
| `terminate_service` (admin) | confirm + note ≥ 10 chars, once; sets `service_terminated_*`; emails Paul "SERVICE ENDED — cancel the monthly in Stripe"; never calls Stripe |
| Results + re-measure | `maybeSendRemeasureResults` skips a terminated service; `fireDueRemeasures` skips it |
| PAID email | the handoff line now includes the domain item |
| Website Build | `assetsToDownload` downloads only `ownership === 'client_owned'`; a faithful replica / modernised rebuild is blocked unless `copy_ownership` is client_wrote / client_permission; recon no longer asserts an authorisation |
| Manual onboarding (operator) | the same questions, recorded as the client's answers |
| Sales | `outreach_leads.domain_control` (A client_owns · B client_owns_agency_manages · C third_party_owns · D unknown) via `lead_set_domain_control`, shown in the workspace with the guidance and the line to say; information only. Call script + reply drafter: no rebuild promise before the domain is confirmed, never "break your contract", never legal advice |

## Client-facing wording changed

findable-site: onboarding (domain pages, stop, the "without going through you" helper, "copied exactly as
it is" migration text, the owner reassurance on the build path, the access notice, the pay screen's "What
you pay" and build line, the checkout refusal sentence), `/terms` (new sections "Your domain, your current
website and your existing provider" and "If someone else disputes your authority", the refund / billing
carve-out, scoped liability, what we need from you), `/refunds` (the guarantee needs the access and
authority — four narrow situations), FAQ ("An agency looks after my website"). LeadFinderOS: welcome pack
("Your domain and your current website"), client request sheet (domain ask; never a password), call script,
reply-drafter rules, manual onboarding copy.

## ⚠️ For a solicitor

The new /terms sections and the /refunds paragraph are software-written. The confirmations are scoped "to
the best of your knowledge"; the dispute right is operational ("not us deciding who is right"); the
carve-out is limited to this situation; non-excludable liability is preserved. Review before relying on
enforceability — in particular the interaction with the 12-month minimum term, and whether any client is a
consumer rather than a business.

## Meta templates

`explain_offer` / `explain_offer_v2` say "if you can't give me access, or want a new one, I'll build it" —
a rebuild promise with no domain condition. Both are already blocked (`STALE_OFFER_TEMPLATES`); re-register
with Meta before use. No other registered body promises a rebuild or a switch-over.

## Not changed

- `serveGate` logic (the migrate question is asked after payment; the ownership condition is enforced at
  delivery by `mayReuseExistingSite` / Website Build). Comment updated in both repos.
- The prospect preview (a pre-sale mock-up that reuses the prospect's logo/photos) — not a delivered site;
  flag for Paul.

## Tests

LeadFinderOS `scripts/domain-authority.test.ts` (in `npm test`), `supabase/tests/domain-authority.sql`
(9/9 live, rolled back); findable-site `scripts/domain-authority.test.ts` (npx tsx). Live render of the
onboarding pages (local build, nothing submitted): A/B eligible, C/D/no-access stop, confirmations gate,
optimise path unaffected, new domain skips the ownership pages. Found and fixed while driving it: the
step-check memo omitted the domain answers (Continue stayed disabled), and `domainStatus` was never saved in
the draft or restored after Stripe.
