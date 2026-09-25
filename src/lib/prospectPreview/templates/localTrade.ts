/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the built-in demonstration template: "Findable Local Trade".

   ONE homepage for any local trade, driven entirely by a ProspectConfig. It exists so the Prospect
   Preview works before the approved Findable trade templates (Website Build, another branch) are
   exposed for prospect use; when they are, they register in templates/index.ts and win for their
   trades. This file does not import, copy or depend on the Website Build templates.

   ⛔ NO CLIENT DATA LIVES HERE. No default name, phone, town, photo, review, credential, price or
   claim. A section whose facts are missing is LEFT OUT (no photo → no photo frame; no services →
   no services grid). Every visible sentence is either the prospect's own value, their own words
   from their site, or neutral vocabulary that asserts nothing ("Call …", "Areas we cover").

   Structure: BUSINESS → SERVICE → LOCATION → EVIDENCE, for customers, Google and AI alike:
   one H1 naming the service and the town, one H2 per section, LocalBusiness JSON-LD holding only
   the facts shown on the page.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ProspectConfig, ProspectTemplate } from '../types.ts';
import { paletteFrom } from '../color.ts';
import { tradePackFor, iconForService, type TradePack } from '../trades.ts';
import { esc, safeHref, telHref, icon, FONT_LINK, listText } from '../html.ts';

export const LOCAL_TRADE_TEMPLATE_ID = 'findable-local-trade';
export const LOCAL_TRADE_TEMPLATE_VERSION = '1.0.0';

/** Lower-case ordinary words, keep acronyms ("EICR Testing" → "EICR testing"). */
const softLower = (s: string) => s.replace(/\b([A-Z])([a-z]+)\b/g, (_m, a: string, b: string) => a.toLowerCase() + b);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function packFor(cfg: ProspectConfig): TradePack {
  const p = tradePackFor(cfg.tradeKey === 'generic' ? cfg.tradeLabel : cfg.tradeKey);
  return p;
}

function jsonLd(cfg: ProspectConfig, pack: TradePack): string {
  const b = cfg.business;
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': pack.schemaType,
    name: b.name.value,
    areaServed: cfg.areas.map((a) => ({ '@type': 'Place', name: a.value })),
  };
  if (b.phone) ld.telephone = b.phone.value;
  if (b.email) ld.email = b.email.value;
  if (b.address) ld.address = b.address.value;
  if (b.website) ld.url = b.website.value;
  if (cfg.brand.logoUrl) ld.logo = cfg.brand.logoUrl.value;
  if (cfg.brand.photos[0]) ld.image = cfg.brand.photos[0].value;
  if (b.openingHours) ld.openingHours = b.openingHours.value;
  if (cfg.services.length) {
    ld.hasOfferCatalog = { '@type': 'OfferCatalog', name: pack.servicePhrase, itemListElement: cfg.services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name } })) };
  }
  if (cfg.proof.rating) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: cfg.proof.rating.value.rating, reviewCount: cfg.proof.rating.value.count };
  // Escape "<" so a value can never close the script element.
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}

function css(p: ReturnType<typeof paletteFrom>): string {
  return `
:root{--p:${p.primary};--pi:${p.primaryInk};--d:${p.deep};--dd:${p.deeper};--t:${p.tint};--a:${p.accent};--ai:${p.accentInk};
--ink:#0f172a;--mut:#475569;--line:#e2e8f0;--bg:#ffffff;--r:14px;--hf:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;--bf:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 var(--bf);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{max-width:100%;display:block}a{color:inherit;text-decoration:none}
h1,h2,h3{font-family:var(--hf);line-height:1.12;letter-spacing:-.02em;margin:0}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}
.btn{display:inline-flex;align-items:center;gap:10px;font:700 16px/1 var(--bf);padding:16px 22px;border-radius:12px;white-space:nowrap;transition:transform .15s}
.btn-a{background:var(--a);color:var(--ai);box-shadow:0 10px 24px -10px rgba(0,0,0,.45)}
.btn-p{background:var(--p);color:var(--pi)}
.btn-o{border:1.5px solid rgba(255,255,255,.35);color:#fff}
.btn-ol{border:1.5px solid var(--line);color:var(--ink);background:#fff}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font:600 13px/1 var(--bf);letter-spacing:.08em;text-transform:uppercase}
.topbar{background:var(--dd);color:rgba(255,255,255,.78);font-size:14px}
.topbar .wrap{display:flex;gap:28px;align-items:center;min-height:42px}
.topbar span{display:inline-flex;align-items:center;gap:8px}.topbar .sp{margin-left:auto}
header.site{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid var(--line);box-shadow:0 1px 0 rgba(15,23,42,.02)}
header.site .wrap{display:flex;align-items:center;gap:32px;min-height:84px}
.logo img{max-height:56px;max-width:230px;width:auto;object-fit:contain}
.wordmark{display:flex;align-items:center;gap:12px;font:800 21px/1.1 var(--hf);letter-spacing:-.02em}
.wordmark i{font-style:normal;display:grid;place-items:center;width:42px;height:42px;border-radius:11px;background:var(--p);color:var(--pi);font-size:18px}
nav.main{display:flex;gap:28px;margin-left:auto;font-weight:600;font-size:15px;color:#334155}
header .btn{padding:13px 18px;font-size:15px}
.hero{background:var(--d);color:#fff;position:relative;overflow:hidden}
.hero:before{content:"";position:absolute;inset:0;background:radial-gradient(900px 480px at 85% -10%,rgba(255,255,255,.07),transparent 60%);pointer-events:none}
.hero .wrap{position:relative;display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center;padding-top:84px;padding-bottom:92px}
.hero .eyebrow{color:var(--a);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:9px 14px;border-radius:999px}
.hero h1{font-size:60px;font-weight:800;margin:22px 0 20px}
.hero h1 em{font-style:normal;color:var(--a)}
.hero .lede{font-size:19px;color:rgba(255,255,255,.8);max-width:560px;margin:0 0 32px}
.hero .ctas{display:flex;gap:14px;flex-wrap:wrap}
.chips{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:34px;color:rgba(255,255,255,.85);font-size:15px;font-weight:500}
.chips span{display:inline-flex;align-items:center;gap:8px}.chips svg{color:var(--a)}
.hero-photo{border-radius:22px;overflow:hidden;aspect-ratio:4/3.4;box-shadow:0 40px 80px -30px rgba(0,0,0,.6);outline:1px solid rgba(255,255,255,.1)}
.hero-photo img{width:100%;height:100%;object-fit:cover}
.hero-card{background:#fff;color:var(--ink);border-radius:20px;padding:30px;box-shadow:0 40px 80px -30px rgba(0,0,0,.55)}
.hero-card h2{font-size:22px;margin-bottom:6px}.hero-card p{color:var(--mut);margin:0 0 18px;font-size:15px}
.hero-card ul{list-style:none;margin:0 0 22px;padding:0;display:grid;gap:12px}
.hero-card li{display:flex;gap:12px;align-items:center;font-weight:600}
.hero-card li b{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--t);color:var(--p);flex:none}
.hero-card .btn{width:100%;justify-content:center}
.trust{border-bottom:1px solid var(--line);background:#fff}
.trust .wrap{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:0}
.trust div{display:flex;gap:14px;align-items:center;padding:26px 22px;border-left:1px solid var(--line)}
.trust div:first-child{border-left:0;padding-left:0}
.trust b{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--t);color:var(--p);flex:none}
.trust strong{display:block;font:700 16px/1.25 var(--hf)}.trust small{color:var(--mut);font-size:13.5px}
section{padding:96px 0}
.sec-head{max-width:720px;margin-bottom:48px}
.sec-head .eyebrow{color:var(--p)}
.sec-head h2{font-size:42px;margin:14px 0 14px}.sec-head p{color:var(--mut);margin:0;font-size:18px}
.services{background:var(--t)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.svc{background:#fff;border:1px solid rgba(15,23,42,.06);border-radius:var(--r);padding:28px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.svc b{display:grid;place-items:center;width:52px;height:52px;border-radius:14px;background:var(--p);color:var(--pi);margin-bottom:20px}
.svc h3{font-size:20px;margin-bottom:10px}.svc p{color:var(--mut);margin:0 0 18px;font-size:15.5px;flex:1}
.svc a{font-weight:700;color:var(--p);display:inline-flex;gap:8px;align-items:center;font-size:15px}
.about .wrap{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}
.about.solo .wrap{grid-template-columns:1fr}
.about-photo{border-radius:20px;overflow:hidden;aspect-ratio:5/4}.about-photo img{width:100%;height:100%;object-fit:cover}
.about h2{font-size:40px;margin:14px 0 18px}.about .eyebrow{color:var(--p)}
.about p.lead{font-size:18px;color:#334155;margin:0 0 26px}
.facts{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.facts li{display:flex;gap:14px;align-items:flex-start}.facts li b{color:var(--p);flex:none;margin-top:2px}
.areas{background:var(--d);color:#fff}
.areas .sec-head .eyebrow{color:var(--a)}.areas .sec-head p{color:rgba(255,255,255,.72)}
.area-list{display:flex;flex-wrap:wrap;gap:12px}
.area-list span{display:inline-flex;align-items:center;gap:9px;padding:13px 18px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-weight:600}
.area-list span.home{background:var(--a);color:var(--ai);border-color:transparent}
.gallery .g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.gallery .g div{border-radius:16px;overflow:hidden;aspect-ratio:4/3}.gallery img{width:100%;height:100%;object-fit:cover}
.faq{background:var(--t)}
.faq .wrap{display:grid;grid-template-columns:.8fr 1.2fr;gap:64px}
details{background:#fff;border-radius:var(--r);border:1px solid rgba(15,23,42,.06);padding:22px 26px;margin-bottom:14px}
summary{cursor:pointer;list-style:none;font:700 18px/1.35 var(--hf);display:flex;justify-content:space-between;gap:16px}
summary::-webkit-details-marker{display:none}
summary:after{content:"+";color:var(--p);font-size:24px;line-height:1}details[open] summary:after{content:"\\2013"}
details p{margin:12px 0 0;color:var(--mut)}
.cta{background:var(--p);color:var(--pi);padding:72px 0}
.cta .wrap{display:flex;align-items:center;justify-content:space-between;gap:32px}
.cta h2{font-size:38px}.cta p{margin:10px 0 0;opacity:.85;font-size:18px}
.cta .btn-a{background:#fff;color:var(--ink)}
footer{background:var(--dd);color:rgba(255,255,255,.7);padding:72px 0 28px;font-size:15px}
footer .cols{display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:40px}
footer h3{color:#fff;font-size:15px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:16px;font-family:var(--bf);font-weight:700}
footer ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
footer .logo img{max-height:52px;background:#fff;padding:8px 10px;border-radius:10px}
footer .wordmark{color:#fff}
footer .nap{margin-top:18px;display:grid;gap:8px}footer .nap span{display:flex;gap:10px;align-items:center}
footer .legal{border-top:1px solid rgba(255,255,255,.1);margin-top:48px;padding-top:24px;font-size:13.5px}
.callbar{display:none}
@media (max-width:1024px){nav.main{display:none}.hero .wrap{grid-template-columns:1fr;gap:40px}.grid{grid-template-columns:repeat(2,1fr)}footer .cols{grid-template-columns:1fr 1fr}.faq .wrap,.about .wrap{grid-template-columns:1fr;gap:36px}}
@media (max-width:640px){
body{font-size:16px;padding-bottom:76px}.wrap{padding:0 18px}
.topbar{display:none}
header.site .wrap{min-height:68px;gap:12px}.logo img{max-height:44px;max-width:170px}.wordmark{font-size:17px}.wordmark i{width:36px;height:36px;font-size:15px}
header .btn{margin-left:auto;padding:11px 14px;font-size:14px}header .btn .num{display:none}
.hero .wrap{padding-top:44px;padding-bottom:52px;gap:30px}
.hero h1{font-size:38px;margin:18px 0 14px}.hero .lede{font-size:17px;margin-bottom:24px}
.hero .ctas .btn{flex:1 1 100%;justify-content:center}
.chips{margin-top:24px;gap:10px 16px;font-size:14px}
.hero-card{padding:22px}
.trust .wrap{grid-template-columns:1fr 1fr}.trust div{padding:18px 8px;border-left:0;border-top:1px solid var(--line)}.trust div:nth-child(-n+2){border-top:0}
.trust div:first-child{padding-left:8px}.trust b{width:38px;height:38px}.trust strong{font-size:14.5px}.trust small{font-size:12.5px}
section{padding:60px 0}.sec-head{margin-bottom:30px}.sec-head h2,.about h2{font-size:30px}.sec-head p{font-size:16px}
.grid{grid-template-columns:1fr;gap:14px}.svc{padding:22px}.svc b{width:46px;height:46px;margin-bottom:14px}
.gallery .g{grid-template-columns:1fr 1fr;gap:10px}
.cta{padding:52px 0}.cta .wrap{flex-direction:column;align-items:flex-start}.cta h2{font-size:28px}.cta .btn{width:100%;justify-content:center}
footer .cols{grid-template-columns:1fr;gap:30px}
.callbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--line);box-shadow:0 -8px 24px -12px rgba(15,23,42,.25)}
.callbar a{flex:1;justify-content:center;padding:14px;min-width:0}.callbar .btn-ol{flex:0 0 auto}.callbar .btn-ol span,.callbar .num{display:none}
}`;
}

function logoBlock(cfg: ProspectConfig): string {
  const name = cfg.business.name.value;
  const logo = cfg.brand.logoUrl ? safeHref(cfg.brand.logoUrl.value) : '';
  if (logo) return `<a class="logo" href="#top" aria-label="${esc(name)} home"><img src="${logo}" alt="${esc(name)}"></a>`;
  const initials = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return `<a class="wordmark" href="#top"><i>${esc(initials || name[0])}</i><span>${esc(name)}</span></a>`;
}

export function renderLocalTrade(cfg: ProspectConfig, opts: { year?: number } = {}): string {
  const pack = packFor(cfg);
  const pal = paletteFrom(cfg.brand.primary?.value, cfg.brand.accent?.value);
  const b = cfg.business;
  const name = b.name.value;
  const town = b.town.value;
  const phone = b.phone?.value ?? null;
  const tel = phone ? telHref(phone) : '';
  const email = b.email?.value ?? null;
  const otherAreas = cfg.areas.slice(1).map((a) => a.value);
  const services = cfg.services;
  const photos = cfg.brand.photos.map((p) => safeHref(p.value)).filter(Boolean);
  const year = opts.year ?? new Date().getUTCFullYear();
  const creds = cfg.proof.credentials.map((c) => c.value);
  const summary = cfg.proof.summary?.value ?? null;

  const callBtn = (cls: string, label = 'Call') => (phone ? `<a class="btn ${cls}" href="${tel}">${icon('phone', 19)}<span>${esc(label)}</span> <span class="num">${esc(phone)}</span></a>` : '');
  const emailBtn = (cls: string) => (email ? `<a class="btn ${cls}" href="mailto:${esc(email)}">${icon('mail', 19)}<span>Email us</span></a>` : '');
  const primaryCta = phone ? callBtn('btn-a', 'Call') : emailBtn('btn-a');
  const coverLine = otherAreas.length ? `${town} and nearby, including ${listText(otherAreas.slice(0, 4))}` : town;

  /* ── hero ── */
  // Their own summary is said ONCE, in About; the hero states the services and the coverage.
  const lede = services.length
    ? `${listText(services.slice(0, 3).map((s) => s.name))} in ${coverLine}.`
    : summary ?? `${cap(pack.servicePhrase.toLowerCase())} across ${coverLine}.`;
  const chips: string[] = [];
  if (cfg.proof.rating) chips.push(`<span>${icon('star', 17)} ${esc(cfg.proof.rating.value.rating.toFixed(1))} from ${esc(cfg.proof.rating.value.count)} Google reviews</span>`);
  for (const c of creds.slice(0, 2)) chips.push(`<span>${icon('check', 17)} ${esc(c)}</span>`);
  if (cfg.proof.yearsTrading) chips.push(`<span>${icon('check', 17)} ${esc(cfg.proof.yearsTrading.value)}</span>`);
  chips.push(`<span>${icon('pin', 17)} Based in ${esc(town)}</span>`);
  const heroSide = photos[0]
    ? `<div class="hero-photo"><img src="${photos[0]}" alt="${esc(name)}"></div>`
    : services.length
      ? `<div class="hero-card"><h2>How ${esc(name)} can help</h2><p>${esc(cap(pack.servicePhrase.toLowerCase()))} in ${esc(town)}${otherAreas.length ? ' and nearby' : ''}.</p><ul>${services.slice(0, 5).map((s) => `<li><b>${icon(iconForService(pack, s.name), 17)}</b>${esc(s.name)}</li>`).join('')}</ul>${phone ? callBtn('btn-p', 'Call') : emailBtn('btn-p')}</div>`
      : '';

  /* ── trust strip ── */
  const trust: Array<[string, string, string]> = [];
  if (cfg.proof.rating) trust.push(['star', `${cfg.proof.rating.value.rating.toFixed(1)} on Google`, `${cfg.proof.rating.value.count} reviews`]);
  for (const c of creds.slice(0, 2)) trust.push(['shield', c, 'Accreditation']);
  if (cfg.proof.yearsTrading) trust.push(['check', cfg.proof.yearsTrading.value, name]);
  trust.push(['pin', `Based in ${town}`, otherAreas.length ? `Covering ${otherAreas.length + 1} areas` : 'Local to you']);
  if (phone && trust.length < 4) trust.push(['phone', phone, 'Call direct']);
  const trustHtml = trust.length >= 2
    ? `<div class="trust"><div class="wrap" style="--n:${Math.min(4, trust.length)}">${trust.slice(0, 4).map(([ic, t, s]) => `<div><b>${icon(ic as 'check', 21)}</b><span><strong>${esc(t)}</strong><small>${esc(s)}</small></span></div>`).join('')}</div></div>`
    : '';

  /* ── services ── */
  const servicesHtml = services.length ? `<section class="services" id="services"><div class="wrap">
<div class="sec-head"><span class="eyebrow">${esc(pack.servicePhrase)}</span><h2>${esc(pack.servicePhrase)} in ${esc(town)}</h2><p>${esc(name)} — ${esc(services.length === 1 ? services[0].name : `${services.length} services`)} for customers in ${esc(coverLine)}.</p></div>
<div class="grid">${services.map((s) => `<article class="svc"><b>${icon(iconForService(pack, s.name), 24)}</b><h3>${esc(s.name)}</h3><p>${esc(s.description ?? `Get in touch about ${softLower(s.name)} in ${town}.`)}</p>${phone ? `<a href="${tel}">Call about this ${icon('arrow', 16)}</a>` : email ? `<a href="mailto:${esc(email)}">Ask about this ${icon('arrow', 16)}</a>` : ''}</article>`).join('')}</div>
</div></section>` : '';

  /* ── about ── */
  const facts: string[] = [`Based in ${esc(town)}${otherAreas.length ? `, covering ${esc(listText(otherAreas.slice(0, 5)))}` : ''}`];
  if (creds.length) facts.push(`Accreditations: ${esc(listText(creds))}`);
  if (cfg.proof.yearsTrading) facts.push(esc(cfg.proof.yearsTrading.value));
  if (b.openingHours) facts.push(`Opening hours: ${esc(b.openingHours.value.join(' · '))}`);
  if (phone) facts.push(`Call direct on <a href="${tel}"><strong>${esc(phone)}</strong></a>`);
  const aboutPhoto = photos[1] ?? (photos[0] && !heroSide.includes('hero-photo') ? photos[0] : null);
  const aboutHtml = `<section class="about${aboutPhoto ? '' : ' solo'}" id="about"><div class="wrap">
${aboutPhoto ? `<div class="about-photo"><img src="${aboutPhoto}" alt="${esc(name)}"></div>` : ''}
<div><span class="eyebrow">About us</span><h2>About ${esc(name)}</h2>${summary ? `<p class="lead">${esc(summary)}</p>` : ''}
<ul class="facts">${facts.map((f) => `<li><b>${icon('check', 20)}</b><span>${f}</span></li>`).join('')}</ul></div>
</div></section>`;

  /* ── areas ── */
  const areasHtml = `<section class="areas" id="areas"><div class="wrap">
<div class="sec-head"><span class="eyebrow">Areas we cover</span><h2>${esc(cap(pack.label))} in ${esc(town)}${otherAreas.length ? ' and the surrounding area' : ''}</h2><p>${esc(name)} is based in ${esc(town)}${otherAreas.length ? ` and works across ${esc(listText(otherAreas))}` : ''}.</p></div>
<div class="area-list"><span class="home">${icon('pin', 17)} ${esc(town)}</span>${otherAreas.map((a) => `<span>${icon('pin', 17)} ${esc(a)}</span>`).join('')}</div>
</div></section>`;

  /* ── gallery (only with 3+ genuine photos beyond the ones already used) ── */
  const galleryPhotos = photos.slice(aboutPhoto === photos[1] ? 2 : 1).slice(0, 6);
  const galleryHtml = galleryPhotos.length >= 3 ? `<section class="gallery"><div class="wrap"><div class="sec-head"><span class="eyebrow">Gallery</span><h2>${esc(name)}</h2></div>
<div class="g">${galleryPhotos.slice(0, galleryPhotos.length >= 6 ? 6 : 3).map((p) => `<div><img src="${p}" alt="${esc(name)}"></div>`).join('')}</div></div></section>` : '';

  /* ── FAQ: every answer is a fact on this page ── */
  const faqs: Array<[string, string]> = [];
  faqs.push([`Which areas do you cover?`, otherAreas.length ? `We're based in ${town} and cover ${listText(otherAreas)}.` : `We're based in ${town}. Get in touch to check we cover your area.`]);
  if (services.length) faqs.push([`What ${pack.label === 'local business' ? '' : pack.label + ' '}services do you offer?`, `${listText(services.map((s) => s.name))}.`]);
  if (creds.length) faqs.push(['What accreditations do you hold?', `${listText(creds)}.`]);
  if (b.openingHours) faqs.push(['What are your opening hours?', b.openingHours.value.join(', ') + '.']);
  if (phone || email) faqs.push(['How do I get in touch?', [phone ? `Call ${phone}` : '', email ? `email ${email}` : ''].filter(Boolean).join(' or ') + '.']);
  const faqHtml = `<section class="faq" id="faq"><div class="wrap">
<div class="sec-head"><span class="eyebrow">FAQs</span><h2>Questions about ${esc(name)}</h2><p>${esc(cap(pack.label))} in ${esc(town)}.</p></div>
<div>${faqs.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
</div></section>`;

  /* ── CTA band + footer ── */
  const ctaHtml = (phone || email) ? `<div class="cta" id="contact"><div class="wrap"><div><h2>Need ${/^[aeiou]/i.test(pack.label) ? 'an' : 'a'} ${esc(pack.label)} in ${esc(town)}?</h2><p>${phone ? `Call ${esc(name)} on ${esc(phone)}` : `Email ${esc(name)} at ${esc(email)}`}.</p></div><div style="display:flex;gap:12px;flex-wrap:wrap">${phone ? callBtn('btn-a', 'Call') : ''}${emailBtn(phone ? 'btn-o' : 'btn-a')}</div></div></div>` : '';
  const nap = [
    phone ? `<span>${icon('phone', 17)} <a href="${tel}">${esc(phone)}</a></span>` : '',
    email ? `<span>${icon('mail', 17)} <a href="mailto:${esc(email)}">${esc(email)}</a></span>` : '',
    b.address ? `<span>${icon('pin', 17)} ${esc(b.address.value)}</span>` : `<span>${icon('pin', 17)} ${esc(town)}</span>`,
  ].filter(Boolean).join('');
  const footerHtml = `<footer><div class="wrap"><div class="cols">
<div>${logoBlock(cfg)}<div class="nap">${nap}</div></div>
${services.length ? `<div><h3>Services</h3><ul>${services.map((s) => `<li><a href="#services">${esc(s.name)}</a></li>`).join('')}</ul></div>` : '<div></div>'}
<div><h3>Areas</h3><ul>${cfg.areas.map((a) => `<li><a href="#areas">${esc(a.value)}</a></li>`).join('')}</ul></div>
<div><h3>Contact</h3><ul><li><a href="#contact">Get in touch</a></li><li><a href="#faq">FAQs</a></li><li><a href="#about">About</a></li></ul></div>
</div><div class="legal">&copy; ${year} ${esc(name)}</div></div></footer>`;

  const topbar = `<div class="topbar"><div class="wrap"><span>${icon('pin', 15)} ${esc(otherAreas.length ? `Covering ${town} and ${otherAreas.length} nearby areas` : `Based in ${town}`)}</span>${b.openingHours ? `<span>${icon('clock', 15)} ${esc(b.openingHours.value[0])}</span>` : ''}${email ? `<span class="sp">${icon('mail', 15)} ${esc(email)}</span>` : ''}</div></div>`;
  const nav = `<nav class="main">${services.length ? '<a href="#services">Services</a>' : ''}<a href="#areas">Areas</a><a href="#about">About</a><a href="#faq">FAQs</a><a href="#contact">Contact</a></nav>`;
  const title = `${cap(pack.label)} in ${town} | ${name}`;
  const metaDesc = `${name}: ${pack.servicePhrase.toLowerCase()} in ${coverLine}.${phone ? ` Call ${phone}.` : ''}`;

  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title><meta name="description" content="${esc(metaDesc)}">
<meta name="generator" content="Findable prospect preview ${LOCAL_TRADE_TEMPLATE_ID}@${LOCAL_TRADE_TEMPLATE_VERSION}">
${FONT_LINK}
<style>${css(pal)}</style>
<script type="application/ld+json">${jsonLd(cfg, pack)}</script>
</head><body id="top">
${topbar}
<header class="site"><div class="wrap">${logoBlock(cfg)}${nav}${primaryCta ? primaryCta.replace('btn btn-a', 'btn btn-p') : ''}</div></header>
<main>
<section class="hero" style="padding:0"><div class="wrap">
<div><span class="eyebrow">${icon('pin', 15)} ${esc(name)} · ${esc(town)}</span>
<h1>${esc(pack.servicePhrase)} in <em>${esc(town)}</em>${otherAreas.length ? ' &amp; nearby' : ''}</h1>
<p class="lede">${esc(lede)}</p>
<div class="ctas">${primaryCta}${services.length ? `<a class="btn btn-o" href="#services">Our services ${icon('arrow', 17)}</a>` : phone ? emailBtn('btn-o') : ''}</div>
<div class="chips">${chips.join('')}</div></div>
${heroSide}
</div></section>
${trustHtml}
${servicesHtml}
${aboutHtml}
${areasHtml}
${galleryHtml}
${faqHtml}
${ctaHtml}
</main>
${footerHtml}
${phone ? `<div class="callbar">${callBtn('btn-a', 'Call now')}${email ? emailBtn('btn-ol') : ''}</div>` : ''}
</body></html>`;
}

export const LOCAL_TRADE_TEMPLATE: ProspectTemplate = {
  id: LOCAL_TRADE_TEMPLATE_ID,
  version: LOCAL_TRADE_TEMPLATE_VERSION,
  name: 'Findable Local Trade (demonstration)',
  trades: '*',
  status: 'demo',
  sections: ['header', 'hero', 'trust', 'services', 'about', 'areas', 'faq', 'contact', 'footer'],
  // hero + about + a gallery of up to six.
  imageBudget: { logo: true, photos: 8 },
  render: renderLocalTrade,
};
