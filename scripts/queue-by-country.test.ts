/* THE WHATSAPP QUEUE BY COUNTRY (2026-10-22) — the pure rules and the screen's shape. A screen job: no sending code is touched. */
import fs from "node:fs";
import path from "node:path";
import { splitByTab, tabOfRow, nextSendWords, QUEUE_TABS } from "../src/lib/queueByCountry.ts";
import { countrySettingsFrom } from "../src/lib/outreachMarkets.ts";
import type { QueueRow } from "../src/lib/whatsappQueueView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const row = (id: string, phone: string | null, country: string | null = null): QueueRow => ({
  id, business_name: id, status: "queued", is_archived: false, queued_at: "2026-10-22T09:00:00Z", whatsapp_template: "initial_contact",
  phone, country, contact_followup_queued_at: null, hook_followup_queued_at: null,
});

console.log("── which tab a lead is under (the digits we send to, never the country column) ──");
ok(tabOfRow(row("uk", "07911 123456")) === "UK", "a UK mobile is UK");
ok(tabOfRow(row("my", "+60 12 345 6789")) === "MY", "a Malaysian mobile is Malaysia");
ok(tabOfRow(row("sg", "+65 8123 4567")) === "SG", "a Singapore mobile is Singapore");
ok(tabOfRow(row("au", "+61 412 345 678")) === "AU", "an Australian mobile is Australia");
ok(tabOfRow(row("liar", "+60 12 345 6789", "United Kingdom")) === "MY", "a wrong country column does not decide it");
ok(tabOfRow(row("none", null)) === "UK" && tabOfRow(row("land", "020 7946 0000")) === "UK", "no number / a landline sits under UK (nothing waiting disappears)");
const split = splitByTab([row("a", "07911 123456"), row("b", "+60 12 345 6789"), row("c", null), row("d", "+61 412 345 678")]);
ok(QUEUE_TABS.length === 4 && split.UK.length === 2 && split.MY.length === 1 && split.SG.length === 0 && split.AU.length === 1, "every row lands in exactly one tab");

console.log("── next send, in the country's own words ──");
const S = countrySettingsFrom([{ country: "MY", whatsapp_on: true }, { country: "AU", whatsapp_on: true }]);
const noon = new Date("2026-10-22T04:00:00Z"); // 12:00 in Kuala Lumpur
ok(nextSendWords("SG", S, "2026-10-22T04:30:00Z", {}, noon) === "Off", "a switched-off country says Off");
ok(nextSendWords("MY", S, "2026-10-22T04:30:00Z", {}, noon) === "12:30", "Malaysia reads the stamp in Kuala Lumpur time while its window is open");
ok(nextSendWords("MY", S, "2026-10-22T04:30:00Z", {}, new Date("2026-10-22T14:00:00Z")) === "Opens 09:00", "outside its window it says when it opens");
ok(nextSendWords("MY", S, "2026-10-22T04:30:00Z", { paused: true }, noon) === "Paused", "a paused queue says Paused");
ok(nextSendWords("AU", S, "2026-10-22T04:30:00Z", {}, noon) === "Lead’s own time", "Australia has one zone per lead, so no single clock");
ok(nextSendWords("UK", S, "2026-10-22T10:30:00Z", { ukWindowOpen: true }, noon) === "11:30", "the UK reads it in London time");
ok(nextSendWords("UK", S, "2026-10-22T10:30:00Z", { ukWindowOpen: false, ukStartHour: 7 }, noon) === "Opens 07:00", "a closed UK window says when it opens");

console.log("── the screen ──");
const panel = read("src/components/WhatsAppQueuePanel.tsx");
ok(/data-testid=\{`queue-tab-\$\{m\}`\}/.test(panel) && /QUEUE_TABS\.map/.test(panel), "one tab per country");
ok(!/Last batch|BatchNote batch=|readQueueBatch/.test(panel.slice(0, panel.indexOf("export function BatchNote"))), "no 'Last batch' on the queue screen");
const dialog = panel.slice(panel.indexOf("<Dialog open={settingsOpen}"), panel.indexOf("</Dialog>"));
ok(/WhatsAppPaceSettings/.test(dialog) && /CountrySendingSettings/.test(dialog) && /RecentSendFailures/.test(dialog), "limits, rating, country switches, hours and failed sends all live in the Settings popup");
const main = panel.slice(panel.indexOf("<Tabs value={tab}"));
ok(!/<WhatsAppPaceSettings|<CountrySendingSettings|<RecentSendFailures/.test(main), "none of them is left on the main screen");
ok(/Pause all/.test(panel) && /Resume all/.test(panel), "Pause is honestly the whole queue's (the server has one pause flag)");

process.exit(f ? 1 : 0);
