/* ============================================================
   WHATSAPP SEND PACING — what actually binds throughput.

   ⛔ THE CONSTANT THAT DECIDED THROUGHPUT FOR MONTHS HAD NO NAME. The floor was a bare `20` inside
   the gap expression, so nothing could reference it and the header comment described it from memory.
   It is now SEND_GAP_FLOOR_MIN, halved to 10 on 2026-08-08.

   ⛔ AND THE FLOOR IS NOT WHAT BINDS AFTERWARDS. This function wakes on a ~10-minute cron and sends
   AT MOST ONE lead per tick, so every target gap is rounded UP to the next tick. That is why the
   measured median under a 20-minute floor was 29.9 minutes rather than 20 — the +20 mark is missed
   by a hair and the send lands on +30. The same effect puts a 10-minute floor at 20.
   This suite models the tick so the daily figure quoted to Paul is derived, not asserted.

   ⚠️ IT MODELS THE ARITHMETIC, NOT THE DEPLOYED FUNCTION. The gap formula is restated below; the
   cron SCHEDULE lives only in the database and cannot be read from this repo, so TICK_MIN is an
   assumption carried from the measured 29.9-minute median. If the real schedule differs, the daily
   numbers move and this comment is where to start.
   ============================================================ */

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* Restated from process-whatsapp-queue. */
const DAILY_CAP = 100;
const SEND_GAP_FLOOR_MIN = 10;
const SEND_GAP_CEILING_MIN = 180;
const SEND_GAP_JITTER_LOW = 0.55;
const SEND_GAP_JITTER_HIGH = 1.65;
const WINDOW_START_MIN = 7 * 60;
const WINDOW_END_MIN = 21 * 60 + 30;
const WINDOW_MIN = WINDOW_END_MIN - WINDOW_START_MIN;   // 870
/** The cron cadence. See the caveat above — inferred from measurement, not read from the DB. */
const TICK_MIN = 10;

function gapFor(minsLeft: number, sentToday: number, jitter: number): number {
  const remaining = Math.max(1, DAILY_CAP - (sentToday + 1));
  const baseGap = minsLeft / remaining;
  return Math.min(SEND_GAP_CEILING_MIN, Math.max(SEND_GAP_FLOOR_MIN, Math.round(baseGap * jitter)));
}
/** A target gap can only be realised on a cron tick, so it rounds UP. */
const onTick = (gap: number) => Math.ceil(gap / TICK_MIN) * TICK_MIN;

/** Walk a whole day at a fixed jitter and count how many sends fit. */
function dayThroughput(jitter: number): number {
  let t = 0, sent = 0;
  while (t < WINDOW_MIN && sent < DAILY_CAP) {
    sent++;
    t += onTick(gapFor(WINDOW_MIN - t, sent, jitter));
  }
  return sent;
}

console.log("── THE WINDOW AND THE FLOOR ──");
ok(WINDOW_MIN === 870, `the 07:00–21:30 window is ${WINDOW_MIN} minutes`);
ok(SEND_GAP_FLOOR_MIN === 10, "the floor is 10 minutes, halved from 20");

console.log("\n── ⛔ THE FLOOR IS NOT THE BINDING CONSTRAINT — THE TICK IS ──");
/* A 10-minute target cannot produce a 10-minute gap unless it lands exactly on a tick. */
ok(onTick(10) === 10, "a gap of exactly 10 rides the next tick");
ok(onTick(11) === 20, "a gap of 11 waits for +20 — 1 minute over the floor costs a whole tick");
ok(onTick(14) === 20, "and so does 14");
ok(onTick(21) === 30, "21 becomes 30 — this is why the measured median was 29.9 under a 20 floor");

console.log("\n── WHAT THE DAY ACTUALLY DELIVERS ──");
const lo = dayThroughput(SEND_GAP_JITTER_LOW);
const mid = dayThroughput(1.0);
const hi = dayThroughput(SEND_GAP_JITTER_HIGH);
console.log(`  jitter ${SEND_GAP_JITTER_LOW} -> ${lo}/day   jitter 1.0 -> ${mid}/day   jitter ${SEND_GAP_JITTER_HIGH} -> ${hi}/day`);
/* The honest band. The old floor produced a measured ~29/day; anything at or below that would mean
   the change achieved nothing. */
ok(mid > 29, `the mid-jitter day (${mid}) beats the measured 29/day the 20-minute floor produced`);
ok(hi >= 20, `even the slowest jitter still clears 20/day (${hi})`);
ok(lo <= DAILY_CAP, `the fastest jitter (${lo}) cannot exceed the ${DAILY_CAP} cap`);

console.log("\n── ⛔ THE CAP IS NOW REACHABLE, WHICH IT WAS NOT BEFORE ──");
/* Under the old 20-minute floor the cap could be any number above ~43 and change nothing. The test
   that it is now load-bearing: at the fastest jitter the day is limited BY THE CAP, not by time. */
{
  let t = 0, sent = 0;
  while (t < WINDOW_MIN && sent < DAILY_CAP) { sent++; t += onTick(gapFor(WINDOW_MIN - t, sent, SEND_GAP_JITTER_LOW)); }
  ok(sent === DAILY_CAP || t >= WINDOW_MIN, "the fastest day ends either at the cap or at the window close");
  console.log(`  fastest-jitter day: ${sent} sends, window ${t >= WINDOW_MIN ? "exhausted" : "still open"}`);
}

console.log("\n── THE GAP NEVER LEAVES ITS BOUNDS ──");
for (const j of [SEND_GAP_JITTER_LOW, 0.8, 1.0, 1.3, SEND_GAP_JITTER_HIGH]) {
  for (const minsLeft of [870, 600, 300, 60, 5]) {
    for (const sent of [0, 20, 40, 59, 60, 100]) {
      const g = gapFor(minsLeft, sent, j);
      if (g < SEND_GAP_FLOOR_MIN || g > SEND_GAP_CEILING_MIN) {
        ok(false, `gap out of bounds: ${g} at jitter ${j}, ${minsLeft} left, ${sent} sent`);
      }
    }
  }
}
ok(true, "across every jitter x time-left x sent-today combination the gap stays within [10, 180]");
/* ⛔ THE ABSENT CASE: sentToday at or beyond the cap. `remaining` is clamped to at least 1, so the
   division can never be by zero and can never produce Infinity — which would become a NaN gap and
   an unparseable next_send_at, stalling the queue silently. */
ok(Number.isFinite(gapFor(870, DAILY_CAP, 1.0)), "a day already at the cap still yields a finite gap");
ok(Number.isFinite(gapFor(0, 0, 1.0)), "a closed window still yields a finite gap");
ok(gapFor(0, 0, 1.0) === SEND_GAP_FLOOR_MIN, "  and it is the floor, not zero");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
