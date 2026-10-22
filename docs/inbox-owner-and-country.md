# Inbox: whose inbox, and which country (2026-10-22)

- The Inbox opens on the signed-in person's own leads (`assigned_to_user_id`, read in the Inbox lead read). Admins get a "Viewing" choice: Me, a team member, Unassigned; remembered per device (`inbox-owner-view`, tier local). A salesperson sees Me only: the database gives them only their own leads, so other inboxes would need an RLS change (not done).
- Another person's inbox is read-only for a non-admin (`inboxIsReadOnly`); admins can reply from any inbox. Banner + "Assign to me" (admin: `assign_lead_with_brief`; sales: `claim_lead`). The read-only state is built but unreachable until sales can read other inboxes.
- Country filter (All, UK, Malaysia, Singapore, Australia): a number's own code wins over the lead's label (`phoneCountry.ts`), else the label. One rule: `src/lib/inboxView.ts`, test `scripts/inbox-view.test.ts`.
- Sidebar and bottom-nav unread badge (`useAllInboxUnread`, `useSms.ts`) counts only leads assigned to the signed-in admin; it shows nothing until the ownership read lands.
- Deployed SPA only, no SQL, no edge functions. Verified live by `inbox-viewing-select` in the Inbox chunk.
