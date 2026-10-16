// contract-alert — ONE step for every route (Paul, 2026-10-16; docs/contract-call-alert.md).
//
// A lead answered the agency-contract question. Record it in the once-per-answer ledger (contract_alert_claim, a
// per-lead lock) and, only when the ledger says this is a NEW answer and it is "not sure" or "tied in", email Paul
// through the operator alert sender (OPERATOR_ALERT_TO — his own inbox, the address every operator alert uses).
// The same ledger row is what puts the lead on his "Needs your attention" list.
//   · same answer again (a refresh, a second save) → nothing
//   · a changed answer → a new row (and an email when it is not sure / tied in); "free to leave" closes the line
// The phone and email in the email come from the LEAD record, never from what the prospect typed.
// ⛔ NEVER THROWS and never blocks the save that called it: the client's answer is already stored. A failed send is
//    recorded on the row (email_error) and in client_error_reports.
// ⛔ Nothing here addresses the prospect.
import {
  contractAlertEmail, isAlertAnswer, type ContractAlertAnswer, type ContractAlertSource,
} from "../../../src/lib/contractAlert.ts";
import { readContractEnd } from "../../../src/lib/onboardingSimpleAnswers.ts";
import { sendOperatorAlert } from "./operator-alert.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface ContractAlertInput {
  leadId: string | null | undefined;
  answer: ContractAlertAnswer | null;
  source: ContractAlertSource;
  contractEnds?: unknown;
  provider?: string | null;
}

export type ContractAlertResult = "no_answer" | "repeat" | "recorded" | "emailed" | "email_failed" | "error";

export async function alertContractAnswer(service: Service, i: ContractAlertInput): Promise<ContractAlertResult> {
  try {
    if (!i.leadId || !i.answer) return "no_answer";
    const ends = readContractEnd(i.contractEnds);
    const { data: claimed, error: claimErr } = await service.rpc("contract_alert_claim", {
      _lead_id: i.leadId, _answer: i.answer, _contract_ends: ends, _provider: i.provider ?? null, _source: i.source,
    });
    if (claimErr) throw new Error(`claim: ${claimErr.message}`);
    if (!claimed) return "repeat";
    if (!isAlertAnswer(i.answer)) return "recorded";
    const { data: lead, error: leadErr } = await service.from("outreach_leads")
      .select("id, business_name, contact_name, phone, email").eq("id", i.leadId).maybeSingle();
    if (leadErr) throw new Error(`lead: ${leadErr.message}`);
    const mail = contractAlertEmail({
      leadId: i.leadId, answer: i.answer, source: i.source, contractEnds: ends, provider: i.provider ?? null,
      business: lead?.business_name ?? null, contactName: lead?.contact_name ?? null, phone: lead?.phone ?? null, email: lead?.email ?? null,
    });
    const sent = await sendOperatorAlert(mail.subject, mail.lines, { html: mail.html });
    await service.from("contract_call_alerts")
      .update(sent.ok ? { emailed_at: new Date().toISOString() } : { email_error: String(sent.error ?? `status ${sent.status}`).slice(0, 500) })
      .eq("id", claimed);
    if (!sent.ok) {
      await service.from("client_error_reports").insert({ error_id: "contract_alert_email_failed", message: String(sent.error ?? "").slice(0, 1000), context: { lead_id: i.leadId, alert_id: claimed, status: sent.status } });
      return "email_failed";
    }
    return "emailed";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[contract-alert] not sent (non-fatal):", message);
    try { await service.from("client_error_reports").insert({ error_id: "contract_alert_failed", message: message.slice(0, 1000), context: { lead_id: i.leadId ?? null, answer: i.answer, source: i.source } }); } catch { /* never throws */ }
    return "error";
  }
}
