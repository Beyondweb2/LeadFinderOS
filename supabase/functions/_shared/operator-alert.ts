// operator-alert — ONE way to email Paul an operator alert (2026-09-29). Same sender and inbox the
// existing alerts use (free-check-result.ts, remeasure-results.ts, stripe-webhook) — those keep their
// own copies for now; new alerts come through here.
//
// Returns whether Resend ACCEPTED it, so the caller marks an alert as sent only when it really went
// (the stripe-webhook lesson: a void sender leaves "was it ever sent?" unanswerable).

export const OPERATOR_ALERT_FROM = "Findable alerts <alerts@findable.live>";
export const OPERATOR_ALERT_TO = "paul@findable.live";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendOperatorAlert(subject: string, lines: string[]): Promise<{ ok: boolean; status: number; error: string | null }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, status: 0, error: "RESEND_API_KEY not set" };
  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${
    lines.map((l) => (l.trim() === "" ? "<br>" : `<div>${escapeHtml(l)}</div>`)).join("")
  }</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: OPERATOR_ALERT_FROM, to: [OPERATOR_ALERT_TO], subject: subject.slice(0, 180), text, html }),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, status: res.status, error: body.slice(0, 300) };
    return { ok: true, status: res.status, error: null };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
