// Tests for the social-URL helpers behind the Facebook/Instagram enrichment fix.
// Run: deno test supabase/functions/_shared/aggregators_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  isUsableMapsListingSocial,
  isPlatformSocialUrl,
  isSiteBuilderSocialUrl,
  canonicalSocialUrl,
} from "./aggregators.ts";

// ── (a) The reported miss: facebook.com/MrMGCB (Magic Hands Barber) from the Maps
//        listing has an OPAQUE handle (no name-token overlap) — it must now be
//        accepted as a usable Maps-listing social, in /reels/ or plain form. ──
Deno.test("Maps-listing: opaque handle (MrMGCB) is now accepted", () => {
  assertEquals(isUsableMapsListingSocial("https://facebook.com/MrMGCB/reels/"), true);
  assertEquals(isUsableMapsListingSocial("https://www.facebook.com/MrMGCB"), true);
  assertEquals(isUsableMapsListingSocial("https://instagram.com/mr_mgcb"), true);
});

// ── (b) Platform + builder accounts on a Maps listing are STILL rejected. ──
Deno.test("Maps-listing: platform + builder accounts still rejected", () => {
  assertEquals(isUsableMapsListingSocial("https://facebook.com/fresha"), false);
  assertEquals(isUsableMapsListingSocial("https://facebook.com/booksyapp"), false); // token variant
  assertEquals(isUsableMapsListingSocial("https://facebook.com/wix"), false);
  assertEquals(isUsableMapsListingSocial("https://facebook.com/squarespace"), false);
  // sanity: the underlying denylists the gate relies on still fire
  assertEquals(isPlatformSocialUrl("https://facebook.com/fresha"), true);
  assertEquals(isSiteBuilderSocialUrl("https://facebook.com/wix"), true);
});

Deno.test("Maps-listing: non-social / empty urls are not usable", () => {
  assertEquals(isUsableMapsListingSocial("https://magichands.co.uk"), false);
  assertEquals(isUsableMapsListingSocial(""), false);
});

// ── (c) URL normalisation to the page root — /reels/, /posts/, /about, IG, pages/,
//        profile.php; handle case preserved; non-social + bare-domain unchanged. ──
Deno.test("canonicalSocialUrl: deep links reduced to page root", () => {
  assertEquals(canonicalSocialUrl("https://facebook.com/MrMGCB/reels/"), "https://www.facebook.com/MrMGCB");
  assertEquals(canonicalSocialUrl("https://www.facebook.com/MrMGCB/posts/123456"), "https://www.facebook.com/MrMGCB");
  assertEquals(canonicalSocialUrl("https://facebook.com/MrMGCB/about"), "https://www.facebook.com/MrMGCB");
  assertEquals(canonicalSocialUrl("facebook.com/MrMGCB"), "https://www.facebook.com/MrMGCB"); // already root, no scheme
  assertEquals(canonicalSocialUrl("https://instagram.com/waas_barber/reels/"), "https://www.instagram.com/waas_barber");
});

Deno.test("canonicalSocialUrl: preserves /pages/Name/id and profile.php?id", () => {
  assertEquals(canonicalSocialUrl("https://facebook.com/pages/Magic-Hands/12345/about"), "https://www.facebook.com/pages/Magic-Hands/12345");
  assertEquals(canonicalSocialUrl("https://facebook.com/profile.php?id=100012345678"), "https://www.facebook.com/profile.php?id=100012345678");
});

Deno.test("canonicalSocialUrl: case preserved; non-social + bare domain unchanged", () => {
  assertEquals(canonicalSocialUrl("https://facebook.com/MrMGCB/reels/"), "https://www.facebook.com/MrMGCB"); // MrMGCB case kept
  assertEquals(canonicalSocialUrl("https://magichands.co.uk/team"), "https://magichands.co.uk/team");
  assertEquals(canonicalSocialUrl("https://facebook.com/"), "https://facebook.com/"); // no handle → unchanged
});
