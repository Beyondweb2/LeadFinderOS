# Inbox follow-up hooks + plain send errors (2026-11-16)

Paul: in the Inbox, Polite hook 2 on Antony Cooper (open window, he replied) was labelled "Opener" and its preview said
"This would NOT send — Edge Function returned a non-2xx status code".

## The real error
Function logs (`npx supabase logs --remote=<ref> --service function-edge --resource <send-whatsapp-message id> --level error`):
three POSTs at 13:32 UTC answered **503**; the function's own log at the same seconds: `[operator-auth] auth service unavailable:
auth service timed out after 8000 ms`. So the answer was `auth_unavailable` (the Supabase sign-in service timed out checking the
rep's session) — transient, not a polite_hook2 fault. Earlier the same day polite_hook2 dry runs succeeded ("WOULD SEND (text)",
v255). The screen showed the SDK wrapper because `useInbox.preview` used `error.message`.

## What changed
- `src/lib/functionError.ts` `invokeFailure(err)` → `{ error, reason, status }`: reads the body once; reason = the server's
  `reason`/`detail`/`message`, else the known-token sentence (`EDGE_ERROR_SENTENCES`), else plain words with the status. Never the
  wrapper. `plainRefusal(token)` for a bare token. Used by: Inbox preview (dry run), `sendWhatsAppRequest` (single + bulk sends,
  Outreach WhatsApp dialog), Inbox `sendNamed`, SubmissionsCard, LeadQuestionnaireSection. The preview line shows the reason.
- Labels: `TemplateGroup` gains `'followup'`; polite_hook, polite_hook2, webdev_hook, webdev_report, webdev_example,
  initial_question are `followup`. `templateGroupLabel()` is the one picker label rule (any continuation reads Follow-up; only a
  cold template reads Opener). Sending already treated all six as continuations (`CONTINUATION_TEMPLATES`, `NEEDS_PRIOR_WHATSAPP`)
  in preview, single send and bulk — unchanged.
- Test: `scripts/inbox-followup-labels.test.ts`.

## send-whatsapp-message on main
Live was v255 (09:40 UTC); `src/lib/clientOnboardingForm.ts` and `src/lib/protectionLimits.ts` (both reached by it) changed on main
after that, so it was redeployed from main with this release.
