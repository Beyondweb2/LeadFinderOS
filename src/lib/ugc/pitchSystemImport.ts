/* LOAD HER pitch-system.md INTO HER PRIVATE RECORD — pure (docs/ugc-brand-finder.md).
 *
 * Her export (docs/ugc/jess-pitch-system/pitch-system.md, gitignored) is personal data. It is never committed and
 * never baked into code: Jess (or stage 2) imports it on her private Pitch system tab, and it lands in
 * ugc_pitch_system (owner-only). Her export WINS over the sheet wherever they differ (Paul, 2026-10-29).
 *
 * Headings: her export uses NUMBERED plain-text headings ("4. Pitch rules", "4b. Structure of the email, in order");
 * markdown "#" headings are read too. A numbered line counts as a heading only when it is short, does not end in a
 * full stop / colon / question mark, and its number is the next top-level number ("5." after "4.") or a lettered
 * sub-section of the current one ("5c."). That keeps her numbered rule lists ("1. Previously pitched check. Not in…")
 * from ever being read as headings.
 *
 * The whole text becomes `content` (what the writer and the reviewer are given). Sections are then routed by title:
 * About me → "About Jess" (its Rates sub-section kept OUT of it), Rates → rates, and each template's sections → that
 * template, text as written. Her blocked brands come from her "Blocked:" rule; her email sign-off is rebuilt from the
 * links her Output section names. Anything we cannot place stays in `content` only — nothing is dropped or guessed.
 * ⛔ Rates are kept in their own field and are NEVER sent to the writer (pitch.ts / fn ugc-brands). */

import type { TemplateKey } from './pitch.ts';

export interface PitchSystemImport {
  content: string;
  about_jess: string;
  rates: string;
  templates: Partial<Record<TemplateKey, string>>;
  blocked_list: string[];
  signoff_html: string;
  /** Headings found and where each went — shown to Jess so she can check the import. */
  placed: { heading: string; to: string }[];
  /** Templates her export did not provide (they stay "Not loaded" until she adds them). */
  missing: TemplateKey[];
}

export interface Section { id: string; level: number; title: string; body: string }

const ALL_TEMPLATES: TemplateKey[] = ['ad_idea_v2', 'video_idea_v3', 'generic_inbox_v2', 'ig_dm_ad_idea_v2', 'follow_up_1', 'follow_up_2', 'agency_roster_v1', 'cm_collab_dm_v4'];

/** Split her export into sections: markdown headings, or her numbered plain-text headings (see the header). */
export function splitSections(md: string): Section[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: Section[] = [];
  let cur: Section | null = null;
  let top = 0;
  let fence = false;
  const push = (s: Section) => { if (cur) out.push(cur); cur = s; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence) {
      const h = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (h) { push({ id: '', level: h[1].length, title: h[2].trim(), body: '' }); continue; }
      const n = line.match(/^(\d{1,2})([a-z])?\.\s+(\S.{0,78})$/);
      if (n && !/[.:?]$/.test(n[3].trim())) {
        const num = Number(n[1]);
        if (!n[2] && num === top + 1) { top = num; push({ id: String(num), level: 1, title: n[3].trim(), body: '' }); continue; }
        if (n[2] && num === top) { push({ id: `${num}${n[2]}`, level: 2, title: n[3].trim(), body: '' }); continue; }
      }
    }
    if (cur) (cur as Section).body += `${raw}\n`;
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}

/** A section with its sub-sections, as text (sub-headings kept so the template reads as she wrote it). */
function withChildren(all: Section[], i: number, skip?: (s: Section) => boolean): string {
  const parts = [all[i].body];
  for (let j = i + 1; j < all.length && all[j].level > all[i].level; j++) {
    if (skip?.(all[j])) continue;
    parts.push(`${all[j].id ? `${all[j].id}. ` : ''}${all[j].title}\n${all[j].body}`);
  }
  return parts.filter(Boolean).join('\n\n').trim();
}
const block = (s: Section) => `${s.id ? `${s.id}. ` : ''}${s.title}\n${s.body}`.trim();

/** Which template(s) a section's title feeds. A template may be built from several of her sections. */
const ROUTES: ReadonlyArray<[RegExp, TemplateKey[]]> = [
  [/chiang mai local|cm collab/i, ['cm_collab_dm_v4']],
  [/agency pitch|agency roster/i, ['agency_roster_v1']],
  [/email follow-?ups?/i, ['follow_up_1', 'follow_up_2']],
  /* "Instagram DM (word for word template)" — not "Instagram DM, X or LinkedIn: written in the chat" (an output rule). */
  [/^instagram dm\b(?!,)/i, ['ig_dm_ad_idea_v2']],
  [/generic inbox vs named/i, ['generic_inbox_v2']],
  [/email subject lines/i, ['ad_idea_v2', 'video_idea_v3', 'generic_inbox_v2']],
  [/tone and voice|structure of the email|ad wording vs video|always include|never say or do|concept rules|category rules|pre-send check|brand-specific notes/i, ['ad_idea_v2', 'video_idea_v3', 'generic_inbox_v2']],
];

/** Her follow-up section holds both follow-ups as bullets: split them so each template is one note. */
function splitFollowUps(text: string): { fu1: string; fu2: string } {
  const bullets = text.split(/\n(?=\s*[•\-*]\s)/);
  return {
    fu1: bullets.filter((b) => /follow-?up 1/i.test(b)).join('\n').trim(),
    fu2: bullets.filter((b) => /follow-?up 2/i.test(b)).join('\n').trim(),
  };
}

/** Her blocked brands from her rule line "Blocked: Innermost (commission-only), Loop Earplugs (already pitched)." */
export function blockedFromRules(text: string): string[] {
  const m = text.match(/\bBlocked:\s*([^\n]*?)(?:\.\s+Hard no\b|\.\s*$|\n)/im);
  if (!m) return [];
  return m[1].split(/,(?![^()]*\))/).map((x) => x.replace(/\([^)]*\)/g, '').trim()).filter(Boolean);
}

/** Her email sign-off as live-link HTML, rebuilt from her Output section: each "<text> ← linked to <url>" line
 *  becomes a link; the lines between stay as she wrote them. Empty when her export has no such layout. */
export function signoffFromOutput(text: string): string {
  const start = text.search(/^.*←\s*linked to\s+https?:\/\//m);
  if (start < 0) return '';
  const lines = text.slice(start).split('\n');
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*[•\-*]\s/.test(l)) break; // the next rule bullet ends the layout
    const link = l.match(/^(.*?)\s*←\s*linked to\s+(https?:\/\/\S+)/);
    if (link) out.push(`<a href="${link[2].replace(/[),.]+$/, '')}">${link[1].trim()}</a>`);
    else out.push(l.trim());
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out.map((l) => l || '').join('<br>').replace(/(<br>){3,}/g, '<br><br>');
}

export function parsePitchSystem(md: string): PitchSystemImport {
  const content = md.replace(/\r\n/g, '\n').trim();
  const all = splitSections(content);
  const res: PitchSystemImport = { content, about_jess: '', rates: '', templates: {}, blocked_list: [], signoff_html: '', placed: [], missing: [] };
  const add = (k: TemplateKey, text: string) => { if (text.trim()) res.templates[k] = res.templates[k] ? `${res.templates[k]}\n\n${text.trim()}` : text.trim(); };
  const isRates = (s: Section) => /\brates?\b|\bpricing\b/i.test(s.title);

  all.forEach((s, i) => {
    const t = s.title;
    if (/^about (me|jess)\b/i.test(t)) {
      res.about_jess = withChildren(all, i, isRates);
      res.placed.push({ heading: t, to: 'About Jess (rates kept out)' });
      return;
    }
    if (isRates(s)) { res.rates = withChildren(all, i); res.placed.push({ heading: t, to: 'Rates (never in a pitch)' }); return; }
    if (/^output\b/i.test(t) && !res.signoff_html) {
      res.signoff_html = signoffFromOutput(withChildren(all, i));
      if (res.signoff_html) res.placed.push({ heading: t, to: 'Email sign-off (live links)' });
      return;
    }
    if (/superseded|retired/i.test(t)) return;
    const route = ROUTES.find(([re]) => re.test(t));
    if (!route) return;
    const text = s.level === 1 ? withChildren(all, i) : block(s);
    if (route[1].includes('follow_up_1')) {
      const { fu1, fu2 } = splitFollowUps(s.body);
      add('follow_up_1', fu1); add('follow_up_2', fu2);
    } else {
      for (const k of route[1]) add(k, text);
    }
    res.placed.push({ heading: t, to: route[1].map((k) => `Template: ${k}`).join(', ') });
  });

  /* Tier wording: both email templates carry the same rules; this line tells the writer which wording applies. */
  if (res.templates.ad_idea_v2) res.templates.ad_idea_v2 = `Use the Tier A/B ad wording (subject "ad idea", the paid-ads question).\n\n${res.templates.ad_idea_v2}`;
  if (res.templates.video_idea_v3) res.templates.video_idea_v3 = `Use the Tier C/D video wording (subject "video idea", the paid-briefs question).\n\n${res.templates.video_idea_v3}`;
  if (res.templates.generic_inbox_v2) res.templates.generic_inbox_v2 = `Generic inbox: routing subject, routing line, and "Who's the best person to speak to about paid UGC?". Ad or video wording by tier.\n\n${res.templates.generic_inbox_v2}`;

  res.blocked_list = blockedFromRules(content);
  res.missing = ALL_TEMPLATES.filter((k) => !res.templates[k]?.trim());
  return res;
}
