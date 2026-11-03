# The simpler Inbox (2026-11-03)

Paul asked for a simpler Inbox for salespeople. Layout only: no server rule, sender, queue, cap, database or permission changed. Branch `feat/inbox-simplify`. Fence: `scripts/inbox-simplify.test.ts`.

## What changed

- **Assign:** `LeadOwnerControl` already drew the Assign picker for admins only (`leadPermissions(role).assignOwner`), in the Inbox header and the prospect popup. No code change. A salesperson still sees `Owner: <name>` and Request transfer. The test now fences it.
- **Quick reply:** removed from the Inbox reply area, on WhatsApp and texts, both window states. Saved texts and Team templates stay on the Templates page and in the lead's WhatsApp card, but they no longer have a way into the Inbox.
- **Template picker:** the grey one-line snippet and the big Preview button are gone from the Inbox only. Outreach's queue panel and the lead's WhatsApp card keep theirs.
- **The eye (`TemplateEye`):** on every row of the list, including greyed rows, and beside the chosen template. It shows the full wording on hover, tap or keyboard focus. Words come from `pickerWording`: dashboard wording, SMS wording on a text, otherwise `templatePreviewText` with the lead's details.
- **Send now (top right):** removed. It was admin-only. The edge functions still accept `send_now`; nothing in the Inbox calls it now.

## Rules to keep

- Passing the pointer over a row opens nothing. Only the eye does (the 2026-09-29 "no hover card" rule). Radix focuses a row on pointer move too, so a row's eye opens on focus only when the last input was a key press.
- The eye sits outside `ItemText` (`SelectItem`'s `trailing` prop), because Radix copies `ItemText` into the closed trigger.
- The eye is a reading aid from the app's copy, not the server's dry run. The sender's dry run still runs behind "Put in message box", and every send still runs the server's guards. What went with the Preview button: asking the server "would this send?" without sending, for a closed-window template.

## 2026-11-03 follow-up: solid pill style back, automatic "would this send?" check
- The Inbox status pill is solid again (bright fill, dark text, one small size for every status; `StatusPill` in `InboxAttention.tsx`, colours from `pipelineStatusClass` plus `SOLID_STATUS` / `DERIVED_CLASS`). The see-through tint came in with commit 5d7f6fbe ("one status pill per lead"); the single-status words (`inboxStatusPill.ts`) are unchanged.
- Choosing a template runs the server's read-only dry run once (cached per conversation, template and typed item; nothing on hover) and shows an amber "May not send: reason" by the eye. It only warns; Queue template is never blocked. A check that could not run says nothing.
