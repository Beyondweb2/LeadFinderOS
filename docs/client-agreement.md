# Client Service Agreement — electronic acceptance (2026-10-02)

Paul's brief, plan and decisions of 2026-10-02. Branch `feat/client-agreement` (LeadFinderOS) and
`feat/client-agreement` (findable-site).

## What it is

Every client accepts the **Findable Client Service Agreement** electronically, in two places, and each
acceptance leaves one write-once evidence row.

| Where | How | Method |
|---|---|---|
| Stripe Checkout (Quick Close and findable.live onboarding both go through `findable-checkout`) | A **required** terms tick: "I agree to the Findable Client Service Agreement, including the minimum term." linked to the client's own page. **Binding on its own.** | `checkout` |
| `findable.live/agree/<token>` (from the Welcome Pack button/QR, or Paul's Send link) | Legal name, company number (optional), full name, role, address, email, phone, website (optional), Paul's consent sentence, "I agree and sign". | `agree_page` |

The Welcome Pack still asks **every** client to sign on the page, even after the checkout tick (the
fuller record). Only an `agree_page` acceptance replaces the pack's button with "Agreement accepted on …
by …".

## The words

- `src/lib/clientAgreement.ts` holds Paul's PDF (`Desktop\Findable_Client_Service_Agreement.pdf`) as
  version **v1, verbatim**. `scripts/client-agreement.test.ts` pins its template fingerprint
  (`10b3fd55…`); a change to the words is a **new version**, never an edit of v1.
- One source, three renderings: the page (`agreementPageHtml.ts`), the PDF (`agreementPdf.ts`, pdf-lib
  injected so it runs in Deno and Node) and the fingerprint (`renderAgreementText` → SHA-256).
- The signed PDF is fully filled ("Not provided" for any gap), both signature blocks read "Signed
  electronically", and the signature page ends with the evidence line (method, UTC time, version,
  fingerprint).

## The data (SQL Paul ran 2026-10-02, read back the same day)

- `client_agreement_versions` — one row per version (written by the first acceptance; a different
  template under the same id is a hard stop).
- `client_agreement_links` — one 64-hex token per lead. `service_route` (follow-up SQL) is the Build /
  Optimise the page shows: set by Paul's selector or by the checkout. With no route (and no
  checkout-stamped `contract_total_payments`) the page refuses to show the agreement.
- `client_agreement_acceptances` — the evidence. Signer = contact (`typed_name`, `typed_role`).
  `agree_page_is_complete` requires legal name, name, role, address, email, phone; `checkout_has_session`
  requires the Stripe session (unique → a webhook retry is a no-op).
- **Write-once**: triggers refuse UPDATE / DELETE / TRUNCATE on acceptances and versions for every
  role; RLS on, no policies, no grants for `anon` / `authenticated`. Proven by a rolled-back DO block
  the same day (every block refused, every rule enforced, nothing kept).
- The one-off link fill: paid and **not** refunded in full (`status <> 'refunded'` and
  `refund_amount_gbp < amount_paid` — the webhook sets `refunded` only on a full refund; RG and SC were
  marked by hand with no amount). On the day: MCLocksmiths and Ronnie in; RG, SC, BS4 (no amount),
  White Sparks (no amount, archived) out.

## Email

The signed PDF goes to the client and to **paul@findable.live** (`AGREEMENT_COPY_TO_PAUL`), from
`alerts@findable.live` via Resend. Cloudflare Email Routing forwards paul@findable.live to Paul's
inbox; that inbox is never a recipient in code. The row is stored before any email; a failed email is
written to `client_error_reports` and never loses the acceptance.

## Four weeks for every new client

The same day Paul dropped the brand-new-domain eight-week exception everywhere: `FINDABLE_GUARANTEE`
and findable-site `GUARANTEE` (byte-locked), `GUARANTEE_SHORT`, `NEW_DOMAIN_GUARANTEE_NOTE` (deleted),
/terms, /refunds, /pricing, the home-page guarantee, the onboarding form, the Stripe receipt and the
Welcome Pack. `remeasureWeeksFor` returns four. No onboarding row had ever answered `domain_status =
'new'`, so no client's clock moved; stored dates (RG 6 Oct, Ronnie 13 Oct) still win.

## Where it lives

| Thing | Path |
|---|---|
| Words, fill, evidence row, URLs | `src/lib/clientAgreement.ts` |
| Page HTML | `src/lib/agreementPageHtml.ts` |
| Signed PDF | `src/lib/agreementPdf.ts` |
| QR code | `src/lib/qrSvg.ts` (+ vendored `src/lib/vendor/qrcodeGenerator.ts`, MIT) |
| Page + signature + PDF download | fn `client-agreement` (`verify_jwt = false`) |
| Store + email (shared) | `supabase/functions/_shared/client-agreement.ts` |
| Checkout tick | fn `findable-checkout` (consent_collection), fn `stripe-webhook` (records it) |
| Welcome Pack page | `welcomePackHtml.ts` `agreementPage`, read by `_shared/welcome-pack-render.ts` |
| Paul's panel | `src/pages/ClientHub.tsx` `AgreementStage`; fn `paid-client-hub` `agreement_status` / `agreement_set_route` / `agreement_send_link` |
| findable.live | `functions/agree/[token].ts` (proxy, forwards IP + user agent), `functions/agreement/index.ts` (blank version, Stripe's ToS URL) |

## Stripe

Stripe refuses a Checkout Session with a required terms tick unless **Dashboard → Settings → Business →
Public details → Terms of service** is set (live and test mode). It is `https://findable.live/agreement`.
