import{ga as Le,fU as mt,i_ as vt,i$ as pe,j0 as Ee,j1 as Ue,dX as be,j2 as Ve,j3 as Ke,j4 as Qe,j5 as Je,j6 as Ze,j7 as wt,j8 as Ae,j9 as bt,bR as xe,ja as Me,jb as xt,jc as yt,jd as kt,je as qt,ge as $t,jf as Et,jg as At,jh as Tt,ji as It,jj as St,jk as Ct,jl as Nt,jm as Ot,jn as Xe,jo as Rt,jp as et,eY as fe,jq as Te,jr as _t}from"./index-DqyojbXq.js";const Lt=28,Mt=7,Bt=[{key:"baseline_checked",label:"Baseline done — checked",hint:"The baseline has finished and you have read it. It is the document the refund is measured against, so it is checked by a person before anything is sent",kind:"tick"},{key:"baseline_sent",label:"Baseline sent",hint:"The client has been sent their baseline. Nothing sends it automatically",kind:"tick"},{key:"directories",label:"Directories added",hint:"Listed on the directories the evidence says matter for this trade",kind:"tick"},{key:"gbp_access",label:"Google profile access confirmed",hint:`Tick once you have accepted their Manager invite to ${Le}. The client saying they sent it is not this — that shows as "Client says" on the Client tab`,kind:"tick"},{key:"gbp",label:"Google Business Profile sorted",hint:`Claimed, verified and consistent with the pages. Needs the client to add ${Le} as a manager first — they are asked at sign-up and in the welcome pack`,kind:"tick"},{key:"pages",label:"Pages built",hint:"One line per planned page (the page-plan queue). Tick a page when it is live on their site",kind:"pages"},{key:"website",label:"Website",hint:"Site built or fixed where there was none / it was blocking",kind:"tick"},{key:"remeasure",label:"Week-four re-measure",hint:"Fires itself on the stored due date (RG Locksmiths: eight weeks, by his contract). Tick once you have checked the replay",kind:"remeasure"},{key:"results_sent",label:"Results sent",hint:"Stamped by the system when the four-week results email goes out (outreach_leads.remeasure_results_sent_at). Starts the client's 14-day claim window. Not a tick.",kind:"stamp"}],nn="gbp_access";function on(e){return e==="done"?"invite sent (their word, not yet confirmed by us)":e==="will_do"?"will do it later":e==="no_access"?"can't get into their profile, needs a hand":"no answer yet"}const Dt=Bt.filter(e=>e.kind==="tick"||e.kind==="remeasure");function sn(e){return e?Dt.filter(t=>e[t.key]===!0).length:0}const Pt=new Set(["planned","held","draft","approved","live"]),zt=e=>Pt.has(String(e??"")),Wt=e=>String(e??"")==="live",rn=e=>e?"live":"planned";function ln(e){const t=(e??[]).filter(i=>zt(i.status));return{built:t.filter(i=>Wt(i.status)).length,total:t.length}}function Ht(e,t){const i=e.length<=10?`${e}T00:00:00Z`:e,n=new Date(i);return n.setUTCDate(n.getUTCDate()+t),n.toISOString().slice(0,10)}function dn(e,t=Lt){return Ht(e,t)}function cn(e,t){if(!e)return{state:"none",daysUntil:null,label:"not set"};const i=new Date(e.length<=10?`${e}T00:00:00Z`:e).getTime(),n=864e5,r=Math.floor(t/n),k=Math.floor(i/n)-r;if(k<0){const C=Math.abs(k);return{state:"red",daysUntil:k,label:`overdue by ${C} day${C===1?"":"s"}`}}return k<=Mt?{state:"amber",daysUntil:k,label:k===0?"due today":`due in ${k} day${k===1?"":"s"}`}:{state:"ok",daysUntil:k,label:`due in ${k} days`}}const pn=[{key:"login_email",label:"Login email",placeholder:"e.g. the WordPress / host admin email"},{key:"host",label:"Host / platform",placeholder:"e.g. 20i · WordPress + Elementor"},{key:"access_notes",label:"Access notes",placeholder:"e.g. GBP access via Kieran; site login from Sam"}];function J(e,t,i=`${t}s`){return e===1?t:i}function Gt(e){return/^[aeiou]/i.test(String(e??"").trim())?"an":"a"}function jt(e){return e.replace(/<!--[\s\S]*?-->/g,"")}function o(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Ft(e){return["zero","once","twice","three times","four times","five times","six times"][e]??`${e} times`}function tt(e,t){const i=t>0?e/t*100:0;return i<=15?{band:"crit",key:"rare"}:i<=40?{band:"low",key:"inconsistent"}:i<=70?{band:"mid",key:"many"}:{band:"high",key:"default"}}function Yt(e,t,i){const{band:n,key:r}=tt(e,t),u=i>0?i:t;return r==="rare"?{band:n,punch:"AI rarely names you yet.",sub:`Across ${u} way${u===1?"":"s"} customers ask, you were named in ${e} of ${t} answers. This is the starting point, and it is fixable.`}:r==="inconsistent"?{band:n,punch:"You&rsquo;re being named, but not yet consistently.",sub:`You were named in ${e} of ${t} answers. That gap is the opportunity.`}:r==="many"?{band:n,punch:"You&rsquo;re being named across many of the questions that matter.",sub:`You were named in ${e} of ${t} answers. The job now is to hold these and win the rest.`}:{band:n,punch:"You&rsquo;re one of the names AI reaches for.",sub:`You were named in ${e} of ${t} answers. You are already a default recommendation across most of these questions.`}}function ge(e){const t=(e||"").trim().charAt(0).toUpperCase();return t==="A"||t==="B"?"var(--green)":t==="C"?"var(--amber)":"var(--red)"}const ye=e=>Math.max(0,Math.min(100,Number.isFinite(e)?e:0));function le(e,t,i,n,r=!1){const u=ge(e),k=44,C=2*Math.PI*k,D=`${((t==null?1:ye(t)/100)*C).toFixed(1)} ${C.toFixed(1)}`,B=(e||"").trim(),U=B.length>1?32:40,V=r&&t!=null?`<div class="gc-score">${ye(t)}/100</div>`:"";return`
        <figure class="gc">
          <svg width="${i}" height="${i}" viewBox="0 0 100 100" role="img" aria-label="${o(n)}: grade ${o(B)}${t!=null?`, score ${ye(t)} of 100`:""}">
            <circle cx="50" cy="50" r="${k}" fill="none" stroke="var(--line-strong)" stroke-width="8" />
            <circle cx="50" cy="50" r="${k}" fill="none" stroke="${u}" stroke-width="8" stroke-linecap="round"
              stroke-dasharray="${D}" transform="rotate(-90 50 50)" />
            <text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="${U}" font-weight="900" fill="${u}">${o(B)}</text>
          </svg>
          <figcaption class="gc-lbl">${o(n)}</figcaption>${V}
        </figure>`}const ie="https://findable.live",Be=`${ie}/#video`,Ut=`${ie}/media/findable-hook.mp4`,De=`${ie}/media/findable-hook-poster.jpg`,Se={high:"var(--red)",med:"var(--amber)",low:"var(--muted)"},at="You don&rsquo;t have a website yet, so we&rsquo;ll build you one.";function nt(e=!1){return`AI can&rsquo;t recommend a business it can&rsquo;t read, and right now there&rsquo;s nothing for it to read.
        We&rsquo;ll build you a simple site that&rsquo;s set up properly for AI from the start: your services,
        your area, your credentials, all written the way AI quotes them.${e?"":` Building and hosting it are
        part of the service, with no separate build fee. ${o(xt("build"))}`}`}function Pe(e=!1){return`
    <!-- NO WEBSITE &mdash; what we will build, where the SEO grade would be -->
    <section class="why" style="border-top:1px solid var(--line)">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">${at}</div>
      <p style="margin:0;max-width:70ch;font-size:14px;line-height:1.55;color:var(--muted)">
        ${nt(e)}
      </p>
    </section>`}const Vt="No technical faults found",Kt="We checked your website and didn&rsquo;t find a technical fault stopping AI from reading it. So the work here isn&rsquo;t fixing faults: it&rsquo;s making sure your site clearly sets out the services you offer, the areas you cover and who you are.";function Qt(e){if(!e)return"";const{overallGrade:t,categories:i,leadFindings:n}=e,r=ge(t),u=(n??[]).map(k=>`
          <li class="find">
            <span class="find-dot" style="background:${Se[k.severity]??"var(--faint)"}"></span>
            <span class="find-body"><b class="find-title">${o(k.title)}</b> <span class="find-detail">${o(k.detail)}</span></span>
          </li>`).join("");return`
    <!-- WEBSITE SEO &mdash; grade circles + tight findings (radar dropped); renders only when seo present -->
    <section class="seo">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">How findable is your website?</div>
      <!-- ⛔ THE LEAD FOLLOWS THE GRADE. It used to say "Here's what's holding it back" at EVERY
           grade, so an A was announced and then immediately contradicted: a good result presented as
           a problem. To a sceptical accountant that reads as manufacturing an issue to sell against,
           which is the one thing that would undo the honest-measurement argument.
           A/B: the site is in good shape, these are the remaining small things.
           C and below: the original wording, which is accurate there. -->
      <p class="seo-intro">Your site&rsquo;s overall SEO grade is <b style="color:${r}">${o(t)}</b>. This scores how well your pages are built for search engines and AI to read - the on-page and technical foundations. ${/^[AB]/i.test(t.trim())?"That is a good result: the foundations are sound. These are the small things still worth tidying.":"Here&rsquo;s what&rsquo;s holding it back."}</p>

      <div class="seo-body">
        <div class="seo-grades">
          <div class="seo-overall">${le(t,null,124,"Overall")}</div>
          <div class="seo-grade-split" aria-hidden="true"></div>
          <div class="seo-cats">
            ${le(i.onPage.grade,i.onPage.score,60,"On-Page SEO",!0)}
            ${le(i.contentTechnical.grade,i.contentTechnical.score,60,"Content & Technical",!0)}
          </div>
        </div>
        ${u?`<ul class="seo-findings">${u}
        </ul>`:""}
      </div>
    </section>`}function Jt(e){if(!e)return"";const t=(e.leadFindings??[]).map(i=>`
          <li class="find">
            <span class="find-dot" style="background:${Se[i.severity]??"var(--faint)"}"></span>
            <span class="find-body"><b class="find-title">${o(i.title)}</b> <span class="find-detail">${o(i.detail)}</span></span>
          </li>`).join("");return`
    <!-- WEBSITE ISSUES &mdash; the findings alone. No grade, no score: see seoStyle. -->
    <section class="seo">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">Website issues we can fix</div>
      <div class="seo-body">
        ${t?`<ul class="seo-findings">${t}
        </ul>`:'<p class="seo-intro">We didn&rsquo;t flag any page-level issues on the pages we checked. That&rsquo;s a small sample and separate from whether AI names you, which the results above cover.</p>'}
      </div>
    </section>`}function Zt(e,t){const i=(e.leadFindings??[]).map(u=>`
          <li class="find">
            <span class="find-dot" style="background:${Se[u.severity]??"var(--faint)"}"></span>
            <span class="find-body"><b class="find-title">${o(u.title)}</b> <span class="find-detail">${o(u.detail)}</span></span>
          </li>`).join(""),n=u=>`
        <div class="seo-grades">
          <div class="seo-overall">${le(u.overallGrade,null,124,"Overall")}</div>
          <div class="seo-grade-split" aria-hidden="true"></div>
          <div class="seo-cats">
            ${le(u.categories.onPage.grade,u.categories.onPage.score,60,"On-Page SEO",!0)}
            ${le(u.categories.contentTechnical.grade,u.categories.contentTechnical.score,60,"Content & Technical",!0)}
          </div>
        </div>`,r=t!=null&&t.measuredAt&&Number.isFinite(Date.parse(t.measuredAt))?new Date(t.measuredAt).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}):"";return`
    <!-- WEBSITE SEO GRADE (Welcome Pack) &mdash; a separate website measure, before / after; never the guarantee's number -->
    <section class="seo" data-seo="pack">
      <div class="sec-eyebrow">Your website &middot; a separate measure</div>
      <div class="sec-title">Your website&rsquo;s SEO grade</div>
      <p class="seo-intro">This grade scores how well your web pages are built for search engines and AI to read &mdash; the on-page and technical foundations. It is separate from your AI visibility. Your money-back guarantee is judged only on AI visibility, measured before we start and re-measured after four weeks; this grade does not decide it.</p>
      <p class="seo-intro"><b>Before</b> &mdash; your website as we measured it at the start: overall <b style="color:${ge(e.overallGrade)}">${o(e.overallGrade)}</b>.</p>
      <div class="seo-body">
        ${n(e)}
        ${i?`<ul class="seo-findings">${i}
        </ul>`:""}
      </div>
      ${t?`<p class="seo-intro"><b>After</b> &mdash; measured${r?` on ${o(r)}`:""}: overall <b style="color:${ge(t.seo.overallGrade)}">${o(t.seo.overallGrade)}</b>.</p>
      <div class="seo-body">${n(t.seo)}</div>`:'<p class="seo-intro"><b>After</b> &mdash; not measured yet. An after grade appears here only once your website has actually been scanned again; we never estimate one.</p>'}
    </section>`}const Xt=`
  :root{
    /* ══ THE BRAND: DARK WITH GOLD. LIGHT BODY. (Paul, 2026-09-13) ═══════════════════════════
       Everything that used to be Findable BLUE (#1a3d7c, the pale blue tints, the navy footer) is
       the site's charcoal now — its --color-band #101114, --color-foot #0A0B0D, gold #FFD13F — and
       the body stays light and readable. --blue KEEPS ITS NAME because 20 rules and three
       documents read it; renaming it would be a second edit for no pixel. Its VALUE is charcoal.
       ⚠️ Text on the band/CTA/footer: white on #101114 is 18:1, --on-band-muted 11:1, gold 13:1,
       charcoal text on a gold button 12:1 — every pairing that sat on blue was re-checked on
       charcoal and passes. Amber (--amber, chosen for a LIGHT ground) never sits on a dark surface
       in this document: the grade rings, the measuring banner and the severity dots are all on the
       light body. If one ever moves onto the band, it needs gold there and amber in print.
       ⚠️ PRINT NEEDS NOTHING NEW: the band and footer were already dark and already forced with
       print-color-adjust; charcoal prints exactly as navy did. */
    --blue:#101114; --blue-2:#2C2D34; --yellow:#FFD13F;
    --ink:#0f172a; --muted:#5b6472; --faint:#9aa3b2; --line:#e9edf3;
    --line-strong:#94a3b8; /* darker grey &mdash; for SEO graphics that must stay visible on the --page tint */
    --red:#e11d2a; --amber:#c2820b; --green:#15a34a; --paper:#ffffff; --page:#eef1f6;
    --foot:#0A0B0D;
    /* ── EVERY OTHER COLOUR IN THE DOCUMENT, NAMED (step 1 of the dark theme, 2026-09-13). ──
       These carry exactly the values that used to sit inline, so this step changes no pixel. They
       exist so a second token set (dark for screen, light for print) can swap ALL of them at once:
       a recolour over a half-tokenised file is how one path looks right and the other five wrong.
       ⚠️ Text on the band/footer/CTA is grouped as --on-band-* because those surfaces are dark;
       the -tint tokens are the pale panels of the light body. (No backticks in this comment: a
       backtick inside this template literal terminates the whole stylesheet — CLAUDE.md §3.) */
    --ink-2:#334155;                                            /* body copy one step lighter than --ink */
    /* On the charcoal surfaces: neutral greys from the site (its --color-faint / --color-panel-3),
       replacing the blue-cast greys that suited navy. */
    --on-band:#ffffff; --on-band-muted:#c9cbd1; --on-band-faint:#9C9FA7; --on-band-soft:#dcdee3;
    --foot-text:#c9cbd1; --foot-muted:#9C9FA7;
    --red-tint:#fff5f5; --red-tint-2:#fdeaea; --on-red-tint:#3d0f12;
    --green-tint:#e7f6ee; --amber-tint:#fff8ea; --amber-tint-2:#fdf3dd;
    /* The pale BLUE tints are the site's neutral panels now (--color-panel / --color-panel-2). */
    --blue-tint:#f0f1f3; --blue-tint-2:#e9eaed;
    --panel-tint:#f8fafc; --panel-tint-2:#f1f5f9;
    --gold:#FFD13F; --on-gold:#3a2d05;
    --gold-tint:#fffaeb; --gold-line:#e6c968; --on-gold-tint:#8a6d1a; --on-gold-tint-2:#6b5a1e;
    /* ── ENGINE IDENTITY COLOURS (paid summary only) ────────────────────────────────────────────
       ⛔ THESE IDENTIFY AN ENGINE, THEY DO NOT GRADE A RESULT. Green is ChatGPT and purple is
       Gemini whatever the numbers say — a client reading 2% next to a green card and 63% next to a
       purple one must not conclude that green means good. Red is deliberately absent: Gemini's low
       score is a measurement, not a failing, and colouring it red would grade it.
       ⚠️ Contrast measured, not eyeballed: #0f7a46 on #eef8f2 is 4.97:1 and #5f3fa8 on #f4f1fb is
       6.81:1 — both pass AA for normal text, never mind the 46px numerals they carry. */
    --eng-gpt:#0f7a46; --eng-gpt-tint:#eef8f2; --eng-gpt-line:#cfe7da;
    --eng-gem:#5f3fa8; --eng-gem-tint:#f4f1fb; --eng-gem-line:#ded5f2;
    /* Secondary copy that must stay READABLE while reading as secondary. --faint is 2.54:1 on
       white, which is decoration rather than text; size and spacing do the demoting instead. */
    --muted-2:#6b7280;
    /* The welcome pack's code boxes were navy; charcoal now (--color-navy-800), site ink on it. */
    --mono-bg:#17181C; --mono-text:#F7F7F5; --mono-light-text:#1e293b;
    --video-bg:#000000;
  }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body{ margin:0; padding:0; }
  body{ background:var(--page); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.5; -webkit-font-smoothing:antialiased; }
  .sheet{ max-width:760px; margin:24px auto; background:var(--paper); border-radius:14px; overflow:hidden;
    box-shadow:0 8px 40px rgba(15,23,42,.12); }

  /* Header band &mdash; Findable blue with a yellow wordmark and a wave bottom edge */
  .band{ position:relative; background:var(--blue); color:var(--on-band); padding:22px 28px 34px; }
  .band-row{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .wordmark{ font-size:22px; font-weight:900; letter-spacing:-.02em; color:var(--yellow); }
  .wordmark .dot{ color:var(--on-band); }
  .band-meta{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--on-band-faint); font-weight:700; }
  .wave{ position:absolute; left:0; right:0; bottom:-1px; width:100%; height:38px; display:block; }
`,ea=`
  .site-foot{ background:var(--foot); padding:12px 28px 14px; }
  .site-foot .row{ display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;
    font-size:11px; color:var(--foot-text); font-weight:400; }
  .site-foot .row b{ color:var(--on-band); font-weight:700; }
  .site-foot .row a{ color:var(--yellow); text-decoration:none; }
  .site-foot .note{ margin-top:8px; font-size:11px; font-weight:400; color:var(--foot-muted); }
  /* The note carries the contact links in the welcome pack. Unstyled they render browser-default
     blue on the near-black footer: unreadable and off-brand. Gold is 13:1 on this ground. */
  .site-foot .note a{ color:var(--yellow); text-decoration:none; font-weight:700; }
  .site-foot .site-link{ margin-top:8px; font-size:11px; font-weight:400; color:var(--foot-muted); }
  .site-foot .site-link a{ color:var(--yellow); text-decoration:none; font-weight:700; }
`,ta=`  @page{ size:A4; margin:10mm; }
  @media print{
    html,body,.sheet,.band,.site-foot{ -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body{ background:var(--paper); }
    .sheet{ margin:0; max-width:none; box-shadow:none; border-radius:0; }
    .sheet + .sheet{ break-before:page; page-break-before:always; }
    .band,.site-foot{ break-inside:avoid; }
    /* A PDF cannot play video: hide the player, show the poster as a clickable caption.
       The link survives print-to-PDF; the play button would not. */
    .vid video{ display:none !important; }
    .vid .vid-poster{ display:block !important; width:196px; text-decoration:none; color:var(--ink); }
    .vid .vid-poster img{ display:block; width:196px; border-radius:12px; }
    .vid .vid-poster span{ display:block; margin-top:6px; font-size:11px; line-height:1.4; color:var(--blue); text-decoration:underline; }
    .vid-row{ break-inside:avoid; }
  }`;function ze(e){return`<header class="band">
      <div class="band-row">
        <div class="wordmark">Findable<span class="dot">.</span></div>
        <div class="band-meta">${e}</div>
      </div>
      <svg class="wave" viewBox="0 0 1200 38" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,14 C220,42 420,-4 640,15 C860,34 1010,4 1200,19 L1200,38 L0,38 Z" style="fill:var(--paper)"/>
      </svg>
    </header>`}function aa(e){return`<footer class="site-foot">
      <div class="row">
        <span>Prepared for <b>${o(e.businessName)}</b></span>
        <span>${e.metaHtml}</span>
      </div>
      <div class="note">${e.note}</div>
      <div class="site-link"><a href="${o(ie)}" target="_blank" rel="noopener noreferrer">findable.live</a> &middot; Findable measures how often AI names local businesses, and fixes what it reads.</div>
    </footer>`}const Ce='<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.1419.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>',ot=e=>`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${e}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285f4"/><stop offset=".5" stop-color="#9b72cb"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs><path fill="url(#${e})" d="M12 2c.45 5.1 3.4 8.05 8.5 8.5-5.1.45-8.05 3.4-8.5 8.5-.45-5.1-3.4-8.05-8.5-8.5 5.1-.45 8.05-3.4 8.5-8.5Z"/></svg>`,it=e=>/chatgpt|openai|gpt/i.test(e),We=e=>it(e)?`<span class="cc-mark cc-mark--oai">${Ce}</span>`:`<span class="cc-mark cc-mark--gem">${ot("gemMark")}</span>`,na=e=>it(e)?`<div class="cc-avatar cc-avatar--oai">${Ce}</div>`:`<div class="cc-avatar cc-avatar--gem">${ot("gemAvatar")}</div>`,oa=4,st={sitemap_wrong_domain:{title:"Your sitemap points at a different website",why:"A sitemap is the file that lists your pages so search and AI tools can follow them. Yours lists pages on another web address, which can give them conflicting information about which website is really yours.",label:"Found in your sitemap"},canonical_off_domain:{title:"A page names a different website as the main version",why:"Inside each page there is a setting that says which address should be treated as the original. On this page it names a different website, which can create conflicting information about which site is meant to be treated as yours.",label:"Set on this page"},schema_wrong_domain:{title:"Your business details point at a different website",why:"Your pages carry a block of business information written for software to read. It gives a different web address to the one the site is on, which can make the business harder to tie back to one clear website.",label:"Written into the page"},noindex_important_page:{title:"A main page is marked not to be listed",why:"The page looks completely normal to a visitor, but it carries a line asking search tools to leave it out of their results. That may mean it is not there to be picked up when somebody searches for what you do.",label:"Found on this page"}};function ia(e){const t=st[e.kind];if(!t)return"";const i=e.evidence.counted&&e.evidence.counted.of>0?`<span class="ev-k">${e.evidence.counted.matched} of ${e.evidence.counted.of} checked${e.evidence.subject?` &middot; your site is on ${o(e.evidence.subject)}`:""}</span>`:e.evidence.subject?`<span class="ev-k">Your site is on ${o(e.evidence.subject)}</span>`:"",n=e.evidence.observed.map(u=>o(u)).join("<br>"),r=e.pageUrl?`<span class="ev-k">${o(t.label)}: ${o(e.pageUrl)}</span>`:"";return`
        <div class="ev-item">
          <p class="ev-t">${o(t.title)}</p>
          <p class="ev-p">${o(t.why)}</p>
          <p class="ev-proof">${r}${i}${n}</p>
        </div>`}const sa=420;function ra(e,t){const i=(e||"").trim();if(i.length<=t)return i;const n=i.slice(0,t),r=Math.max(n.lastIndexOf(". "),n.lastIndexOf("! "),n.lastIndexOf("? "));return r>t*.5?n.slice(0,r+1).trim():n.trim()+"…"}function la(e,t,i,n={}){if(!e)return"";const r=n.quote!==!1,u=new Set,k=e.namedInstead.filter(V=>{const F=V.trim().toLowerCase();return!F||u.has(F)?!1:(u.add(F),!0)}).slice(0,5),C=(e.answerExcerpt??"").replace(/\s+/g," ").trim(),W=yt(C)||kt(C)?"":ra(qt(C),sa),D=W&&r?`
          <p class="cc-label">${o(e.engineLabel)} replied</p>
          <blockquote class="ev-quote">${o(W)}</blockquote>`:"",B=k.length?`
          <p class="cc-label">Businesses it named</p>
          <ol class="cc-list ev-list">${k.map(V=>`<li>${o(V)}</li>`).join("")}</ol>`:"",U=i?`<span class="cc-date">${o(i)}</span>`:"";return`
      <section class="chatcard evcard">
        <div class="cc-head">
          <span class="cc-engine">Asked ${o(e.engineLabel)}</span>${U}
        </div>
        <div class="cc-body">
          <p class="cc-label">Question</p>
          <div class="cc-q-plain">&ldquo;${o(e.question)}&rdquo;</div>${D}${B}
        </div>
        <div class="cc-callout"><span class="cc-bang">!</span>${o(t)} wasn&rsquo;t named.</div>
      </section>`}function rt(e,t,i){const n=Ve(e,t);if(!e.gap)return`
    <!-- ADAPTIVE HOOK: no gap in the searches tested -->
    <section class="hook">
      <div class="hook-eyebrow">${o(n.eyebrow)}</div>
      <div class="hook-vk">The verdict</div>
      <h1 class="hook-head ok">${o(n.headline)}</h1>
      <p class="hook-named">${o(n.lede)}</p>
      <p class="hook-caveat">${o(n.caveat)}</p>
    </section>`;const r=e.gap;return`
    <!-- ADAPTIVE HOOK (restored toward the original report layout, 2026-09-21 — page 1 of the
         baseline PDF is the visual reference). Shows ONLY the failed search: no list of every
         question tested, no earlier-successful-question line, no cross-engine qualifier, no
         process/execution-count wording — the adaptive question count is internal methodology,
         not something a prospect needs to see. The model/evidence box IS the result. -->
    <section class="hook">
      <div class="hook-eyebrow">${o(n.eyebrow)}</div>
      <div class="hook-vk">The verdict</div>
      <h1 class="hook-head">${o(n.headline)}</h1>
      ${la(r,t,i)}
      <p class="hook-caveat">${o(n.caveat)}</p>
    </section>`}function da(){return`
    <section class="measuring">
      <div class="sec-eyebrow">Quick AI Visibility Check</div>
      <div class="sec-title">This check didn&rsquo;t finish.</div>
      <p>An AI engine didn&rsquo;t return a usable answer to every question, so there is no score to show. A number built on missing answers would be wrong, so we don&rsquo;t show one.</p>
    </section>`}const ca=e=>`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="${e}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset=".45" stop-color="#a855f7"/><stop offset=".75" stop-color="#e8578a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><path fill="url(#${e})" d="M12 1.5c.5 5.7 3.8 9 9.5 9.5-5.7.5-9 3.8-9.5 9.5-.5-5.7-3.8-9-9.5-9.5 5.7-.5 9-3.8 9.5-9.5Z"/></svg>`;let lt=0;function Ne(e){return e==="chatgpt"?`<span class="q4-mk q4-mk--gpt">${Ce}</span>`:`<span class="q4-mk q4-mk--gai">${ca(`q4gai${++lt}`)}</span>`}function pa(e,t){return t>0?e<=0?"red":e/t<.5?"amber":"green":""}function ha(e,t){const{band:i}=tt(e,t);return i==="high"?"green":i==="mid"?"amber":"red"}function dt(e){const t=String(e||"").trim().replace(/\s+(?:ltd|limited)\.?$/i,"").trim();if(!t)return[];const i=new Set([String(e).trim(),t,t.replace(/\s&\s/g," and "),t.replace(/\sand\s/gi," & ")]),n=t.split(/\s+/);for(let r=n.length-1;r>=3;r--){const u=n[r-1].toLowerCase();["and","&","the","of","for","in","at"].includes(u)||i.add(n.slice(0,r).join(" "))}return[...i].filter(r=>r.length>=3)}const ua={high:0,medium:1,low:2},ga={high:"High",medium:"Medium",low:"Low"},fa={high:"high",medium:"med",low:"low"},Ie=e=>e.severity??(e.minor?"medium":"high");function ma(e,t,i){var k,C;const n=i==null?void 0:i.score,r=n?n.perEngine.length:0,u=n&&n.googleAiInScore&&n.questions>0&&r>0?`${n.questions} ${J(n.questions,"question")} &times; ${r} AI ${J(r,"engine")}, plus Google AI where Google showed an AI answer &middot; ${n.total} ${J(n.total,"answer")} scored`:n&&n.questions>0&&r>0?`${n.questions} ${J(n.questions,"question")} &times; ${r} AI ${J(r,"engine")} &times; 1 ask each &middot; ${n.total} ${J(n.total,"answer")} total${(k=i==null?void 0:i.overviews)!=null&&k.length?(C=i==null?void 0:i.score)!=null&&C.googleAiInScore?" &middot; plus Google AI where Google showed an AI answer":" &middot; plus Google AI, shown for context":""}`:"";return`<header class="q4-head">
      <div class="q4-brand"><div class="q4-wm">Findable<span>.</span></div><div class="q4-sub">AI visibility quick audit</div></div>
      <div class="q4-meta">
        <div class="q4-meta-top"><span class="q4-meta-k">Report for</span><span class="q4-date">${o(t)}</span></div>
        <div class="q4-biz">${o(e)}</div>${u?`
        <div class="q4-method">${u}</div>`:""}
      </div>
    </header>`}const ke={page:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>',globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.8"/></svg>',chart:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="13" width="4" height="7" rx="1.2"/><rect x="10" y="9" width="4" height="11" rx="1.2"/><rect x="16" y="4" width="4" height="16" rx="1.2"/></svg>',people:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="8.5" r="2.5"/><path d="M2.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5z"/><path d="M13.6 19c.2-1.9-.4-3.6-1.5-4.8.9-.6 2-.9 3.3-.9 2.8 0 5.1 2 5.1 5.7z"/></svg>',spark:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 5 3.6 8.1 8.6 8.6-5 .5-8.1 3.6-8.6 8.6-.5-5-3.6-8.1-8.6-8.6 5-.5 8.1-3.6 8.6-8.6Z"/></svg>'},va=220,wa=5,ba=e=>e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");function He(e,t){let i=1/0;for(const n of t){const r=String(n||"").trim();for(const u of[r,r.replace(/\s+(?:ltd|limited)\.?$/i,"").trim()]){if(u.length<3)continue;const k=new RegExp(`(?<![A-Za-z0-9])${ba(u)}(?![A-Za-z0-9])`,"i").exec(e);k&&k.index<i&&(i=k.index)}}return i}function xa(e,t,i){const n=String(e||""),r=t.map((u,k)=>({name:u,me:!1,at:He(n,[u]),i:k}));if(i){const u=He(n,dt(i));r.push({name:i,me:!0,at:Number.isFinite(u)?u:-1,i:-1})}return r.sort((u,k)=>(u.at===k.at?0:u.at<k.at?-1:1)||u.i-k.i).map(({name:u,me:k})=>({name:u,me:k}))}function ya(e,t){const i=At(e,va,t);if(!i)return"";const n=i.blocks.map(r=>r.text.trim()).filter(Boolean).join(" ").replace(/\s+/g," ");return n?`<p class="q4-snip">&ldquo;${i.lead?"&hellip; ":""}${o(n)}${i.truncated?" &hellip;":""}&rdquo;</p>`:""}function ka(e){const t=[];let i=0,n=0;for(const r of e){if(r.me){t.push(r);continue}i<wa?(t.push(r),i++):n++}return t.length?`<ul class="q4-list">${t.map(r=>r.me?`<li class="q4-who q4-who--me"><span class="q4-ico" aria-hidden="true">&#10003;</span><span class="q4-sr">Named you: </span><span class="q4-nm">${o(r.name)}</span></li>`:`<li class="q4-who q4-who--rival"><span class="q4-ico" aria-hidden="true">&#10005;</span><span class="q4-sr">Competitor: </span><span class="q4-nm">${o(r.name)}</span></li>`).join("")}${n>0?`<li class="q4-more">+${n} more</li>`:""}</ul>`:""}function Ge(e){const t=e.engine==="chatgpt"?"gpt":e.engine==="ai_overview"?"aio":"gai",i=`<div class="q4-reply-h">${Ne(e.engine)}<span class="q4-reply-n">${o(e.label)}</span>${e.tag?`<span class="q4-tag">${o(e.tag)}</span>`:""}</div>`;if(e.named===null)return`
          <div class="q4-reply q4-reply--${t}">${i}<p class="q4-none">${o(e.emptyNote??"No answer")}</p></div>`;const n=ka(xa(e.answerText,e.names,e.named?e.businessName:null)),r=e.named?"":'<p class="q4-none">You weren&rsquo;t mentioned</p>',u=e.emptyNote&&!e.names.length?`<p class="q4-none">${o(e.emptyNote)}</p>`:"",k=ya(e.answerText,e.named?dt(e.businessName):e.names);return`
          <div class="q4-reply q4-reply--${t}">${i}${r}${n}${u}${k}</div>`}function qa(e){var r;const t=$t(e.overviews??[]),i=((r=e.score)==null?void 0:r.googleAiInScore)===!0,n=i?t&&t.shown>0?"In score":"":Ke;return`<div class="q4-aio q4-aio--${Qe(t)}" data-aio="${ct(t)}" data-in-score="${i}" title="${o(Je(t,i))}">${Ne("ai_overview")}<span class="q4-aio-t">${o(Ze(t))}</span>${n?`<span class="q4-aio-n">${o(n)}</span>`:""}</div>`}function je(e,t=!1){const i=e??null,n=t?i&&i.shown>0?"In score":"":Ke;return`<p class="aio-chip aio-chip--${Qe(i)}" data-aio="${ct(i)}" data-in-score="${t}" title="${o(Je(i,t))}"><span class="aio-chip-t">${o(Ze(i))}</span>${n?`<span class="aio-chip-n">${o(n)}</span>`:""}</p>`}function ct(e){return e&&e.shown>0?"shown":wt(e)===pe?"none":"unknown"}function $a(e,t,i,n=!1){const r=e.score;if(e.shape!=="six"||!r)return rt(e,t);lt=0;const u=Ve(e,t),k=ha(r.named,r.total),C=Math.max(0,r.total-r.named),W=r.perEngine.map(_=>{const Z=pa(_.named,_.total),$=_.total>0?Math.round(_.named/_.total*100):0;return`
          <div class="q4-eng q4-eng--${_.engine==="chatgpt"?"gpt":"gai"}">
            <div class="q4-eng-h">${Ne(_.engine)}<span>${o(_.label)}</span></div>
            <b class="q4-eng-v${Z?` q4-t-${Z}`:""}">${$}%</b>
            <span class="q4-eng-s">${_.named} of ${_.total} ${J(_.total,"answer")}</span>
          </div>`}).join(""),D=`
    <section class="q4-score">
      <div class="q4-score-in">
        <div class="q4-overall">
          <span class="q4-k"><i></i>Overall AI visibility</span>
          <b class="q4-t-${k}">${r.percent}%</b>
          <span class="q4-overall-s">${r.named} of ${r.total} ${J(r.total,"answer")} named your business</span>
        </div>
        <div class="q4-engs">${W}
        </div>
        ${qa(e)}
      </div>
      <p class="q4-verdict">${o(u.headline)}</p>
    </section>`,B=e.rivalsNamedInstead,U=C>0?`${C} of ${r.total} ${J(r.total,"answer")} didn&rsquo;t name you.${typeof B=="number"&&B>0?` ${B} other ${B===1?"business was":"businesses were"} named instead.`:""}`:`All ${r.total} ${J(r.total,"answer")} named you.`,V=e.overviews??[],F=e.rivalsNamedInstead===null,se=e.tested.map((_,Z)=>{const $=r.perEngine.map(w=>{const d=_.perEngine.find(b=>b.engine===w.engine);return Ge({engine:w.engine,label:w.label,named:d?d.named:null,names:(d==null?void 0:d.names)??[],answerText:(d==null?void 0:d.answerText)??"",businessName:t})}).join(""),q=V.find(w=>w.questionIndex===Z&&(w.state==="shown"||w.state==="not_shown")),v=q?Ge({engine:"ai_overview",label:Ae,tag:r.googleAiInScore?q.state==="not_shown"?"Left out of the score":"In score":"Shown for context · not in score",named:q.state==="not_shown"?null:!!q.named,names:q.names,answerText:q.answerText,businessName:t,emptyNote:q.state==="not_shown"?pe:!q.named&&!F?bt:void 0}):"";return`
      <article class="q4-chat">
        <div class="q4-chat-q"><span class="q4-sr">Question ${Z+1}: </span>${o(_.question)}</div>
        <div class="q4-replies">${$}${v}
        </div>
      </article>`}).join(""),de=i.state==="issues"?`
      <section class="q4-panel q4-panel--site">
        <h2 class="q4-h">Website issues we found</h2>
        <div class="q4-rows">${i.issues.map(_=>{const Z=fa[Ie(_)];return`
          <div class="q4-issue"><span class="q4-ic q4-ic--${Z}">${ke.page}</span><div><div class="q4-issue-t">${o(_.title)} <span class="q4-sev q4-sev--${Z}">${ga[Ie(_)]}</span></div><p class="q4-issue-p">${o(_.detail)}</p>${_.evidence?`<p class="q4-issue-ev"><b>We found:</b> ${o(_.evidence)}</p>`:""}</div></div>`}).join("")}
        </div>
      </section>`:i.state==="none"?`
      <section class="q4-panel q4-panel--site">
        <h2 class="q4-h">Your website</h2>
        <div class="q4-issue"><span class="q4-ic q4-ic--high">${ke.globe}</span><div><div class="q4-issue-t">${at}</div><p class="q4-issue-p">${nt(n)}</p></div></div>
      </section>`:i.state==="clean"?`
      <section class="q4-panel q4-panel--site">
        <h2 class="q4-h">Your website</h2>
        <div class="q4-issue"><span class="q4-ic q4-ic--ok">${ke.check}</span><div><div class="q4-issue-t">${Vt}</div><p class="q4-issue-p">${Kt}</p></div></div>
      </section>`:"";return`
    <style>${Aa}</style>${D}
    <div class="q4-body">
      <p class="q4-sum">${U}</p>
      <section class="q4-chats" aria-label="What each AI said">${se}
      </section>
      <p class="q4-caveat">${o(u.caveat)}</p>${de}
    </div>`}function Ea(e){return`
    <footer class="q4-foot">${e.pitch?`
      <div class="q4-foot-cta">
        <h3>Want to be the one AI names?</h3>
        <div class="cta-actions">
          ${e.startBtn}
          ${e.requestCallBtn}
          <a class="cta-btn wa" href="${e.waHref}" target="_blank" rel="noopener noreferrer">Ask me anything</a>
        </div>
        <a class="cta-site" href="${o(ie)}" target="_blank" rel="noopener noreferrer">See how it works at findable.live &rarr;</a>
      </div>
      ${e.promiseHtml?`<div class="q4-foot-card q4-foot-promise"><span class="foot-k">Your guarantee</span><p class="cta-promise">${e.promiseHtml}</p></div>`:""}`:""}
      <div class="q4-foot-grid">
        <div class="q4-foot-card"><span class="foot-k">Prepared for</span><span class="foot-v">${o(e.businessName)}</span></div>
        <div class="q4-foot-card"><span class="foot-k">Report date</span><span class="foot-v">${o(e.dateLabel)}</span></div>
        <div class="q4-foot-card"><span class="foot-k">Measured on</span><span class="foot-v">${e.measuredOnHtml}</span></div>
      </div>
      <div class="q4-foot-brand"><span class="foot-brand">Findable<span class="foot-dot">.</span></span><a class="foot-cta" href="${o(ie)}" target="_blank" rel="noopener noreferrer">findable.live</a></div>
      <div class="foot-note">${e.noteHtml}</div>
    </footer>`}const Aa=`
  body{background:#f7f5f1}
  .sheet{max-width:920px;background:#f7f5f1;box-shadow:0 1px 0 rgba(16,17,20,.06)}
  .q4-head,.q4-score,.q4-body,.q4-foot{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .q4-head{background:#101114;color:#fff;padding:22px 32px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px 28px;flex-wrap:wrap}
  .q4-wm{font-size:30px;font-weight:800;letter-spacing:-.035em;line-height:1;color:#fff}
  .q4-wm span{color:#fcc933}
  .q4-sub{margin-top:8px;font-size:10.5px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#a3a5ab}
  .q4-meta{text-align:right;min-width:0}
  .q4-meta-top{display:flex;justify-content:flex-end;gap:18px;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#a3a5ab}
  .q4-date{color:#d4d5d9}
  .q4-biz{font-size:16px;font-weight:700;color:#fff;margin-top:4px}
  .q4-method{margin-top:6px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fcc933;opacity:.9}
  .q4-score{background:#101114;padding:4px 24px 22px}
  .q4-score-in{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:14px;align-items:stretch}
  .q4-overall{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:18px 22px}
  .q4-k{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#dcdde0}
  .q4-k i{width:10px;height:10px;border-radius:3px;background:#fcc933;display:inline-block}
  .q4-overall b{display:block;font-size:84px;font-weight:900;letter-spacing:-.06em;line-height:.95;margin-top:10px}
  .q4-overall-s{display:block;font-size:15px;color:#ebebed;margin-top:8px;line-height:1.35}
  .q4-t-red{color:#ff6b75} .q4-t-amber{color:#ffbe3d} .q4-t-green{color:#4ade80}
  .q4-engs{display:contents}
  .q4-eng{border-radius:18px;padding:16px 18px;border:1px solid rgba(255,255,255,.09);display:flex;flex-direction:column;justify-content:center}
  .q4-eng--gpt{background:linear-gradient(160deg,rgba(74,222,128,.10),rgba(255,255,255,.03))}
  .q4-eng--gai{background:linear-gradient(160deg,rgba(167,139,250,.16),rgba(255,255,255,.03))}
  .q4-eng-h{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;color:#fff}
  .q4-eng-h .q4-mk{width:28px;height:28px}
  .q4-eng-v{font-size:46px;font-weight:900;letter-spacing:-.05em;line-height:1;margin-top:12px;color:#fff}
  .q4-eng-v.q4-t-red{color:#ff6b75} .q4-eng-v.q4-t-amber{color:#ffbe3d} .q4-eng-v.q4-t-green{color:#4ade80}
  .q4-eng-s{font-size:13px;color:#bdbec3;margin-top:6px}
  .q4-aio{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;border-radius:14px;padding:9px 14px;border:1px dashed rgba(255,255,255,.18);background:rgba(255,255,255,.04);font-size:14px;color:#fff}
  .q4-aio .q4-mk{width:22px;height:22px}
  .q4-aio-t{font-weight:750}
  .q4-aio--named .q4-aio-t{color:#4ade80} .q4-aio--not_named .q4-aio-t{color:#ff6b75}
  .q4-aio-n{font-size:12px;color:#bdbec3}
  .q4-verdict{margin:16px 2px 0;font-size:18px;font-weight:750;color:#fff;letter-spacing:-.01em;padding-left:12px;border-left:3px solid #fcc933}
  .q4-mk{display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:50%;width:22px;height:22px;vertical-align:middle}
  .q4-mk svg{width:62%;height:62%;display:block}
  .q4-mk--gpt{background:#0d0d0d;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)} .q4-mk--gpt svg{fill:#fff}
  .q4-mk--gai{background:#fff;box-shadow:inset 0 0 0 1px #e2e0da} .q4-mk--gai svg{width:70%;height:70%}
  .q4-body{background:#f7f5f1;padding:20px 24px 8px}
  .q4-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .q4-sum{margin:0 0 16px;font-size:16px;font-weight:700;line-height:1.4;color:#101114}
  .q4-chats{display:grid;gap:16px}
  .q4-chat{background:#fff;border:1px solid #e6e2d9;border-radius:18px;padding:16px;min-width:0;break-inside:avoid;page-break-inside:avoid}
  .q4-chat-q{margin:0 0 12px auto;max-width:88%;width:fit-content;background:#ebe9e4;color:#101114;font-size:15px;font-weight:650;line-height:1.4;padding:10px 14px;border-radius:16px 16px 4px 16px;overflow-wrap:anywhere}
  .q4-replies{display:grid;gap:10px}
  .q4-reply{max-width:94%;background:#fff;border:1px solid #ebe8e1;border-radius:4px 16px 16px 16px;padding:11px 14px;min-width:0}
  .q4-reply-h{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;margin:0 0 8px}
  .q4-reply-n{font-size:13.5px;font-weight:800;color:#101114}
  .q4-reply-h .q4-mk{width:22px;height:22px}
  .q4-tag{font-size:11px;font-weight:600;color:#6b6c72;background:#efeeea;border-radius:999px;padding:2px 8px}
  .q4-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
  .q4-who{display:flex;align-items:flex-start;gap:8px;font-size:14.5px;font-weight:700;line-height:1.35;padding:6px 10px;border-radius:10px;border:1px solid;min-width:0}
  .q4-nm{min-width:0;overflow-wrap:anywhere}
  .q4-ico{flex:none;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;line-height:1;margin-top:1px;color:#fff}
  .q4-who--me{background:#e7f6ec;border-color:#b9e2c7;color:#0d5c2c}
  .q4-who--me .q4-ico{background:#15803d}
  .q4-who--rival{background:#fff;border-color:transparent;color:#b3121e;padding:2px 10px}
  .q4-who--rival .q4-ico{background:#c81e2b}
  .q4-more{font-size:13px;font-weight:600;color:#6b6c72;padding:2px 2px 0}
  .q4-none{margin:0 0 6px;font-size:14px;font-weight:600;color:#5d5e63}
  .q4-snip{margin:8px 0 0;font-size:13px;line-height:1.5;color:#55565c;font-style:italic;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;overflow-wrap:anywhere}
  .q4-caveat{margin:14px 2px 18px;font-size:13px;line-height:1.45;color:#5d5e63}
  .q4-panel{background:#fff;border:1px solid #e6e2d9;border-radius:18px;padding:16px 18px 12px;margin-bottom:18px;break-inside:avoid;page-break-inside:avoid}
  .q4-h{margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#101114;break-after:avoid;page-break-after:avoid}
  .q4-rows > div + div{border-top:1px solid rgba(16,17,20,.07)}
  .q4-issue{display:grid;grid-template-columns:36px 1fr;gap:12px;align-items:start;padding:10px 0;break-inside:avoid;page-break-inside:avoid}
  .q4-ic{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;background:#efeeea;color:#55565c}
  .q4-ic svg{width:18px;height:18px}
  .q4-issue-t{font-size:14.5px;font-weight:800;color:#101114;line-height:1.35}
  .q4-sev{display:inline-block;margin-left:6px;font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:999px;vertical-align:2px;background:#efeeea;color:#55565c}
  .q4-issue-p{margin:3px 0 0;font-size:13px;color:#4f5056;line-height:1.45}
  .q4-issue-ev{margin:4px 0 0;font-size:12px;color:#6b6c72;line-height:1.4;overflow-wrap:anywhere} .q4-issue-ev b{color:#101114;font-weight:700}
  .q4-foot{background:#101114;color:#d4d5d9;padding:26px 28px 22px}
  .q4-foot-cta h3{margin:0 0 16px;font-size:26px;font-weight:800;letter-spacing:-.02em;color:#fff}
  .q4-foot .cta-actions{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 14px}
  .q4-foot .cta-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:700;padding:11px 18px;border-radius:10px;text-decoration:none;line-height:1.2}
  .q4-foot .cta-btn.start{background:#fcc933;color:#101114}
  .q4-foot .cta-btn.call{background:#fff;color:#101114;border:1px solid transparent;font-family:inherit;cursor:pointer}
  .q4-foot .cta-btn.wa{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4)}
  .q4-foot .cta-site{display:inline-block;font-size:13.5px;font-weight:600;color:#fcc933;text-decoration:none;margin:0 0 18px}
  .q4-foot-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:12px 16px;min-width:0}
  .q4-foot-promise{margin:0 0 12px}
  .q4-foot-promise .cta-promise{margin:4px 0 0;padding:0;border:0;font-size:13px;line-height:1.5;color:#d4d5d9;max-width:none}
  .q4-foot .foot-k{display:block;font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:#9c9da3}
  .q4-foot .foot-v{display:block;margin-top:3px;font-size:13.5px;font-weight:600;color:#fff;overflow-wrap:anywhere}
  .q4-foot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 18px}
  .q4-foot-brand{display:flex;align-items:baseline;justify-content:space-between;padding-top:14px;border-top:1px solid rgba(255,255,255,.10)}
  .q4-foot .foot-brand{font-size:19px;font-weight:800;letter-spacing:-.02em;color:#fff}
  .q4-foot .foot-dot{color:#fcc933}
  .q4-foot .foot-cta{font-size:13.5px;font-weight:600;color:#fcc933;text-decoration:none}
  .q4-foot .foot-note{margin-top:10px;font-size:12px;line-height:1.5;color:#9c9da3;max-width:62ch;padding:0;border:0}
  @media (max-width:760px){
    .q4-score-in{grid-template-columns:1fr 1fr}
    .q4-overall{grid-column:1/-1}
  }
  @media (max-width:640px){
    .q4-head{padding:18px 18px 14px;flex-direction:column;gap:12px}
    .q4-wm{font-size:26px}
    .q4-meta{text-align:left;width:100%}
    .q4-meta-top{justify-content:space-between}
    .q4-score{padding:2px 14px 18px}
    .q4-score-in{gap:10px}
    .q4-overall{padding:16px 18px}
    .q4-overall b{font-size:68px}
    .q4-eng{padding:13px 14px}
    .q4-eng-h{font-size:13px}
    .q4-eng-h .q4-mk{width:24px;height:24px}
    .q4-eng-v{font-size:34px;margin-top:8px}
    .q4-verdict{font-size:16px}
    .q4-foot{padding:22px 16px 18px}
    .q4-foot-cta h3{font-size:22px}
    .q4-foot .cta-actions{flex-direction:column}
    .q4-foot .cta-btn{width:100%;min-height:44px}
    .q4-foot .cta-actions form{display:block !important;width:100%}
    .q4-foot-grid{grid-template-columns:1fr}
    .q4-body{padding:16px 12px 4px}
    .q4-sum{font-size:15px}
    .q4-chat{padding:12px;border-radius:16px}
    .q4-chat-q{max-width:94%;font-size:14.5px}
    .q4-reply{max-width:100%;padding:10px 12px}
    .q4-who{font-size:14px}
    .q4-panel{padding:14px 14px 10px;border-radius:16px}
  }
  @media print{
    .sheet{max-width:none}
    .q4-head{padding:14px 22px 12px}
    .q4-score{padding:2px 18px 14px}
    .q4-score-in{grid-template-columns:1.15fr 1fr 1fr;gap:10px}
    .q4-overall,.q4-eng{padding:12px 16px}
    .q4-overall b{font-size:60px;margin-top:6px}
    .q4-eng-v{font-size:36px;margin-top:8px}
    .q4-verdict{margin-top:10px;font-size:16px}
    .q4-body{padding:14px 18px 2px}
    .q4-chats{gap:10px}
    .q4-chat{padding:10px 12px}
    .q4-snip{-webkit-line-clamp:3;line-clamp:3}
  }
  @media (prefers-color-scheme: dark){
    body,.sheet,.q4-body{background:#16171a}
    .sheet{box-shadow:none}
    .q4-sum{color:#f2f2f3}
    .q4-chat,.q4-panel{background:#1e1f23;border-color:#2e3036}
    .q4-chat-q{background:#33353b;color:#f2f2f3}
    .q4-reply{background:#25272c;border-color:#34363c}
    .q4-reply-n,.q4-h,.q4-issue-t,.q4-issue-ev b{color:#f2f2f3}
    .q4-mk--gai{background:#f2f2f3}
    .q4-tag,.q4-sev,.q4-ic{background:#33353b;color:#c9cacf}
    .q4-who--me{background:rgba(34,197,94,.14);border-color:rgba(74,222,128,.38);color:#86efac}
    .q4-who--me .q4-ico{background:#16a34a}
    .q4-who--rival{background:transparent;border-color:transparent;color:#fca5a5}
    .q4-who--rival .q4-ico{background:#dc2626}
    .q4-none,.q4-more,.q4-caveat,.q4-snip,.q4-issue-p,.q4-issue-ev{color:#b4b5ba}
    .q4-rows > div + div{border-top-color:rgba(255,255,255,.08)}
  }
`,Ta=10,Ia=25,Sa=10;function Ca(e){if(!e||e.length<2)return"";const t=[...e].sort((u,k)=>k.pct-u.pct),i=t[0],n=t[t.length-1];if(i.pct<=Sa)return"The business has limited visibility across both measured engines.";const r=i.pct-n.pct;return r<Ta?`Visibility is currently similar across ${i.label} and ${n.label}.`:r<Ia?`Visibility is somewhat stronger in ${i.label} than in ${n.label}.`:`Visibility is much stronger in ${i.label} than in ${n.label}.`}function pt(e){var S,K,Q,ce;const t=e.businessType.trim()||"business like yours",i=((S=e.hook)==null?void 0:S.shape)==="six"&&!!e.hook.score,n=!i&&e.hookIncomplete===!0,r=i&&!!e.hook&&!e.measuring&&!e.nameNotJudgeable,u=i||n?mt(e.businessType):null,k=u&&u.ok?u.value.toLowerCase():null,C=Yt(e.named,e.total,e.questionsAsked??0);{const c=(e.topCompetitors??[]).filter(R=>R.name&&R.count>0),T=e.questionsAsked??0;if(!e.nameNotJudgeable&&e.named,e.nameNotJudgeable?`${o(e.businessName)}`:e.named>0?(`${o(e.businessName)}${e.named}`,e.named,e.total>0&&`${e.total}`):(`${o(e.businessName)}`,e.total>0&&`${e.total}`),c.length>0){const R=c.map(j=>`<span class="rv">${o(j.name)}</span>`);R.length===1?R[0]:R.join(", then "),e.competitorMentions&&e.competitorMentions>0&&`${e.competitorMentions}${T}`}e.internal===!0&&(((K=e.questionBreakdown)==null?void 0:K.length)??0)>0}const W=e.crawlFaults&&e.crawlFaults.length?`
    <section class="why" style="border-top:1px solid var(--line)">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">What&rsquo;s stopping AI reading your site</div>
      <p style="margin:0 0 18px;max-width:70ch;font-size:14px;line-height:1.55;color:var(--muted)">We read your site the way ChatGPT and Gemini do.</p>
      ${e.crawlFaults.map(c=>`
      <div class="fault">
        <div class="fault-dot${c.minor?" fault-dot--minor":""}"></div>
        <div>
          <div class="fault-t">${o(c.title)}</div>
          <p class="fault-p">${o(c.detail)}</p>
        </div>
      </div>`).join("")}
    </section>`:"",D=e.seo?e.seoStyle==="issues"?Jt(e.seo):e.seoStyle==="pack"?Zt(e.seo,e.seoAfter??null):Qt(e.seo):e.crawlFaults&&e.crawlFaults.length?W:e.hasWebsite===!1?Pe(e.prospectOnly===!0):"",B=(e.siteEvidence??[]).slice(0,oa),U=B.length?`
    <!-- DEEP-CRAWL EVIDENCE: what was found on the prospect's own site, each with the bytes it was
         read from. The proof is the point — it is what the prospect can go and check. -->
    <section class="seo">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">I had a look at your website too</div>
      <div class="seo-body">${B.map(ia).join("")}${e.crawlFaults&&e.crawlFaults.length?`
        <ul class="seo-findings" style="margin-top:14px">${e.crawlFaults.map(c=>`
          <li class="find">
            <span class="find-dot" style="background:${c.minor?"var(--amber)":"var(--red)"}"></span>
            <span class="find-body"><b class="find-title">${o(c.title)}</b> <span class="find-detail">${o(c.detail)}</span></span>
          </li>`).join("")}
        </ul>`:""}
      </div>
    </section>`:"",V=U||(e.crawlFaults&&e.crawlFaults.length?`
    <!-- WEBSITE ISSUES, hook layout — the same card treatment page 1/3 of the old baseline PDF
         uses ("Website issues we can fix": bordered card, dot + bold lead-in + detail), not the
         ordinary report's unboxed .fault list. Reused classes (.seo/.find*), no new CSS. -->
    <section class="seo">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">Website issues we can fix</div>
      <div class="seo-body">
        <ul class="seo-findings">${e.crawlFaults.map(c=>`
          <li class="find">
            <span class="find-dot" style="background:${c.minor?"var(--amber)":"var(--red)"}"></span>
            <span class="find-body"><b class="find-title">${o(c.title)}</b> <span class="find-detail">${o(c.detail)}</span></span>
          </li>`).join("")}
        </ul>
      </div>
    </section>`:e.hasWebsite===!1?Pe(e.prospectOnly===!0):""),se=[...(e.siteEvidence??[]).flatMap(c=>{const T=st[c.kind];return T?[{title:T.title,detail:T.why,minor:!1}]:[]}),...(e.crawlFaults??[]).filter(c=>!vt(c)).map(c=>({title:c.title,detail:c.detail,minor:!!c.minor})),...(e.contentIssues??[]).filter(c=>!(c.kind==="robots_blocks_ai"&&(e.crawlFaults??[]).some(T=>T.kind==="search_blocked"))).map(c=>({title:c.title,detail:c.why,minor:c.severity!=="high",severity:c.severity,evidence:c.evidence}))].filter((c,T,R)=>R.findIndex(j=>j.title.trim().toLowerCase()===c.title.trim().toLowerCase())===T).map((c,T)=>({x:c,i:T,rank:ua[Ie(c)]})).sort((c,T)=>c.rank-T.rank||c.i-T.i).map(c=>c.x).slice(0,5),de=se.length?{state:"issues",issues:se}:e.hasWebsite===!1?{state:"none"}:e.siteChecked===!0?{state:"clean"}:{state:"unknown"},_=e.gutPunch,Z=_&&_.answer&&_.answer.trim()&&_.businesses&&_.businesses.length?`
    <section class="chatcard">
      <div class="cc-head">
        <span class="cc-brand">${We(_.engineLabel)}${o(_.engineLabel)}</span>
        <span class="cc-date">${o(e.generatedAtLabel)}</span>
      </div>
      <div class="cc-body">
        <div class="cc-q">${o(_.question)}</div>
        <div class="cc-arow">
          ${na(_.engineLabel)}
          <div class="cc-a">
            <p class="cc-atext">${o(_.answer)}</p>
            <ol class="cc-list">${_.businesses.map(c=>`<li><b>${o(c)}</b></li>`).join("")}</ol>
          </div>
        </div>
      </div>
      <div class="cc-callout"><span class="cc-bang">!</span>${o(e.businessName)} wasn&rsquo;t mentioned in this search.</div>
    </section>`:"",$=["ChatGPT","Gemini"],q=(()=>{const c=P=>P==="ChatGPT"?"gpt":P==="Gemini"?"gem":"";if(!e.paidSummary||e.measuring||e.nameNotJudgeable)return"";const T=(e.perEngine??[]).filter(P=>$.includes(P.label)&&P.total>0).map(P=>({label:P.label,named:P.named,total:P.total,pct:Math.round(P.named/P.total*100)})),R=T.map(P=>`
        <div class="pv-card ${c(P.label)}">
          <div class="pv-card-label">${We(P.label)}${o(P.label)}</div>
          <div class="pv-card-pct">${P.pct}%</div>
          <div class="pv-card-sub">${P.named} of ${P.total}</div>
        </div>`).join(""),j=e.questionsAsked&&e.enginesUsed?`${e.questionsAsked} question${e.questionsAsked===1?"":"s"} &times; ${e.enginesUsed} AI engine${e.enginesUsed===1?"":"s"}${(e.measurementRuns??1)>1?` &times; ${e.measurementRuns} asks each`:""}`:"",ae=Ca(T);return`
    <!-- PAID ${e.paidSummary.toUpperCase()} SUMMARY: percentage-first. Replaces the hero + chat card. -->
    <section class="pv">
      <div class="pv-pill">${e.paidSummary==="remeasure"?"Remeasurement":"Baseline"}</div>
      <div class="pv-overall">
        <div class="pv-eyebrow">Overall AI visibility</div>
        <div class="pv-pct">${e.pct}%</div>
        <div class="pv-sub">${e.named} of ${e.total} measured ${J(e.total,"answer")}${j?` &middot; ${j}`:""}</div>
      </div>
      ${R?`<div class="pv-cards">${R}</div>`:""}
      ${je(e.overview,e.googleAiInScore===!0)}
      ${ae?`<p class="pv-read">${o(ae)}</p>`:""}
    </section>
    <div class="pv-split"></div>`})(),v=e.paidSummary?e.questionBreakdown??[]:(e.questionBreakdown??[]).filter(c=>!_||c.question!==_.question),w=(c,T)=>{var ae;const R=(ae=c.perEngine)==null?void 0:ae.find(P=>P.label===T);return!R||!R.ran?null:(typeof R.named=="number"?R.named:R.named?1:0)>0},d=c=>c===null?'<span class="qm qm-na" title="didn&rsquo;t appear">&ndash;</span>':c?'<span class="qm qm-yes" title="named">&check;</span>':'<span class="qm qm-no" title="not named">&times;</span>',b=c=>{var T;return(T=c.perEngine)==null?void 0:T.find(R=>R.label===xe)},s=c=>{const T=b(c);return T&&T.ran?d(w(c,xe)):T&&(T.notShown??0)>0?`<span class="qm qm-none" title="${pe}">none</span>`:d(null)},a=c=>{var R;const T=(((R=b(c))==null?void 0:R.overviewAnswers)??[]).slice(0,3);return T.length?`<details class="qrow-aio-ans"><summary>${o(Ae)} said</summary>${T.map(j=>`<p>&ldquo;${o(j.full||j.text)}&rdquo;</p>`).join("")}</details>`:""},y=v.length?`
    <section class="qlist">
      <div class="sec-eyebrow">${e.paidSummary?"Question by question":"The other questions we asked"}</div>
      ${e.paidSummary?"":je(e.overview,e.googleAiInScore===!0)}
      <div class="qrow qrow-head"><span class="qrow-q"></span>${$.map(c=>`<span class="qrow-e">${c}</span>`).join("")}<span class="qrow-e qrow-aio">AI Overview</span></div>
      ${v.map(c=>`<div class="qrow"><span class="qrow-q">${o(c.question)}</span>${$.map(T=>`<span class="qrow-e">${d(w(c,T))}</span>`).join("")}${`<span class="qrow-e qrow-aio">${s(c)}</span>`}</div>${a(c)}`).join("")}
      ${`<p class="qlist-note">Google AI (Google&rsquo;s own AI answer) ${e.googleAiInScore?"is counted in the score wherever Google showed one; a search with none is left out, never counted against you.":"is shown for context and is not counted in this report&rsquo;s score."} &ldquo;none&rdquo; = ${pe} for that search; &ldquo;&ndash;&rdquo; = not recorded.</p>`}
    </section>`:"",m=`
    <!-- NAME NOT JUDGEABLE: the hero and the named figure are withheld. See nameNotJudgeable. -->
    <section class="namecheck">
      <div class="sec-eyebrow">Before we show you a number</div>
      <div class="sec-title">We&rsquo;re checking this one by hand.</div>
      <p>Your business name is made of the same words as your trade and your town, so an automated check can&rsquo;t tell a mention of you apart from a mention of the search itself. We check this one by hand before we send it.</p>
    </section>`,x=e.shareUrl?` &middot; <a href="${o(e.shareUrl)}">View online</a>`:"",N='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h9"/><rect x="8" y="8" width="12" height="12" rx="2"/><line x1="11" y1="12" x2="17" y2="12"/><line x1="11" y1="16" x2="15" y2="16"/></svg>',O='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.4"/><circle cx="5.5" cy="18.5" r="2.4"/><circle cx="18.5" cy="18.5" r="2.4"/><line x1="11" y1="7.1" x2="6.6" y2="16.4"/><line x1="13" y1="7.1" x2="17.4" y2="16.4"/></svg>',L='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-4 4V5.5Z"/><path d="M12 7.3l1.15 2.33 2.57.37-1.86 1.81.44 2.56L12 13.17l-2.3 1.2.44-2.56-1.86-1.81 2.57-.37Z"/></svg>',z="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#101114"/><path d="M20 8.5 Q14 8.5 14 13.5 L14 24.5 M9.5 14.8 H18.5" fill="none" stroke="#ffd23f" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="22.5" r="2.4" fill="#fff"/></svg>');o(`mailto:${Ee}?subject=${encodeURIComponent(`AI Visibility - ${e.businessName}`)}`);const G=(e.offerUrl??"").trim(),X=r?"Improve AI visibility":"Get started &mdash; &pound;99",ee=e.showOffer===!0&&e.prospectOnly!==!0&&G?`<a class="cta-btn start" href="${o(G)}" target="_blank" rel="noopener noreferrer">${X}</a>`:"";e.showOffer===!0&&!G&&console.warn("[report] get-started button omitted: no per-lead onboarding url (no lead_id, or the site origin is not configured)");const te=e.auditId&&e.requestCallUrl?`<form method="POST" action="${o(e.requestCallUrl)}" style="margin:0;display:inline"><input type="hidden" name="audit" value="${o(e.auditId)}"><button type="submit" class="cta-btn call">Request a call</button></form>`:"",ne=o(`https://wa.me/${Ue}?text=${encodeURIComponent(`Hi, this is ${e.businessName} - I saw my AI visibility report and I'm interested.`)}`),he=(ce=(Q=e.hook)==null?void 0:Q.overviews)!=null&&ce.length?"ChatGPT, Gemini and Google AI":"ChatGPT &amp; Gemini",oe=e.paidSummary?"A snapshot of where you stand today. After we make changes we ask the same questions again to show your before and after.":"A snapshot of where you stand today. If you join, we first measure a full "+be+" questions, then ask those again after the work to show your before and after.",me=r?Ea({pitch:!(e.hidePitch||e.paidSummary),startBtn:ee,requestCallBtn:te,waHref:ne,promiseHtml:e.prospectOnly===!0?"":`Your guarantee is judged on a full ${be}-question measurement we run after you join, not on this quick check. ${o(Me)}`,businessName:e.businessName,dateLabel:e.generatedAtLabel,measuredOnHtml:he,noteHtml:oe}):"",p=e.questionBreakdown??[],h=3,l=[];for(let c=0;c<p.length;c+=h)l.push(p.slice(c,c+h));const g=c=>ze(c),f=aa({businessName:e.businessName,metaHtml:`Findable &middot; AI Visibility Audit &middot; ${o(e.generatedAtLabel)}${x}`,note:"A snapshot of where you stand today. After we&rsquo;ve made changes we ask these questions again, alongside others, to show your before &amp; after."}),E=c=>{if(!c.ran){const Y=(c.notShown??0)>0?pe:c.label===xe?Et:"Didn&rsquo;t appear";return`<div class="qb-eng"><div class="qb-eng-head"><span class="qb-eng-name">${o(c.label)}</span><span class="qb-eng-empty">${Y}</span></div></div>`}const T=typeof c.named=="number"?c.named:c.named?1:0,R=c.ranCount??1,j=T>0?`<span class="qb-badge yes sm">Named you ${T} of ${R}</span>`:`<span class="qb-badge no sm">Not named${R>1?` (0 of ${R})`:""}</span>`,ae=c.recommended!=null||c.cited!=null?`<div class="qb-eng-line qb-split"><span class="qb-split-i"><b>Named in the answer</b> &mdash; ${c.recommended??0} of ${R}</span><span class="qb-split-i"><b>Cited as a source</b> in ${c.cited??0} of ${R}</span></div>`:"",P=c.ran&&c.counted===!1?'<span class="qb-uncounted">not counted in the total above</span>':"",ve=c.rivals.length?`<div class="qb-eng-line"><span class="qb-rlabel">Others named:</span> ${c.rivals.map(Y=>`<span class="qb-chip">${o(Y)}</span>`).join(" ")}</div>`:e.namesWithheld?'<div class="qb-eng-line"><span class="qb-none">Competitor names withheld &mdash; this run&rsquo;s list could not be verified.</span></div>':'<div class="qb-eng-line"><span class="qb-none">No other businesses named.</span></div>',ue=c.citations.length?`<div class="qb-eng-line"><span class="qb-slabel">Sources:</span> ${c.citations.map(Y=>`<a class="qb-cite" href="${o(Y.url)}" target="_blank" rel="noopener noreferrer nofollow">${o(Y.domain)}</a>`).join(" ")}</div>`:'<div class="qb-eng-line"><span class="qb-none">No sources cited.</span></div>',we=(c.overviewAnswers??[]).slice(0,3).map(Y=>{const Re=Y.text||Y.full.slice(0,420),_e=Y.full&&Y.full.length>Re.length+20;return`<div class="qb-aio-ans"><span class="qb-aio-k">${o(Ae)} said</span>&ldquo;${o(Re)}${Y.truncated||_e?" &hellip;":""}&rdquo;${_e?`<details><summary>Read the full overview</summary>${o(Y.full)}</details>`:""}</div>`}).join("");return`<div class="qb-eng"><div class="qb-eng-head"><span class="qb-eng-name">${o(c.label)}</span>${j}${P}</div>${ae}${ve}${ue}${we}</div>`},I={named:"ALREADY NAMED",wide_open:"WIDE OPEN",locked:"LOCKED",informational:"INFORMATIONAL",unclear:"UNCLEAR"},A=c=>{const T=c.sourceMix,R=T.total>0?`sources ${T.authority} info / ${T.business} business${T.other?` / ${T.other} other`:""}`:"no sources";return`<div class="qb-win win-${o(c.label)}">
      <span class="qb-win-chip">${o(I[c.label]??c.label)}</span>
      <span class="qb-win-why">${o(c.reason)}</span>
      <span class="qb-win-nums">${c.distinctFirms} distinct firm${c.distinctFirms===1?"":"s"} · top in ${c.topFirmCells}/${c.totalCells} answers · ${R}</span>
    </div>`},M=c=>{const T=c.namedCount,R=c.answers,j=T!=null?T>0?`<span class="qb-badge yes">Named in ${T}${R?` of ${R} answers`:"&times;"}</span>`:`<span class="qb-badge no">Not named${R?` in any of ${R} answers`:""}</span>`:c.namedYou?'<span class="qb-badge yes">Named you</span>':'<span class="qb-badge no">Not named</span>';let ae;if(c.perEngine&&c.perEngine.length)ae=`<div class="qb-engines">${c.perEngine.map(E).join("")}</div>`;else{const ve=c.rivals.length?`<span class="qb-rlabel">Others named:</span> ${c.rivals.map(Y=>`<span class="qb-chip">${o(Y)}</span>`).join(" ")}`:'<span class="qb-none">No specific businesses named.</span>',ue=c.citations??[],we=ue.length?`<span class="qb-slabel">AI&rsquo;s sources:</span> ${ue.map(Y=>`<a class="qb-cite" href="${o(Y.url)}" target="_blank" rel="noopener noreferrer nofollow">${o(Y.domain)}</a>`).join(" ")}`:'<span class="qb-none">No sources cited.</span>';ae=`<div class="qb-line">${ve}</div><div class="qb-line qb-src">${we}</div>`}const P=e.internal===!0&&c.winnability?A(c.winnability):"";return`<li class="qb-item">
      <div class="qb-top"><span class="qb-q">&ldquo;${o(c.question)}&rdquo;</span>${j}</div>
      ${ae}
      ${P}
    </li>`},H=e.internal!==!0||p.length===0?"":l.map((c,T)=>`
    <div class="sheet qpage">
      ${g(`Questions &amp; sources${l.length>1?` &middot; page ${T+1} of ${l.length}`:""}`)}
      <section class="qbreak">
        ${T===0?`<div class="sec-eyebrow">The detail</div>
        <div class="sec-title">Every question we asked, engine by engine</div>
        <p class="qb-intro">These are the exact questions we put to the AI engines. For each one, we show what <b>ChatGPT</b>, <b>Gemini</b> and <b>Google AI</b> each said &mdash; whether they named <b>${o(e.businessName)}</b>, who they named instead, and the sources they drew on. The engines behave differently, so telling them apart matters.</p>`:""}
        <ul class="qb-list">
          ${c.map(M).join("")}
        </ul>
      </section>
      ${f}
    </div>`).join("");return jt(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- ⛔ NEVER INDEXABLE. This document names the prospect's COMPETITORS and their own measured
     invisibility. It appearing in a Google result would be a genuine problem for them and for us,
     and it was fully indexable until 2026-08-05: no robots meta, no X-Robots-Tag on any route.
     In the DOCUMENT rather than only on a response header, so the downloaded file and every route
     that ever serves this HTML carry it — a header only protects the route that sets it.
     noarchive/nosnippet as well as noindex: a cached copy or a snippet naming their competitors is
     the same disclosure by another name. The proxy adds the header too; belt and braces. -->
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
<link rel="icon" type="image/svg+xml" href="${z}" />
<title>AI Visibility Report &mdash; ${o(e.businessName)}</title>
<style>
${Xt}

  /* One-line explainer */
  .explainer{ padding:16px 28px 4px; font-size:17px; line-height:1.4; color:var(--ink-2); font-weight:400; max-width:70ch; }
  .explainer b{ color:var(--blue); font-weight:700; }

  /* ── EMPHASIS SYSTEM (one rule, whole document) ───────────────────────────────
     Key WORDS get a consistent accent at weight 850: brand --blue for neutral/positive
     terms (.hl, .explainer b) and --red for loss/negative terms (.rv, .was) &mdash; same
     strength, colour carries the meaning. Key NUMBERS/verdicts stay at 900 in their
     severity/brand colour (hero .num, why .big/.was, SEO grade). --blue holds strong on
     BOTH --paper and the --page tint, so the accent never reads weak in any section. */
  .hl{ color:var(--blue); font-weight:700; }

  /* ══ PAID SUMMARY (baseline / remeasurement only) ═════════════════════════════════════════════
     Percentage first, and deliberately quiet: no chart, no gauge, no colour-graded band. The number
     IS the design. Reuses the report's own tokens (--ink, --muted, --line, --panel-tint, --blue-2)
     so it sits inside the existing document rather than beside it, and the engine cards use the same
     .em engine marks the chat card and the per-question rows already use.
     ⚠️ NO SEVERITY COLOUR ON THE PERCENTAGES. The hero grades its number red/amber/green because it
     is selling a problem to a prospect; a client reading their own baseline does not need their
     result shouted at them in red, and a remeasurement that moved 2 points would change colour
     without changing meaning. */
  .pv{ padding:14px 28px 6px; }
  /* The report-type pill: small, understated, and the one place the saturated brand gold appears
     here — on a hairline chip where contrast is carried by the dark text, not by the gold. */
  .pv-pill{ display:inline-block; font-size:10.5px; font-weight:900; letter-spacing:.14em;
    text-transform:uppercase; color:var(--on-gold-tint-2); background:var(--gold-tint);
    border:1px solid var(--gold-line); border-radius:999px; padding:4px 11px; }
  /* The overall result sits ON a warm panel rather than floating in white. Gold hairline, gold
     tint, and a slightly heavier left edge so the panel reads as one object. */
  .pv-overall{ margin-top:12px; background:var(--gold-tint); border:1px solid var(--gold-line);
    border-left-width:4px; border-radius:14px; padding:18px 22px 20px; }
  .pv-eyebrow{ font-size:12.5px; letter-spacing:.11em; text-transform:uppercase; color:var(--muted);
    font-weight:800; }
  /* Smaller than the first pass (92px) and warm rather than navy, but still by far the biggest
     thing on the page. #8a6d1a on #fffaeb is 4.70:1. */
  .pv-pct{ font-size:76px; line-height:.9; font-weight:900; letter-spacing:-.04em;
    color:var(--on-gold-tint); margin-top:4px; }
  /* The working-out: smaller, lighter and pushed away from the number it explains. */
  .pv-sub{ font-size:12px; line-height:1.5; color:var(--muted-2); margin-top:14px; font-weight:500; }
  .pv-cards{ display:flex; gap:14px; margin-top:14px; flex-wrap:wrap; }
  .pv-card{ flex:1 1 200px; min-width:180px; border:1px solid var(--line); border-radius:14px;
    background:var(--panel-tint); padding:15px 17px 17px; }
  /* Engine identity — tint, hairline and numeral all from the same pair. See the token note. */
  .pv-card.gpt{ background:var(--eng-gpt-tint); border-color:var(--eng-gpt-line); }
  .pv-card.gem{ background:var(--eng-gem-tint); border-color:var(--eng-gem-line); }
  .pv-card.gpt .pv-card-label, .pv-card.gpt .pv-card-pct{ color:var(--eng-gpt); }
  .pv-card.gem .pv-card-label, .pv-card.gem .pv-card-pct{ color:var(--eng-gem); }
  .pv-card-label{ display:flex; align-items:center; gap:7px; font-size:12px; font-weight:800;
    letter-spacing:.07em; text-transform:uppercase; color:var(--blue-2); }
  .pv-card-pct{ font-size:46px; line-height:1; font-weight:900; letter-spacing:-.03em; color:var(--ink); margin-top:9px; }
  .pv-card-sub{ font-size:13px; color:var(--muted-2); margin-top:5px; font-weight:500; }
  /* One plain-English line under the cards, derived from the two percentages. */
  .pv-read{ font-size:14.5px; line-height:1.55; color:var(--ink); margin-top:16px; font-weight:500; max-width:62ch; }
  /* Separation from the question table: space plus one hairline, nothing more. */
  .pv-split{ height:1px; background:var(--line); margin:26px 28px 0; }

  /* HERO &mdash; balanced two-part: big number/label on the left, the verdict on the right */
  .hero{ display:flex; align-items:stretch; gap:26px; padding:14px 28px 20px; }
  .hero-num{ display:flex; align-items:center; gap:18px; flex:0 0 auto; }
  .num{ font-size:104px; line-height:.82; font-weight:900; letter-spacing:-.04em; }
  .num.crit,.num.low{ color:var(--red); } .num.mid{ color:var(--amber); } .num.high{ color:var(--green); }
  .num-cap{ max-width:24ch; }
  .num-cap .l1{ font-size:17px; font-weight:700; color:var(--ink); line-height:1.1; }
  .num-cap .l2{ font-size:14px; font-weight:400; color:var(--muted); margin-top:3px; }
  /* The working-out under the total: deliberately smaller and quieter than the total itself. It is
     there for the prospect who checks, not for the one who skims. */
  .num-cap .l3{ font-size:12px; font-weight:400; color:var(--muted); margin-top:2px; opacity:.85; }
  .hero-rule{ width:1px; background:var(--line); align-self:stretch; }
  .hero-verdict{ flex:1; display:flex; flex-direction:column; justify-content:center; }
  .hero-verdict .vk{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin-bottom:8px; }
  .punch-sub{ font-size:13px; line-height:1.45; color:var(--ink); margin-top:6px; font-weight:500; }
  .punch{ font-size:22px; line-height:1.2; font-weight:900; letter-spacing:-.01em; color:var(--ink); }

  /* GUT-PUNCH &mdash; a written summary of the worst answer (never the raw AI text) */
  .gutbox{ margin:0 28px 16px; padding:14px 18px; background:var(--red-tint); border-left:6px solid var(--red); border-radius:0 12px 12px 0; }
  /* Quick AI Visibility Check (six-result hook): the percentage is the hero number. The % sign is
     smaller so "100%" still sits beside its caption on a phone-width column. */
  .qc-num{ font-size:92px; white-space:nowrap; }
  .qc-pct{ font-size:.5em; font-weight:800; letter-spacing:0; margin-left:2px; vertical-align:top; position:relative; top:.12em; }
  .qc-hero .num-cap{ max-width:22ch; }
  .qc-hero .num-cap .l1{ overflow-wrap:anywhere; }
  .qc-table .qrow-q{ overflow-wrap:anywhere; }
  .qc-caveat{ font-size:12.5px; color:var(--muted); font-style:italic; margin:12px 0 0; }
  .qc-web-p{ margin:0; max-width:70ch; font-size:14px; line-height:1.55; color:var(--muted); }
  .qc-web .find-body{ overflow-wrap:anywhere; }
  @media(max-width:560px){ .qc-num{ font-size:68px; } }
  @media print{ .qc-hero,.qc-table,.qc-web,.evcard{ break-inside:avoid; page-break-inside:avoid; } }
  /* Adaptive hook hero — the missed search IS the result, so it gets the size the number used to have. */
  .hook{ padding:14px 28px 20px; }
  .hook-eyebrow{ font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); font-weight:700; margin-bottom:8px; }
  .hook-head{ font-size:30px; line-height:1.15; font-weight:800; letter-spacing:-.01em; margin:0 0 14px; }
  .hook-head.ok{ color:var(--green, #1b7f4b); }
  /* The old pink .hook-card (a second "we asked / answered with other suggestions / wasn't named")
     was removed 2026-09-21 — the model/evidence box (.chatcard, .cc-*) directly below the heading now
     carries that narrative once, not twice. .hook-named survives for the fully-named ("ok") branch's
     lede, which never used .hook-card. Same date: the question-list/qualifier/process-count
     wording (.hook-earlier, .hook-count, .hook-tested, .hook-eng, .hook-cites) is gone along with
     the elements that used it — the report shows only the failed search now (page 1 of the old
     baseline PDF is the visual reference; it never listed every question tested either). */
  .hook-named{ font-size:14px; margin:0 0 12px; color:var(--ink); }
  /* "The verdict" — same weight/spacing as the ordinary report's hero-verdict .vk, restored here
     without needing its .hero-verdict flex-layout parent. */
  .hook-vk{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin-bottom:8px; }
  /* Labels inside the restored model/evidence box ("Question", "AI named") — small, muted, uppercase,
     matching the eyebrow treatment used elsewhere in this document. The outer "Question" label sits
     directly in .cc-body (needs .cc-q's own 18px gutter); "AI named" sits inside the padded .cc-a
     bubble, which already provides that gutter. */
  .cc-label{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:700; margin:0 18px 4px; }
  .cc-a .cc-label{ margin:0 0 4px; }
  /* The hook box's own question line — same visual weight as .cc-q's bubble, but left-aligned block
     rather than a right-aligned "user typed this" bubble (that illusion belongs to the ordinary
     report's chatCard, which still uses .cc-q unchanged). */
  .cc-q-plain{ margin:0 18px 14px; background:var(--blue-tint); color:var(--ink); font-size:15px; font-weight:600; line-height:1.4; padding:10px 14px; border-radius:10px; }
  .hook-caveat{ font-size:13px; color:var(--muted); font-style:italic; margin:6px 0 0; }
  .gb-eyebrow{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--red); font-weight:700; margin-bottom:7px; }
  .gb-sum{ margin:0 0 7px; font-size:14px; line-height:1.4; font-weight:400; color:var(--on-red-tint); }
  .gb-sum .gb-q{ color:var(--ink); font-weight:700; }
  .gb-sum .rv{ color:var(--red); font-weight:700; white-space:normal; }
  /* The mention count beside each leader. Deliberately quieter than the name: it is the evidence
     for the name, not a second thing to read. */
  .gb-sum .rvn{ color:var(--muted); font-weight:600; font-size:.85em; white-space:nowrap; }
  .gb-sum b{ color:var(--ink); font-weight:700; }
  .gb-attr{ font-size:11px; color:var(--muted); font-weight:400; }
  .gb-sum .gb-more{ color:var(--muted); font-weight:400; }

  /* QUESTION-BY-QUESTION DETAIL — each chunk is its OWN .sheet page (.qpage) with the SAME wave band
     and footer as page 1, so it reads as a distinct, fully-branded client page on screen and prints
     as a fresh A4. .qbreak is just the body inside that sheet; the sheet does the paging.
     The footer sits at the bottom; a little breathing room above it. */
  .qpage{ display:flex; flex-direction:column; }
  .qpage .qbreak{ padding:16px 28px 22px; flex:1 0 auto; }
  .qpage .site-foot{ margin-top:auto; }
  .qb-intro{ margin:0 0 16px; font-size:14px; font-weight:400; color:var(--muted); max-width:64ch; }
  .qb-intro b{ color:var(--blue); font-weight:700; }
  .qb-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
  .qb-item{ padding:12px 14px; background:var(--page); border:1px solid var(--line); border-radius:10px;
    break-inside:avoid; page-break-inside:avoid; }
  .qb-top{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .qb-q{ font-size:14px; font-weight:700; color:var(--ink); line-height:1.35; }
  .qb-badge{ flex:0 0 auto; font-size:10px; font-weight:800; letter-spacing:.04em; text-transform:uppercase;
    padding:3px 9px; border-radius:999px; white-space:nowrap; }
  .qb-badge.yes{ background:var(--green-tint); color:var(--green); }
  .qb-badge.no{ background:var(--red-tint-2); color:var(--red); }
  .qb-line{ margin-top:8px; font-size:13px; color:var(--muted); line-height:1.9; }
  .qb-split{ display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:var(--ink); margin:2px 0 1px; }
  .qb-split-i b{ font-weight:800; }
  .qm-none{ font-size:10px; color:#8a8f98; font-weight:600; }
  .aio-chip{ display:inline-flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin:10px 0 4px; padding:4px 10px; border-radius:999px; border:1px dashed #c9ccd2; background:#f6f7f9; font-size:12px; color:#374151; }
  .aio-chip-t{ font-weight:700; }
  .aio-chip--named .aio-chip-t{ color:#15803d; } .aio-chip--not_named .aio-chip-t{ color:#b91c1c; }
  .aio-chip-n{ font-size:11px; color:#6b7280; }
  .qb-aio-ans{ margin:6px 0 0; padding:8px 10px; border-left:3px solid #d1d5db; background:#f9fafb; border-radius:6px; font-size:12px; line-height:1.55; color:#374151; }
  .qb-aio-ans summary{ cursor:pointer; color:#6b7280; font-size:11px; margin-top:4px; }
  .qb-aio-k{ display:block; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#6b7280; margin-bottom:3px; }
  .qlist-note{ font-size:11px; color:#6b7280; margin:8px 0 0; font-style:italic; }
  .qb-uncounted{ font-size:10px; color:var(--muted); font-style:italic; margin-left:6px; }
  .qb-rlabel{ font-weight:700; color:var(--ink); font-size:12px; margin-right:2px; }
  .qb-chip{ display:inline-block; background:var(--paper); border:1px solid var(--line); border-radius:999px;
    padding:2px 9px; font-size:12px; font-weight:600; color:var(--ink); }
  /* Sources row — a light divider above it separates "who" (rivals) from "where" (sources). */
  .qb-src{ margin-top:9px; padding-top:9px; border-top:1px dashed var(--line); }
  .qb-slabel{ font-weight:700; color:var(--ink); font-size:12px; margin-right:2px; }
  .qb-cite{ display:inline-block; color:var(--blue-2); font-weight:600; font-size:12px; text-decoration:none;
    border-bottom:1px solid var(--line); word-break:break-word; }
  .qb-none{ font-style:italic; color:var(--faint); }
  /* PER-ENGINE block inside a card — ChatGPT / Gemini / AI Overview told apart. Each engine is a
     sub-row with a small caps name + its own named/not badge, then who it named and its sources. */
  .qb-engines{ margin-top:10px; display:flex; flex-direction:column; gap:9px; }
  .qb-eng{ padding-top:9px; border-top:1px dashed var(--line); }
  .qb-eng:first-child{ padding-top:0; border-top:none; }
  .qb-eng-head{ display:flex; align-items:center; gap:9px; }
  .qb-eng-name{ font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--blue); }
  .qb-eng-empty{ font-size:11px; font-style:italic; color:var(--faint); }
  .qb-badge.sm{ font-size:9px; padding:2px 7px; }
  .qb-eng-line{ margin-top:5px; font-size:12.5px; line-height:1.75; color:var(--muted); }
  /* INTERNAL winnability chip — only rendered in the operator preview (d.internal), never on the
     client document. A tinted strip so it reads as a separate, internal annotation. */
  .qb-win{ margin-top:10px; padding:8px 10px; border-radius:8px; border:1px dashed var(--line-strong);
    background:var(--panel-tint); display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; }
  .qb-win-chip{ font-size:10px; font-weight:800; letter-spacing:.06em; text-transform:uppercase;
    padding:2px 8px; border-radius:999px; color:var(--on-band); }
  .win-named .qb-win-chip{ background:var(--green); }
  .win-wide_open .qb-win-chip{ background:var(--green); }
  .win-locked .qb-win-chip{ background:var(--red); }
  .win-informational .qb-win-chip{ background:var(--blue-2); }
  .win-unclear .qb-win-chip{ background:var(--faint); }
  .qb-win-why{ font-size:12px; color:var(--ink); font-weight:600; }
  .qb-win-nums{ font-size:11px; color:var(--muted); width:100%; }

  /* WHY THIS MATTERS &mdash; stakes stats, big coloured numbers, muted supporting text */
  .why{ padding:18px 28px 18px; border-top:1px solid var(--line); }
  h2{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:0 0 16px; }
  /* Consistent phase header: tiny eyebrow + human-readable title (pain &rarr; stakes &rarr; solution) */
  .sec-eyebrow{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:0 0 4px; }
  .sec-title{ font-size:22px; line-height:1.15; letter-spacing:-.01em; font-weight:700; color:var(--ink); margin:0 0 16px; }
  /* Solution = THE standout moment: still the biggest/heaviest title, but standard ink/black
     colour (like every other .sec-title) &mdash; it stands out via its band + size, not colour. */
  .dowe .sec-eyebrow{ color:var(--blue); }
  .dowe .sec-title{ font-size:32px; font-weight:700; color:var(--ink); margin:0 0 18px; }
  .stats{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .stat{ display:flex; align-items:flex-start; gap:14px; }
  .stat .big{ font-size:46px; line-height:.9; font-weight:900; letter-spacing:-.03em; color:var(--blue); }
  .stat p{ margin:0; font-size:14px; font-weight:400; color:var(--muted); }
  .stat p .was{ color:var(--red); font-weight:700; font-size:14px; }
  .why-frame{ margin:12px 0 0; font-size:17px; font-weight:700; color:var(--ink); max-width:64ch; }
  .src{ margin-top:6px; font-size:11px; font-weight:400; color:var(--faint); }

  /* WHAT WE DO &mdash; the solution reveal (the money section): a tinted full-width band with a
     heavy brand-blue top rule so it visibly BREAKS from the section above; white card inside. */
  /* STILL MEASURING — replaces the hero, "who AI named", the website slot and the fix section
     while a run is in flight. Amber, not red: nothing is wrong, it is simply not finished. */
  .measuring,.namecheck{ margin:0 28px 20px; padding:18px 22px; border:1px solid var(--amber); border-left-width:6px; border-radius:12px; background:var(--amber-tint); }
  .measuring .sec-eyebrow,.namecheck .sec-eyebrow{ color:var(--amber); }
  .measuring .sec-title,.namecheck .sec-title{ font-size:24px; font-weight:700; color:var(--ink); margin:0 0 10px; }
  .measuring p,.namecheck p{ margin:0 0 8px; font-size:14px; line-height:1.55; color:var(--muted); max-width:70ch; }
  .measuring .measuring-progress{ color:var(--ink); }
  .measuring .measuring-progress b{ font-size:16px; }
  /* THE EXPLAINER BESIDE THE THREE STEPS. The video is 1080x1920 (vertical), so it takes its own
     narrow column and the steps stack beside it; on a phone it sits above them. */
  .vid-row{ display:flex; gap:22px; align-items:flex-start; }
  .vid{ flex:0 0 196px; }
  .vid video{ display:block; width:196px; aspect-ratio:9/16; border-radius:12px; background:var(--video-bg); box-shadow:0 4px 18px rgba(15,23,42,.14); }
  .vid .vid-poster{ display:none; }
  .vid-row .steps{ flex:1; grid-template-columns:1fr; gap:14px; }
  .vid-row .steps::before{ display:none; }
  /* Icon in the first column; label, title and copy STACKED in the second. (A flex row here put
     the title in its own narrow column and wrapped it one word per line — seen in the render check.) */
  .vid-row .step{ text-align:left; display:grid; grid-template-columns:46px minmax(0,1fr); column-gap:12px; align-items:start; }
  .vid-row .step-ic{ margin:0; grid-column:1; grid-row:1 / span 3; }
  .vid-row .step-n, .vid-row .st, .vid-row .step p{ grid-column:2; }
  .dowe{ padding:22px 28px 24px; border-top:3px solid var(--blue); background:var(--page); }
  .dowe h2{ margin-bottom:14px; }
  .dowe-panel{ background:var(--paper); border:1px solid var(--line); border-radius:16px; padding:18px 22px 20px; box-shadow:0 4px 24px rgba(15,23,42,.06); }
  .dowe-lead{ font-size:17px; font-weight:700; color:var(--ink); margin:0 0 16px; max-width:64ch; }
  .steps{ position:relative; display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  /* connecting flow line behind the three icon tiles &rarr; reads as a process */
  .steps::before{ content:""; position:absolute; top:23px; left:16.67%; right:16.67%; height:2px; background:var(--line); z-index:0; }
  .step{ position:relative; text-align:center; }
  .step-ic{ position:relative; width:46px; height:46px; margin:0 auto 13px; z-index:1; }
  .step .ic{ width:46px; height:46px; border-radius:14px; background:var(--blue-tint); color:var(--blue);
    display:flex; align-items:center; justify-content:center; }
  .step .ic svg{ width:25px; height:25px; }
  .badge{ position:absolute; top:-7px; right:-7px; width:20px; height:20px; border-radius:50%;
    background:var(--blue); color:var(--on-band); font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;
    box-shadow:0 0 0 3px var(--paper); }
  .step-n{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; }
  .st{ font-size:14px; font-weight:700; color:var(--ink); margin:2px 0 5px; }
  .step p{ margin:0; font-size:14px; line-height:1.45; font-weight:400; color:var(--muted); }


  /* WEBSITE SEO &mdash; grade circles + radar + findings (all inline SVG, no chart lib).
     Its own QUIET "chapter": a subtle --page tint for depth in the alternating rhythm
     (white hero/gutbox &rarr; tinted SEO &rarr; white 'why' &rarr; the stronger solution band). Kept
     lighter than .dowe &mdash; no blue rule, no white inner card &mdash; so it never competes with
     the solution peak. The white&rarr;tint bg change is the section separator (with the crisp
     --line top edge); the following white 'why' reopens the rhythm. */
  .seo{ padding:18px 28px 18px; border-top:2px solid var(--ink); border-bottom:2px solid var(--ink); background:var(--page); }
  .seo-intro{ margin:-2px 0 12px; font-size:14px; line-height:1.45; color:var(--muted); font-weight:400; max-width:74ch; }
  .seo-intro b{ font-weight:700; } /* the SEO verdict &mdash; bold accent, same as other numbers/verdicts */
  /* Grades ROW (radar dropped to reclaim height): Overall dominant, then the three
     sub-grades as a tidy secondary row past a hairline divider. Findings sit BELOW, full
     width, so they stay tight (1&ndash;2 lines) instead of wrapping in a narrow column. */
  .seo-body{ /* block wrapper: grades row, then full-width findings */ }
  .seo-grades{ display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
  .seo-grade-split{ flex:0 0 auto; width:1px; height:80px; background:var(--line-strong); opacity:.55; }
  .seo-cats{ display:flex; gap:14px; flex-wrap:wrap; }
  .gc{ margin:0; text-align:center; }
  .gc svg{ display:block; margin:0 auto; }
  .gc-lbl{ margin-top:6px; font-size:11px; font-weight:700; color:var(--muted); max-width:11ch; line-height:1.2; }
  .gc-score{ margin-top:2px; font-size:11px; font-weight:700; color:var(--ink); font-variant-numeric:tabular-nums; }
  .seo-overall{ text-align:center; }
  .seo-overall .gc-lbl{ margin-top:8px; font-size:11px; color:var(--ink); font-weight:700; letter-spacing:.02em; }
  /* FINDINGS &mdash; tight full-width rows: a severity dot + bold title + short detail on the same
     flow. No big padded cards; far less vertical space, still reads as the key takeaways. */
  .seo-findings{ list-style:none; margin:12px 0 0; padding:0; }
  .find{ display:flex; gap:9px; padding:7px 0; border-bottom:1px solid var(--line); }
  .find:first-child{ padding-top:0; }
  .find:last-child{ border-bottom:0; padding-bottom:0; }
  .find-dot{ width:8px; height:8px; border-radius:50%; margin-top:5px; flex:0 0 auto; }
  .find-body{ flex:1; }
  .find-title{ font-weight:700; font-size:14px; color:var(--ink); }
  .find-detail{ font-size:14px; font-weight:400; line-height:1.45; color:var(--muted); }

  /* ONE REAL AI ANSWER, RECREATED &mdash; a chat-style card under "Who AI named instead". A visual
     recreation of stored audit data (see chatCard in renderReportHtml), never a screenshot. */
  .chatcard{ margin:0 28px 20px; border:1px solid var(--line); border-radius:14px; background:var(--paper);
    overflow:hidden; box-shadow:0 4px 24px rgba(15,23,42,.06); }
  .cc-head{ display:flex; align-items:center; justify-content:space-between; padding:11px 18px;
    border-bottom:1px solid var(--line); background:var(--page); }
  .cc-engine{ font-size:15px; font-weight:700; color:var(--ink); }
  .cc-date{ font-size:12px; color:var(--faint); }
  /* The question, as the customer would type it &mdash; a right-aligned user bubble. */
  .cc-q{ margin:16px 18px 0 auto; max-width:82%; width:fit-content; background:var(--blue-tint);
    color:var(--ink); font-size:14px; font-weight:600; padding:10px 14px; border-radius:14px 14px 4px 14px; }
  /* The AI's answer &mdash; a left-aligned assistant bubble. */
  .cc-a{ margin:12px 18px 0; max-width:88%; background:var(--page); border:1px solid var(--line);
    border-radius:4px 14px 14px 14px; padding:12px 14px; }
  .cc-atext{ margin:0; font-size:14px; line-height:1.55; color:var(--ink-2); }
  .cc-firms{ margin-top:10px; display:flex; flex-wrap:wrap; gap:6px; }
  .cc-firms .rv{ color:var(--red); font-weight:700; font-size:13px; }
  /* The truthful callout &mdash; only ever rendered for an answer that did NOT name the business. */
  .cc-callout{ display:flex; align-items:center; gap:9px; margin:16px 18px 18px; padding:11px 14px;
    border-radius:10px; background:var(--red-tint); color:var(--red); font-size:14px; font-weight:700; }
  .cc-bang{ flex:0 0 auto; width:20px; height:20px; border-radius:50%; background:var(--red);
    color:var(--paper); font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; }

  /* CLOSING CTA &mdash; Findable blue band with a yellow highlight */
  .cta{ background:var(--blue); color:var(--on-band); padding:20px 28px 20px; }
  .cta h3{ margin:0 0 7px; font-size:22px; font-weight:700; color:var(--on-band); letter-spacing:-.01em; }
  .cta h3 .y{ color:var(--yellow); }
  .cta p{ margin:0 0 6px; font-size:14px; font-weight:400; color:var(--on-band-muted); max-width:66ch; }
  .cta p b{ color:var(--on-band); font-weight:700; }
  .cta .close{ margin-top:10px; font-size:14px; font-weight:700; color:var(--on-band); }
  /* Contact buttons — side by side, stacking on narrow screens. On-palette (yellow + white). */
  .cta-actions{ display:flex; flex-wrap:wrap; gap:12px; margin-top:16px; }
  /* The promise, under the buttons: read after deciding to look, not competing with the heading. */
  .cta-promise{ margin:16px 0 0; padding-top:14px; border-top:1px solid rgba(255,255,255,.16);
                font-size:13px; line-height:1.55; color:var(--on-band-muted); max-width:66ch; }
  .cta-btn{ display:inline-flex; align-items:center; justify-content:center; gap:8px;
    padding:13px 22px; border-radius:10px; font-size:15px; font-weight:700; line-height:1;
    text-decoration:none; border:1px solid transparent; }
  .cta-btn.email{ background:var(--yellow); color:var(--blue); }
  /* The primary action. Own class, not .email - that name meant "Email us" and the button is gone. */
  .cta-btn.start{ background:var(--yellow); color:var(--blue); }
  .cta-btn.wa{ background:var(--on-band); color:var(--blue); }
  .cta-btn.site{ background:transparent; color:var(--on-band); box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.45); }

  /* FOOTER &mdash; a distinct darker navy bar so the text is clearly readable (no blue-on-blue) */
  /* THE FOUNDER OFFER reuses .cta wholesale — same navy ground, same yellow accent, same button
     shape. These rules only add the eyebrow, the list and the guarantee panel. A hairline above it
     separates the transaction from the close without introducing a second band colour. */
  .cta.offer{ border-top:1px solid rgba(255,255,255,.16); padding-top:18px; }
  .offer-eyebrow{ color:var(--yellow); margin-bottom:6px; }
  .offer-gets{ margin-top:14px; }
  .offer-gets .offer-h{ font-size:12px; font-weight:700; letter-spacing:.06em;
    text-transform:uppercase; color:var(--on-band-muted); margin-bottom:6px; }
  .offer-gets ul{ margin:0; padding-left:18px; max-width:66ch; }
  .offer-gets li{ font-size:14px; line-height:1.55; color:var(--on-band); margin-bottom:4px; }
  .offer-gtee{ margin-top:16px; border-left:3px solid var(--yellow); padding:10px 14px;
    background:rgba(255,255,255,.06); font-size:13px; line-height:1.55; color:var(--on-band-soft);
    max-width:70ch; border-radius:0 6px 6px 0; }
  .offer-after{ margin:10px 0 0; font-size:12.5px; color:var(--on-band-muted); max-width:66ch; }
${ea}

  /* MOBILE (~phones) — the report is opened mostly on phones via a WhatsApp link. Stack the
     multi-column sections, fix the hero's non-shrinking number block, make the CTA full-width
     tappable, and reclaim width by trimming the 28px side padding. Desktop/tablet + print
     (below) are untouched. */
  @media (max-width:560px){
    .sheet{ margin:12px; }
    /* Reclaim width: 28px side padding → 18px on every full-bleed section. */
    .band{ padding-left:18px; padding-right:18px; }
    .explainer{ padding-left:18px; padding-right:18px; }
    .hero{ padding-left:18px; padding-right:18px; }
    .pv{ padding-left:18px; padding-right:18px; }
    .gutbox{ margin-left:18px; margin-right:18px; }
    .chatcard{ margin-left:18px; margin-right:18px; }
    .why{ padding-left:18px; padding-right:18px; }
    .dowe{ padding-left:18px; padding-right:18px; }
    .seo{ padding-left:18px; padding-right:18px; }
    .cta{ padding-left:18px; padding-right:18px; }
    .site-foot{ padding-left:18px; padding-right:18px; }
    /* 1 · Hero stacks: number+caption on top, verdict below; drop the vertical rule. */
    .hero{ flex-direction:column; gap:14px; }
    .hero-num{ align-items:flex-start; }
    .hero-rule{ display:none; }
    .num{ font-size:72px; }
    /* 1b · Paid summary: the overall number shrinks, and the two engine cards stack into one column
       so each percentage keeps its own line rather than being squeezed side by side on a phone. */
    /* The score must not eat the viewport: at 375px a 76px numeral plus its panel already fills a
       third of the screen, so it steps down again and the panel padding tightens with it. */
    .pv-pct{ font-size:58px; }
    .pv-overall{ padding:15px 16px 17px; border-radius:12px; }
    .pv-eyebrow{ font-size:11.5px; letter-spacing:.09em; }
    .pv-sub{ margin-top:11px; }
    .pv-split{ margin-left:18px; margin-right:18px; }
    .pv-cards{ flex-direction:column; gap:12px; }
    /* ⛔ THE FLEX BASIS HAS TO BE RESET, NOT JUST THE MIN-WIDTH. A basis of 200px sizes along the
       MAIN axis, and the main axis is now the column — so each card took a 200px HEIGHT and
       rendered with a slab of dead space under "38 of 60". Caught on the 375px capture.
       ⚠️ NO BACKTICKS IN THIS COMMENT. The whole stylesheet is inside a template literal, and the
       first draft of this note quoted the shorthand in backticks — which ended the literal and broke
       the build. CLAUDE.md §3 records three previous instances; this was the fourth. */
    .pv-card{ min-width:0; flex:0 0 auto; }
    /* 2 · Fix steps → single column; hide the horizontal connector line. The video stacks above. */
    .steps{ grid-template-columns:1fr; gap:14px; }
    .steps::before{ display:none; }
    .vid-row{ flex-direction:column; align-items:center; }
    .measuring,.namecheck{ margin-left:18px; margin-right:18px; }
    /* 3 · Stakes stats → single column. */
    .stats{ grid-template-columns:1fr; }
    /* 4 · Contact buttons → stacked, full-width, comfortable tap target. */
    .cta-actions{ flex-direction:column; }
    .cta-btn{ width:100%; min-height:44px; }
    /* 6 · Hide the stray vertical grade divider when the SEO grades wrap. */
    .seo-grade-split{ display:none; }
  }

${ta}
  @media print{
    /* Audit-specific print rules ON TOP of the shared chrome print CSS above: force the section
       tints/CTA/dots to colour-print and keep the audit blocks unsplit. */
    .hero,.gutbox,.why,.dowe,.cta,.seo,.find-dot,.step .ic{
      -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    .hero,.gutbox,.why,.dowe,.cta,.seo{ break-inside:avoid; }
    .steps,.stats,.seo-grades,.seo-body,.dowe-panel{ break-inside:avoid; }
    .qb-item{ break-inside:avoid; page-break-inside:avoid; }
  }

  /* ══ 2026-09-16 REDESIGN — faults section, numbered-list chat card, new CTA + footer, darker
     surfaces. Appended so it overrides the base rules above (later wins), the way the mockup did. ══ */
  .fault{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--line)}
  .fault:first-of-type{border-top:0;padding-top:0}
  .fault-dot{width:9px;height:9px;border-radius:50%;background:var(--red);margin-top:6px;flex:0 0 9px}
  .fault-dot--minor{background:var(--amber)}
  .fault-t{font-weight:700;font-size:15px;color:var(--ink);letter-spacing:-.01em}
  .fault-p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--muted);max-width:66ch}

  /* The other questions — a row each, ChatGPT + Gemini markers (green named, red not named). */
  .qlist{padding:4px 28px 18px}
  .qrow{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line)}
  .qrow-head{border-top:0;padding:0 0 4px}
  .qrow-head .qrow-e{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:700}
  .qrow-q{flex:1;font-size:13.5px;color:var(--ink);line-height:1.35}
  .qrow-e{width:64px;text-align:center;flex:0 0 64px}
  .qm{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:12px;font-weight:800}
  .qm-yes{background:var(--green-tint);color:var(--green)}
  .qm-no{background:var(--red-tint-2);color:var(--red)}
  .qm-na{background:var(--blue-tint);color:var(--faint)}
  .qrow-aio-ans{margin:-2px 0 8px;font-size:12.5px;color:var(--muted)}
  .qrow-aio-ans summary{cursor:pointer;font-size:11.5px;font-weight:600;color:var(--faint)}
  @media print{ .qrow-aio-ans::details-content{content-visibility:visible;display:block} .qrow-aio-ans summary{display:none} }
  .qrow-aio-ans p{margin:6px 0 0;padding:8px 10px;border-left:3px solid var(--line);background:rgba(0,0,0,.02);border-radius:6px;line-height:1.55;max-width:72ch}
  @media(max-width:560px){.qlist{padding-left:18px;padding-right:18px}.qrow-e{width:52px;flex-basis:52px}}

  /* Chat card — official mark in the header + as the avatar, a numbered list of the real firms. */
  /* THE EVIDENCE CARD (2026-09-22). Findable's own card: no engine logo, no chat bubble, no replica
     chrome. The engine is named in text and its words sit in a quote block that is visibly a QUOTE —
     ruled left edge, italic, its own background — so nothing inside this card can be mistaken for
     something we wrote, and nothing about the card can be mistaken for a screenshot. */
  .evcard{background:var(--paper)}
  .ev-quote{margin:0 18px 4px; padding:12px 14px; border-left:3px solid var(--blue);
    background:var(--page); border-radius:0 10px 10px 0; font-size:14px; line-height:1.6;
    color:var(--ink-2); font-style:italic}
  .ev-list{margin:8px 18px 0; padding-left:38px}
  .cc-body .cc-label + .ev-quote{margin-top:0}
  /* The deep-crawl findings block — one item per finding: what it is, what it means, and the actual
     bytes underneath. .ev-proof is monospaced because it is a URL a prospect is meant to copy and
     check, not prose.
     ⚠️ NO USER-FACING COPY IN THIS COMMENT, DELIBERATELY. The <style> block ships in EVERY report,
     so a heading quoted here appears in the HTML of reports that do not render the section at all —
     which is precisely how scripts/site-evidence-report.test.ts first "proved" the section rendered
     on a clean site. A negative can be your own check's fault (CLAUDE.md §4); so can a positive. */
  .ev-item{padding:14px 0; border-top:1px solid var(--line)}
  .ev-item:first-child{border-top:none; padding-top:2px}
  .ev-t{font-size:15px; font-weight:700; color:var(--ink); margin:0 0 5px}
  .ev-p{margin:0 0 9px; font-size:13.5px; line-height:1.55; color:var(--muted); max-width:70ch}
  .ev-proof{margin:0; padding:9px 12px; background:var(--page); border:1px solid var(--line);
    border-radius:8px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    font-size:12px; line-height:1.7; color:var(--ink-2); word-break:break-all}
  .ev-proof .ev-k{display:block; font-family:inherit; color:var(--faint)}
  .cc-body{padding:2px 0 16px}
  .cc-brand{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:var(--ink)}
  .cc-mark{width:18px;height:18px;border-radius:50%;flex:0 0 18px}
  .cc-arow{display:flex;gap:10px;margin:12px 18px 0;align-items:flex-start}
  .cc-avatar{width:26px;height:26px;border-radius:50%;flex:0 0 26px;margin-top:2px}
  .cc-mark svg,.cc-avatar svg{width:100%;height:100%;display:block}
  .cc-avatar--oai{background:#0d0d0d;border-radius:50%;padding:5px;box-sizing:border-box}
  .cc-mark--oai{background:#0d0d0d;border-radius:6px;padding:3px;box-sizing:border-box}
  .cc-list{margin:8px 0 0;padding-left:20px;font-size:14px;line-height:1.55;color:var(--ink-2)}
  .cc-list li{margin:7px 0}
  .cc-head{background:var(--paper)}
  .cc-a{margin:0;max-width:none;background:var(--paper);border-radius:4px 14px 14px 14px;padding:12px 14px}

  /* New footer — brand row, key/value grid, note. */
  .site-foot{background:var(--foot);color:var(--foot-text);padding:26px 28px 22px}
  .foot-top{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.10)}
  .foot-brand{font-size:19px;font-weight:800;letter-spacing:-.02em;color:#fff}
  .foot-dot{color:var(--gold)}
  .foot-cta{font-size:13.5px;font-weight:600;color:var(--gold);text-decoration:none}
  .foot-grid{display:flex;flex-wrap:wrap;gap:26px 44px;padding:16px 0 14px}
  .foot-grid > div{display:flex;flex-direction:column;gap:3px}
  .foot-k{font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--foot-muted)}
  .foot-v{font-size:13.5px;font-weight:600;color:#fff}
  .foot-note{font-size:12px;line-height:1.5;color:var(--foot-muted);max-width:62ch;padding-top:13px;border-top:1px solid rgba(255,255,255,.10)}
  @media(max-width:560px){.foot-grid{gap:16px 28px}}

  /* New CTA buttons + site link + one-line fix copy. */
  .fx-p{font-size:13.5px;line-height:1.5;margin:3px 0 0}
  .cta h3{font-size:26px;letter-spacing:-.02em;margin:0 0 18px}
  .cta-actions{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 16px}
  .cta-btn.start{background:var(--gold);color:#0d0d0d}
  .cta-btn.call{background:#fff;color:#0d0d0d;border:1px solid transparent;font-family:inherit;cursor:pointer}
  .cta-btn.wa{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35)}
  .cta-site{display:inline-block;font-size:13.5px;font-weight:600;color:var(--gold);text-decoration:none;margin:0 0 18px}
  .cta-promise{font-size:12.5px;line-height:1.5;color:var(--foot-muted);margin:0;padding-top:14px;border-top:1px solid rgba(255,255,255,.10);max-width:56ch}

  /* Darker surfaces — the old tints were washed out (Paul, 2026-09-16). Overrides, later-wins. */
  :root{ --blue-tint:#dfe3ea; --blue-tint-2:#cfd5df; --page:#eef0f4; --line:#c8cede; }
  body{background:#c3c9d6}
  .chatcard{background:#dfe3ea;border-color:#c0c7d6}
  .cc-head{background:#fff;border-bottom-color:#d3d9e4}
  .cc-a{background:#fff;border-color:#d3d9e4}
  .cc-q{background:#cdd4e2}
  .fault{border-top-color:#d3d9e4}
  .sec-title{margin-bottom:6px}
  .ev-quote{background:#fff;border-color:#d3d9e4}
  .ev-item{border-top-color:#d3d9e4}
  .ev-proof{background:#eef1f6;border-color:#d3d9e4}
</style>
</head>
<body>
  <div class="sheet">
    ${r?ma(e.businessName,e.generatedAtLabel,e.hook):`${ze(`${i||n?"Quick AI Visibility Check":"AI Visibility Report"} &middot; ${o(e.generatedAtLabel)}`)}

    <div class="explainer">We asked ${i||n?"ChatGPT and Gemini":"AI"} the kinds of questions customers ask when they&rsquo;re looking for ${k?`<b>${o(k)}</b>`:`${Gt(t)} <b>${o(t)}</b>`}, and checked how often <b>${o(e.businessName)}</b> came up.</div>`}
${e.measuring?`
    <!-- STILL MEASURING: every figure below this point is withheld. See AiAuditReportData.measuring. -->
    <section class="measuring">
      <div class="sec-eyebrow">Still measuring</div>
      <div class="sec-title">We&rsquo;re not finished asking yet.</div>
      <p>AI gives different answers to the same question on different days, so we ask every question ${e.measuring.runsTarget===1?"and check the answer":`${Ft(e.measuring.runsTarget)} times`} before we show you a number &mdash; otherwise the figure would change under you between one visit and the next.</p>
      <p class="measuring-progress"><b>${e.measuring.runsDone} of ${e.measuring.runsTarget}</b> ${J(e.measuring.runsTarget,"round")} of questions ${e.measuring.runsDone===1?"is":"are"} complete. Each round takes a few minutes. This page updates itself &mdash; check back shortly.</p>
    </section>`:e.nameNotJudgeable?`${m}
${D}
`:r&&e.hook?`${$a(e.hook,e.businessName,de,e.prospectOnly===!0)}
`:n?`${da()}
`:e.hook?`${rt(e.hook,e.businessName,e.generatedAtLabel)}
${V}
`:e.paidSummary?`${q}
${y}
${D}
`:`
    <!-- HERO -->
    <div class="hero">
      <div class="hero-num">
        <span class="num ${C.band}">${e.named}</span>
        <div class="num-cap">
          <div class="l1">${J(e.named,"time","times")} ${o(e.businessName)} showed up in AI search</div>
          <div class="l2">out of ${e.total} ${J(e.total,"answer")}</div>
          ${e.questionsAsked&&e.enginesUsed?`<div class="l3">${e.questionsAsked} way${e.questionsAsked===1?"":"s"} of asking &times; ${e.enginesUsed} AI engine${e.enginesUsed===1?"":"s"}${(e.measurementRuns??1)>1?` &times; ${e.measurementRuns} asks each`:""}</div>`:""}
        </div>
      </div>
      <div class="hero-rule"></div>
      <div class="hero-verdict">
        <div class="vk">The verdict</div>
        <div class="punch">${C.punch}</div>
        <div class="punch-sub">${C.sub}</div>
      </div>
    </div>
${Z}
${y}
    <!-- ============================================================================
         SEO SECTION SLOT &mdash; renders results.seo when present (overall grade + three
         category grades + a radar of the three scores + the lead findings). With no scan
         it is THREE-WAY on d.hasWebsite: true = "the full check comes with the work",
         false = "we'll build you one", null/unknown = NOTHING. Silence beats a guess: the
         old two-way branch read a blank website column as "no website" and told a business
         with a site that we would build them one (AD Locksmithing, 2026-09-13).
         ============================================================================ -->
${D}
`}
    <!-- WHY THIS MATTERS / 45% STAKES SECTION: REMOVED from all audits (Paul, 2026-09-16). -->

    <!-- WHAT WE DO (solution) &mdash; the confident turn from problem to fix -->
    <!-- PITCH: hidden in the welcome pack (d.hidePitch) -->
${e.hidePitch||e.paidSummary||e.measuring||i||n?"":`
    <section class="dowe">
      <div class="sec-eyebrow">The fix</div>
      <!-- The title names the ARGUMENT this section makes, not an inventory. It read "Here's what we
           do" while the three steps below carried the deliverables; once those became three causal
           claims (it has to exist, be readable, agree with itself) that title described the offer
           block instead. "What's included" is the inventory, a screen below. -->
      <!-- ⛔ CONDITIONAL ON THE BAND, like the SEO lead and the verdict. This said "Why you're not
           in the answer" and opened "Being absent is not bad luck" on a report whose own verdict,
           two sections above, said the business was named once. Three places in one document
           disagreeing about whether the business exists in AI answers is the same fault three times,
           and it is the one a sceptical reader notices first. -->
      <div class="sec-title">${e.nameNotJudgeable?"What gets you named":e.named>0?"Where you show up, and where you don&rsquo;t yet":"Why you&rsquo;re not in the answer"}</div>
      <div class="dowe-panel">
        <p class="dowe-lead">${e.nameNotJudgeable?"Being named consistently is not luck.":e.named>0?"Being named occasionally rather than consistently is not bad luck.":"Being absent is not bad luck."} It comes down to <span class="hl">three things</span>, and all three are fixable.</p>
        <!-- ⛔ THREE IDEAS, NO QUANTITIES. THIS SECTION IS THE ARGUMENT, NOT THE INVENTORY.
             It used to carry the deliverables too - "a page for each service you do, in your town",
             "we mark up your details" - which is word for word what "What's included" says in the
             offer block a screen below. The reader met the same list twice and both readings got
             weaker: the argument read like a quote, and the quote read like a repeat.
             So the split is by JOB. Here: why being absent happens and what has to change, as three
             causal claims - it has to exist, it has to be readable, it has to agree with itself.
             There: the countable list someone weighs against the price, which is where "each service,
             each town" and "structured data" belong.
             ⚠️ Keep quantities, deliverables and anything with a number OUT of these three. The moment
             one appears here it is duplicated below, because the offer list is exhaustive by design. -->
        <!-- THE EXPLAINER BESIDE THREE CONCRETE STEPS (Paul, 2026-09-13). This replaced three
             abstract claims ("it quotes pages, not businesses" / "it has to be able to read you" /
             "it has to agree with itself") which read as weak on the document that sells. The three
             steps are now what we MEASURE, what we BUILD and what we RE-MEASURE — the shape of the
             guarantee — and they overlap "What's included" below on purpose: that list is the
             inventory someone weighs against the price, this is the method. Keep quantities and
             prices out of these three; the offer list is exhaustive by design.
             ⛔ VIDEO ON SCREEN, POSTER IN PRINT. The report is also printed to PDF and a PDF cannot
             play video, so the print stylesheet hides the player and shows the poster as a link
             with a caption. The poster is the same 1080x1920 frame the site uses.
             ⛔ NO LENGTH CLAIMED HERE (CLAUDE.md 13b): the file is re-cut in another repo. -->
        <div class="vid-row">
          <div class="vid">
            <video controls preload="metadata" playsinline poster="${o(De)}" src="${o(Ut)}">
              Your browser cannot play this video. <a href="${o(Be)}">Watch it at findable.live</a>.
            </video>
            <a class="vid-poster" href="${o(Be)}" target="_blank" rel="noopener noreferrer">
              <img src="${o(De)}" alt="The Findable explainer video" />
              <span>Watch the explainer at findable.live</span>
            </a>
          </div>
          <div class="steps">
            <div class="step">
              <div class="step-ic"><span class="ic">${L}</span><span class="badge">1</span></div>
              <div class="step-n">What we measure</div>
              <div class="st">How often AI names you</div>
              <p class="fx-p">We ask the questions your customers ask, and record who gets named.</p>
            </div>
            <div class="step">
              <div class="step-ic"><span class="ic">${N}</span><span class="badge">2</span></div>
              <div class="step-n">What we build</div>
              <div class="st">Pages AI can quote</div>
              <p class="fx-p">We find the questions you can win, then build new pages or fix your existing ones so AI can read and name you.</p>
            </div>
            <div class="step">
              <div class="step-ic"><span class="ic">${O}</span><span class="badge">3</span></div>
              <div class="step-n">What we re-measure</div>
              <div class="st">The same questions, four weeks on</div>
              <p class="fx-p">Same questions, same engines. You see both numbers.</p>
            </div>
          </div>
        </div>
      </div>
    </section>`}

    <!-- CTA -->
    <!-- PITCH: hidden in the welcome pack (d.hidePitch) -->
    <!-- NOTE FOR THE CTA BELOW, KEPT OUTSIDE THE TEMPLATE LITERAL. It cannot live inside the
         backticked string because naming a variable in backticks TERMINATES THE STRING - the exact
         trap CLAUDE.md section 3 records, and it broke this file for one edit on 2026-09-12.

         WHY THE COPY IS SAFE WITH NO "Get started" BUTTON. startBtn is empty on every render path
         except render-audit-report: there is no offerUrl in the in-app preview, the PDF, the
         before/after iframes or the welcome pack. So the copy has to read correctly without it, and
         it does - the three steps describe what WE do, not steps the reader has to take, and the
         second line points only at the two buttons that ALWAYS render.

         IT DEPENDS ON SOMETHING OUTSIDE THIS REPO, AND IT BRIEFLY POINTED AT NOTHING. "See how it
         works" lands on findable.live, and when this copy first shipped that page had NO VIDEO on
         it - zero video elements, zero iframes, no reference to findable-hook.mp4 - while the file
         itself served a clean 200. It existed only as the WhatsApp template's header asset.
         Fixed the same day: findable-site now has an Explainer section above Pricing. If that
         section is ever removed, this line goes with it.

         AND IT NO LONGER CLAIMS A LENGTH. It said "the two minute explainer"; the file is 49
         SECONDS. Paul offered "60 second" as the alternative and I did not take it - 49 is not 60
         either, and this sentence is deployed from a different repo to the video it describes, so a
         number here goes stale the moment the cut changes and nobody is standing next to it to
         notice. The length IS claimed on findable.live ("under a minute"), which is true at 49s and
         sits directly above the player, where a re-cut cannot be made without seeing it. -->
${r||e.hidePitch||e.paidSummary||n?"":`
    <!-- ⛔ NOT ON A PAID CLIENT'S OWN BASELINE / RE-MEASURE (2026-10-04, Session C C-34): "Want to be one
         of the names? Request a call" was printed to clients who had already paid. paidSummary is set
         only for those documents (reportKind.ts), so every prospect report is unchanged.
         🔴 STRIPPED BACK TO A HEADING, ONE LINE AND TWO BUTTONS (2026-09-02, Paul's call). What
         was here: "Ready to get started?", three paragraphs, Email us / WhatsApp us / Who we are,
         and directly below it the whole founder-offer block - "first 10 at £49.99", "normally £99",
         a What's included list, the guarantee box and week-eight references. All of it described a
         model that is no longer the offer, on the document a prospect reads first.

         ⛔ THE OFFER BLOCK IS NO LONGER RENDERED AT ALL - founderOfferSection() is not called. Read
         the note above that function before reinstating anything: the report was the only surface
         carrying the per-lead onboarding link, and that link is what made the founder price
         reachable. A bare findable.live URL cannot carry ?lead=, so a visitor arriving this way
         gets the standard funnel. That is the intended trade here - a short honest CTA over a stale
         price - but it IS a funnel change, not just copy.

         ⚠️ Who we are went with it. Email me came BACK on 2026-09-13 (Paul: the report must carry
         an email route), and WhatsApp now points at the personal number, not the Business API line,
         prefilled with the business name, so the one route that was actually used is unchanged. -->
    <section class="cta">
      <h3>Want to be one of the names?</h3>
      <div class="cta-actions">
        ${ee}
        ${te}
        <a class="cta-btn wa" href="${ne}" target="_blank" rel="noopener noreferrer">Ask me anything</a>
      </div>
      <a class="cta-site" href="${o(ie)}" target="_blank" rel="noopener noreferrer">See how it works at findable.live &rarr;</a>
      <!-- ⛔ THE REFUND SENTENCE IS REMEASURE_CLAIM_SENTENCE, VERBATIM/BYTE-LOCKED (Paul, 2026-09-16).
           The layout changed; the sentence does not. Not the shortened mockup version, not paraphrased
           — it is the promise the checkout and the refunds page carry, and it must read identically.
           ⛔ AND IT IS NOT JUDGED ON THIS PAGE'S NUMBER (2026-10-04, Session C C-06 / M-026). On a quick
           check the sentence sat directly under a 3-question score, so "that number" read as THIS
           figure. The line in front says which number the guarantee is judged on; the locked sentence
           follows it unchanged. -->
      ${e.prospectOnly===!0?"":`<p class="cta-promise">Your guarantee is judged on a full ${be}-question measurement we run after you join, not on this quick check. ${o(Me)}</p>`}
    </section>`}

${r?me:`
    <footer class="site-foot">
      <div class="foot-top">
        <div class="foot-brand">Findable<span class="foot-dot">.</span></div>
        <a class="foot-cta" href="${o(ie)}" target="_blank" rel="noopener noreferrer">findable.live</a>
      </div>
      <div class="foot-grid">
        <div><span class="foot-k">Prepared for</span><span class="foot-v">${o(e.businessName)}</span></div>
        <div><span class="foot-k">Report date</span><span class="foot-v">${o(e.generatedAtLabel)}</span></div>
        <div><span class="foot-k">Measured on</span><span class="foot-v">${he}</span></div>
      </div>
      <!-- ⛔ "the same questions" is true of a paid baseline (the re-measure replays it word for word),
           NOT of a prospect's quick check — the guarantee is judged on the full measurement (C-06). -->
      <div class="foot-note">${oe}</div>
    </footer>`}
  </div>
${H}
</body>
</html>`)}var ht=function(){var e=function($,q){var v=236,w=17,d=$,b=i[q],s=null,a=0,y=null,m=[],x={},N=function(p,h){a=d*4+17,s=function(l){for(var g=new Array(l),f=0;f<l;f+=1){g[f]=new Array(l);for(var E=0;E<l;E+=1)g[f][E]=null}return g}(a),O(0,0),O(a-7,0),O(0,a-7),G(),z(),ee(p,h),d>=7&&X(p),y==null&&(y=he(d,b,m)),te(y,h)},O=function(p,h){for(var l=-1;l<=7;l+=1)if(!(p+l<=-1||a<=p+l))for(var g=-1;g<=7;g+=1)h+g<=-1||a<=h+g||(0<=l&&l<=6&&(g==0||g==6)||0<=g&&g<=6&&(l==0||l==6)||2<=l&&l<=4&&2<=g&&g<=4?s[p+l][h+g]=!0:s[p+l][h+g]=!1)},L=function(){for(var p=0,h=0,l=0;l<8;l+=1){N(!0,l);var g=r.getLostPoint(x);(l==0||p>g)&&(p=g,h=l)}return h},z=function(){for(var p=8;p<a-8;p+=1)s[p][6]==null&&(s[p][6]=p%2==0);for(var h=8;h<a-8;h+=1)s[6][h]==null&&(s[6][h]=h%2==0)},G=function(){for(var p=r.getPatternPosition(d),h=0;h<p.length;h+=1)for(var l=0;l<p.length;l+=1){var g=p[h],f=p[l];if(s[g][f]==null)for(var E=-2;E<=2;E+=1)for(var I=-2;I<=2;I+=1)E==-2||E==2||I==-2||I==2||E==0&&I==0?s[g+E][f+I]=!0:s[g+E][f+I]=!1}},X=function(p){for(var h=r.getBCHTypeNumber(d),l=0;l<18;l+=1){var g=!p&&(h>>l&1)==1;s[Math.floor(l/3)][l%3+a-8-3]=g}for(var l=0;l<18;l+=1){var g=!p&&(h>>l&1)==1;s[l%3+a-8-3][Math.floor(l/3)]=g}},ee=function(p,h){for(var l=b<<3|h,g=r.getBCHTypeInfo(l),f=0;f<15;f+=1){var E=!p&&(g>>f&1)==1;f<6?s[f][8]=E:f<8?s[f+1][8]=E:s[a-15+f][8]=E}for(var f=0;f<15;f+=1){var E=!p&&(g>>f&1)==1;f<8?s[8][a-f-1]=E:f<9?s[8][15-f-1+1]=E:s[8][15-f-1]=E}s[a-8][8]=!p},te=function(p,h){for(var l=-1,g=a-1,f=7,E=0,I=r.getMaskFunction(h),A=a-1;A>0;A-=2)for(A==6&&(A-=1);;){for(var M=0;M<2;M+=1)if(s[g][A-M]==null){var H=!1;E<p.length&&(H=(p[E]>>>f&1)==1);var S=I(g,A-M);S&&(H=!H),s[g][A-M]=H,f-=1,f==-1&&(E+=1,f=7)}if(g+=l,g<0||a<=g){g-=l,l=-l;break}}},ne=function(p,h){for(var l=0,g=0,f=0,E=new Array(h.length),I=new Array(h.length),A=0;A<h.length;A+=1){var M=h[A].dataCount,H=h[A].totalCount-M;g=Math.max(g,M),f=Math.max(f,H),E[A]=new Array(M);for(var S=0;S<E[A].length;S+=1)E[A][S]=255&p.getBuffer()[S+l];l+=M;var K=r.getErrorCorrectPolynomial(H),Q=k(E[A],K.getLength()-1),ce=Q.mod(K);I[A]=new Array(K.getLength()-1);for(var S=0;S<I[A].length;S+=1){var c=S+ce.getLength()-I[A].length;I[A][S]=c>=0?ce.getAt(c):0}}for(var T=0,S=0;S<h.length;S+=1)T+=h[S].totalCount;for(var R=new Array(T),j=0,S=0;S<g;S+=1)for(var A=0;A<h.length;A+=1)S<E[A].length&&(R[j]=E[A][S],j+=1);for(var S=0;S<f;S+=1)for(var A=0;A<h.length;A+=1)S<I[A].length&&(R[j]=I[A][S],j+=1);return R},he=function(p,h,l){for(var g=C.getRSBlocks(p,h),f=W(),E=0;E<l.length;E+=1){var I=l[E];f.put(I.getMode(),4),f.put(I.getLength(),r.getLengthInBits(I.getMode(),p)),I.write(f)}for(var A=0,E=0;E<g.length;E+=1)A+=g[E].dataCount;if(f.getLengthInBits()>A*8)throw"code length overflow. ("+f.getLengthInBits()+">"+A*8+")";for(f.getLengthInBits()+4<=A*8&&f.put(0,4);f.getLengthInBits()%8!=0;)f.putBit(!1);for(;!(f.getLengthInBits()>=A*8||(f.put(v,8),f.getLengthInBits()>=A*8));)f.put(w,8);return ne(f,g)};x.addData=function(p,h){h=h||"Byte";var l=null;switch(h){case"Numeric":l=D(p);break;case"Alphanumeric":l=B(p);break;case"Byte":l=U(p);break;case"Kanji":l=V(p);break;default:throw"mode:"+h}m.push(l),y=null},x.isDark=function(p,h){if(p<0||a<=p||h<0||a<=h)throw p+","+h;return s[p][h]},x.getModuleCount=function(){return a},x.make=function(){if(d<1){for(var p=1;p<40;p++){for(var h=C.getRSBlocks(p,b),l=W(),g=0;g<m.length;g++){var f=m[g];l.put(f.getMode(),4),l.put(f.getLength(),r.getLengthInBits(f.getMode(),p)),f.write(l)}for(var E=0,g=0;g<h.length;g++)E+=h[g].dataCount;if(l.getLengthInBits()<=E*8)break}d=p}N(!1,L())},x.createTableTag=function(p,h){p=p||2,h=typeof h>"u"?p*4:h;var l="";l+='<table style="',l+=" border-width: 0px; border-style: none;",l+=" border-collapse: collapse;",l+=" padding: 0px; margin: "+h+"px;",l+='">',l+="<tbody>";for(var g=0;g<x.getModuleCount();g+=1){l+="<tr>";for(var f=0;f<x.getModuleCount();f+=1)l+='<td style="',l+=" border-width: 0px; border-style: none;",l+=" border-collapse: collapse;",l+=" padding: 0px; margin: 0px;",l+=" width: "+p+"px;",l+=" height: "+p+"px;",l+=" background-color: ",l+=x.isDark(g,f)?"#000000":"#ffffff",l+=";",l+='"/>';l+="</tr>"}return l+="</tbody>",l+="</table>",l},x.createSvgTag=function(p,h,l,g){var f={};typeof arguments[0]=="object"&&(f=arguments[0],p=f.cellSize,h=f.margin,l=f.alt,g=f.title),p=p||2,h=typeof h>"u"?p*4:h,l=typeof l=="string"?{text:l}:l||{},l.text=l.text||null,l.id=l.text?l.id||"qrcode-description":null,g=typeof g=="string"?{text:g}:g||{},g.text=g.text||null,g.id=g.text?g.id||"qrcode-title":null;var E=x.getModuleCount()*p+h*2,I,A,M,H,S="",K;for(K="l"+p+",0 0,"+p+" -"+p+",0 0,-"+p+"z ",S+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',S+=f.scalable?"":' width="'+E+'px" height="'+E+'px"',S+=' viewBox="0 0 '+E+" "+E+'" ',S+=' preserveAspectRatio="xMinYMin meet"',S+=g.text||l.text?' role="img" aria-labelledby="'+oe([g.id,l.id].join(" ").trim())+'"':"",S+=">",S+=g.text?'<title id="'+oe(g.id)+'">'+oe(g.text)+"</title>":"",S+=l.text?'<description id="'+oe(l.id)+'">'+oe(l.text)+"</description>":"",S+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',S+='<path d="',M=0;M<x.getModuleCount();M+=1)for(H=M*p+h,I=0;I<x.getModuleCount();I+=1)x.isDark(M,I)&&(A=I*p+h,S+="M"+A+","+H+K);return S+='" stroke="transparent" fill="black"/>',S+="</svg>",S},x.createDataURL=function(p,h){p=p||2,h=typeof h>"u"?p*4:h;var l=x.getModuleCount()*p+h*2,g=h,f=l-h;return Z(l,l,function(E,I){if(g<=E&&E<f&&g<=I&&I<f){var A=Math.floor((E-g)/p),M=Math.floor((I-g)/p);return x.isDark(M,A)?0:1}else return 1})},x.createImgTag=function(p,h,l){p=p||2,h=typeof h>"u"?p*4:h;var g=x.getModuleCount()*p+h*2,f="";return f+="<img",f+=' src="',f+=x.createDataURL(p,h),f+='"',f+=' width="',f+=g,f+='"',f+=' height="',f+=g,f+='"',l&&(f+=' alt="',f+=oe(l),f+='"'),f+="/>",f};var oe=function(p){for(var h="",l=0;l<p.length;l+=1){var g=p.charAt(l);switch(g){case"<":h+="&lt;";break;case">":h+="&gt;";break;case"&":h+="&amp;";break;case'"':h+="&quot;";break;default:h+=g;break}}return h},me=function(p){var h=1;p=typeof p>"u"?h*2:p;var l=x.getModuleCount()*h+p*2,g=p,f=l-p,E,I,A,M,H,S={"██":"█","█ ":"▀"," █":"▄","  ":" "},K={"██":"▀","█ ":"▀"," █":" ","  ":" "},Q="";for(E=0;E<l;E+=2){for(A=Math.floor((E-g)/h),M=Math.floor((E+1-g)/h),I=0;I<l;I+=1)H="█",g<=I&&I<f&&g<=E&&E<f&&x.isDark(A,Math.floor((I-g)/h))&&(H=" "),g<=I&&I<f&&g<=E+1&&E+1<f&&x.isDark(M,Math.floor((I-g)/h))?H+=" ":H+="█",Q+=p<1&&E+1>=f?K[H]:S[H];Q+=`
`}return l%2&&p>0?Q.substring(0,Q.length-l-1)+Array(l+1).join("▀"):Q.substring(0,Q.length-1)};return x.createASCII=function(p,h){if(p=p||1,p<2)return me(h);p-=1,h=typeof h>"u"?p*2:h;var l=x.getModuleCount()*p+h*2,g=h,f=l-h,E,I,A,M,H=Array(p+1).join("██"),S=Array(p+1).join("  "),K="",Q="";for(E=0;E<l;E+=1){for(A=Math.floor((E-g)/p),Q="",I=0;I<l;I+=1)M=1,g<=I&&I<f&&g<=E&&E<f&&x.isDark(A,Math.floor((I-g)/p))&&(M=0),Q+=M?H:S;for(A=0;A<p;A+=1)K+=Q+`
`}return K.substring(0,K.length-1)},x.renderTo2dContext=function(p,h){h=h||2;for(var l=x.getModuleCount(),g=0;g<l;g++)for(var f=0;f<l;f++)p.fillStyle=x.isDark(g,f)?"black":"white",p.fillRect(g*h,f*h,h,h)},x};e.stringToBytesFuncs={default:function($){for(var q=[],v=0;v<$.length;v+=1){var w=$.charCodeAt(v);q.push(w&255)}return q}},e.stringToBytes=e.stringToBytesFuncs.default,e.createStringToBytes=function($,q){var v=function(){for(var d=de($),b=function(){var z=d.read();if(z==-1)throw"eof";return z},s=0,a={};;){var y=d.read();if(y==-1)break;var m=b(),x=b(),N=b(),O=String.fromCharCode(y<<8|m),L=x<<8|N;a[O]=L,s+=1}if(s!=q)throw s+" != "+q;return a}(),w=63;return function(d){for(var b=[],s=0;s<d.length;s+=1){var a=d.charCodeAt(s);if(a<128)b.push(a);else{var y=v[d.charAt(s)];typeof y=="number"?(y&255)==y?b.push(y):(b.push(y>>>8),b.push(y&255)):b.push(w)}}return b}};var t={MODE_NUMBER:1,MODE_ALPHA_NUM:2,MODE_8BIT_BYTE:4,MODE_KANJI:8},i={L:1,M:0,Q:3,H:2},n={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7},r=function(){var $=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],q=1335,v=7973,w=21522,d={},b=function(s){for(var a=0;s!=0;)a+=1,s>>>=1;return a};return d.getBCHTypeInfo=function(s){for(var a=s<<10;b(a)-b(q)>=0;)a^=q<<b(a)-b(q);return(s<<10|a)^w},d.getBCHTypeNumber=function(s){for(var a=s<<12;b(a)-b(v)>=0;)a^=v<<b(a)-b(v);return s<<12|a},d.getPatternPosition=function(s){return $[s-1]},d.getMaskFunction=function(s){switch(s){case n.PATTERN000:return function(a,y){return(a+y)%2==0};case n.PATTERN001:return function(a,y){return a%2==0};case n.PATTERN010:return function(a,y){return y%3==0};case n.PATTERN011:return function(a,y){return(a+y)%3==0};case n.PATTERN100:return function(a,y){return(Math.floor(a/2)+Math.floor(y/3))%2==0};case n.PATTERN101:return function(a,y){return a*y%2+a*y%3==0};case n.PATTERN110:return function(a,y){return(a*y%2+a*y%3)%2==0};case n.PATTERN111:return function(a,y){return(a*y%3+(a+y)%2)%2==0};default:throw"bad maskPattern:"+s}},d.getErrorCorrectPolynomial=function(s){for(var a=k([1],0),y=0;y<s;y+=1)a=a.multiply(k([1,u.gexp(y)],0));return a},d.getLengthInBits=function(s,a){if(1<=a&&a<10)switch(s){case t.MODE_NUMBER:return 10;case t.MODE_ALPHA_NUM:return 9;case t.MODE_8BIT_BYTE:return 8;case t.MODE_KANJI:return 8;default:throw"mode:"+s}else if(a<27)switch(s){case t.MODE_NUMBER:return 12;case t.MODE_ALPHA_NUM:return 11;case t.MODE_8BIT_BYTE:return 16;case t.MODE_KANJI:return 10;default:throw"mode:"+s}else if(a<41)switch(s){case t.MODE_NUMBER:return 14;case t.MODE_ALPHA_NUM:return 13;case t.MODE_8BIT_BYTE:return 16;case t.MODE_KANJI:return 12;default:throw"mode:"+s}else throw"type:"+a},d.getLostPoint=function(s){for(var a=s.getModuleCount(),y=0,m=0;m<a;m+=1)for(var x=0;x<a;x+=1){for(var N=0,O=s.isDark(m,x),L=-1;L<=1;L+=1)if(!(m+L<0||a<=m+L))for(var z=-1;z<=1;z+=1)x+z<0||a<=x+z||L==0&&z==0||O==s.isDark(m+L,x+z)&&(N+=1);N>5&&(y+=3+N-5)}for(var m=0;m<a-1;m+=1)for(var x=0;x<a-1;x+=1){var G=0;s.isDark(m,x)&&(G+=1),s.isDark(m+1,x)&&(G+=1),s.isDark(m,x+1)&&(G+=1),s.isDark(m+1,x+1)&&(G+=1),(G==0||G==4)&&(y+=3)}for(var m=0;m<a;m+=1)for(var x=0;x<a-6;x+=1)s.isDark(m,x)&&!s.isDark(m,x+1)&&s.isDark(m,x+2)&&s.isDark(m,x+3)&&s.isDark(m,x+4)&&!s.isDark(m,x+5)&&s.isDark(m,x+6)&&(y+=40);for(var x=0;x<a;x+=1)for(var m=0;m<a-6;m+=1)s.isDark(m,x)&&!s.isDark(m+1,x)&&s.isDark(m+2,x)&&s.isDark(m+3,x)&&s.isDark(m+4,x)&&!s.isDark(m+5,x)&&s.isDark(m+6,x)&&(y+=40);for(var X=0,x=0;x<a;x+=1)for(var m=0;m<a;m+=1)s.isDark(m,x)&&(X+=1);var ee=Math.abs(100*X/a/a-50)/5;return y+=ee*10,y},d}(),u=function(){for(var $=new Array(256),q=new Array(256),v=0;v<8;v+=1)$[v]=1<<v;for(var v=8;v<256;v+=1)$[v]=$[v-4]^$[v-5]^$[v-6]^$[v-8];for(var v=0;v<255;v+=1)q[$[v]]=v;var w={};return w.glog=function(d){if(d<1)throw"glog("+d+")";return q[d]},w.gexp=function(d){for(;d<0;)d+=255;for(;d>=256;)d-=255;return $[d]},w}();function k($,q){if(typeof $.length>"u")throw $.length+"/"+q;var v=function(){for(var d=0;d<$.length&&$[d]==0;)d+=1;for(var b=new Array($.length-d+q),s=0;s<$.length-d;s+=1)b[s]=$[s+d];return b}(),w={};return w.getAt=function(d){return v[d]},w.getLength=function(){return v.length},w.multiply=function(d){for(var b=new Array(w.getLength()+d.getLength()-1),s=0;s<w.getLength();s+=1)for(var a=0;a<d.getLength();a+=1)b[s+a]^=u.gexp(u.glog(w.getAt(s))+u.glog(d.getAt(a)));return k(b,0)},w.mod=function(d){if(w.getLength()-d.getLength()<0)return w;for(var b=u.glog(w.getAt(0))-u.glog(d.getAt(0)),s=new Array(w.getLength()),a=0;a<w.getLength();a+=1)s[a]=w.getAt(a);for(var a=0;a<d.getLength();a+=1)s[a]^=u.gexp(u.glog(d.getAt(a))+b);return k(s,0).mod(d)},w}var C=function(){var $=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],q=function(d,b){var s={};return s.totalCount=d,s.dataCount=b,s},v={},w=function(d,b){switch(b){case i.L:return $[(d-1)*4+0];case i.M:return $[(d-1)*4+1];case i.Q:return $[(d-1)*4+2];case i.H:return $[(d-1)*4+3];default:return}};return v.getRSBlocks=function(d,b){var s=w(d,b);if(typeof s>"u")throw"bad rs block @ typeNumber:"+d+"/errorCorrectionLevel:"+b;for(var a=s.length/3,y=[],m=0;m<a;m+=1)for(var x=s[m*3+0],N=s[m*3+1],O=s[m*3+2],L=0;L<x;L+=1)y.push(q(N,O));return y},v}(),W=function(){var $=[],q=0,v={};return v.getBuffer=function(){return $},v.getAt=function(w){var d=Math.floor(w/8);return($[d]>>>7-w%8&1)==1},v.put=function(w,d){for(var b=0;b<d;b+=1)v.putBit((w>>>d-b-1&1)==1)},v.getLengthInBits=function(){return q},v.putBit=function(w){var d=Math.floor(q/8);$.length<=d&&$.push(0),w&&($[d]|=128>>>q%8),q+=1},v},D=function($){var q=t.MODE_NUMBER,v=$,w={};w.getMode=function(){return q},w.getLength=function(s){return v.length},w.write=function(s){for(var a=v,y=0;y+2<a.length;)s.put(d(a.substring(y,y+3)),10),y+=3;y<a.length&&(a.length-y==1?s.put(d(a.substring(y,y+1)),4):a.length-y==2&&s.put(d(a.substring(y,y+2)),7))};var d=function(s){for(var a=0,y=0;y<s.length;y+=1)a=a*10+b(s.charAt(y));return a},b=function(s){if("0"<=s&&s<="9")return s.charCodeAt(0)-48;throw"illegal char :"+s};return w},B=function($){var q=t.MODE_ALPHA_NUM,v=$,w={};w.getMode=function(){return q},w.getLength=function(b){return v.length},w.write=function(b){for(var s=v,a=0;a+1<s.length;)b.put(d(s.charAt(a))*45+d(s.charAt(a+1)),11),a+=2;a<s.length&&b.put(d(s.charAt(a)),6)};var d=function(b){if("0"<=b&&b<="9")return b.charCodeAt(0)-48;if("A"<=b&&b<="Z")return b.charCodeAt(0)-65+10;switch(b){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+b}};return w},U=function($){var q=t.MODE_8BIT_BYTE,v=e.stringToBytes($),w={};return w.getMode=function(){return q},w.getLength=function(d){return v.length},w.write=function(d){for(var b=0;b<v.length;b+=1)d.put(v[b],8)},w},V=function($){var q=t.MODE_KANJI,v=e.stringToBytesFuncs.SJIS;if(!v)throw"sjis not supported.";(function(b,s){var a=v(b);if(a.length!=2||(a[0]<<8|a[1])!=s)throw"sjis not supported."})("友",38726);var w=v($),d={};return d.getMode=function(){return q},d.getLength=function(b){return~~(w.length/2)},d.write=function(b){for(var s=w,a=0;a+1<s.length;){var y=(255&s[a])<<8|255&s[a+1];if(33088<=y&&y<=40956)y-=33088;else if(57408<=y&&y<=60351)y-=49472;else throw"illegal char at "+(a+1)+"/"+y;y=(y>>>8&255)*192+(y&255),b.put(y,13),a+=2}if(a<s.length)throw"illegal char at "+(a+1)},d},F=function(){var $=[],q={};return q.writeByte=function(v){$.push(v&255)},q.writeShort=function(v){q.writeByte(v),q.writeByte(v>>>8)},q.writeBytes=function(v,w,d){w=w||0,d=d||v.length;for(var b=0;b<d;b+=1)q.writeByte(v[b+w])},q.writeString=function(v){for(var w=0;w<v.length;w+=1)q.writeByte(v.charCodeAt(w))},q.toByteArray=function(){return $},q.toString=function(){var v="";v+="[";for(var w=0;w<$.length;w+=1)w>0&&(v+=","),v+=$[w];return v+="]",v},q},se=function(){var $=0,q=0,v=0,w="",d={},b=function(a){w+=String.fromCharCode(s(a&63))},s=function(a){if(!(a<0)){if(a<26)return 65+a;if(a<52)return 97+(a-26);if(a<62)return 48+(a-52);if(a==62)return 43;if(a==63)return 47}throw"n:"+a};return d.writeByte=function(a){for($=$<<8|a&255,q+=8,v+=1;q>=6;)b($>>>q-6),q-=6},d.flush=function(){if(q>0&&(b($<<6-q),$=0,q=0),v%3!=0)for(var a=3-v%3,y=0;y<a;y+=1)w+="="},d.toString=function(){return w},d},de=function($){var q=$,v=0,w=0,d=0,b={};b.read=function(){for(;d<8;){if(v>=q.length){if(d==0)return-1;throw"unexpected end of file./"+d}var a=q.charAt(v);if(v+=1,a=="=")return d=0,-1;if(a.match(/^\s$/))continue;w=w<<6|s(a.charCodeAt(0)),d+=6}var y=w>>>d-8&255;return d-=8,y};var s=function(a){if(65<=a&&a<=90)return a-65;if(97<=a&&a<=122)return a-97+26;if(48<=a&&a<=57)return a-48+52;if(a==43)return 62;if(a==47)return 63;throw"c:"+a};return b},_=function($,q){var v=$,w=q,d=new Array($*q),b={};b.setPixel=function(m,x,N){d[x*v+m]=N},b.write=function(m){m.writeString("GIF87a"),m.writeShort(v),m.writeShort(w),m.writeByte(128),m.writeByte(0),m.writeByte(0),m.writeByte(0),m.writeByte(0),m.writeByte(0),m.writeByte(255),m.writeByte(255),m.writeByte(255),m.writeString(","),m.writeShort(0),m.writeShort(0),m.writeShort(v),m.writeShort(w),m.writeByte(0);var x=2,N=a(x);m.writeByte(x);for(var O=0;N.length-O>255;)m.writeByte(255),m.writeBytes(N,O,255),O+=255;m.writeByte(N.length-O),m.writeBytes(N,O,N.length-O),m.writeByte(0),m.writeString(";")};var s=function(m){var x=m,N=0,O=0,L={};return L.write=function(z,G){if(z>>>G)throw"length over";for(;N+G>=8;)x.writeByte(255&(z<<N|O)),G-=8-N,z>>>=8-N,O=0,N=0;O=z<<N|O,N=N+G},L.flush=function(){N>0&&x.writeByte(O)},L},a=function(m){for(var x=1<<m,N=(1<<m)+1,O=m+1,L=y(),z=0;z<x;z+=1)L.add(String.fromCharCode(z));L.add(String.fromCharCode(x)),L.add(String.fromCharCode(N));var G=F(),X=s(G);X.write(x,O);var ee=0,te=String.fromCharCode(d[ee]);for(ee+=1;ee<d.length;){var ne=String.fromCharCode(d[ee]);ee+=1,L.contains(te+ne)?te=te+ne:(X.write(L.indexOf(te),O),L.size()<4095&&(L.size()==1<<O&&(O+=1),L.add(te+ne)),te=ne)}return X.write(L.indexOf(te),O),X.write(N,O),X.flush(),G.toByteArray()},y=function(){var m={},x=0,N={};return N.add=function(O){if(N.contains(O))throw"dup key:"+O;m[O]=x,x+=1},N.size=function(){return x},N.indexOf=function(O){return m[O]},N.contains=function(O){return typeof m[O]<"u"},N};return b},Z=function($,q,v){for(var w=_($,q),d=0;d<q;d+=1)for(var b=0;b<$;b+=1)w.setPixel(b,d,v(b,d));var s=F();w.write(s);for(var a=se(),y=s.toByteArray(),m=0;m<y.length;m+=1)a.writeByte(y[m]);return a.flush(),"data:image/gif;base64,"+a};return e}();(function(){ht.stringToBytesFuncs["UTF-8"]=function(e){function t(i){for(var n=[],r=0;r<i.length;r++){var u=i.charCodeAt(r);u<128?n.push(u):u<2048?n.push(192|u>>6,128|u&63):u<55296||u>=57344?n.push(224|u>>12,128|u>>6&63,128|u&63):(r++,u=65536+((u&1023)<<10|i.charCodeAt(r)&1023),n.push(240|u>>18,128|u>>12&63,128|u>>6&63,128|u&63))}return n}return t(e)}})();const Na=ht;function Oa(e){const t=Na(0,"M");t.addData(e,"Byte"),t.make();const i=t.getModuleCount();return Array.from({length:i},(n,r)=>Array.from({length:i},(u,k)=>t.isDark(r,k)))}function Ra(e,t=132,i="QR code"){const n=Oa(e),r=n.length,u=4,k=r+u*2;let C="";for(let D=0;D<r;D++)for(let B=0;B<r;B++)n[D][B]&&(C+=`M${B+u} ${D+u}h1v1h-1z`);const W=i.replace(/[&<>"]/g,D=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[D]);return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${k} ${k}" width="${t}" height="${t}" role="img" aria-label="${W}" shape-rendering="crispEdges"><rect width="${k}" height="${k}" fill="#fff"/><path d="${C}" fill="#000"/></svg>`}function Fe(e){return new Date(e).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/London"})}function _a(e,t){const i=String(e??"").trim().slice(0,10),n=String(t??"").trim().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(i)||!/^\d{4}-\d{2}-\d{2}$/.test(n))return null;const r=Math.round((Date.parse(i+"T00:00:00Z")-Date.parse(n+"T00:00:00Z"))/864e5);return!Number.isFinite(r)||r<=0||r%7!==0?null:r/7}function re(e,t){return`<p><b>${o(e)}</b> ${o(t)}</p>`}const La=`
  .wp-wrap{ padding:18px 28px 24px; }
  .wp-eyebrow{ font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--blue-2); font-weight:800; }
  .wp-h1{ font-size:26px; font-weight:900; color:var(--ink); margin:2px 0 4px; line-height:1.15; }
  .wp-sub{ font-size:13.5px; color:var(--muted); font-weight:700; margin:0 0 12px; }
  .wp-h2{ font-size:17px; font-weight:900; color:var(--ink); margin:18px 0 6px; }
  .wp-h3{ font-size:14.5px; font-weight:800; color:var(--blue-2); margin:16px 0 4px; }
  .wp-wrap p{ font-size:13.5px; color:var(--ink); line-height:1.55; margin:0 0 9px; max-width:82ch; }
  .wp-wrap p.muted{ color:var(--muted); }
  .wp-note{ font-size:12.5px; color:var(--muted); font-style:italic; margin:6px 0 0; }

  /* gold rounded number squares */
  .wp-rows{ display:flex; flex-direction:column; gap:12px; margin:10px 0 0; }
  .wp-row{ display:flex; gap:12px; align-items:flex-start; }
  .wp-num{ flex:0 0 auto; width:30px; height:30px; border-radius:8px; background:var(--gold);
    color:var(--on-gold); font-weight:900; font-size:15px; display:flex; align-items:center; justify-content:center; }
  .wp-rowbody{ min-width:0; }
  .wp-rowtitle{ font-size:14px; font-weight:800; color:var(--ink); }
  /* The one block in the pack that asks the reader to do something, so it is the one block that
     does not look like body copy. Gold rule on the left, matching the report's own band accent. */
  /* ⚠️ --gold-line / --gold-tint / --on-gold-tint, NOT invented names. The pack renders inside the
     report's stylesheet (see this file's header) and a --tint token does not exist there. A token
     that
     does not resolve leaves the block transparent and the text on the page ground, which is exactly
     the "it rendered, therefore it is right" trap. Checked against the token block before use. */
  .wp-ask{ margin:18px 0 6px; padding:14px 16px; border-left:3px solid var(--gold-line); background:var(--gold-tint); border-radius:0 8px 8px 0; }
  .wp-asklabel{ font-size:11px; font-weight:800; letter-spacing:.10em; text-transform:uppercase; color:var(--on-gold-tint); }
  .wp-askline{ margin:6px 0 0; font-size:14px; font-weight:800; color:var(--ink); }
  .wp-asksteps{ margin:6px 0 0; font-size:13px; line-height:1.5; color:var(--on-gold-tint-2); }
  .wp-rowline{ font-size:13px; color:var(--muted); margin:2px 0 0; line-height:1.5; }

  /* info boxes */
  .wp-box{ border:1px solid var(--line); background:var(--panel-tint); border-radius:10px; padding:12px 14px; margin:12px 0; }
  .wp-box-navy{ border:1px solid var(--line); border-left:4px solid var(--blue); background:var(--paper);
    border-radius:10px; padding:12px 14px; margin:12px 0; }
  .wp-boxtitle{ font-size:10.5px; font-weight:900; letter-spacing:.07em; text-transform:uppercase;
    color:var(--blue-2); margin:0 0 7px; }
  .wp-ticks{ list-style:none; margin:0; padding:0; }
  .wp-ticks li{ font-size:13px; color:var(--ink); line-height:1.5; padding:3px 0 3px 22px; position:relative; }
  .wp-ticks li:before{ content:"\\2713"; position:absolute; left:0; top:3px; color:var(--green); font-weight:900; }

  /* monospace boxes */
  .wp-mono{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px;
    background:var(--mono-bg); color:var(--mono-text); border-radius:8px; padding:11px 13px; margin:8px 0;
    white-space:pre-wrap; word-break:break-word; line-height:1.5; }
  .wp-mono-light{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px;
    background:var(--panel-tint-2); color:var(--mono-light-text); border:1px solid var(--line); border-radius:8px;
    padding:10px 12px; margin:8px 0; white-space:pre-wrap; word-break:break-word; }
  .wp-monolabel{ font-size:10px; font-weight:900; letter-spacing:.07em; text-transform:uppercase;
    color:var(--blue-2); margin:10px 0 0; }

  /* two columns (Gmail/Outlook, Do/Don't) */
  .wp-cols{ display:flex; gap:14px; margin:10px 0; flex-wrap:wrap; }
  .wp-col{ flex:1 1 220px; min-width:200px; border:1px solid var(--line); border-radius:10px; padding:11px 13px; }
  .wp-coltitle{ font-size:12.5px; font-weight:900; color:var(--ink); margin:0 0 6px; }
  .wp-col ol{ margin:0; padding-left:18px; }
  .wp-col ol li{ font-size:12.5px; color:var(--ink); line-height:1.5; margin:2px 0; }
  .wp-col ul{ list-style:none; margin:0; padding:0; }
  .wp-col ul li{ font-size:12.5px; color:var(--ink); line-height:1.5; margin:0 0 7px; }
  .wp-do .wp-coltitle{ color:var(--green); }
  .wp-dont .wp-coltitle{ color:var(--red); }
  .wp-guar{ font-size:12px; font-weight:800; color:var(--blue-2); margin:16px 0 0; }

  /* the facts grid on "your details" — a label/value pair per cell, never a table */
  .wp-dl{ display:flex; flex-wrap:wrap; gap:10px 18px; margin:8px 0 0; }
  .wp-dl > div{ flex:1 1 210px; min-width:190px; }
  .wp-dt{ font-size:10.5px; font-weight:900; letter-spacing:.06em; text-transform:uppercase; color:var(--blue-2); }
  .wp-dd{ font-size:13.5px; color:var(--ink); line-height:1.45; word-break:break-word; margin:1px 0 0; }
  /* the three headline numbers on the baseline page */
  .wp-stats{ display:flex; gap:12px; flex-wrap:wrap; margin:10px 0 4px; }
  .wp-stat{ flex:1 1 150px; min-width:140px; border:1px solid var(--line); border-radius:10px;
    padding:11px 13px; background:var(--panel-tint); }
  .wp-statnum{ font-size:24px; font-weight:900; color:var(--ink); line-height:1.1; }
  .wp-statlab{ font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--blue-2); margin:3px 0 0; }

  /* the one-line summaries: the sentence a skimming reader should take away from the page */
  .wp-wrap p.wp-oneline{ font-size:15px; font-weight:800; color:var(--ink); line-height:1.45;
    border-left:3px solid var(--gold-line); padding:2px 0 2px 12px; margin:6px 0 10px; }
  /* a box is already a narrow measure; the body's 70ch cap left a third of every box empty */
  .wp-box p, .wp-box-navy p{ max-width:none; }
  .wp-rows-tight{ gap:4px; }
  /* the cover lists up to eight sections; smaller squares keep it to one printed page */
  .wp-rows-tight .wp-num{ width:26px; height:26px; font-size:13.5px; border-radius:7px; }
  .wp-rows-tight .wp-rowline{ margin-top:0; }
  .wp-rows-tight .wp-row{ align-items:flex-start; }
  .wp-rows-tight .wp-rowtitle, .wp-rows-tight .wp-rowline{ line-height:26px; }
  .wp-rows-tight .wp-rowbody{ display:flex; flex-wrap:wrap; align-items:baseline; column-gap:8px; }
  .wp-points{ margin:4px 0 8px; padding-left:18px; }
  .wp-points li{ font-size:13.5px; color:var(--ink); line-height:1.5; margin:0 0 4px; }
  .wp-ticks li b{ color:var(--ink); }
  /* the time label on each "what happens next" step */
  .wp-when{ display:inline-block; font-size:10.5px; font-weight:900; letter-spacing:.06em; text-transform:uppercase;
    color:var(--blue-2); margin-right:8px; }

  /* the agreement page: the one button in the pack, and its QR code */
  .wp-keys{ margin:6px 0 10px; padding-left:20px; }
  .wp-keys li{ font-size:13.5px; color:var(--ink); line-height:1.5; margin:0 0 7px; }
  .wp-agree{ display:flex; gap:18px; align-items:center; flex-wrap:wrap; margin:16px 0 4px; padding:16px;
    border:1px solid var(--line); border-left:4px solid var(--gold-line); border-radius:0 10px 10px 0; background:var(--gold-tint); }
  .wp-agree-main{ flex:1 1 260px; min-width:0; }
  a.wp-agreebtn{ display:inline-block; background:var(--gold); color:var(--on-gold); font-weight:900; font-size:15px;
    text-decoration:none; padding:12px 18px; border-radius:10px; }
  .wp-agreeurl{ font-size:11px; color:var(--muted); word-break:break-all; margin:8px 0 0; }
  .wp-qr{ flex:0 0 auto; background:#fff; padding:6px; border-radius:8px; border:1px solid var(--line); line-height:0; }
  @media print{ .wp-agree{ break-inside:avoid; page-break-inside:avoid; } }

  @media (max-width:520px){ .wp-wrap{ padding:14px 18px 18px; } }
`,Ma=`
  @media print{
    .wp-row, .wp-box, .wp-box-navy, .wp-mono, .wp-mono-light, .wp-col, .wp-stat, .wp-dl > div{ break-inside:avoid; page-break-inside:avoid; }
  }
`;function Ba(e,t,i){return`
  <div class="sheet">
    <header class="band">
      <div class="band-row">
        <div class="wordmark">Findable<span class="dot">.</span></div>
        <div class="band-meta">${e}</div>
      </div>
      <svg class="wave" viewBox="0 0 1200 38" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,14 C220,42 420,-4 640,15 C860,34 1010,4 1200,19 L1200,38 L0,38 Z" style="fill:var(--paper)"/>
      </svg>
    </header>
    <section class="wp-wrap">${t}</section>
    ${i}
  </div>`}function Da(e,t,i,n,r=!1){const u=[{title:"Your plan",line:"What we do, what you get, the timeline and your guarantee."},{title:"How it works",line:"Why many local businesses are hard for AI to read, and what we change."},...i?[{title:"Where you stand today",line:"Your starting result, explained in plain English."},{title:"What happens next",line:"The steps from today to your before and after."}]:[],...n?[{title:"Your agreement",line:r?"The key points, and where to review and sign it.":"How your agreement works from here."}]:[],...t?[{title:"What we have on file",line:"The details everything is built on. Please check them."}]:[],{title:"Get more reviews",line:"A five-minute setup for the part only you can do."},{title:"Your baseline report",line:"Every question we asked and what AI said, in full."}];return`
      <div class="wp-eyebrow">Welcome pack</div>
      <h1 class="wp-h1">Welcome to Findable</h1>
      <p class="wp-sub">Prepared for ${o(e)}</p>
      <p>Thanks for coming on board. This pack has everything in one place: what we&rsquo;re doing,
      where you stand with AI today, and the one small part that&rsquo;s yours.</p>
      <!-- ⛔ THE ASK COMES FIRST, ABOVE THE CONTENTS. The pack already promised "the one small part
           that's yours" in its opening line and then never said what it was — the address appeared
           nowhere in this document. Placed before the timeline so it cannot read as a later step:
           the profile work waits on it, and a customer who reads to the end and stops has still
           read this.
           ⚠️ Every sentence is a shared constant (findableOffer.ts), byte-identical to the
           confirmation screens in findable-site. An instruction somebody is expected to FOLLOW must
           not exist in three slightly different versions, and the address least of all. -->
      <div class="wp-ask">
        <div class="wp-asklabel">${o("One thing we need from you")}</div>
        <p class="wp-askline">${o(It)}</p>
        <p class="wp-asksteps">${o(St)}</p>
        <p class="wp-asksteps">${o(Ct)} ${o(Nt)}</p>
      </div>
      <h2 class="wp-h2">What&rsquo;s inside</h2>
      <div class="wp-rows wp-rows-tight">
        ${u.map((k,C)=>`<div class="wp-row">
          <div class="wp-num">${C+1}</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">${k.title}</div>
            <p class="wp-rowline">${k.line}</p>
          </div>
        </div>`).join(`
        `)}
      </div>
      <p style="margin-top:14px">Any questions at all, just reply to the email this came with.
      <b>Glad to have you with us.</b></p>`}function Pa(e,t){return fe(e)!==null&&t!==null&&t!==void 0&&Number(t)===Xe}function za(e,t){const i=_a(e,t);if(i===null)return null;const n=new Date(String(e).slice(0,10)+"T00:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});return{weeks:i,label:n}}const Wa={2:"two",3:"three",4:"four",5:"five",6:"six",7:"seven",8:"eight",10:"ten",12:"twelve"};function ut(e){return Wa[e]??String(e)}function gt(e){return fe(e)==="build"?"hosting and maintenance of your website":"hosting and maintenance if your site is with us"}function Ha(e){const t=fe(e);return t?`, for your minimum term (${Te(t)} payments in total, counting your first)`:", until your agreed payments are complete (counting your first)"}function Ga(e){return`
      <div class="wp-eyebrow">Your part</div>
      <h1 class="wp-h1">Get more Google reviews</h1>
      <p>Reviews help new customers decide whether to trust you, and they strengthen the public evidence
      around your business. The easier you make it for customers to leave one, the more you get.
      This takes about five minutes to set up, once.</p>

      <div class="wp-rows">
        <div class="wp-row">
          <div class="wp-num">1</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">Your review link</div>
            ${e?`<p>Here&rsquo;s your review link. Use it anywhere you ask a customer to leave a review.</p>
           <div class="wp-mono-light">${o(e)}</div>
           <p class="wp-note">Keep this handy. It&rsquo;s the same link every time.</p>`:`<p>Search your business name on Google, signed in with the account that looks after your
           listing, and click <b>Ask for reviews</b> in your business panel. Copy the short link it
           gives you.</p>
           <p class="wp-note">No Business Profile access yet? Open your listing on Google Maps and copy
           the address from your browser. Customers can still leave a review from it in one extra tap.</p>`}
          </div>
        </div>
        <div class="wp-row">
          <div class="wp-num">2</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">Add it to your email signature</div>
            <p>Put one line under your name, so every email you send carries it:</p>
            <div class="wp-mono-light">Happy with our work? <u>Leave us a quick review</u></div>
            <div class="wp-cols">
              <div class="wp-col">
                <p class="wp-coltitle">In Gmail</p>
                <ol>
                  <li>Click the gear icon, top right</li>
                  <li>See all settings</li>
                  <li>On the General tab, scroll to Signature</li>
                  <li>Click your signature to edit, or Create new</li>
                  <li>Add the line, then Save changes at the bottom</li>
                </ol>
              </div>
              <div class="wp-col">
                <p class="wp-coltitle">In Outlook</p>
                <ol>
                  <li>Click the gear icon, top right</li>
                  <li>Mail, then Compose and reply</li>
                  <li>Add the line to your signature box</li>
                  <li>Click Save</li>
                </ol>
                <p class="wp-note">Desktop app: File &gt; Options &gt; Mail &gt; Signatures</p>
              </div>
            </div>
            <p class="wp-note">Tip: don&rsquo;t paste the raw web address. Type the words
            &ldquo;Leave us a quick review&rdquo;, highlight them, then use the link button (the chain
            icon) to attach your link. It looks tidier and gets clicked more.</p>
          </div>
        </div>
      </div>`}function ja(){return`
      <div class="wp-eyebrow">Your part</div>
      <div class="wp-rows">
        <div class="wp-row">
          <div class="wp-num">3</div>
          <div class="wp-rowbody">
            <div class="wp-rowtitle">Ask at the right moment</div>
            <p>The signature works quietly in the background. A direct ask, sent just after a job wraps
            up, is what really moves the number. Copy the message below.</p>
            <p class="wp-monolabel">Ready to send &middot; copy, fill the brackets, send</p>
            <div class="wp-mono">Subject: A quick favour

Hi [first name],

Now [the work] is wrapped up, would you mind leaving us a quick Google review? It takes about a minute and makes a real difference to a small business like ours.

[your review link]

Thanks,
[your name]</div>
            <div class="wp-cols">
              <div class="wp-col wp-do">
                <p class="wp-coltitle">Do</p>
                <ul>
                  <li>Ask every customer, a few at a time, while the work is fresh in their mind.</li>
                  <li>Reply to every review you receive. It shows customers you&rsquo;re active and
                  that you care.</li>
                </ul>
              </div>
              <div class="wp-col wp-dont">
                <p class="wp-coltitle">Don&rsquo;t</p>
                <ul>
                  <li>Offer discounts or gifts for reviews. It&rsquo;s against Google&rsquo;s rules and
                  can get reviews removed.</li>
                  <li>Only ask customers you think were happy. Filtering is against the rules too. Ask
                  everyone.</li>
                </ul>
              </div>
            </div>
            <div class="wp-box-navy">
              <p><b>That&rsquo;s it.</b> We handle the pages and the directories.
              You do the review link once, and ask customers as jobs wrap up. Any questions at all,
              just reply to the email this came with.</p>
            </div>
          </div>
        </div>
      </div>`}const qe="If AI names you no more often at your four-week re-check, you can claim your £99 back within 14 days, and the agreement ends.",$e=`Monthly payments start ${et}.`,Fa={build:[`Your service has a minimum term: ${Te("build")} payments, counting your first. The remaining payments are owed even if you stop early.`,$e,"We build, host and manage your new website during the term.","We own the website and our work until your final payment. Then it’s yours.","If a payment is 14 days late, we can take down the website we built until it’s paid. We will tell you first.",qe],optimise:[`Your service has a minimum term: ${Te("optimise")} payments, counting your first. The remaining payments are owed even if you stop early.`,$e,"Your website is always yours. We will never take it offline.","The pages and content we add become yours on your final payment.","If a payment is 14 days late, we can remove the pages and content we added until it’s paid. We will tell you first.",qe],unknown:["Your service has a minimum term. The remaining payments are owed even if you stop early.",$e,qe]};function Ya(e){const t=Fa[e.route??"unknown"];return(e.version==="v4"||e.version==="v5")&&e.route?[...t,_t(e.route)]:t}const Ua="Your domain, logo and photos are always yours.";function Va(e){if(!e.termsKnown&&!e.acceptedAtIso)return`
      <div class="wp-eyebrow">Your agreement</div>
      <h1 class="wp-h1">Your agreement</h1>
      <p>${o("Your agreed payment schedule continues under the terms you signed up to.")}</p>
      <p class="wp-note">${o("Your agreement link will be sent separately.")}</p>`;const t=[e.planName?`Plan: ${e.planName}`:"",e.version?`Agreement version ${e.version}`:"",e.initialPaidAtIso?`First payment ${Fe(e.initialPaidAtIso)}`:""].filter(Boolean).join(" · "),n=(e.acceptedAtIso?`<div class="wp-box-navy"><p><b>Agreement accepted on ${o(Fe(e.acceptedAtIso))} by ${o(e.acceptedBy||"you")}.</b></p>${t?`<p>${o(t)}</p>`:""}${e.url?`<p><a href="${o(e.url)}?pdf=1">Download your signed agreement (PDF)</a></p>`:""}</div>`:"")||(e.url?`<div class="wp-agree">
        <div class="wp-agree-main">
          <a class="wp-agreebtn" href="${o(e.url)}">Review and agree to your agreement</a>
          <p class="wp-note">Or scan the code with your phone camera. This link is yours alone.</p>
          <p class="wp-agreeurl">${o(e.url)}</p>
        </div>
        <div class="wp-qr">${Ra(e.url,124,"QR code for your agreement page")}</div>
      </div>`:'<p class="wp-note">Your agreement link will be sent separately.</p>');return`
      <div class="wp-eyebrow">Your agreement</div>
      <h1 class="wp-h1">Your agreement: the key points</h1>
      <p>Your Findable Client Service Agreement sets out exactly what we do and what you pay. In short:</p>
      <ul class="wp-keys">
        ${Ya(e).map(r=>`<li>${o(r)}</li>`).join(`
        `)}
      </ul>
      <p><b>${o(Ua)}</b></p>
      ${n}`}function Ka(e,t){const i=(u,k)=>{const C=String(k??"").trim();return C?`<div><div class="wp-dt">${o(u)}</div><div class="wp-dd">${o(C)}</div></div>`:""},n=(u,k)=>i(u,(k??[]).filter(Boolean).join(", "));return`
      <div class="wp-eyebrow">Your details</div>
      <h1 class="wp-h1">What we have on file</h1>
      <p class="wp-sub">Please check this over</p>
      <p>These are the details we hold for you, taken from what you told us when you signed up and
      from your own website. Everything we do is built on them &mdash; the questions we test, the pages
      we write, the profiles we tidy up. <b>If anything here is wrong or out of date, just reply and
      tell us.</b></p>
      <div class="wp-dl">
        ${[i("Business",e),i("Website",t.website),i("Main location",t.primaryLocation),i("What you do",t.category),n("Services we measure you on",t.services),n("Areas you serve",t.areas),i("Main contact",t.contactName),i("Email",t.email),i("Phone",t.phone)].filter(Boolean).join(`
        `)}
      </div>
      <p class="wp-note">Anything we don&rsquo;t have, we&rsquo;ve left out rather than guessed.</p>`}function Qa(e,t,i,n,r=!1){const u=o(e),k=Pa(t,i),C=n?ut(n.weeks):"",W=fe(t);return`
      <div class="wp-eyebrow">Your plan</div>
      <h1 class="wp-h1">Your Findable plan</h1>
      <p>More and more customers ask AI tools like ChatGPT and Google&rsquo;s Gemini to recommend a
      local business, and the answer usually names only a handful.</p>
      <p>Findable improves the public evidence about ${u}, on your website and the sites AI reads, so
      AI and search tools can understand you more clearly. Then we measure whether you are named more
      often. Practical, measured work, not vague SEO talk.</p>

      <h2 class="wp-h2">What we do, in one line</h2>
      <p class="wp-oneline">We make the facts about your business clear, consistent and easy to check,
      so you have stronger evidence when customers ask AI who to use.</p>

      <div class="wp-box">
        <p class="wp-boxtitle">What you get</p>
        <ul class="wp-ticks">
          <li><b>Your starting point, measured.</b> Real customer questions, asked several times on ChatGPT and Gemini${r?", plus Google AI where Google shows an AI answer":""}.</li>
          ${W==="build"?"<li><b>A new website, built and hosted by us.</b> One dedicated page for each key service, answering what customers really ask.</li>":W==="optimise"?"<li><b>Clearer pages on your own website.</b> One dedicated page for each key service, answering what customers really ask. Your website stays yours.</li>":"<li><b>Clearer website pages.</b> One dedicated page for each key service, answering what customers really ask.</li>"}
          <li><b>Your Google Business Profile corrected,</b> so it matches your website.</li>
          <li><b>The right directories for your trade.</b> Added where you are missing, fixed where you are wrong.</li>
          <li><b>A before and after.</b> The same questions asked again, shown side by side.</li>
          <li><b>Every month after that.</b> A new page, a check of your AI visibility, adjustments, and a short update.</li>
        </ul>
      </div>

      <div class="wp-box-navy">
        <p class="wp-boxtitle">Timeline &amp; guarantee</p>
        ${re("When work starts.","Straight away. The first improvements go live within the first few weeks.")}
        ${n?re("Your first re-measure.",`${C.charAt(0).toUpperCase()+C.slice(1)} weeks after your starting point, due ${n.label}. Same questions, same AI tools. The first check, not the finish line.`):re("Your first re-measure.","Four weeks after your starting point, same questions, same AI tools. The first check, not the finish line.")}
        
        ${k?`<p><b>Your guarantee.</b> ${o(Ot)}</p>`:re("Your guarantee.","Your money-back guarantee applies on the terms you signed up to.")}
        
        ${k?re("Payments.",`Your £${Xe} covers the measurement, the first round of work and the re-measure. £${Rt} a month begins ${et}${Ha(t)}. It pays for the monthly work above, plus ${gt(t)}. We will email you before it starts.`):re("Payments.","Your agreed payment schedule continues under the terms you signed up to.")}
      </div>`}function Ja(e){return`
      <div class="wp-eyebrow">Your plan</div>
      <h1 class="wp-h1">How it works</h1>
      <p class="wp-oneline">AI and search tools can only name a business they can understand and
      check. Our job is to make yours easy to understand and easy to check.</p>
      <p>In our measurements so far, ChatGPT has often used a wider mix of directories and other
      sites, while Gemini has more often used businesses&rsquo; own websites. It varies by trade and
      question, so we measure rather than assume.</p>

      <h3 class="wp-h3">1. Your website pages (the main part of the work)</h3>
      <p><b>Where many local websites fall short.</b> Often one page tries to cover everything, so no
      service has a clear page of its own. Or pages repeat town names and keywords without adding
      anything useful, which makes them harder to make sense of and weaker evidence, for customers
      and AI tools alike.</p>
      <ul class="wp-ticks">
        <li>Each important service gets one clear, dedicated page.</li>
        <li>Location pages only where there is real local information to give. No cloned town pages.</li>
        <li>The questions customers really ask, answered inside the right page. No piles of thin FAQ pages.</li>
        <li>Plain facts that are easy to check: what you do, where you work, how to reach you.</li>
        <li>Any price, qualification or promise is checked with you before it goes live.</li>
      </ul>
      <p style="margin-top:8px"><b>What this means:</b> not more pages, but clearer ones, each with a job to do.</p>

      <h3 class="wp-h3">2. The directories that matter for your trade</h3>
      <p>Which directories matter depends on the trade: one vital for plumbers can be irrelevant for
      accountants. We check which sites AI actually quotes for your trade, then add or correct you there.</p>

      <h3 class="wp-h3">3. Saying the same thing everywhere</h3>
      <p>If your website, Google and a directory each show a different phone number or address, nobody
      can be sure which is right. We make your name, address, phone and services match everywhere.</p>

      <h3 class="wp-h3">4. Your reviews</h3>
      <p>Reviews help customers choose you and add to the public picture of your business. We
      don&rsquo;t claim they decide what AI recommends on their own, but they are well worth having.
      Getting them is the part only you can do, and there is a five-minute setup later in this pack.</p>

      <div class="wp-box-navy">
        <p><b>In short.</b> AI and search tools need clear, consistent, trustworthy information about your
        business. We make your website and listings provide it, and measure whether you are named more often.</p>
      </div>`}function Za(e){return e>=60?"most times":`roughly 1 in every ${Math.max(2,Math.round(100/e))} times`}function Xa(e,t){const i=o(e),n=t.runs||3,r=o(t.engineLabels.join(" and ")||"each AI tool"),u=t.perEngine.length?t.perEngine.map(F=>`${o(F.label)} named you in ${F.named} of ${F.total} answers`).join(" &middot; "):"",k=t.strong.length,C=t.fragile.length,W=t.oneEngine.length,D=t.absent.length,B=k+C,U=F=>`${F} question${F===1?"":"s"}`;if(t.nameNotJudgeable)return`
      <div class="wp-eyebrow">Your baseline</div>
      <h1 class="wp-h1">Where you stand today</h1>
      <p class="wp-sub">Measured ${o(t.completedLabel||"on the date shown in your report")}</p>
      <p>Your business name is close enough to the words people search for that an automatic check
      can&rsquo;t reliably tell a mention of <b>you</b> from a mention of the trade itself. So we
      have not put a score on it. Everything else in this pack still applies, and we read your
      results by hand.</p>
      <p>We asked ${t.questionCount} questions a real customer in your area might ask, ${n} times each
      on ${r}. The full detail is in the report at the back of this pack.</p>`;const V=t.named>0?`${t.named} of those ${t.total} answers named ${i}. That&rsquo;s ${t.pct}%: ${Za(t.pct)} a customer asks, AI mentions you.`:`None of those ${t.total} answers named ${i} yet. That is the starting point we work from.`;return`
      <div class="wp-eyebrow">Your baseline</div>
      <h1 class="wp-h1">Where you stand today</h1>
      <p class="wp-sub">Measured ${o(t.completedLabel||"on the date shown in your report")}</p>
      <p>Before we change anything, we measure. This is your starting point, and the number we compare
      against when we measure again.</p>
      <div class="wp-stats">
        <div class="wp-stat"><div class="wp-statnum">${t.named} of ${t.total}</div><div class="wp-statlab">Answers that named you</div></div>
        <div class="wp-stat"><div class="wp-statnum">${t.pct}%</div><div class="wp-statlab">Of all answers</div></div>
        <div class="wp-stat"><div class="wp-statnum">${t.questionCount}</div><div class="wp-statlab">Questions, asked ${n}&times; each</div></div>
      </div>

      <h2 class="wp-h2">What the numbers mean</h2>
      <ul class="wp-points">
        <li>We asked <b>${t.questionCount} questions</b> a real customer near you might ask.</li>
        <li>We asked each one <b>${n} times on ${r}</b>. That makes <b>${t.total} answers</b> in total.</li>
        <li>${V}</li>
        ${u?`<li>${u}.</li>`:""}
      </ul>

      <h3 class="wp-h3">Why ask everything ${n} times?</h3>
      <p>AI doesn&rsquo;t give the same answer every time. Ask the same question twice and you can get
      different names. One answer on its own could be luck, good or bad. Asking every question
      several times, on more than one tool, gives a fair average and a starting point you can rely on.</p>

      <h2 class="wp-h2">Where your openings are</h2>
      <ul class="wp-ticks">
        ${k?`<li><b>${U(k)} where AI named you every time.</b> These are already working for you, and we protect them.</li>`:""}
        ${C?`<li><b>${U(C)} where AI named you sometimes, not every time.</b> You are on the edge of the answer, and these can tip either way.</li>`:""}
        ${D?`<li><b>${U(D)} where you were not named at all.</b> The biggest openings, and where clearer pages and listings have the most room to help.</li>`:""}
      </ul>
      ${W?`<p style="margin-top:8px"><b>Worth knowing:</b> on ${W} of the ${B} question${B===1?"":"s"} where you were named, only one of the two AI tools named you. One already finds you, so the work is to make the same facts clear to the other.</p>`:""}

      <div class="wp-box-navy">
        <p class="wp-boxtitle">How we measured it</p>
        <p>${t.questionCount} questions &middot; asked ${n} times each &middot; on ${r} &middot;
        the same questions are used again when we re-measure. Every question and answer is in the
        report at the back of this pack.</p>
      </div>`}function en(e,t){const i=t?ut(t.weeks):"four",n=(r,u,k,C)=>`
        <div class="wp-row"><div class="wp-num">${r}</div><div class="wp-rowbody">
          <div class="wp-rowtitle"><span class="wp-when">${u}</span>${k}</div>
          <p class="wp-rowline">${C}</p></div></div>`;return`
      <div class="wp-eyebrow">What happens next</div>
      <h1 class="wp-h1">From today to your before and after</h1>
      <p>Week ${i} is your first check, not the end. Nothing about the test changes along the way.</p>
      <div class="wp-rows">
        ${n(1,"Today","Your baseline is locked","These exact questions are frozen, so the before and after is like for like. No moved goalposts.")}
        ${n(2,"The next few weeks","We do the work","Clearer pages on your website, your Google Business Profile corrected, and your directory listings added and fixed.")}
        ${n(3,`At ${i} weeks`,"Your first re-measure",t?`The same frozen questions, the same AI tools, the same method, the same towns. Due ${t.label}.`:"The same frozen questions, the same AI tools, the same method, the same towns.")}
        ${n(4,"Then","You get your before and after","Side by side, with every answer shown. If the number has not gone up, your guarantee applies.")}
        ${n(5,"Every month after","We keep building",`A new page each month, giving customers and AI another clear answer about what you do. We check your AI visibility monthly and adjust as we learn, plus ${gt(e)}. A short update tells you what changed.`)}
      </div>
      <div class="wp-box">
        <p class="wp-boxtitle">Why the answers vary</p>
        <p>AI answers are not fixed. Ask the same question twice and the names can change, which is why
        we ask everything several times and compare like for like. Our work makes your business easier
        to find, understand and describe correctly; the re-measure shows whether the number has moved.
        What nobody can do is guarantee that a particular AI tool will recommend you or quote your
        website on a particular day.</p>
      </div>
      <div class="wp-box">
        <p class="wp-boxtitle">Your domain and your current website</p>
        <p>If we are building you a new website, your business needs to own or control its web address
        (its domain). If an agency or developer runs your current site, that agreement stays yours to
        manage, and we only reuse material your business owns or is allowed to use. If anything changes
        with your domain or your provider, tell us straight away. Full terms: findable.live/terms.</p>
      </div>`}function Ye(e,t,i,n){const r=e.match(t);if(!r||r.index===void 0)throw new Error(`welcomePack: could not find the report's ${n} opening tag`);const u=r.index+r[0].length,k=e.indexOf(i,u);if(k<0)throw new Error(`welcomePack: could not find the report's ${n} closing tag`);return e.slice(u,k)}function tn(e){var B,U,V;const t=(e.businessName||"your business").trim(),i=(e.reviewLink??"").trim(),n=pt({...e.report,hidePitch:!0,seoStyle:"pack"}),r=Ye(n,/<style>/i,"</style>","stylesheet"),u=Ye(n,/<body>/i,"</body>","body"),k=`Welcome pack &middot; ${o(t.toUpperCase())}`,C=`<footer class="site-foot">
      <div class="row">
        <span>Prepared for <b>${o(t)}</b></span>
        <span>Findable &middot; Welcome pack</span>
      </div>
      <div class="note">Backed by our money-back guarantee. Any questions, message or email me
        &mdash; <a href="https://wa.me/${Ue}">${o(Tt())}</a>
        or <a href="mailto:${o(Ee)}?subject=${encodeURIComponent(`Findable - ${t}`)}">${o(Ee)}</a>.</div>
    </footer>`,W=za(e.remeasureDueDate,((B=e.baseline)==null?void 0:B.completedAt)??null),D=[Da(t,!!e.facts,!!e.baseline,!!e.agreement,!!((U=e.agreement)!=null&&U.termsKnown||(V=e.agreement)!=null&&V.acceptedAtIso)),Qa(t,e.totalPayments,e.amountPaid,W,e.report.googleAiInScore===!0),Ja(),...e.baseline?[Xa(t,e.baseline),en(e.totalPayments,W)]:[],...e.agreement?[Va(e.agreement)]:[],...e.facts?[Ka(t,e.facts)]:[],Ga(i),ja()].map(F=>Ba(k,F,C)).join(`
`);return`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<!-- 🔴 THE META IS THE ONLY PROTECTION THAT ACTUALLY TRAVELS. Both this route and /r/ set an
     x-robots-tag header upstream and Cloudflare STRIPS it (measured on production 2026-09-22: the
     header is absent from findable.live/w/ AND findable.live/r/, on both of which upstream sets
     it). So the document's own meta is doing the whole job, and it now matches the report's —
     noarchive and nosnippet included, because a cached copy or a search snippet naming a client's
     measured invisibility and their rivals is the same disclosure by another name. -->
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet"/>
<title>Findable Welcome Pack - ${o(t)}</title>
<style>
${r}
${La}
${Ma}
</style>
</head>
<body>
${D}
${u}
</body>
</html>`}function ft(e,t){return`${(e||"Business").trim().replace(/[^\w\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"")||"Business"}-${t}`}function Oe(e,t){const i=e.replace(/<title>[\s\S]*?<\/title>/i,`<title>${o(t)}</title>`),n=document.createElement("iframe");n.setAttribute("aria-hidden","true"),n.style.position="fixed",n.style.left="-10000px",n.style.top="0",n.style.width="794px",n.style.height="1123px",n.style.border="0",n.style.opacity="0";let r=!1;const u=()=>{r||(r=!0,n.remove())};n.onload=()=>{const k=n.contentWindow,C=n.contentDocument;if(!k||!C){u();return}try{C.title=t}catch{}try{n.style.height=`${C.documentElement.scrollHeight}px`}catch{}k.addEventListener("afterprint",()=>setTimeout(u,300),{once:!0}),setTimeout(u,6e4),requestAnimationFrame(()=>requestAnimationFrame(()=>{k.focus(),k.print()}))},document.body.appendChild(n),n.srcdoc=i}function hn(e){if(e.measuring){console.warn(`[report] refusing to print: still measuring (${e.measuring.runsDone} of ${e.measuring.runsTarget} runs done)`);return}Oe(pt({...e,internal:e.internal===!0}),ft(e.businessName,"AI-Visibility-Report"))}function un(e,t,i){Oe(e,ft(t,i))}function gn(e){const t=(e.businessName||"your business").trim();Oe(tn(e),`Findable Welcome Pack - ${t}`)}export{Bt as D,nn as G,Xt as R,Dt as T,un as a,aa as b,ze as c,hn as d,o as e,ea as f,ta as g,on as h,gn as i,zt as j,Wt as k,rn as l,dn as m,sn as n,pn as o,ln as p,pt as q,cn as r};
//# sourceMappingURL=aiAuditReportDownload-f5GUsc5Z.js.map
