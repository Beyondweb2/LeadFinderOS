/* No bottom-right pop-ups (Paul, 2026-11-15): toast() routes an error / an Undo inline beside the control just used,
 * everything else to the bell's "This session" list only; App.tsx mounts ActionNotices, never the Toaster.
 * Run: npx tsx scripts/action-notices.test.ts */
import { readFileSync } from "node:fs";
import {
  _resetNotices, anchorFor, getInlineNotices, getNoticeLog, noteAction, pushNotice, routeOf, plainText, ANCHOR_WINDOW_MS, LOG_LIMIT,
} from "../src/lib/actionNotices.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const el = (connected = true) => ({ isConnected: connected }) as unknown as Element;

console.log("── routing ──");
ok(routeOf({ variant: "destructive" }) === "inline", "an error goes inline");
ok(routeOf({ title: "Undo?", action: {} }) === "inline", "a notice with an action (Undo) goes inline");
ok(routeOf({ title: "Saved" }) === "log", "a success goes to the bell only");

console.log("\n── anchor = the control just used ──");
_resetNotices();
const btn = el();
noteAction(btn, 1000);
ok(anchorFor(1000 + 5_000) === btn, "a click 5s ago anchors the notice");
ok(anchorFor(1000 + ANCHOR_WINDOW_MS + 1) === null, "a click older than the window does not");
noteAction(el(false), 2000);
ok(anchorFor(2001) === null, "a control no longer on the page -> top bar (null anchor)");

console.log("\n── push ──");
_resetNotices();
noteAction(btn, 1000);
pushNotice({ title: "Saved" }, 1100);
ok(getInlineNotices().length === 0 && getNoticeLog().length === 1, "success: logged, not inline");
pushNotice({ title: "Send failed", description: "Meta refused it", variant: "destructive" }, 1200);
ok(getInlineNotices().length === 1 && getInlineNotices()[0].anchor === btn && getInlineNotices()[0].error, "error: inline beside the button");
ok(getNoticeLog()[0].title === "Send failed" && getNoticeLog()[0].error, "error: also in the bell's list, newest first");
pushNotice({ title: "Send failed again", variant: "destructive" }, 1300);
ok(getInlineNotices().length === 1 && getInlineNotices()[0].title === "Send failed again", "a newer error replaces the older one beside the same control");
for (let i = 0; i < LOG_LIMIT + 10; i++) pushNotice({ title: `m${i}` }, 2000 + i);
ok(getNoticeLog().length === LOG_LIMIT, `the list keeps the newest ${LOG_LIMIT}`);
ok(plainText({ props: { children: ["a", { props: { children: "b" } }] } }) === "ab", "React-node text is read as plain text");

console.log("\n── wiring ──");
const app = readFileSync("src/App.tsx", "utf8");
ok(app.includes("<ActionNotices />") && !/<Toaster\b/.test(app) && !/<Sonner\b/.test(app), "App mounts ActionNotices, no Toaster / Sonner");
const hook = readFileSync("src/hooks/use-toast.ts", "utf8");
ok(/function toast\([^)]*\)\s*\{\s*const id = pushNotice\(/.test(hook) && !hook.includes('"ADD_TOAST",\n    toast:'), "toast() only calls pushNotice (no pop-up dispatch)");

console.log(f ? `\n${f} FAILED` : "\nall passed");
process.exit(f ? 1 : 0);
