# Template wording preview + "Request a template" (2026-09-28)

Paul: hovering a template should say what it is; a "Request a template" button where the person types
the message, with a link to WhatsApp's rules, sent to Paul by email exactly as written, for him to
approve. Branch `feat/template-requests`. Migration `20260928220000_template_requests.sql`.

## 1. The preview

- Every approved-template picker: the Outreach "Queue for WhatsApp" window, a lead's WhatsApp card
  (`WhatsAppLeadControls`, in the lead workspace), the Inbox thread's template picker.
- Hovering an option shows its wording INSIDE the open list, pinned to the bottom
  (`TemplateWordingInList`). ⚠️ Measured first: a box under the picker was covered by the open list.
  Once the list closes, the chosen template's wording shows under the picker (`TemplateWordingPreview`).
- The text is `templatePreviewText` (`src/lib/templatePreview.ts`) = the app's one copy of the bodies
  (`READABLE_TEMPLATE_BODIES`, held to the send path by the template-bodies parity test), with sample
  details (`SAMPLE_PREVIEW_VALUES`), or the lead's own business / first name / town / trade on the
  single-lead pickers. A reading aid only — the Inbox dry run is still the exact payload.
- "Single-lead WhatsApp send window": the old `SingleWhatsAppDialog` is the free-text wa.me window, not
  an approved-template picker, so it was left alone; the two single-lead approved pickers carry it.

## 2. Request a template

- `RequestTemplateButton` under each picker opens a form: what the message should say (required,
  ≤ 1,024 — Meta's body limit; hint to put changing details in [brackets]), when you would use it
  (required), **why an existing template doesn't cover it** (required, ≤ 300 — Paul's addition, to stop
  near-duplicates), a suggested name (optional). Above the text box: "Read WhatsApp's template rules"
  → Meta's official Template review page (`META_TEMPLATE_GUIDELINES_URL`: approval process, samples,
  common rejection reasons).
- Edge function `template-request` (verify_jwt true, role required — admin or sales): validates again
  (`checkTemplateRequest`, `src/lib/templateRequest.ts`), SAVES the request first (service role), then
  emails Paul via Resend (`alerts@findable.live` → `paul@findable.live`, the request-call route), then
  writes `email_status` (`sent` / `failed` / `not_configured`) + `email_error` back. A failed email never
  loses the request; the form says "Request saved" instead of "sent" when the email did not go.
- The email (`templateRequestEmail`, plain text): who (name, role, email), when (UK time), suggested name,
  where it was asked from, when they'd use it, why an existing template doesn't cover it, and the wording
  exactly as typed between two lines; the request id. This request only — no count or history.
  Reply-to = the requester, only for a real address (`replyToAddress`: never .invalid / example / test).
- Stored exactly as typed (`message_text`, `use_case`, `why_not_existing`; only the name is trimmed).
- ⛔ Nothing goes to Meta — the function knows no Meta endpoint. Paul registers any template himself.

## 3. Database

`public.template_requests` (requester, the three texts, source queue/inbox/lead, email status). RLS on;
**no insert/update/delete policy for any signed-in role** (only the function writes); SELECT = own rows
or the admin; anon revoked. Checks: message 1–1,024, use case and why 1–300.

## 4. Tests

- `scripts/template-request.test.ts`: every sendable template previews from its one body; the lead's name
  used; the three pickers wired (in-list hover + chosen below + the request link); exact wording kept
  (spaces, blank lines, emoji); required fields and limits; the email's content, UK time, subject, no
  history; reply-to rules; saved-before-emailed order, outcome recorded, raw text stored, no Meta call,
  config entry; migration shape.
- `supabase/tests/template-requests.sql` — 10/10 live, rolled back: stored byte for byte, starts
  pending, over-limit refused, anon has nothing, Sales reads its own and not another's, cannot insert /
  edit / delete, the admin reads all.
- Rendered locally (harness, fake data): hover in the list shows "Hi, is this Coastal Mobile Mechanic? …
  Cheers" inside the open list; the form's four fields, the Meta link, Send disabled until the required
  fields are filled.

## 5. Deploy and the live test (2026-09-28)

- Migration applied one statement at a time, read back (RLS on, 14 columns, one SELECT policy, anon no
  privilege). Edge `template-request` v1 from the merge tree (bundle marker read back; an unsigned call →
  401). Main `e43e9133`.
- ⚠️ Cloudflare's build of `e43e9133` FAILED while the same code on the branch (`906f3efc`) built fine and a
  clean local build of the exact commit passes; `f4bf55d1` (another session's merge) failed the same way
  earlier the same day and the next push built. The logs are behind the Cloudflare login; a further push
  re-triggered the build.
- **One live test request, as the Sales Test account (one-time link, ended 204):** a request with no "why"
  → 400 `why_required`; the real one (marked TEST, a prices-after-a-call wording with blank lines, two
  leading spaces and an emoji) → 200 in 0.8 s, `emailed: true`; the row: requester Test (sales), source
  queue, `email_status` sent, the wording byte-for-byte equal to what was sent; Test reads only its own
  row. No reply-to (the Test address is .invalid). The row (`194ba2f6…`) is kept as the first record.
