import{c as pe,aB as ce,aA as Se,ik as L,a3 as Ne,dI as Ce,j as a,aR as he,B as T,N as M,bC as ge,db as me,dd as ue,R as H,aD as D,ab as Oe,r as A,au as _e,bs as re,av as Re,I as ne,X as Ie,dA as je}from"./index-DqyojbXq.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Le=pe("ImageOff",[["line",{x1:"2",x2:"22",y1:"2",y2:"22",key:"a6p6uj"}],["path",{d:"M10.41 10.41a2 2 0 1 1-2.83-2.83",key:"1bzlo9"}],["line",{x1:"13.5",x2:"6",y1:"13.5",y2:"21",key:"1q0aeu"}],["line",{x1:"18",x2:"21",y1:"12",y2:"15",key:"5mozeu"}],["path",{d:"M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59",key:"mmje98"}],["path",{d:"M21 15V5a2 2 0 0 0-2-2H9",key:"43el77"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=pe("LayoutTemplate",[["rect",{width:"18",height:"7",x:"3",y:"3",rx:"1",key:"f1a2em"}],["rect",{width:"9",height:"7",x:"3",y:"14",rx:"1",key:"jqznyg"}],["rect",{width:"5",height:"7",x:"16",y:"14",rx:"1",key:"q5h2i8"}]]);async function O(e){const{data:t,error:r}=await Ne.functions.invoke("mockup",{body:e});if(r)throw new Error(r.message);if(t&&typeof t=="object"&&"ok"in t&&t.ok===!1){const o=t;throw new Error(o.detail||o.error||"request failed")}return t}function De(){return ce({queryKey:["mockups"],queryFn:()=>O({action:"list"}).then(e=>e.mockups??[]),staleTime:3e4})}function Me(e){return ce({queryKey:["mockup",e],queryFn:()=>O({action:"get",id:e}),enabled:!!e})}function qe(e){const t=Se(),r=()=>{t.invalidateQueries({queryKey:["mockup",e]}),t.invalidateQueries({queryKey:["mockups"]})},o=L({mutationFn:m=>O({action:"pool",id:e,template_html:m}),onSuccess:r}),i=L({mutationFn:m=>O({action:"place",id:e,...m}),onSuccess:r}),p=L({mutationFn:m=>O({action:"services",id:e,services:m}),onSuccess:r}),s=L({mutationFn:()=>O({action:"shot",id:e}),onSuccess:r}),d=L({mutationFn:()=>O({action:"refill",id:e}),onSuccess:r});return{pool:o,place:i,saveServices:p,refill:d,shoot:s}}const ze=6,Pe=8,B={locksmith:{key:"locksmith",label:"Locksmith",trade:"Locksmith",template:"locksmith.html",matches:["locksmith","locksmiths","auto locksmith","auto locksmiths","car locksmith"]},plumber:{key:"plumber",label:"Plumber",trade:"Plumber",template:"plumber.html",matches:["plumber","plumbers","plumbing","plummer","heating engineer","plumber and heating"]}};function He(e){return typeof e=="string"&&Object.prototype.hasOwnProperty.call(B,e)?B[e]:null}Object.values(B);const Be=["hero","banner","masthead"];function Fe(e){const t=String(e??"").trim().toLowerCase();return t?!Be.includes(t):!1}const F=[{id:"stock-01",subject:"front door lock",path:"/mockup-stock/stock-01.png",alt:"A black lever handle on a composite front door",caption:"Composite front door, lever handle",niches:["locksmith"]},{id:"stock-02",subject:"euro cylinder",path:"/mockup-stock/stock-02.png",alt:"A brass euro profile cylinder on dark slate",caption:"Brass euro cylinder",niches:["locksmith"]},{id:"stock-03",subject:"anti-snap cylinder",path:"/mockup-stock/stock-03.png",alt:"An anti-snap cylinder cut away with the pins exposed",caption:"Anti-snap cylinder, pins exposed",niches:["locksmith"]},{id:"stock-04",subject:"lit doorway",path:"/mockup-stock/stock-04.jpg",alt:"A lit doorway at night",caption:"Out-of-hours call-out",niches:["locksmith"]},{id:"stock-05",subject:"workshop bench",path:"/mockup-stock/stock-05.jpg",alt:"A workshop bench with lock tools",caption:"Key cutting and lock workshop",niches:["locksmith"]},{id:"stock-06",subject:"cut keys",path:"/mockup-stock/stock-06.jpg",alt:"A set of freshly cut keys",caption:"Cut keys",niches:["locksmith"]}];function Ue(e){const t=String(e??"").trim().toLowerCase(),r=F.filter(i=>(i.niches??[]).includes(t)),o=F.filter(i=>!i.niches||i.niches.length===0);return[...r,...o]}const Ge=["checkatrade","yell","bark","trustpilot","mybuilder","ratedpeople","mla","nsi","safecontractor","trustatrader","which"],We=new Set(["which","mla","nsi"]),Ye=["approved","member","registered","trusted","trader","logo","badge","accredited","certified","couk","com"],fe=e=>String(e??"").toLowerCase().replace(/[^a-z0-9]+/g,"");function be(e){let t="";try{t=decodeURIComponent(new URL(e.url).pathname.split("/").pop()??"")}catch{t=e.url}return fe(`${t} ${e.alt??""}`)}function ve(e){const t=be(e);for(const r of Ge)if(t.includes(r)&&(!We.has(r)||Ye.some(o=>t.includes(o))))return r;return null}function Ve(e,t){const r=be(e);if((/\blogo\b/i.test(String(e.alt??""))||r.includes("logo"))&&!ve(e))return!0;const o=fe(String(t??"").replace(/\b(ltd|limited|llp|plc|co|company|services?|locksmiths?|security|the|and)\b/gi," ").split(/[-–—,|]/)[0]);return!!(o.length>=4&&r.includes(o))}function P(e){const t=Number(e.width)||0,r=Number(e.height)||0;if(e.alpha===!0||t&&r&&(Math.max(t,r)<=260||t/r>=2.2))return!0;try{if(/\.svg(?:$|\?)/i.test(new URL(e.url).pathname))return!0}catch{}return!1}function xe(e,t){const r=ve(e);return r?{kind:"badge",reason:`${r} badge`,uncertain:!P(e)}:Ve(e,t)?{kind:"logo",reason:"their own logo",uncertain:!P(e)}:{kind:"photo",reason:"photograph",uncertain:P(e)}}class Ke extends Error{constructor(t){super(`required field missing: ${t}`),this.field=t,this.name="MissingRequired"}}function U(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function $e(e){const t=String(e??"").trim();if(!t)return"";if(/^(?:tel:|mailto:)/i.test(t))return U(t);try{const r=new URL(t);return r.protocol!=="http:"&&r.protocol!=="https:"?"":U(r.href)}catch{return""}}function we(e,t,r){var s;const o=e.trim();if(!o)return;const i=o.match(/^img\s+([A-Za-z0-9_-]+)$/);if(i)return(s=t.slots)==null?void 0:s[i[1]];if(o===".")return r==null?void 0:r["."];if(o.startsWith("."))return r?r[o.slice(1)]:void 0;let p=t;for(const d of o.split(".")){if(p==null||typeof p!="object")return;p=p[d]}return p}function ke(e){return e==null||e===!1?!0:typeof e=="string"?e.trim()==="":Array.isArray(e)?e.length===0:!1}const Qe=/\{\{#(if|each)\s+([^}]+?)\}\}/;function Ze(e,t,r){const o=new RegExp(`\\{\\{#${r}\\s+[^}]+?\\}\\}`,"g"),i=new RegExp(`\\{\\{/${r}\\}\\}`,"g");let p=1,s=t;for(;s<e.length;){o.lastIndex=s,i.lastIndex=s;const d=o.exec(e),m=i.exec(e);if(!m)return null;if(d&&d.index<m.index){p++,s=d.index+d[0].length;continue}if(p--,p===0)return{inner:e.slice(t,m.index),after:m.index+m[0].length};s=m.index+m[0].length}return null}function oe(e,t,r,o){return e.replace(/\{\{\s*([^#/][^}]*?)\s*\}\}/g,(i,p)=>{const s=p.trim(),d=/^url\s+/.test(s),m=d?s.replace(/^url\s+/,"").trim():s,c=we(m,t,r);if(o.has(m)&&ke(c))throw new Ke(m);return d?$e(c):U(c)})}const ie=new Set(["business.name","business.trade","business.town"]);function G(e,t,r){let o="",i=e;for(;;){const p=Qe.exec(i);if(!p){o+=oe(i,t,r,ie);break}o+=oe(i.slice(0,p.index),t,r,ie);const s=p[1],d=p[2].trim(),m=p.index+p[0].length,c=Ze(i,m,s);if(!c)throw new Error(`unbalanced {{#${s} ${d}}} — no matching {{/${s}}}`);const h=we(d,t,r);if(s==="if")o+=ke(h)?"":G(c.inner,t,r);else{const y=Array.isArray(h)?h:[];for(const b of y){const E=typeof b=="object"&&b!==null?{...b,".":b}:{".":b};o+=G(c.inner,t,E)}}i=i.slice(c.after)}return o}function Xe(e,t){const r=new RegExp(`<template\\s+data-page\\s*=\\s*["']${t}["']\\s*>([\\s\\S]*?)<\\/template>`,"i"),o=e.match(r);return o?o[1]:null}function Je(e){const t=[];for(const r of e.matchAll(/\{\{\s*(?:url\s+)?img\s+([A-Za-z0-9_-]+)\s*\}\}/g))t.includes(r[1])||t.push(r[1]);for(const r of e.matchAll(/\{\{#if\s+img\s+([A-Za-z0-9_-]+)\s*\}\}/g))t.includes(r[1])||t.push(r[1]);return t}function et(e,t,r){const o=Xe(e,t);if(o===null)throw new Error(`template has no <template data-page="${t}">`);return G(o,r,null)}const tt=6,at=6,rt=6,se=5,nt=["business.name","business.trade","business.town"];class ye extends Error{constructor(t){super(`render refused: required field(s) missing — ${t.join(", ")}`),this.fields=t,this.name="MissingRaw"}}function f(e){return e==null||e===!1?!1:Array.isArray(e)?e.length>0:typeof e=="number"?e!==0&&Number.isFinite(e):typeof e=="object"?Object.keys(e).length>0:String(e).trim()!==""}const le=e=>e?String(e).replace(/[^\d+]/g,""):"",ot=/(?:sprite|icon|favicon|pixel|spacer|placeholder|1x1|blank|loader|spinner|avatar|flag|arrow|chevron|star|cookie|facebook|twitter|instagram|linkedin|whatsapp|youtube|watermark)/i,it=new Set(["the","and","of","ltd","limited","co","company","services","service","locksmith","locksmiths","security","locks","lock","auto","mobile","emergency","key","keys","24","7"]);function st(e){const t=String(e??"").trim();if(!t)return"";const r=t.split(/[\s\-–—]+/).filter(Boolean);if(!r.length)return"";const o=r[0].replace(/[^A-Za-z0-9]/g,"");if(/^[A-Z0-9]{2,3}$/.test(o)&&/[A-Z]/.test(o))return o;const i=r.map(s=>s.replace(/[^A-Za-z]/g,"")).filter(s=>s&&!it.has(s.toLowerCase()));return(i.length?i:r.map(s=>s.replace(/[^A-Za-z]/g,"")).filter(Boolean)).slice(0,2).map(s=>s[0].toUpperCase()).join("")}const W=e=>String(e).padStart(2,"0"),x=e=>String(e??"").trim();function lt(e,t={}){var R;const r=e.business??{},o=nt.filter(l=>{const v=l.split(".")[1];return!f(r[v])});if(o.length)throw new ye(o);const p=(t.now??new Date).getUTCFullYear(),s=(e.services??[]).slice(0,tt),d=(e.areas??[]).slice(0,at),m=(e.prices??[]).slice(0,rt),c=e.img??{},h={hero:c.hero??"",work:c.work??"",proof:c.proof??""};h.no_hero=!f(h.hero);for(const l of["bg_urgent","bg_prices","bg_faq","bg_contact","owner","logo","services"])h[l]=c[l]??"";h.no_logo=!f(h.logo),h.no_owner_photo=!f(h.owner);const y=Array.isArray((R=e.img)==null?void 0:R.badges)?e.img.badges.map(l=>String(l??"").trim()).filter(Boolean):[];h.badges=y;const b=new Set(Object.values(c).flatMap(l=>Array.isArray(l)?l.map(String):[l]).filter(Boolean)),E=(e.images??[]).filter(l=>l&&typeof l.url=="string"&&!b.has(l.url)).filter(l=>!ot.test(l.url)).filter(l=>{var v;return xe({url:l.url,alt:l.alt??null,width:l.width??null},(v=e.business)==null?void 0:v.name).kind==="photo"}),w=e.photo_section===!1?[]:gt(E,e.photo_captions??{},e.stock_base??"/mockup-stock/"),S=d.length?d.length===1?d[0]:`${d.slice(0,-1).join(", ")} and ${d[d.length-1]}`:"";return{year:p,business:{...r,phone_digits:le(r.phone),whatsapp_digits:le(r.whatsapp),has_reviews:f(r.rating)&&f(r.review_count),reviews_linked:f(r.rating)&&f(r.review_count)&&f(r.google_reviews_url),reviews_unlinked:f(r.rating)&&f(r.review_count)&&!f(r.google_reviews_url),no_owner_name:!f(r.owner_first_name),no_reviews:!(f(r.rating)&&f(r.review_count)),mark:st(r.name)},services:s.map((l,v)=>({...l,index:W(v+1)})),services_top3:s.slice(0,3).map((l,v)=>({...l,index:W(v+1),no_price:!f(l.price)})),...dt(s),headline_price:pt(e,m),owner:ct(e,r,p),trust_fixed:[{title:"Non-destructive entry",icon:"pick",note:"The lock is picked or bypassed, so it still works afterwards."},{title:"Price agreed before work starts",icon:"tag",note:"You get the figure first. Nothing starts until you have it."}],trust_typed:[...e.no_callout_fee===!0?[{title:"No call-out fee",icon:"coin",note:"You are quoted for the job, not for turning up."}]:[],...e.dbs_checked===!0?[{title:"DBS checked",icon:"shield",note:"Certificate available on request before work starts."}]:[],...e.mla_member===!0?[{title:"Master Locksmiths Association",icon:"rosette",note:"Member — verifiable on the MLA register."}]:[]],reviews:(e.reviews??[]).slice(0,3).map(l=>{const v=x(l==null?void 0:l.name);return{quote:x(l==null?void 0:l.quote),name:v,place:x(l==null?void 0:l.place),role:x(l==null?void 0:l.role),initial:v?v[0].toUpperCase():"",placeholder:(l==null?void 0:l.placeholder)!==!1}}).filter(l=>f(l.quote)),reviews_are_placeholder:(e.reviews??[]).some(l=>(l==null?void 0:l.placeholder)!==!1),fee:{none:e.no_callout_fee===!0,charged:e.no_callout_fee===!1,unknown:e.no_callout_fee!==!0&&e.no_callout_fee!==!1},services_lead:(()=>{const l=s.slice(0,3).map(v=>x(v.name)).filter(Boolean).join(", ").toLowerCase();return l?l.charAt(0).toUpperCase()+l.slice(1):""})(),areas:d,areas_line:S,prices:m,prices_none:m.length===0,photos:w,has_real_photos:w.some(l=>!l.is_stock),photos_all_stock:w.length>0&&w.every(l=>l.is_stock),img:h,...ht(r,d,e.area_times??{}),map:{enabled:!1,off:!0,image:"",year:p,areas_line:S}}}function dt(e){const t=["emergency","residential","commercial","automotive"],r={residential:"Residential",commercial:"Commercial",automotive:"Automotive",emergency:"Emergency"},o=e.map((s,d)=>({...s,index:W(d+1),_cat:typeof s.category=="string"?s.category.trim().toLowerCase():""}));if(!o.some(s=>s._cat))return{service_groups:[],services_flat:!0};const i=[];for(const s of t){const d=o.filter(m=>m._cat===s);d.length&&i.push({label:r[s],items:d})}const p=o.filter(s=>!t.includes(s._cat));return p.length&&i.push({label:"",items:p,unlabelled:!0}),{service_groups:i,services_flat:!1}}function pt(e,t){const r=e.headline_price;if(r&&typeof r=="object"&&f(r.service)&&f(r.from))return{service:x(r.service),from:x(r.from)};let o=null;for(const i of t){const p=x(i==null?void 0:i.amount),s=x(i==null?void 0:i.label);if(!p||!s||p.includes("+"))continue;const d=parseFloat(p.replace(/[^0-9.]/g,""));!Number.isFinite(d)||d<=0||(!o||d<o.n)&&(o={n:d,service:s,from:p})}return o?{service:o.service,from:o.from}:null}function ct(e,t,r){const o=x(e.owner_bio);if(!o)return null;const i=parseInt(String(t.established??""),10);return{bio:o,name:x(t.owner_first_name),established:x(t.established),years:Number.isFinite(i)&&i>1900&&i<=r-2?String(r-i):""}}function ht(e,t,r){const o={};for(const[d,m]of Object.entries(r))o[d.trim().toLowerCase()]=x(m);const i=(d,m)=>({area:d,time:o[x(d).toLowerCase()]??"",home:m,no_time:!1}),p=[i(e.town,!0),...t.map(d=>i(d,!1))],s=p.some(d=>f(d.time));if(s)for(const d of p)d.no_time=!f(d.time);return{area_rows:p,areas_timed:s,areas_untimed:!s}}function gt(e,t,r){const o=[];for(const i of e){if(o.length>=se)break;const p=t[i.url]??{},s=typeof p=="string"?p:p.caption??"";o.push({src:i.local??i.url,caption:s,alt:(typeof p=="object"?p.alt:void 0)??s??"Lock work",is_stock:!1,uncaptioned:!f(s)})}for(const i of F){if(o.length>=se)break;i.placeholder||o.push({src:`${r.replace(/\/$/,"")}/${i.path.split("/").pop()}`,caption:i.caption,alt:i.alt,is_stock:!0,uncaptioned:!1})}return o}const mt=/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i;function ut(e,t,r={}){var h,y,b,E;const o=e.business??{},i=He(e.niche),p=String(o.phone??(t==null?void 0:t.phone)??"").replace(/^\+44\s*/,"0").replace(/\s+/g," ").trim(),s=o.town??(t==null?void 0:t.derived_town)??(t==null?void 0:t.search_location)??"",d=o.address??(t==null?void 0:t.address)??"",m=((h=e.services)!=null&&h.length?e.services:(y=e.scrape)==null?void 0:y.services)??[],c=(e.pool??[]).filter(w=>w&&typeof w.url=="string"&&!w.demoted).map(w=>({url:w.url}));return{business:{name:o.name??(t==null?void 0:t.business_name)??"",trade:(i==null?void 0:i.trade)??"",town:s,phone:p,address:d,email:o.email??"",hours:o.hours??"",postcode:((b=d.match(mt))==null?void 0:b[1])??"",rating:(t==null?void 0:t.rating)!=null?String(t.rating):"",review_count:(t==null?void 0:t.review_count)!=null?String(t.review_count):"",google_reviews_url:(t==null?void 0:t.google_maps_url)??""},services:m,areas:((E=e.scrape)==null?void 0:E.areas)??[],prices:[],images:c,img:r}}const ft=`<template data-page="home">\r
<style>\r
/* ============================================================================\r
   LOCKSMITH MASTER TEMPLATE\r
   Layout and CSS are fixed and owned by Paul. Only the listed variables change.\r
\r
   THE ONE TEST: it must not look like a template. Everything below is aimed at\r
   that, and specifically AWAY from the UK locksmith norm (Wix, stock photo of a\r
   hand holding a key, red 24 HOUR banner, six identical rounded icon cards).\r
\r
   HOW RICHNESS IS ACHIEVED WITHOUT PHOTOGRAPHS — this is the load-bearing\r
   decision, because measured real supply was 17/0/24/24/24/7 image URLs and one\r
   business had NOTHING:\r
     1. Alternating grounds. Ink → paper → ink switches hard, several times.\r
        Contrast between sections does the work a photograph usually does.\r
     2. Scale. The name is set very large; section headings are large.\r
     3. A mono spec strip. Numbers (rating, reviews, established, postcode) set\r
        in a mono face read as a datasheet, which no Wix template does.\r
     4. One accent. Brass, used on rules, indices and a single button style —\r
        never scattered.\r
   ========================================================================== */\r
\r
/* Self-hosted, SIL OFL. Recovered from this project's own history (barber\r
   template, CREDITS.md). No font CDN at runtime — a delivered mockup must not\r
   depend on an external host, and the product sells crawlability. */\r
@font-face{font-family:'Manrope';src:url('assets/fonts/Manrope-400.woff2') format('woff2');font-weight:400;font-display:swap}\r
@font-face{font-family:'Manrope';src:url('assets/fonts/Manrope-500.woff2') format('woff2');font-weight:500;font-display:swap}\r
@font-face{font-family:'Manrope';src:url('assets/fonts/Manrope-700.woff2') format('woff2');font-weight:700;font-display:swap}\r
@font-face{font-family:'Manrope';src:url('assets/fonts/Manrope-800.woff2') format('woff2');font-weight:800;font-display:swap}\r
@font-face{font-family:'Bebas';src:url('assets/fonts/BebasNeue-400.woff2') format('woff2');font-weight:400;font-display:swap}\r
/* JetBrains Mono, SIL OFL 1.1 — see assets/fonts/CREDITS.md. Bundled so the\r
   numerals are the SAME face everywhere: the system stack gave Consolas on\r
   Windows and DejaVu Sans Mono in the review screenshots, i.e. one design\r
   judged against two different faces. */\r
/* Fraunces, SIL OFL. The single biggest premium signal available without\r
   photography: a high-contrast serif headline is the one thing no Wix trade\r
   template does. Warm and sturdy rather than fashion-editorial, which also\r
   pulls against the "this feels scary" note. */\r
/* ⚠️ ABLM HAS NO SERIF. Both --sans and --serif map to "Archivo" there; the\r
   only second face is IBM Plex Mono. The Fraunces serif was MY addition and it\r
   is why the type read as a different site — flagged in the deviation list.\r
   Self-hosted rather than pulled from Google's CDN, which ABLM does: a mockup\r
   must not depend on an external host. */\r
@font-face{font-family:'Archivo';src:url('assets/fonts/Archivo-400.woff2') format('woff2');font-weight:400;font-display:swap}\r
@font-face{font-family:'Archivo';src:url('assets/fonts/Archivo-500.woff2') format('woff2');font-weight:500;font-display:swap}\r
@font-face{font-family:'Archivo';src:url('assets/fonts/Archivo-600.woff2') format('woff2');font-weight:600;font-display:swap}\r
@font-face{font-family:'Archivo';src:url('assets/fonts/Archivo-700.woff2') format('woff2');font-weight:700;font-display:swap}\r
@font-face{font-family:'PlexMono';src:url('assets/fonts/IBMPlexMono-400.woff2') format('woff2');font-weight:400;font-display:swap}\r
@font-face{font-family:'PlexMono';src:url('assets/fonts/IBMPlexMono-500.woff2') format('woff2');font-weight:500;font-display:swap}\r
@font-face{font-family:'Fraunces';src:url('assets/fonts/Fraunces-600.woff2') format('woff2');font-weight:600;font-display:swap}\r
@font-face{font-family:'Fraunces';src:url('assets/fonts/Fraunces-700.woff2') format('woff2');font-weight:700;font-display:swap}\r
@font-face{font-family:'JBMono';src:url('assets/fonts/JetBrainsMono-400.woff2') format('woff2');font-weight:400;font-display:swap}\r
@font-face{font-family:'JBMono';src:url('assets/fonts/JetBrainsMono-500.woff2') format('woff2');font-weight:500;font-display:swap}\r
\r
:root{\r
  --ink:#0A0C0F; --ink-2:#111519; --ink-3:#181E25; --ink-4:#212933;\r
  --paper:#F2EEE7; --paper-2:#E7E1D6; --paper-ink:#13171B;\r
  --brass:#C9922F; --brass-lit:#EBB75A; --brass-dim:#7A5A1C;\r
  --text:#E9EBEE; --dim:#98A2AE; --dimmer:#8B949F;\r
  --line:rgba(255,255,255,.10); --line-2:rgba(255,255,255,.055);\r
  --grid:rgba(255,255,255,.032);\r
  --line-ink:rgba(19,23,27,.14);\r
  --display:'Fraunces',Georgia,'Times New Roman',serif;\r
  --mono:'JBMono',ui-monospace,"Cascadia Mono","Consolas","DejaVu Sans Mono",monospace;\r
  --pad:clamp(20px,5vw,80px);\r
}\r
/* ── THE WARM ACCENT VARIANT ───────────────────────────────────────────────\r
   Paul's question: does brass on black signal "expensive safe manufacturer"\r
   rather than "approachable local trade"? Here is the alternative to compare\r
   against — a CLAY / terracotta.\r
   ⚠️ ONLY the three accent values change. Grounds, type and spacing are\r
   identical, so the comparison isolates the accent instead of confounding it\r
   with five other differences. Clay is deliberately desaturated and used only\r
   on rules, indices and one button — it must never become the red emergency\r
   banner Paul ruled out.\r
   Built with \`npm run build -- --warm\`.\r
   ⛔ DECLARE NOTHING HERE EXCEPT THE ACCENTS. An earlier version of this block\r
   swallowed --text, --dim, --mono and --pad because :root was closed above it\r
   by mistake: the default build then had no text colour at all and rendered\r
   near-black on near-black at 1.07:1. Caught by the contrast sweep, invisible\r
   to a brace count. */\r
/* ── THE OLD DARK-HEAVY BALANCE, kept as a live A/B ────────────────────────\r
   Before 2026-09-11 six sections were near-black against two paper ones, and\r
   Paul's read was that the page came across as menace rather than help — a\r
   conversion problem, not a taste one. The rebalance made paper the default.\r
   This block restores the OLD grounds so the two can be compared in a browser\r
   rather than from memory. Built with \`npm run build -- --darkheavy\`.\r
   ⚠️ It restores background AND foreground together. Flipping a ground without\r
   its text colours is how the planned lane once ended up with white text on a\r
   near-white panel at 1.03:1. */\r
:root[data-palette="darkheavy"] .trust{background:var(--ink-2);color:var(--text);\r
  border-bottom:1px solid var(--line-2)}\r
:root[data-palette="darkheavy"] .trust h3{color:var(--text)}\r
:root[data-palette="darkheavy"] .trust p{color:var(--dim)}\r
:root[data-palette="darkheavy"] .trust h3::before{background:var(--brass)}\r
:root[data-palette="darkheavy"] .gal{background:var(--ink);color:var(--text)}\r
:root[data-palette="darkheavy"] .gal .h2{color:var(--text)}\r
:root[data-palette="darkheavy"] figcaption{color:var(--dimmer)}\r
:root[data-palette="darkheavy"] .areas{background:var(--ink-2);color:var(--text);\r
  border-top:1px solid var(--line-2)}\r
:root[data-palette="darkheavy"] .areas .h2{color:var(--text)}\r
:root[data-palette="darkheavy"] .area-list{border-top:1px solid var(--line)}\r
:root[data-palette="darkheavy"] .area-row{border-bottom:1px solid var(--line-2)}\r
:root[data-palette="darkheavy"] .area-row dd{color:var(--brass-lit)}\r
:root[data-palette="darkheavy"] .based,\r
:root[data-palette="darkheavy"] .t-none,\r
:root[data-palette="darkheavy"] .area-note{color:var(--dimmer)}\r
:root[data-palette="darkheavy"] .faq{background:var(--ink);color:var(--text)}\r
:root[data-palette="darkheavy"] .faq .h2{color:var(--text)}\r
:root[data-palette="darkheavy"] .faq-item{border-top:1px solid var(--line-2)}\r
:root[data-palette="darkheavy"] .faq-item p{color:var(--dim)}\r
:root[data-palette="darkheavy"] .owner{background:var(--ink-3);color:var(--text);\r
  border-bottom:1px solid var(--line-2)}\r
:root[data-palette="darkheavy"] .owner .h2{color:var(--text)}\r
:root[data-palette="darkheavy"] .owner-bio{color:var(--dim)}\r
:root[data-palette="darkheavy"] .owner-facts{border-top:1px solid var(--line)}\r
:root[data-palette="darkheavy"] .owner-facts dt{color:var(--dimmer)}\r
:root[data-palette="darkheavy"] .owner-facts dd{color:var(--text)}\r
:root[data-palette="darkheavy"] .eyebrow.on-paper{color:var(--brass)}\r
\r
:root[data-palette="warm"]{\r
  /* #CE7549, not the #B85C36 this started as. Measured: the darker clay gave\r
     3.69:1 for the eyebrow on the contact section and 4.19:1 for dark text on\r
     the primary button — both below AA. This one clears every dark ground\r
     AND takes the dark button text, AND clears 4.5:1 against the worst-case\r
     background behind a photograph — that last one is why it is #D68053 and\r
     not #CE7549: the lighter-clay-on-a-bright-photo case measured 4.39:1 in\r
     the prices and contact sections, which only the analytic check sees. The\r
     accent is lighter and warmer than brass, which is the point. */\r
  --brass:#D68053; --brass-lit:#E8A176; --brass-dim:#8E4526;\r
}\r
*{box-sizing:border-box}\r
body{margin:0;background:var(--ink);color:var(--text);\r
  font:400 17px/1.62 'Manrope',system-ui,-apple-system,"Segoe UI",sans-serif;\r
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}\r
img{max-width:100%;display:block}\r
a{color:inherit}\r
/* ═══════════════════════════════════════════════════════════════════════════\r
   THE LIGHT THEME — white base, dark as a rare accent.\r
   Built 2026-09-11 after Paul sampled three real UK locksmith sites (Aston's,\r
   Dr Locks York, First4locks). All three are predominantly WHITE with a bright\r
   friendly accent; not one uses brass, amber or clay, and dark is the base\r
   nowhere. The earlier rebalance moved in this direction and did not go nearly\r
   far enough.\r
\r
   ⛔ TWO ACCENT TONES ARE REQUIRED, AND THAT IS ARITHMETIC NOT STYLE. A colour\r
   dark enough to clear 4.5:1 on white (#22683E green, 6.74:1) only reaches\r
   2.5–2.9:1 on the two remaining dark bands. So --accent-ink is the dark tone\r
   for light grounds and --accent-lift is the light tone for dark grounds.\r
   Using one value for both is unreadable at one end or the other, whichever\r
   end you happen to be looking at.\r
\r
   DARK SURVIVES IN EXACTLY TWO PLACES: the "locked out right now" lane, where\r
   the contrast IS the message, and the contact band, which anchors the foot of\r
   the page. Five became two.\r
   ═══════════════════════════════════════════════════════════════════════════ */\r
:root[data-palette="light"],:root[data-palette="light-blue"]{\r
  --paper:#FFFFFF; --paper-2:#F5F4F1; --paper-3:#EDEBE6; --paper-ink:#15181C;\r
  --line-ink:rgba(21,24,28,.13);\r
}\r
:root[data-palette="light"]{      /* MOSS GREEN */\r
  --accent-ink:#22683E; --accent-lift:#6ECF9A; --accent-wash:rgba(34,104,62,.07);\r
}\r
:root[data-palette="light-blue"]{ /* KINGFISHER */\r
  --accent-ink:#0B5A74; --accent-lift:#6FC7E4; --accent-wash:rgba(11,90,116,.07);\r
}\r
/* map the old accent names onto the new pair, so no rule needs rewriting */\r
:root[data-palette="light"],:root[data-palette="light-blue"]{\r
  --brass:var(--accent-lift); --brass-lit:var(--accent-lift); --brass-dim:var(--accent-ink);\r
}\r
\r
/* ---- grounds: white by default, dark only twice --------------------------- */\r
[data-palette="light"] body,[data-palette="light-blue"] body{\r
  background:var(--paper);color:var(--paper-ink)}\r
[data-palette="light"] .hero,[data-palette="light-blue"] .hero{\r
  background:var(--paper);color:var(--paper-ink);border-bottom:1px solid var(--line-ink)}\r
[data-palette="light"] .trust,[data-palette="light-blue"] .trust{\r
  background:var(--paper-2);color:var(--paper-ink);border-bottom:1px solid var(--line-ink)}\r
[data-palette="light"] .owner,[data-palette="light-blue"] .owner{background:var(--paper)}\r
[data-palette="light"] .svcs,[data-palette="light-blue"] .svcs{background:var(--paper-2)}\r
[data-palette="light"] .gal,[data-palette="light-blue"] .gal{background:var(--paper)}\r
[data-palette="light"] .areas,[data-palette="light-blue"] .areas{background:var(--paper-2)}\r
[data-palette="light"] .faq,[data-palette="light-blue"] .faq{background:var(--paper)}\r
[data-palette="light"] .revs,[data-palette="light-blue"] .revs{background:var(--paper-2)}\r
[data-palette="light"] .rev-card,[data-palette="light-blue"] .rev-card{background:var(--paper);border-color:var(--line-ink)}\r
[data-palette="light"] .rev-stars i,[data-palette="light-blue"] .rev-stars i{background:var(--accent-ink)}\r
[data-palette="light"] .rev-more a,[data-palette="light-blue"] .rev-more a{border-bottom-color:var(--accent-ink)}\r
/* prices was dark; now a near-white band with an accent wash */\r
[data-palette="light"] .prices,[data-palette="light-blue"] .prices{\r
  background:linear-gradient(180deg,var(--accent-wash),transparent 70%),var(--paper-3);\r
  color:var(--paper-ink)}\r
[data-palette="light"] .prices .h2,[data-palette="light-blue"] .prices .h2{color:var(--paper-ink)}\r
[data-palette="light"] .prices .eyebrow,[data-palette="light-blue"] .prices .eyebrow{color:var(--accent-ink)}\r
[data-palette="light"] .price-table,[data-palette="light-blue"] .price-table{border-top:1px solid var(--line-ink)}\r
[data-palette="light"] .price-row,[data-palette="light-blue"] .price-row{border-bottom:1px solid var(--line-ink)}\r
[data-palette="light"] .price-row dd,[data-palette="light-blue"] .price-row dd{color:var(--accent-ink);font-weight:500}\r
[data-palette="light"] .price-row .note,[data-palette="light-blue"] .price-row .note{color:#525C68}\r
[data-palette="light"] .price-none,[data-palette="light-blue"] .price-none{\r
  border:1px solid var(--line-ink);border-top:2px solid var(--accent-ink);background:var(--paper)}\r
[data-palette="light"] .price-none>div,[data-palette="light-blue"] .price-none>div{border-right:1px solid var(--line-ink)}\r
[data-palette="light"] .price-none>div:last-child,[data-palette="light-blue"] .price-none>div:last-child{border-right:0}\r
[data-palette="light"] .price-none dt,[data-palette="light-blue"] .price-none dt{\r
  color:var(--accent-ink);border-bottom:1px solid var(--line-ink)}\r
[data-palette="light"] .price-none dd,[data-palette="light-blue"] .price-none dd{color:var(--paper-ink)}\r
/* footer follows the light base */\r
[data-palette="light"] footer,[data-palette="light-blue"] footer{\r
  background:var(--paper-2);border-top:1px solid var(--line-ink);color:#5A6470}\r
[data-palette="light"] .f-name,[data-palette="light-blue"] .f-name{color:var(--paper-ink)}\r
\r
/* ---- text + accents on the light grounds --------------------------------- */\r
[data-palette="light"] .h2,[data-palette="light-blue"] .h2,\r
[data-palette="light"] .trust h3,[data-palette="light-blue"] .trust h3,\r
[data-palette="light"] .owner .h2,[data-palette="light-blue"] .owner .h2{color:var(--paper-ink)}\r
[data-palette="light"] .eyebrow,[data-palette="light-blue"] .eyebrow{color:var(--accent-ink)}\r
[data-palette="light"] .trust p,[data-palette="light-blue"] .trust p,\r
[data-palette="light"] .faq-item p,[data-palette="light-blue"] .faq-item p{color:#4A5460}\r
[data-palette="light"] .trust h3::before,[data-palette="light-blue"] .trust h3::before{background:var(--accent-ink)}\r
[data-palette="light"] .faq-item,[data-palette="light-blue"] .faq-item{border-top:1px solid var(--line-ink)}\r
[data-palette="light"] .area-row dd,[data-palette="light-blue"] .area-row dd{color:var(--accent-ink)}\r
[data-palette="light"] .svc-i,[data-palette="light-blue"] .svc-i,\r
[data-palette="light"] .grp,[data-palette="light-blue"] .grp{color:var(--accent-ink)}\r
[data-palette="light"] .svc-price,[data-palette="light-blue"] .svc-price{border-top:2px solid var(--accent-ink)}\r
[data-palette="light"] .btn-p,[data-palette="light-blue"] .btn-p{\r
  background:var(--accent-ink);border-color:var(--accent-ink);color:#fff}\r
[data-palette="light"] .btn-s,[data-palette="light-blue"] .btn-s{\r
  color:var(--paper-ink);border-color:rgba(21,24,28,.28)}\r
[data-palette="light"] .cb-call,[data-palette="light-blue"] .cb-call{background:var(--accent-ink);color:#fff}\r
[data-palette="light"] .cb-wa,[data-palette="light-blue"] .cb-wa{background:var(--paper-ink);color:#fff}\r
\r
/* ---- the two surviving dark bands --------------------------------------- */\r
[data-palette="light"] .lane-now,[data-palette="light-blue"] .lane-now,\r
[data-palette="light"] .contact,[data-palette="light-blue"] .contact{color:var(--text)}\r
[data-palette="light"] .lane-now .h2,[data-palette="light-blue"] .lane-now .h2,\r
[data-palette="light"] .lane-now h2,[data-palette="light-blue"] .lane-now h2,\r
[data-palette="light"] .contact .h2,[data-palette="light-blue"] .contact .h2{color:var(--text)}\r
[data-palette="light"] .lane-now .eyebrow,[data-palette="light-blue"] .lane-now .eyebrow,\r
[data-palette="light"] .contact .eyebrow,[data-palette="light-blue"] .contact .eyebrow{color:var(--accent-lift)}\r
[data-palette="light"] .lane-now p,[data-palette="light-blue"] .lane-now p,\r
[data-palette="light"] .lane-now dd,[data-palette="light-blue"] .lane-now dd{color:var(--dim)}\r
[data-palette="light"] .lane-now .btn-p,[data-palette="light-blue"] .lane-now .btn-p{\r
  background:var(--accent-lift);border-color:var(--accent-lift);color:#08150E}\r
[data-palette="light"] .c-tel,[data-palette="light-blue"] .c-tel{color:var(--accent-lift)}\r
[data-palette="light"] .c-grid dt,[data-palette="light-blue"] .c-grid dt{color:var(--dimmer)}\r
[data-palette="light"] .c-grid dd a,[data-palette="light-blue"] .c-grid dd a{border-bottom-color:var(--accent-lift)}\r
\r
/* ---- THE HERO becomes a SPLIT: text on white, the person on the right ----\r
   The photo stops being a full-bleed background and becomes a right-hand\r
   panel, which is what all three real sites do — a face in daylight beside the\r
   headline rather than behind it under a scrim. Markup is unchanged; only the\r
   positioning of .hero-bg moves. */\r
[data-palette="light"] .hero-bg,[data-palette="light-blue"] .hero-bg{left:52%;right:0}\r
[data-palette="light"] .hero-bg::after,[data-palette="light-blue"] .hero-bg::after{\r
  background:linear-gradient(90deg,var(--paper) 0%,rgba(255,255,255,.34) 26%,rgba(255,255,255,0) 62%)}\r
/* the person must NOT be desaturated — that is the whole point of the face */\r
[data-palette="light"] .hero-bg .shot>img,[data-palette="light-blue"] .hero-bg .shot>img{\r
  filter:contrast(1.03) saturate(1) brightness(1.02)}\r
[data-palette="light"] .hero-bg .shot::before,[data-palette="light-blue"] .hero-bg .shot::before{opacity:.06}\r
[data-palette="light"] .hero-bg .shot::after,[data-palette="light-blue"] .hero-bg .shot::after{background:none}\r
[data-palette="light"] .hero-art,[data-palette="light-blue"] .hero-art{\r
  background:radial-gradient(60% 70% at 6% 0%,var(--accent-wash),transparent 62%),var(--paper)}\r
[data-palette="light"] .hero-grid,[data-palette="light-blue"] .hero-grid{\r
  background-image:linear-gradient(rgba(21,24,28,.045) 1px,transparent 1px),\r
                   linear-gradient(90deg,rgba(21,24,28,.045) 1px,transparent 1px)}\r
[data-palette="light"] .hero h1,[data-palette="light-blue"] .hero h1{color:var(--paper-ink)}\r
[data-palette="light"] .hero-sub,[data-palette="light-blue"] .hero-sub{color:#3E4854}\r
[data-palette="light"] .hero-sub b,[data-palette="light-blue"] .hero-sub b{color:var(--paper-ink)}\r
[data-palette="light"] .hero-rule,[data-palette="light-blue"] .hero-rule{background:var(--accent-ink)}\r
/* the spec panel drops to a full-width strip under the text, clear of the photo */\r
[data-palette="light"] .hero-in,[data-palette="light-blue"] .hero-in{\r
  grid-template-columns:minmax(0,1fr) minmax(0,.82fr)}\r
[data-palette="light"] .spec,[data-palette="light-blue"] .spec{\r
  grid-column:1/-1;background:var(--paper-2);border-top:2px solid var(--accent-ink);\r
  border-left:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr))}\r
[data-palette="light"] .spec>div,[data-palette="light-blue"] .spec>div{\r
  border-bottom:0;border-right:1px solid var(--line-ink);display:block;padding:16px 20px}\r
[data-palette="light"] .spec>div:last-child,[data-palette="light-blue"] .spec>div:last-child{border-right:0}\r
[data-palette="light"] .spec dt,[data-palette="light-blue"] .spec dt{color:#5A6470;margin-bottom:7px}\r
[data-palette="light"] .spec dd,[data-palette="light-blue"] .spec dd{\r
  color:var(--paper-ink);text-align:left}\r
[data-palette="light"] .spec .hl dd,[data-palette="light-blue"] .spec .hl dd{color:var(--accent-ink)}\r
[data-palette="light"] .spec dd small,[data-palette="light-blue"] .spec dd small{color:#5A6470}\r
[data-palette="light"] .spec-link,[data-palette="light-blue"] .spec-link{border-bottom-color:var(--accent-ink)}\r
\r
/* ---- ⛔ THE BACKGROUND-PHOTO SCRIM MUST FLIP WITH THE GROUND -------------\r
   Found by looking at the rendered page, NOT by the contrast checker, which\r
   reads background-COLOR and is blind to a background image — the fourth time\r
   that blind spot has bitten. The prices band flipped to near-black text while\r
   its .secbg kept the DARK scrim rgba(9,11,14,.88), so the section rendered\r
   dark with dark text on it: unreadable, and reported as passing.\r
   On the light theme the scrim inverts to white, and the photo becomes a faint\r
   texture instead of a ground. Worst case is now a BLACK photo pixel under a\r
   0.90 white scrim = rgb(230,230,230), which every light-ground text colour\r
   clears comfortably. */\r
[data-palette="light"] .prices .secbg::after,[data-palette="light-blue"] .prices .secbg::after{\r
  background:rgba(255,255,255,.90)}\r
[data-palette="light"] .prices .secbg::before,[data-palette="light-blue"] .prices .secbg::before{\r
  opacity:.08}\r
[data-palette="light"] .prices .secbg img,[data-palette="light-blue"] .prices .secbg img{\r
  filter:grayscale(1) contrast(.94) brightness(1.06)}\r
\r
/* the hero spec strip overlaps the photo panel, so it needs to read as a card\r
   sitting ON the image rather than as a band running under it */\r
[data-palette="light"] .spec,[data-palette="light-blue"] .spec{\r
  box-shadow:0 1px 0 var(--line-ink),0 14px 34px rgba(21,24,28,.09)}\r
\r
@media (max-width:820px){\r
  /* the photo goes ABOVE the text on a phone, never behind it */\r
  [data-palette="light"] .hero-bg,[data-palette="light-blue"] .hero-bg{\r
    position:relative;left:0;right:0;height:300px;margin-bottom:8px}\r
  [data-palette="light"] .hero-bg::after,[data-palette="light-blue"] .hero-bg::after{\r
    background:linear-gradient(0deg,var(--paper) 0%,rgba(255,255,255,0) 46%)}\r
  [data-palette="light"] .hero-in,[data-palette="light-blue"] .hero-in{grid-template-columns:1fr}\r
}\r
\r
/* ══ MOTION ════════════════════════════════════════════════════════════════\r
   ⛔ THERE ARE NO ENTRANCE ANIMATIONS, AND THAT IS A DELIBERATE REVERSAL.\r
   Scroll-driven reveals were built here (CSS \`animation-timeline: view()\`, no\r
   JavaScript) and then removed the same hour, because of what this page is FOR:\r
   it gets SCREENSHOTTED. The before/after image is captured by a headless\r
   browser, and a full-page capture resizes the viewport so that every element\r
   is "in view" at once — the view() ranges never resolve, \`fill-mode: both\`\r
   holds the \`from\` state, and the services, gallery, prices, reviews and FAQ\r
   all captured EMPTY. The page was perfect in a browser and blank in the\r
   product.\r
\r
   Animating transform only (never opacity) would have captured content in the\r
   wrong position instead of not at all, which is not better.\r
\r
   So: nothing on this page hides itself, ever, for any reason. The polish\r
   below is limited to hover and press — states a screenshot cannot be caught\r
   in, because nothing is hovering an element in a headless capture.\r
   ⚠️ If anyone re-adds a reveal animation, screenshot the built page full-page\r
   and look at it before believing it works. A browser is not the test; the\r
   capture is. */\r
.btn{transition:transform .16s ease,box-shadow .16s ease,background-color .16s ease}\r
.btn:hover{transform:translateY(-1px)}\r
.btn-p:hover{box-shadow:0 8px 22px rgba(0,0,0,.22)}\r
.btn:active{transform:translateY(0)}\r
.gal-grid .shot>img{transition:transform .55s cubic-bezier(.2,.6,.2,1)}\r
.gal-grid figure:hover .shot>img{transform:scale(1.04)}\r
.svc{transition:background-color .2s ease}\r
.svc:hover{background:rgba(0,0,0,.018)}\r
.rev-card{transition:transform .18s ease,box-shadow .18s ease}\r
.rev-card:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(21,24,28,.07)}\r
.area-row{transition:background-color .18s ease}\r
.spec-link,.rev-more a,.c-grid dd a{transition:border-color .16s ease}\r
\r
/* ═══════════════════════════════════════════════════════════════════════════\r
   THE CHARACTER VARIANT — ornament, not restraint.\r
   Built 2026-09-11 from Paul's read of andersonlock.com and mathias1901.com:\r
   his page was "pure typography on flat grounds with no ornament", which is a\r
   tasteful designerly solution and exactly why it read as generic. Those two\r
   are less refined and far more memorable.\r
\r
   ⛔ EVERY ORNAMENT BELOW IS HIDDEN BY DEFAULT AND REVEALED ONLY HERE, so the\r
   comparison is fair and nothing that already worked is disturbed. Structure is\r
   untouched: the hero, the urgent/planned split, grouped services with prices\r
   and the response-times table are all exactly as they were.\r
\r
   ⛔ THE CAVEAT PAUL NAMED IS ENFORCED IN THE DATA, NOT THE CSS: Anderson says\r
   "65+ years" and "over 40 work trucks" because it is a 65-year-old firm with\r
   40 trucks. Our prospects are sole traders. Every number here is a field the\r
   business supplied — established year, review count, response time — and the\r
   section carrying it disappears when the field is empty. The DEVICES are\r
   borrowed; the SCALE of the claims is not.\r
   ═══════════════════════════════════════════════════════════════════════════ */\r
\r
/* the ornament is invisible unless the variant asks for it */\r
.mark,.heritage,.straddle,.swoop,.ico,.avatar,.badges{display:none}\r
.logo{max-height:46px;width:auto}\r
\r
:root[data-palette="character"]{\r
  --paper:#FFFFFF; --paper-2:#F4F2ED; --paper-3:#E9E5DC; --paper-ink:#16191D;\r
  --line-ink:rgba(22,25,29,.14);\r
  --accent-ink:#1F6B45; --accent-lift:#6FD3A0; --accent-wash:rgba(31,107,69,.08);\r
  --brass:var(--accent-lift); --brass-lit:var(--accent-lift); --brass-dim:var(--accent-ink);\r
}\r
\r
/* ---- grounds: light base, two dark bands, as the research said ----------- */\r
[data-palette="character"] body{background:var(--paper);color:var(--paper-ink)}\r
[data-palette="character"] .hero{background:var(--paper);color:var(--paper-ink);border-bottom:0}\r
[data-palette="character"] .hero h1,[data-palette="character"] .h2,\r
[data-palette="character"] .trust h3,[data-palette="character"] .owner .h2{color:var(--paper-ink)}\r
[data-palette="character"] .hero-sub{color:#3C4550}\r
[data-palette="character"] .hero-sub b{color:var(--paper-ink)}\r
[data-palette="character"] .hero-rule{display:none}\r
[data-palette="character"] .eyebrow{color:var(--accent-ink)}\r
[data-palette="character"] .trust{background:var(--paper-2);color:var(--paper-ink);\r
  border-bottom:1px solid var(--line-ink);padding-top:96px}\r
[data-palette="character"] .trust p,[data-palette="character"] .faq-item p{color:#48525E}\r
[data-palette="character"] .trust h3::before{display:none}\r
[data-palette="character"] .owner{background:var(--paper)}\r
[data-palette="character"] .revs{background:var(--paper-2)}\r
[data-palette="character"] .svcs{background:var(--paper)}\r
[data-palette="character"] .gal{background:var(--paper-2)}\r
[data-palette="character"] .areas{background:var(--paper)}\r
[data-palette="character"] .faq{background:var(--paper-2)}\r
[data-palette="character"] .faq-item{border-top:1px solid var(--line-ink)}\r
[data-palette="character"] .area-row dd,[data-palette="character"] .svc-i,\r
[data-palette="character"] .grp{color:var(--accent-ink)}\r
[data-palette="character"] .svc-price{border-top:2px solid var(--accent-ink)}\r
[data-palette="character"] .btn-p{background:var(--accent-ink);border-color:var(--accent-ink);color:#fff}\r
[data-palette="character"] .btn-s{color:var(--paper-ink);border-color:rgba(22,25,29,.26)}\r
[data-palette="character"] .cb-call{background:var(--accent-ink);color:#fff}\r
[data-palette="character"] .cb-wa{background:var(--paper-ink);color:#fff}\r
[data-palette="character"] footer{background:var(--paper-2);border-top:1px solid var(--line-ink);color:#5A6470}\r
[data-palette="character"] .f-name{color:var(--paper-ink)}\r
\r
/* ---- 2. TEXTURE on section grounds, not just photography ----------------\r
   Mathias runs brushed steel behind one band and dark wood behind another.\r
   Both are CSS gradients here: no image request, no licence, and they scale. */\r
[data-palette="character"] .prices{\r
  background-color:#161A1F;\r
  background-image:\r
    repeating-linear-gradient(90deg,rgba(255,255,255,.030) 0 1px,transparent 1px 3px),\r
    repeating-linear-gradient(90deg,rgba(255,255,255,.018) 0 1px,transparent 1px 9px),\r
    linear-gradient(180deg,#232A31 0%,#12161A 60%,#171C22 100%);   /* brushed steel */\r
  color:var(--text)}\r
[data-palette="character"] .prices .h2{color:var(--text)}\r
[data-palette="character"] .prices .eyebrow{color:var(--accent-lift)}\r
[data-palette="character"] .prices .secbg{display:none}\r
[data-palette="character"] .contact{\r
  background-color:#241C15;\r
  background-image:\r
    repeating-linear-gradient(91deg,rgba(0,0,0,.16) 0 2px,transparent 2px 7px),\r
    repeating-linear-gradient(88deg,rgba(255,255,255,.022) 0 1px,transparent 1px 13px),\r
    linear-gradient(180deg,#33271D 0%,#1E1710 100%);                /* dark timber */\r
  color:var(--text)}\r
[data-palette="character"] .contact .h2{color:var(--text)}\r
[data-palette="character"] .contact .eyebrow{color:var(--accent-lift)}\r
[data-palette="character"] .c-tel{color:var(--accent-lift)}\r
[data-palette="character"] .contact .secbg{display:none}\r
[data-palette="character"] .lane-now{\r
  background-color:#141A17;\r
  background-image:radial-gradient(80% 100% at 0% 0%,rgba(31,107,69,.26),transparent 62%)}\r
/* ⛔ THE DARK LANE NEEDS ITS TEXT FLIPPED TOO. The character variant makes the\r
   body near-black for the light base; this lane keeps a dark ground, so every\r
   string inside it had to be flipped back or it is black on black. Same class\r
   of mistake as the prices band and the hero photo — a ground and its text are\r
   one edit, never two. Caught by src/check-pixels.mjs, which reads the rendered\r
   pixels rather than the CSS. */\r
[data-palette="character"] .lane-now{color:var(--text)}\r
[data-palette="character"] .lane-now h2,[data-palette="character"] .lane-now dt{color:var(--text)}\r
[data-palette="character"] .lane-now p,[data-palette="character"] .lane-now dd{color:var(--dim)}\r
[data-palette="character"] .lane-now .eyebrow{color:var(--accent-lift)}\r
[data-palette="character"] .lane-now .btn-p{background:var(--accent-lift);border-color:var(--accent-lift);color:#06180F}\r
\r
/* ---- 1. THE LOGO MARK ---------------------------------------------------- */\r
[data-palette="character"] .brandline{display:flex;align-items:center;gap:14px}\r
[data-palette="character"] .mark{display:inline-flex;align-items:center;justify-content:center;\r
  min-width:56px;height:40px;padding:0 13px;border-radius:999px;\r
  background:var(--accent-ink);color:#fff;\r
  font-family:var(--display);font-weight:700;font-size:19px;letter-spacing:.04em;\r
  box-shadow:0 3px 0 rgba(22,25,29,.16)}\r
[data-palette="character"] .brandline .eyebrow{margin:0}\r
\r
/* ---- 9. HERITAGE, stated loudly ----------------------------------------- */\r
[data-palette="character"] .heritage{display:flex;align-items:baseline;gap:9px;\r
  margin:18px 0 0;font-family:var(--display);font-weight:700;\r
  font-size:clamp(26px,3vw,40px);letter-spacing:-.01em;color:var(--accent-ink)}\r
[data-palette="character"] .heritage span{font-family:var(--mono);font-size:12px;\r
  letter-spacing:.2em;text-transform:uppercase;color:#5A6470;font-weight:400}\r
\r
/* ---- 6. RULES EITHER SIDE OF SECTION HEADINGS --------------------------- */\r
[data-palette="character"] section .eyebrow{display:flex;align-items:center;gap:12px}\r
[data-palette="character"] section .eyebrow::before,\r
[data-palette="character"] section .eyebrow::after{content:"";height:1px;flex:0 0 26px;\r
  background:currentColor;opacity:.55}\r
[data-palette="character"] section .eyebrow::after{flex:1 1 auto;max-width:120px}\r
[data-palette="character"] .brandline .eyebrow::before{display:none}\r
\r
/* ---- 7. THE NUMBERS, called out in colour ------------------------------- */\r
[data-palette="character"] .spec{background:var(--paper-2);border-top:3px solid var(--accent-ink);\r
  border-left:0;box-shadow:0 1px 0 var(--line-ink)}\r
[data-palette="character"] .spec>div{border-bottom:1px solid var(--line-ink)}\r
[data-palette="character"] .spec dt{color:#5A6470}\r
[data-palette="character"] .spec dd{color:var(--accent-ink);font-weight:500;\r
  font-size:clamp(20px,1.8vw,25px)}\r
[data-palette="character"] .spec dd small{color:#5A6470}\r
/* --brass-lit maps to the LIGHT accent, which is meant for dark grounds; the\r
   spec panel is light, so the highlighted rating was mint on near-white. */\r
[data-palette="character"] .spec .hl dd{color:var(--accent-ink)}\r
[data-palette="character"] .spec-link{border-bottom-color:var(--accent-ink)}\r
\r
/* ---- 5. CARDS STRADDLING THE SECTION EDGE ------------------------------- */\r
[data-palette="character"] .straddle{display:block;position:relative;z-index:3;\r
  margin-top:-58px;margin-bottom:-58px}\r
[data-palette="character"] .straddle-in{display:grid;gap:clamp(12px,1.4vw,20px);\r
  grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}\r
[data-palette="character"] .scard{display:flex;flex-direction:column;gap:7px;\r
  background:var(--paper);border:1px solid var(--line-ink);border-top:3px solid var(--accent-ink);\r
  padding:22px 22px 20px;text-decoration:none;color:var(--paper-ink);\r
  box-shadow:0 14px 34px rgba(22,25,29,.10);\r
  transition:transform .18s ease,box-shadow .18s ease}\r
[data-palette="character"] .scard:hover{transform:translateY(-3px);\r
  box-shadow:0 20px 44px rgba(22,25,29,.14)}\r
[data-palette="character"] .scard-i{font-family:var(--mono);font-size:11px;letter-spacing:.14em;\r
  color:var(--accent-ink)}\r
[data-palette="character"] .scard-n{font-family:var(--display);font-weight:600;\r
  font-size:clamp(17px,1.5vw,20px);line-height:1.2;letter-spacing:-.01em}\r
[data-palette="character"] .scard-p{font-family:var(--mono);font-size:14px;color:var(--accent-ink);\r
  margin-top:auto;padding-top:8px}\r
[data-palette="character"] .scard-p.muted{color:#5A6470}\r
\r
/* ---- 3. CURVED SECTION DIVIDERS ----------------------------------------- */\r
/* Anderson's sections swoop into each other. A CSS mask, so there is no SVG\r
   file to fetch and the curve inherits whatever colour sits above it. */\r
/* ⚠️ IT HAS TO OVERLAP THE SECTION BELOW, AND CARRY THE COLOUR OF THE SECTION\r
   ABOVE. The first version did neither: it sat between the two as its own\r
   64px band, painted white, on a white body — a white curve on white, visible\r
   to nobody. The negative bottom margin pulls it over the next section and the\r
   mask paints a dome, so the band above genuinely bulges down into the one\r
   below. Colour is set per boundary by sibling selector, because a divider has\r
   to know which two grounds it is joining. */\r
[data-palette="character"] .swoop{display:block;position:relative;z-index:2;\r
  height:clamp(38px,4.4vw,64px);margin-bottom:calc(-1 * clamp(38px,4.4vw,64px));\r
  pointer-events:none;background:var(--paper);\r
  -webkit-mask:radial-gradient(96% 100% at 50% 0,#000 69.6%,transparent 70%);\r
  mask:radial-gradient(96% 100% at 50% 0,#000 69.6%,transparent 70%)}\r
[data-palette="character"] .owner+.swoop{background:var(--paper)}\r
[data-palette="character"] .svcs+.swoop{background:var(--paper)}\r
[data-palette="character"] .areas+.swoop{background:var(--paper)}\r
[data-palette="character"] .faq+.swoop{background:var(--paper-2)}\r
/* the section under a divider needs headroom or its heading tucks beneath it */\r
[data-palette="character"] .swoop+section{padding-top:calc(clamp(38px,4.4vw,64px) + clamp(56px,7.5vw,116px))}\r
\r
/* ---- 4. ICONS, inline, no dependency ------------------------------------ */\r
/* Drawn as CSS masks over the accent colour: one element, no <svg> in the\r
   markup to escape, and they recolour with the palette for free. */\r
[data-palette="character"] .ico{display:block;width:26px;height:26px;margin-bottom:12px;\r
  background:var(--accent-ink);\r
  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;\r
  -webkit-mask-size:contain;mask-size:contain}\r
[data-palette="character"] .ico-pick{-webkit-mask-image:var(--i-pick);mask-image:var(--i-pick)}\r
[data-palette="character"] .ico-tag{-webkit-mask-image:var(--i-tag);mask-image:var(--i-tag)}\r
[data-palette="character"] .ico-coin{-webkit-mask-image:var(--i-coin);mask-image:var(--i-coin)}\r
[data-palette="character"] .ico-shield{-webkit-mask-image:var(--i-shield);mask-image:var(--i-shield)}\r
[data-palette="character"] .ico-rosette{-webkit-mask-image:var(--i-rosette);mask-image:var(--i-rosette)}\r
:root{\r
  --i-pick:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='7.5' cy='16.5' r='3.5'/%3E%3Cpath d='M10 14 21 3M18 6l2 2M15 9l2 2'/%3E%3C/svg%3E");\r
  --i-tag:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20.5 13.5 13 21a2 2 0 0 1-2.8 0L3 13.8V4h9.8l7.7 7.7a2 2 0 0 1 0 1.8Z'/%3E%3Ccircle cx='7.8' cy='7.8' r='1.4'/%3E%3C/svg%3E");\r
  --i-coin:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M15 8.5a3.5 3.5 0 0 0-6 2.5c0 3.5 6 2 6 4.5A3.5 3.5 0 0 1 9 15.5M12 6v12'/%3E%3C/svg%3E");\r
  --i-shield:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2.8 4.5 6v6c0 4.6 3.2 7.9 7.5 9.2 4.3-1.3 7.5-4.6 7.5-9.2V6Z'/%3E%3Cpath d='m8.8 12 2.2 2.2 4.2-4.4'/%3E%3C/svg%3E");\r
  --i-rosette:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='9' r='5.6'/%3E%3Cpath d='M8.4 13.6 7 22l5-2.6L17 22l-1.4-8.4'/%3E%3C/svg%3E");\r
}\r
\r
/* ---- 8. REVIEW AVATARS -------------------------------------------------- */\r
[data-palette="character"] .rev-card figcaption{display:flex;align-items:center;gap:11px;\r
  flex-wrap:wrap;text-transform:none;letter-spacing:.02em;font-size:12.5px}\r
[data-palette="character"] .avatar{display:inline-flex;align-items:center;justify-content:center;\r
  width:36px;height:36px;border-radius:999px;background:var(--accent-ink);color:#fff;\r
  font-family:var(--display);font-weight:700;font-size:16px;flex:0 0 auto}\r
[data-palette="character"] .who{display:flex;flex-direction:column;line-height:1.3}\r
[data-palette="character"] .who em{font-style:normal;color:#5A6470;font-size:11.5px}\r
[data-palette="character"] .rev-stars i{background:var(--accent-ink)}\r
[data-palette="character"] .rev-card{border-top:3px solid var(--accent-ink)}\r
\r
/* ---- ⛔ THE HERO PHOTO SCRIM MUST FLIP WITH THE GROUND ------------------\r
   Third time this exact class of bug: a variant flips a ground to light, the\r
   background PHOTO keeps its dark scrim, and near-black text lands on a dark\r
   photograph. It passed every contrast check both previous times because a DOM\r
   checker reads background-COLOR and cannot see a background image.\r
   The rule, now written down: FLIPPING A GROUND MEANS FLIPPING THE SCRIM OVER\r
   ITS PHOTO, in the same edit, always. \`npm run contrast\` gained a probe that\r
   reads the scrim's own computed ::after colour so it cannot miss it again. */\r
[data-palette="character"] .hero-bg{left:50%;right:0}\r
[data-palette="character"] .hero-bg::after{\r
  background:linear-gradient(90deg,var(--paper) 0%,rgba(255,255,255,.42) 24%,rgba(255,255,255,0) 60%)}\r
[data-palette="character"] .hero-bg .shot>img{filter:contrast(1.03) saturate(1) brightness(1.02)}\r
[data-palette="character"] .hero-bg .shot::before{opacity:.06}\r
[data-palette="character"] .hero-bg .shot::after{background:none}\r
[data-palette="character"] .hero-art{\r
  background:radial-gradient(58% 68% at 4% -4%,var(--accent-wash),transparent 60%),var(--paper)}\r
[data-palette="character"] .hero-grid{\r
  background-image:linear-gradient(rgba(22,25,29,.045) 1px,transparent 1px),\r
                   linear-gradient(90deg,rgba(22,25,29,.045) 1px,transparent 1px)}\r
[data-palette="character"] .hero-in{grid-template-columns:minmax(0,1fr) minmax(0,.78fr)}\r
\r
@media (max-width:820px){\r
  [data-palette="character"] .straddle{margin-top:-30px;margin-bottom:-30px}\r
  [data-palette="character"] .trust{padding-top:64px}\r
  [data-palette="character"] .heritage{font-size:26px}\r
  [data-palette="character"] .hero-bg{position:relative;left:0;right:0;height:280px;margin-bottom:8px}\r
  [data-palette="character"] .hero-bg::after{\r
    background:linear-gradient(0deg,var(--paper) 0%,rgba(255,255,255,0) 44%)}\r
  [data-palette="character"] .hero-in{grid-template-columns:1fr}\r
}\r
\r
/* ═══════════════════════════════════════════════════════════════════════════\r
   "SOLID" — the Anderson Lock target, and the only one from now on.\r
   Built 2026-09-11 after three attempts at a mood from contradictory\r
   references. Dr Locks and Aston's are light and friendly; Anderson and Mathias\r
   are dark, heavy and textured. Chasing both produced something that was\r
   neither. This is Anderson only, adapted for a UK sole trader.\r
\r
   WHAT "SOLID" MEANS HERE, taken literally from Paul's list:\r
     heavier weights, tighter leading, less air   -> line-height 1.02 on display,\r
                                                     1.5 on body, padding cut ~30%\r
     warm dark greys and browns, not near-black   -> #17120F / #201A15 / #2A221B,\r
                                                     every one warm-shifted\r
     texture on grounds, nothing flat             -> every ground carries a\r
                                                     gradient or weave\r
     photographs filling the width                -> hero full-bleed, gallery\r
                                                     edge-to-edge, no boxes\r
     fewer, bigger sections                       -> adjacent related sections\r
                                                     share a ground and drop the\r
                                                     rule between them, so the\r
                                                     page reads as 7 blocks\r
\r
   ⛔ THE ONE ANDERSON ELEMENT THAT CANNOT BE BUILT: real photographs of people\r
   and vans. Anderson's warmth comes from the owner by a red truck. There is no\r
   such photograph available — Unsplash, Pexels, Openverse and Picsum were all\r
   searched and looked at. NOTHING IS SUBSTITUTED FOR IT: the hero takes a\r
   full-bleed photograph, and the moment a real one of a person exists it drops\r
   into the same slot with no layout change. The gap is left visible rather than\r
   filled with something that would read as stock.\r
   ═══════════════════════════════════════════════════════════════════════════ */\r
:root[data-palette="solid"]{\r
  --ink:#17120F; --ink-2:#201A15; --ink-3:#2A221B; --ink-4:#372C22;\r
  --paper:#F4EFE6; --paper-2:#E9E1D3; --paper-ink:#1A1410;\r
  --text:#F2ECE4; --dim:#CFC5B8; --dimmer:#A99D8D;\r
  --line:rgba(242,236,228,.14); --line-2:rgba(242,236,228,.075);\r
  --line-ink:rgba(26,20,16,.16);\r
  --red:#C1272D; --red-lift:#EC7A6E; --red-ink:#A81F26;\r
  --brass:var(--red-lift); --brass-lit:var(--red-lift); --brass-dim:var(--red-ink);\r
  --pad:clamp(20px,4.4vw,72px);\r
}\r
\r
/* ---- weight and air: the "solid" part ----------------------------------- */\r
[data-palette="solid"] body{background:var(--ink);color:var(--text);\r
  font-weight:400;line-height:1.5}\r
[data-palette="solid"] .pad-y{padding-block:clamp(44px,5.4vw,84px)}\r
[data-palette="solid"] .hero h1{font-weight:700;line-height:.96;letter-spacing:-.028em;\r
  font-size:clamp(46px,7.6vw,112px);max-width:15ch}\r
[data-palette="solid"] .h2{font-weight:700;line-height:1.0;letter-spacing:-.022em;\r
  font-size:clamp(32px,4.6vw,62px)}\r
[data-palette="solid"] .lane h2{font-weight:700;line-height:1.02;font-size:clamp(27px,3.1vw,44px)}\r
[data-palette="solid"] .svc-name{font-weight:700;line-height:1.1}\r
[data-palette="solid"] .hero-sub{font-size:clamp(17px,1.45vw,20px);line-height:1.45;max-width:44ch}\r
[data-palette="solid"] .lede,[data-palette="solid"] .faq-item p,\r
[data-palette="solid"] .svc-desc,[data-palette="solid"] .lane p{line-height:1.5}\r
[data-palette="solid"] .eyebrow{font-size:clamp(12px,1vw,14px);letter-spacing:.22em}\r
\r
/* ---- texture on every ground: nothing is flat colour -------------------- */\r
[data-palette="solid"] .trust,[data-palette="solid"] .areas{\r
  background-color:var(--ink-2);\r
  background-image:repeating-linear-gradient(122deg,rgba(242,236,228,.016) 0 2px,transparent 2px 6px),\r
                   linear-gradient(180deg,#241D17,#1B1511)}\r
[data-palette="solid"] .owner,[data-palette="solid"] .revs{\r
  background-color:var(--ink-3);\r
  background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.13) 0 3px,transparent 3px 9px),\r
                   linear-gradient(180deg,#332820 0%,#241C16 100%)}          /* timber */\r
[data-palette="solid"] .svcs,[data-palette="solid"] .prices{\r
  background-color:var(--ink);\r
  background-image:repeating-linear-gradient(90deg,rgba(242,236,228,.022) 0 1px,transparent 1px 4px),\r
                   linear-gradient(180deg,#1E1813 0%,#141010 100%)}          /* brushed */\r
[data-palette="solid"] .faq{background-color:var(--ink-2);\r
  background-image:radial-gradient(120% 90% at 12% 0,rgba(193,39,45,.09),transparent 60%),\r
                   linear-gradient(180deg,#221B16,#191410)}\r
[data-palette="solid"] .contact{background-color:#241C15;\r
  background-image:repeating-linear-gradient(91deg,rgba(0,0,0,.17) 0 2px,transparent 2px 7px),\r
                   linear-gradient(180deg,#35291E 0%,#1D1610 100%)}\r
[data-palette="solid"] footer{background:var(--ink);border-top:1px solid var(--line-2)}\r
\r
/* text colours across all of it */\r
[data-palette="solid"] .h2,[data-palette="solid"] .hero h1,[data-palette="solid"] .trust h3,\r
[data-palette="solid"] .svc-name,[data-palette="solid"] .faq-item h3,[data-palette="solid"] .owner .h2,\r
[data-palette="solid"] .area-row dt,[data-palette="solid"] .price-row dt{color:var(--text)}\r
[data-palette="solid"] .trust p,[data-palette="solid"] .faq-item p,[data-palette="solid"] .svc-desc,\r
[data-palette="solid"] .lane p,[data-palette="solid"] .owner-bio,[data-palette="solid"] .lede{color:var(--dim)}\r
[data-palette="solid"] .eyebrow{color:var(--red-lift)}\r
[data-palette="solid"] .area-row dd,[data-palette="solid"] .price-row dd,\r
[data-palette="solid"] .c-tel,[data-palette="solid"] .spec .hl dd{color:var(--red-lift)}\r
[data-palette="solid"] .svc-i,[data-palette="solid"] .grp{color:var(--red-lift)}\r
/* ⚠️ SPECIFICITY, not a missing rule. \`.gal .h2{color:var(--paper-ink)}\` and its\r
   siblings come from the light era and sit LATER in the file at equal weight,\r
   so they won and four section headings rendered dark-on-dark. Adding \`section\`\r
   raises this above them. Found by the pixel probe; a CSS reader would have\r
   said the colour was set, and it was — just not the winning one. */\r
[data-palette="solid"] section .h2,\r
[data-palette="solid"] section .h2 *{color:var(--text)}\r
[data-palette="solid"] section .rev-more a{color:var(--red-lift);border-bottom-color:var(--red)}\r
[data-palette="solid"] section figcaption{color:var(--dimmer)}\r
[data-palette="solid"] .svc-price{border-top:2px solid var(--red);color:var(--text)}\r
[data-palette="solid"] .btn-p{background:var(--red);border-color:var(--red);color:#fff}\r
[data-palette="solid"] .btn-s{color:var(--text);border-color:var(--line)}\r
[data-palette="solid"] .cb-call{background:var(--red);color:#fff}\r
[data-palette="solid"] .cb-wa{background:var(--ink-4);color:var(--text)}\r
[data-palette="solid"] .area-list,[data-palette="solid"] .price-table{border-top:1px solid var(--line)}\r
[data-palette="solid"] .area-row,[data-palette="solid"] .price-row,\r
[data-palette="solid"] .faq-item{border-color:var(--line-2)}\r
[data-palette="solid"] .svc{border-bottom:1px solid var(--line-2)}\r
[data-palette="solid"] .svc:nth-child(odd){border-right:1px solid var(--line-2)}\r
[data-palette="solid"] .svc-list{border-top:1px solid var(--line)}\r
[data-palette="solid"] .svc:hover{background:rgba(242,236,228,.02)}\r
[data-palette="solid"] .price-none{border:1px solid var(--line);border-top:2px solid var(--red)}\r
[data-palette="solid"] .price-none dt{color:var(--red-lift);border-bottom:1px solid var(--line-2)}\r
[data-palette="solid"] .price-none dd,[data-palette="solid"] .c-grid dd{color:var(--text)}\r
[data-palette="solid"] .c-grid dt,[data-palette="solid"] .spec dt,\r
[data-palette="solid"] .based,[data-palette="solid"] .t-none,\r
[data-palette="solid"] .area-note,[data-palette="solid"] figcaption{color:var(--dimmer)}\r
\r
/* ---- FEWER, BIGGER: related sections share a ground and lose the rule --- */\r
[data-palette="solid"] .owner{border-bottom:0;padding-bottom:0}\r
[data-palette="solid"] .revs{padding-top:clamp(30px,3.4vw,48px)}\r
[data-palette="solid"] .svcs{padding-bottom:clamp(30px,3.4vw,48px)}\r
[data-palette="solid"] .prices{padding-top:clamp(30px,3.4vw,48px);border-top:0}\r
[data-palette="solid"] .prices .eyebrow{color:var(--red-lift)}\r
\r
/* ---- the hero: ONE full-bleed photograph, not a panel ------------------- */\r
[data-palette="solid"] .hero{border-bottom:0}\r
[data-palette="solid"] .hero-bg{left:0;right:0}\r
[data-palette="solid"] .hero-bg::after{\r
  background:linear-gradient(90deg,rgba(23,18,15,.95) 0%,rgba(23,18,15,.86) 46%,rgba(23,18,15,.62) 100%),\r
             linear-gradient(0deg,rgba(23,18,15,.92) 0%,rgba(23,18,15,.28) 46%)}\r
[data-palette="solid"] .hero-bg .shot>img{filter:grayscale(.25) contrast(1.06) brightness(.86) saturate(1.05)}\r
[data-palette="solid"] .hero-bg .shot::before{\r
  background:linear-gradient(175deg,#7A4A22 0%,#1A120D 100%);opacity:.34}\r
[data-palette="solid"] .hero-in{grid-template-columns:minmax(0,1fr) minmax(0,.74fr);\r
  padding-block:clamp(58px,7.4vw,104px)}\r
[data-palette="solid"] .spec{background:rgba(23,18,15,.88);border-top:3px solid var(--red);\r
  border-left:1px solid var(--line-2)}\r
[data-palette="solid"] .spec dd{color:var(--text)}\r
\r
/* ---- the mark, in red, heavier ----------------------------------------- */\r
[data-palette="solid"] .mark{display:inline-flex;align-items:center;justify-content:center;\r
  min-width:60px;height:44px;padding:0 15px;border-radius:999px;background:var(--red);color:#fff;\r
  font-family:var(--display);font-weight:700;font-size:21px;letter-spacing:.03em;\r
  box-shadow:0 3px 0 rgba(0,0,0,.34)}\r
[data-palette="solid"] .brandline{display:flex;align-items:center;gap:15px}\r
[data-palette="solid"] .brandline .eyebrow{margin:0}\r
[data-palette="solid"] .brandline .eyebrow::before{display:none}\r
\r
/* ---- heritage, loud ----------------------------------------------------- */\r
[data-palette="solid"] .heritage{display:flex;align-items:baseline;gap:10px;margin:16px 0 0;\r
  font-family:var(--display);font-weight:700;font-size:clamp(30px,3.6vw,52px);\r
  letter-spacing:-.02em;color:var(--red-lift)}\r
[data-palette="solid"] .heritage span{font-family:var(--mono);font-size:12px;letter-spacing:.2em;\r
  text-transform:uppercase;color:var(--dimmer);font-weight:400}\r
\r
/* ---- ruled headings, icons, straddling cards, avatars ------------------- */\r
[data-palette="solid"] section .eyebrow{display:flex;align-items:center;gap:12px}\r
[data-palette="solid"] section .eyebrow::before,[data-palette="solid"] section .eyebrow::after{\r
  content:"";height:2px;flex:0 0 24px;background:currentColor;opacity:.7}\r
[data-palette="solid"] section .eyebrow::after{flex:1 1 auto;max-width:96px}\r
[data-palette="solid"] .ico{display:block;width:28px;height:28px;margin-bottom:12px;\r
  background:var(--red-lift);-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;\r
  -webkit-mask-size:contain;mask-size:contain}\r
[data-palette="solid"] .ico-pick{-webkit-mask-image:var(--i-pick);mask-image:var(--i-pick)}\r
[data-palette="solid"] .ico-tag{-webkit-mask-image:var(--i-tag);mask-image:var(--i-tag)}\r
[data-palette="solid"] .ico-coin{-webkit-mask-image:var(--i-coin);mask-image:var(--i-coin)}\r
[data-palette="solid"] .ico-shield{-webkit-mask-image:var(--i-shield);mask-image:var(--i-shield)}\r
[data-palette="solid"] .ico-rosette{-webkit-mask-image:var(--i-rosette);mask-image:var(--i-rosette)}\r
[data-palette="solid"] .trust h3::before{display:none}\r
[data-palette="solid"] .straddle{display:block;position:relative;z-index:3;\r
  margin-top:-52px;margin-bottom:-52px}\r
[data-palette="solid"] .straddle-in{display:grid;gap:2px;\r
  grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}\r
[data-palette="solid"] .scard{display:flex;flex-direction:column;gap:6px;padding:22px 22px 20px;\r
  background:var(--ink-3);border-top:3px solid var(--red);text-decoration:none;color:var(--text);\r
  box-shadow:0 18px 40px rgba(0,0,0,.42);transition:background-color .18s ease}\r
[data-palette="solid"] .scard:hover{background:var(--ink-4)}\r
[data-palette="solid"] .scard-i{font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:var(--red-lift)}\r
[data-palette="solid"] .scard-n{font-family:var(--display);font-weight:700;font-size:clamp(17px,1.5vw,20px);line-height:1.16}\r
[data-palette="solid"] .scard-p{font-family:var(--mono);font-size:14px;color:var(--red-lift);margin-top:auto;padding-top:8px}\r
[data-palette="solid"] .scard-p.muted{color:var(--dimmer)}\r
[data-palette="solid"] .trust{padding-top:92px}\r
[data-palette="solid"] .avatar{display:inline-flex;align-items:center;justify-content:center;\r
  width:38px;height:38px;border-radius:999px;background:var(--red);color:#fff;\r
  font-family:var(--display);font-weight:700;font-size:17px;flex:0 0 auto}\r
[data-palette="solid"] .rev-card{background:rgba(23,18,15,.55);border:1px solid var(--line-2);\r
  border-top:3px solid var(--red)}\r
[data-palette="solid"] .rev-card blockquote{color:var(--text)}\r
[data-palette="solid"] .rev-stars i{background:var(--red-lift)}\r
[data-palette="solid"] .rev-card figcaption{display:flex;align-items:center;gap:11px;flex-wrap:wrap;\r
  text-transform:none;letter-spacing:.02em;font-size:12.5px;color:var(--dimmer)}\r
[data-palette="solid"] .who{display:flex;flex-direction:column;line-height:1.3}\r
[data-palette="solid"] .who em{font-style:normal;color:var(--dimmer);font-size:11.5px}\r
[data-palette="solid"] .rev-flag{color:#FFD9C9;background:rgba(193,39,45,.22);\r
  border-left:3px solid var(--red)}\r
[data-palette="solid"] .ph{color:#FFD9C9;border-color:rgba(255,217,201,.4)}\r
\r
/* ---- curved dividers, warm ---------------------------------------------- */\r
[data-palette="solid"] .swoop{display:block;position:relative;z-index:2;\r
  height:clamp(34px,4vw,58px);margin-bottom:calc(-1 * clamp(34px,4vw,58px));pointer-events:none;\r
  -webkit-mask:radial-gradient(96% 100% at 50% 0,#000 69.6%,transparent 70%);\r
  mask:radial-gradient(96% 100% at 50% 0,#000 69.6%,transparent 70%)}\r
[data-palette="solid"] .owner+.swoop{background:#2A221B}\r
[data-palette="solid"] .svcs+.swoop{background:#171311}\r
[data-palette="solid"] .areas+.swoop{background:#1B1511}\r
[data-palette="solid"] .faq+.swoop{background:#191410}\r
[data-palette="solid"] .swoop+section{padding-top:calc(clamp(34px,4vw,58px) + clamp(44px,5.4vw,84px))}\r
\r
/* ---- PHOTOGRAPHS FILL THE WIDTH: the gallery leaves its box -------------- */\r
[data-palette="solid"] .gal{background:var(--ink);padding-block:0}\r
[data-palette="solid"] .gal .wrap{max-width:none;padding-inline:0}\r
[data-palette="solid"] .gal .eyebrow,[data-palette="solid"] .gal .h2{\r
  padding-inline:var(--pad);max-width:1240px;margin-inline:auto}\r
[data-palette="solid"] .gal .h2{padding-bottom:clamp(26px,3vw,40px)}\r
[data-palette="solid"] .gal-grid{margin-top:0;gap:2px;grid-auto-rows:minmax(230px,auto)}\r
[data-palette="solid"] .gal-grid figure:nth-child(1) .shot{min-height:462px}\r
[data-palette="solid"] .gal-grid .shot{min-height:230px}\r
[data-palette="solid"] .gal figcaption{padding-inline:12px}\r
/* ⚠️ THE TREATMENT HAS TO LIGHTEN WHEN THE GROUND GOES DARK. On a warm-dark\r
   band the previous values (brightness .93, a 28% warm blend, plus each plate's\r
   own vignette) stacked into near-black rectangles: the photographs filled the\r
   width, which was the point, and could not be seen, which defeated it.\r
   Lifted and warmed instead of desaturated — on this palette the warmth IS the\r
   cohesion, so the set still reads as one family. */\r
[data-palette="solid"] .shot>img{filter:grayscale(.18) contrast(1.02) brightness(1.14) saturate(1.06)}\r
[data-palette="solid"] .shot::before{background:linear-gradient(175deg,#8A5526 0%,#2A1D12 100%);opacity:.20}\r
[data-palette="solid"] .shot::after{\r
  background:radial-gradient(135% 105% at 50% 34%,rgba(0,0,0,0) 62%,rgba(12,8,6,.26) 100%)}\r
/* the hero keeps a heavier hand — text sits on it */\r
[data-palette="solid"] .hero-bg .shot>img{filter:grayscale(.25) contrast(1.06) brightness(.92) saturate(1.05)}\r
\r
/* ---- ⛔ THE PAPER-ERA SECTIONS HAD TO BE FLIPPED, TEXT AND ALL -----------\r
   The owner, reviews and planned lane were built for a light ground. Moving\r
   them onto warm dark without flipping their text produced 19 unreadable\r
   elements — dark-on-dark and light-on-light — every one found by\r
   \`npm run pixels\` reading rendered pixels, and none by a CSS check. Flipping a\r
   ground is one edit with its text, never two. */\r
[data-palette="solid"] .lane-plan{background:var(--ink-3);color:var(--text);\r
  background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.12) 0 3px,transparent 3px 9px),\r
                   linear-gradient(180deg,#332820,#241C16)}\r
[data-palette="solid"] .lane-plan h2,[data-palette="solid"] .lane-plan dt{color:var(--text)}\r
[data-palette="solid"] .lane-plan p,[data-palette="solid"] .lane-plan dd{color:var(--dim)}\r
[data-palette="solid"] .lane-plan .chip{border-color:var(--line);color:var(--dim)}\r
[data-palette="solid"] .lane-plan .btn-s{color:var(--text);border-color:var(--line)}\r
[data-palette="solid"] .eyebrow.on-paper{color:var(--red-lift)}\r
[data-palette="solid"] .owner-facts{border-top:1px solid var(--line)}\r
[data-palette="solid"] .owner-facts dt{color:var(--dimmer)}\r
[data-palette="solid"] .owner-facts dd{color:var(--text)}\r
[data-palette="solid"] .owner-pic .shot{background:var(--ink-4)}\r
[data-palette="solid"] .rev-more a{border-bottom-color:var(--red)}\r
[data-palette="solid"] .svc-desc{color:var(--dim)}\r
[data-palette="solid"] .price-row .note{color:var(--dimmer)}\r
[data-palette="solid"] .grp{color:var(--red-lift)}\r
/* ⚠️ SPECIFICITY, not a missing rule. \`.gal .h2{color:var(--paper-ink)}\` and its\r
   siblings come from the light era and sit LATER in the file at equal weight,\r
   so they won and four section headings rendered dark-on-dark. Adding \`section\`\r
   raises this above them. Found by the pixel probe; a CSS reader would have\r
   said the colour was set, and it was — just not the winning one. */\r
[data-palette="solid"] section .h2,\r
[data-palette="solid"] section .h2 *{color:var(--text)}\r
[data-palette="solid"] section .rev-more a{color:var(--red-lift);border-bottom-color:var(--red)}\r
[data-palette="solid"] section figcaption{color:var(--dimmer)}\r
\r
/* ---- their real logo, and the directory badges -------------------------- */\r
[data-palette="solid"] .logo{display:block;max-height:52px;width:auto;\r
  filter:brightness(0) invert(1) opacity(.94)}   /* their mark, reversed out */\r
[data-palette="solid"] .badges{display:block;background:var(--ink);\r
  border-block:1px solid var(--line-2)}\r
[data-palette="solid"] .badges-in{display:flex;flex-wrap:wrap;align-items:center;\r
  gap:clamp(18px,2.6vw,42px);padding-block:20px}\r
[data-palette="solid"] .badge{height:34px;width:auto;opacity:.62;\r
  filter:grayscale(1) brightness(1.7)}\r
\r
/* ---- the straddle cards at their new, quieter boundary ------------------ */\r
[data-palette="solid"] .gal .straddle,[data-palette="solid"] .straddle{margin-top:-46px;margin-bottom:26px}\r
\r
@media (max-width:820px){\r
  [data-palette="solid"] .hero-bg{position:absolute;left:0;height:auto}\r
  [data-palette="solid"] .straddle{margin-top:-26px;margin-bottom:-26px}\r
  [data-palette="solid"] .trust{padding-top:58px}\r
  [data-palette="solid"] .heritage{font-size:30px}\r
  [data-palette="solid"] .gal .gal-grid{gap:2px}\r
}\r
\r
/* ═══════════════════════════════════════════════════════════════════════════\r
   "STONE" — ported from ABLM Associates, Paul's own client homepage, which he\r
   arrived at over ~40 iterations and is happy with. Seven iterations and three\r
   variants of invented mood were rejected; this is the standard he had been\r
   describing all along.\r
\r
   ⛔ THE INSIGHT THAT EXPLAINS THE WHOLE MORNING, and it was not the palette.\r
   ABLM's h1 is clamp(2.5rem,5.2vw,4.3rem) — 40 to 69px. Mine had grown to\r
   46–112px. I had been scaling type UP to manufacture presence because the\r
   content was thin, which made it shout instead of read. ABLM does not shout\r
   because it has substance. Its base is warm STONE, not near-white, and its\r
   body is #39424A, a soft dark grey, not near-black. Light felt thin and dark\r
   felt bleak for the same reason: density and warmth, not hue.\r
   ⚠️ DO NOT RAISE THE TYPE SCALE. If a section looks empty the answer is more\r
   substance or fewer sections, never bigger type.\r
\r
   TAKEN FROM ABLM: section order, type treatment and spacing, the stone/ink\r
   alternation, and photography used as section BACKGROUNDS rather than sitting\r
   in boxes (which is why the gallery section is hidden here).\r
   CHANGED: accountancy -> locksmith services; the four-person team -> the owner\r
   section; the four calculators -> response times by area, at full weight.\r
   ⛔ NO CALCULATOR WAS INVENTED. An insurance-lock checker would mean\r
   publishing advice with no source, which the honesty rule forbids.\r
   ACCENT: brick red, not ABLM's blue, so Paul's two client sites do not read as\r
   one template. Measured: #9E3B2E clears 4.5:1 on all three stones\r
   (6.01 / 5.41 / 4.65) and takes white text at 6.73:1.\r
   ═══════════════════════════════════════════════════════════════════════════ */\r
:root[data-palette="stone"]{\r
  --ink:#0E1417; --ink-2:#171F24; --ink-3:#2A353C; --ink-4:#38454E;\r
  --paper:#F4F2EC; --paper-2:#EAE6DE; --paper-3:#DBD6CB; --paper-ink:#0E1417;\r
  --body:#39424A;\r
  /* ⚠️ ABLM's own --muted is #6E7880, which measures 4.02:1 on stone and is\r
     BELOW AA for small text. Darkened here rather than copied. Flagged to Paul:\r
     the same grey is on his live client site. */\r
  --muted:#5A646E;\r
  --brick:#9E3B2E; --brick-lift:#E8836F; --brick-deep:#8A2F26;\r
  --brass:var(--brick-lift); --brass-lit:var(--brick-lift); --brass-dim:var(--brick);\r
  --text:#F4F2EC; --dim:#C6C1B7;\r
  /* #9A958C measured 4.29:1 for the 10.5px contact labels once a photograph sat\r
     behind that band and lifted the ground. Raised rather than darkening the\r
     scrim, because the photograph is the point of that band. */\r
  --dimmer:#ABA69C;\r
  --line:rgba(244,242,236,.14); --line-2:rgba(244,242,236,.075);\r
  --line-ink:#D9D4C9;\r
  --pad:clamp(20px,5vw,72px);\r
}\r
\r
/* ---- ABLM's type scale, verbatim. Smaller than mine was, on purpose. ----- */\r
[data-palette="stone"] body{background:var(--paper);color:var(--body);\r
  font-size:17px;line-height:1.62}\r
[data-palette="stone"] .hero h1{font-family:var(--display);font-weight:600;\r
  font-size:clamp(2.5rem,5.2vw,4.3rem);line-height:1.04;letter-spacing:-.02em;max-width:18ch}\r
[data-palette="stone"] .h2{font-family:var(--display);font-weight:600;\r
  font-size:clamp(2.1rem,4.4vw,3.4rem);line-height:1.08;letter-spacing:-.018em;color:var(--ink)}\r
[data-palette="stone"] .lane h2{font-family:var(--display);font-weight:600;\r
  font-size:clamp(1.45rem,3vw,2.2rem);line-height:1.14;letter-spacing:-.012em}\r
[data-palette="stone"] .svc-name,[data-palette="stone"] .faq-item h3,\r
[data-palette="stone"] .step h3{font-family:var(--display);font-weight:600;letter-spacing:-.008em}\r
[data-palette="stone"] .svc-name{font-size:clamp(18px,1.6vw,21px);color:var(--ink)}\r
[data-palette="stone"] .faq-item h3{font-size:18px;color:var(--ink)}\r
[data-palette="stone"] .hero-sub{font-size:clamp(17px,1.4vw,19px);line-height:1.55;color:var(--dim);max-width:48ch}\r
[data-palette="stone"] .lede{color:var(--body);font-size:clamp(17px,1.35vw,19px)}\r
[data-palette="stone"] .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.17em;\r
  font-weight:500;color:var(--brick)}\r
[data-palette="stone"] .pad-y{padding-block:clamp(54px,6.4vw,104px)}\r
\r
/* ---- grounds: stone base, ink for the three punctuation bands ----------- */\r
[data-palette="stone"] .hero{background:var(--ink);color:var(--text);border-bottom:0}\r
[data-palette="stone"] .trust{background:var(--paper-2);color:var(--body);border-bottom:1px solid var(--line-ink)}\r
[data-palette="stone"] .trust h3{color:var(--ink);font-family:var(--display);font-weight:600}\r
[data-palette="stone"] .trust p{color:var(--body)}\r
[data-palette="stone"] .trust h3::before{background:var(--brick)}\r
[data-palette="stone"] .svcs{background:var(--paper)}\r
[data-palette="stone"] .owner{background:var(--paper-2);border-bottom:1px solid var(--line-ink)}\r
[data-palette="stone"] .proc{background:var(--paper)}\r
[data-palette="stone"] .prices{background:var(--paper-2)}\r
[data-palette="stone"] .faq{background:var(--paper)}\r
/* the three dark bands, exactly as ABLM places them */\r
[data-palette="stone"] .areas,[data-palette="stone"] .revs,[data-palette="stone"] .contact{\r
  background:var(--ink);color:var(--text)}\r
[data-palette="stone"] .areas .h2,[data-palette="stone"] .revs .h2,\r
[data-palette="stone"] .contact .h2{color:var(--text)}\r
[data-palette="stone"] .areas .eyebrow,[data-palette="stone"] .revs .eyebrow,\r
[data-palette="stone"] .contact .eyebrow{color:var(--brick-lift)}\r
[data-palette="stone"] footer{background:var(--ink);border-top:1px solid var(--line-2);color:var(--dimmer)}\r
[data-palette="stone"] .f-name{color:var(--dim)}\r
\r
/* ---- the photography moves to BACKGROUNDS, so the gallery box goes ------ */\r
[data-palette="stone"] .gal,[data-palette="stone"] .straddle,\r
[data-palette="stone"] .swoop,[data-palette="stone"] .badges{display:none}\r
/* ⛔ BACKGROUND PHOTOGRAPHS BELONG ONLY BEHIND THE DARK BANDS. The scrim is\r
   dark, so on a stone section it turns the ground dark and leaves near-black\r
   text on a near-black photograph — the fourth time that exact pairing has\r
   appeared. In this variant prices is STONE, so its background slot is simply\r
   not rendered rather than given a second scrim to get wrong. */\r
[data-palette="stone"] .secbg::after{background:rgba(14,20,23,.86)}\r
[data-palette="stone"] .prices .secbg,[data-palette="stone"] .faq .secbg,\r
[data-palette="stone"] .svcs .secbg,[data-palette="stone"] .proc .secbg,\r
[data-palette="stone"] .owner .secbg{display:none}\r
[data-palette="stone"] .secbg img{filter:grayscale(.5) contrast(1.04) brightness(.95) saturate(.8)}\r
\r
/* ---- the hero: ABLM's gradient, and its slow zoom ----------------------- */\r
[data-palette="stone"] .hero-bg{left:0;right:0}\r
[data-palette="stone"] .hero-bg::after{\r
  background:linear-gradient(96deg,rgba(14,20,23,.95) 0%,rgba(14,20,23,.86) 38%,rgba(14,20,23,.45) 68%,rgba(14,20,23,.62) 100%)}\r
[data-palette="stone"] .hero-bg .shot>img{filter:saturate(.55) contrast(1.06);transform:scale(1.04)}\r
[data-palette="stone"] .hero-bg .shot::before{opacity:.12}\r
[data-palette="stone"] .hero-bg .shot::after{background:none}\r
/* ⚠️ A SLOW ZOOM IS SAFE WHERE A REVEAL WAS NOT: it only ever moves the image,\r
   never reveals content, so a screenshot taken at any moment still contains\r
   every word. That was the distinction the scroll-reveal failure turned on. */\r
@media (prefers-reduced-motion: no-preference){\r
  [data-palette="stone"] .hero-bg .shot>img{animation:kb 26s ease-in-out infinite alternate}\r
  @keyframes kb{to{transform:scale(1.12) translateY(-1.2%)}}\r
}\r
[data-palette="stone"] .hero-in{grid-template-columns:1.12fr .88fr;gap:clamp(28px,4vw,56px);\r
  align-items:end;padding-block:clamp(72px,9vw,120px)}\r
[data-palette="stone"] .hero-art,[data-palette="stone"] .hero-grid{display:none}\r
[data-palette="stone"] .hero-rule{background:var(--brick-lift);height:2px;width:84px}\r
[data-palette="stone"] .heritage{display:flex;align-items:baseline;gap:9px;margin:14px 0 0;\r
  font-family:var(--display);font-weight:600;font-size:clamp(22px,2.4vw,32px);color:var(--brick-lift)}\r
[data-palette="stone"] .heritage span{font-family:var(--mono);font-size:11px;letter-spacing:.18em;\r
  text-transform:uppercase;color:var(--dimmer);font-weight:400}\r
[data-palette="stone"] .mark{display:inline-flex;align-items:center;justify-content:center;\r
  min-width:54px;height:38px;padding:0 13px;border-radius:4px;background:var(--brick);color:#fff;\r
  font-family:var(--display);font-weight:700;font-size:18px;letter-spacing:.03em}\r
[data-palette="stone"] .brandline{display:flex;align-items:center;gap:13px}\r
[data-palette="stone"] .brandline .eyebrow{margin:0;color:var(--dim)}\r
[data-palette="stone"] .logo{display:block;max-height:44px;width:auto}\r
/* ⚠️ THE PANEL NEEDS A REAL BACKING, NOT A TINT. At 6% it was effectively\r
   transparent and its 10.5px labels sat straight on the photograph at 2.0:1.\r
   ABLM's hero gradient deliberately stays light on the right so the picture\r
   reads; that means anything placed there supplies its own ground. */\r
[data-palette="stone"] .spec{background:rgba(14,20,23,.90);border-top:2px solid var(--brick-lift);\r
  border-left:1px solid var(--line-2)}\r
[data-palette="stone"] .spec dt{color:var(--dimmer)}\r
[data-palette="stone"] .spec dd{color:var(--text)}\r
[data-palette="stone"] .spec .hl dd{color:var(--brick-lift)}\r
[data-palette="stone"] .spec-link{border-bottom-color:var(--brick-lift)}\r
\r
/* ---- everything on stone ------------------------------------------------ */\r
[data-palette="stone"] .svc-desc,[data-palette="stone"] .faq-item p,\r
[data-palette="stone"] .step p,[data-palette="stone"] .owner-bio,\r
[data-palette="stone"] .price-row .note{color:var(--body)}\r
[data-palette="stone"] .svc-i,[data-palette="stone"] .grp,\r
[data-palette="stone"] .step b{color:var(--brick)}\r
[data-palette="stone"] .svc-price{border-top:2px solid var(--brick);color:var(--ink)}\r
[data-palette="stone"] .price-row dt,[data-palette="stone"] .owner-facts dd{color:var(--ink)}\r
[data-palette="stone"] .price-row dd{color:var(--brick)}\r
[data-palette="stone"] .owner-facts dt,[data-palette="stone"] .c-grid dt{color:var(--muted)}\r
[data-palette="stone"] .owner-facts{border-top:1px solid var(--line-ink)}\r
[data-palette="stone"] .svc-list,[data-palette="stone"] .price-table{border-top:1px solid var(--line-ink)}\r
[data-palette="stone"] .svc,[data-palette="stone"] .price-row,\r
[data-palette="stone"] .faq-item{border-color:var(--line-ink)}\r
[data-palette="stone"] .svc:nth-child(odd){border-right:1px solid var(--line-ink)}\r
[data-palette="stone"] .price-none{border:1px solid var(--line-ink);border-top:2px solid var(--brick);background:var(--paper)}\r
[data-palette="stone"] .price-none dt{color:var(--brick);border-bottom:1px solid var(--line-ink)}\r
[data-palette="stone"] .price-none dd{color:var(--ink)}\r
[data-palette="stone"] .btn-p{background:var(--brick);border-color:var(--brick);color:#fff}\r
[data-palette="stone"] .btn-s{color:var(--ink);border-color:rgba(14,20,23,.26)}\r
[data-palette="stone"] .hero .btn-s{color:var(--text);border-color:var(--line)}\r
[data-palette="stone"] .cb-call{background:var(--brick);color:#fff}\r
[data-palette="stone"] .cb-wa{background:var(--ink-3);color:var(--text)}\r
[data-palette="stone"] .ico{display:block;width:24px;height:24px;margin-bottom:11px;background:var(--brick);\r
  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-size:contain;mask-size:contain}\r
[data-palette="stone"] .ico-pick{-webkit-mask-image:var(--i-pick);mask-image:var(--i-pick)}\r
[data-palette="stone"] .ico-tag{-webkit-mask-image:var(--i-tag);mask-image:var(--i-tag)}\r
[data-palette="stone"] .ico-coin{-webkit-mask-image:var(--i-coin);mask-image:var(--i-coin)}\r
[data-palette="stone"] .ico-shield{-webkit-mask-image:var(--i-shield);mask-image:var(--i-shield)}\r
[data-palette="stone"] .ico-rosette{-webkit-mask-image:var(--i-rosette);mask-image:var(--i-rosette)}\r
\r
/* ---- the two dark data bands: response times at full "tools" weight ----- */\r
[data-palette="stone"] .area-list{border-top:1px solid var(--line)}\r
[data-palette="stone"] .area-row{border-bottom:1px solid var(--line-2);padding-block:19px}\r
[data-palette="stone"] .area-row dt{color:var(--text);font-size:19px}\r
[data-palette="stone"] .area-row dd{color:var(--brick-lift);font-size:18px}\r
[data-palette="stone"] .based,[data-palette="stone"] .t-none,\r
[data-palette="stone"] .area-note{color:var(--dimmer)}\r
[data-palette="stone"] .rev-card{background:rgba(244,242,236,.05);border:1px solid var(--line-2);\r
  border-top:2px solid var(--brick-lift)}\r
[data-palette="stone"] .rev-card blockquote{color:var(--text)}\r
[data-palette="stone"] .rev-stars i{background:var(--brick-lift)}\r
[data-palette="stone"] .rev-card figcaption{color:var(--dimmer)}\r
[data-palette="stone"] .avatar{display:inline-flex;align-items:center;justify-content:center;\r
  width:34px;height:34px;border-radius:999px;background:var(--brick);color:#fff;\r
  font-family:var(--display);font-weight:700;font-size:15px;flex:0 0 auto}\r
[data-palette="stone"] .who{display:flex;flex-direction:column;line-height:1.3}\r
[data-palette="stone"] .who em{font-style:normal;color:var(--dimmer);font-size:11.5px}\r
[data-palette="stone"] .rev-flag{color:#FFD9CE;background:rgba(158,59,46,.26);border-left:3px solid var(--brick-lift)}\r
[data-palette="stone"] .ph{color:#FFD9CE;border-color:rgba(255,217,206,.42)}\r
[data-palette="stone"] .rev-more a{color:var(--brick-lift);border-bottom-color:var(--brick-lift)}\r
[data-palette="stone"] .c-tel{color:var(--brick-lift)}\r
[data-palette="stone"] .contact .c-grid dt{color:var(--dimmer)}\r
[data-palette="stone"] .contact .c-grid dd{color:var(--text)}\r
[data-palette="stone"] .lane-now{background:var(--ink-2);color:var(--text)}\r
[data-palette="stone"] .lane-now h2,[data-palette="stone"] .lane-now dt{color:var(--text)}\r
[data-palette="stone"] .lane-now p,[data-palette="stone"] .lane-now dd{color:var(--dim)}\r
[data-palette="stone"] .lane-now .eyebrow{color:var(--brick-lift)}\r
[data-palette="stone"] .lane-plan{background:var(--paper);color:var(--body)}\r
[data-palette="stone"] .lane-plan h2,[data-palette="stone"] .lane-plan dt{color:var(--ink)}\r
[data-palette="stone"] .lane-plan .eyebrow{color:var(--brick)}\r
\r
/* ---- the process grid --------------------------------------------------- */\r
[data-palette="stone"] .proc-grid{display:grid;gap:0;margin-top:clamp(30px,3.6vw,48px);\r
  grid-template-columns:repeat(auto-fit,minmax(230px,1fr));border-top:1px solid var(--line-ink)}\r
[data-palette="stone"] .step{padding:clamp(22px,2.4vw,32px) clamp(18px,2vw,28px) clamp(24px,2.8vw,36px) 0;\r
  border-right:1px solid var(--line-ink)}\r
[data-palette="stone"] .step:last-child{border-right:0}\r
[data-palette="stone"] .step b{font-family:var(--mono);font-size:12px;letter-spacing:.08em;display:block}\r
[data-palette="stone"] .step h3{font-size:18px;margin:12px 0 0;line-height:1.24}\r
[data-palette="stone"] .step p{margin:.5em 0 0;font-size:15.5px;line-height:1.55}\r
@media (max-width:820px){\r
  [data-palette="stone"] .step{border-right:0;border-bottom:1px solid var(--line-ink);padding-right:0}\r
  [data-palette="stone"] .step:last-child{border-bottom:0}\r
  [data-palette="stone"] .hero-in{grid-template-columns:1fr}\r
}\r
\r
/* ══ THE NINE FIXES, 2026-09-11 ═════════════════════════════════════════ */\r
\r
/* 8. TYPE. Archivo everywhere, IBM Plex Mono for numbers — ABLM's actual\r
      stack. No serif; the serif was mine and it was wrong. */\r
[data-palette="stone"]{--display:'Archivo',system-ui,sans-serif;\r
  --mono:'PlexMono',ui-monospace,monospace}\r
[data-palette="stone"] body{font-family:'Archivo',system-ui,-apple-system,sans-serif}\r
[data-palette="stone"] .hero h1,[data-palette="stone"] .h2,[data-palette="stone"] .lane h2,\r
[data-palette="stone"] .svc-name,[data-palette="stone"] .faq-item h3,\r
[data-palette="stone"] .qh span,[data-palette="stone"] .step h3{font-family:'Archivo',system-ui,sans-serif}\r
[data-palette="stone"] .hero h1{font-weight:700;letter-spacing:-.028em}\r
[data-palette="stone"] .h2{font-weight:700;letter-spacing:-.022em}\r
\r
/* 1. THE FAQ ACCORDION, styled like ABLM's .qa/.qh/.qb ------------------- */\r
[data-palette="stone"] .faq-list{margin-top:clamp(26px,3vw,42px);border-top:1px solid var(--line-ink)}\r
[data-palette="stone"] .qa{border-bottom:1px solid var(--line-ink)}\r
[data-palette="stone"] .qh{display:flex;align-items:flex-start;justify-content:space-between;gap:22px;\r
  width:100%;padding:22px 0;cursor:pointer;list-style:none;\r
  font-size:clamp(17px,1.5vw,19px);font-weight:600;color:var(--ink);line-height:1.34}\r
[data-palette="stone"] .qh::-webkit-details-marker{display:none}\r
[data-palette="stone"] .qh i{flex:0 0 auto;width:20px;height:20px;position:relative;margin-top:3px}\r
[data-palette="stone"] .qh i::before,[data-palette="stone"] .qh i::after{content:"";position:absolute;\r
  background:var(--brick);transition:transform .18s ease,opacity .18s ease}\r
[data-palette="stone"] .qh i::before{inset:9px 0 9px 0;height:2px}\r
[data-palette="stone"] .qh i::after{inset:0 9px 0 9px;width:2px}\r
[data-palette="stone"] .qa[open] .qh i::after{transform:scaleY(0);opacity:0}\r
[data-palette="stone"] .qa[open] .qh{color:var(--brick)}\r
[data-palette="stone"] .qb{overflow:hidden}\r
[data-palette="stone"] .qbi{padding:0 0 24px;max-width:74ch}\r
[data-palette="stone"] .qbi p{margin:0 0 .8em;color:var(--body);font-size:16.5px;line-height:1.6}\r
[data-palette="stone"] .qbi p:last-child{margin-bottom:0}\r
[data-palette="stone"] .qa:hover .qh{color:var(--brick)}\r
\r
/* 2. THE HERO PANEL. Five label/value rows read as a product datasheet.\r
      It is now a short human line plus the numbers that matter, inline. */\r
/* ⚠️ IT MOVES TO THE LEFT COLUMN. Stripped of its panel it was sitting on the\r
   open right-hand side of the hero, where ABLM's gradient deliberately stays\r
   light so the photograph reads — 2.7:1 on the labels. The numbers belong with\r
   the name anyway, and the right side is left clear for the picture. */\r
[data-palette="stone"] .spec{grid-column:1;background:none;border:0;box-shadow:none;\r
  display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 26px;\r
  padding:20px 0 0;margin-top:clamp(20px,2.4vw,30px);border-top:1px solid var(--line-2)}\r
[data-palette="stone"] .spec>div{display:flex;align-items:baseline;gap:8px;padding:0;border:0}\r
[data-palette="stone"] .spec dt{font-family:'Archivo',sans-serif;font-size:14px;letter-spacing:0;\r
  text-transform:none;color:var(--dim);margin:0;white-space:normal;order:2}\r
[data-palette="stone"] .spec dd{font-family:var(--mono);font-size:17px;font-weight:500;\r
  color:var(--text);text-align:left;order:1}\r
[data-palette="stone"] .spec .hl dd{color:var(--brick-lift);font-size:19px}\r
\r
/* 6. REVIEWS CYCLE, with an INSTANT change and never a fade -------------\r
      step-end means there is no in-between frame to be caught mid-change, so\r
      any screenshot lands on exactly one clean review. Each holds 5s. */\r
[data-palette="stone"] .rev-grid{display:block;position:relative;min-height:210px}\r
[data-palette="stone"] .rev-card{position:absolute;inset:0;opacity:0}\r
@media (prefers-reduced-motion: no-preference){\r
  [data-palette="stone"] .rev-card{animation:revcyc 15s step-end infinite}\r
  [data-palette="stone"] .rev-card:nth-child(2){animation-delay:5s}\r
  [data-palette="stone"] .rev-card:nth-child(3){animation-delay:10s}\r
  @keyframes revcyc{0%{opacity:1}33.333%{opacity:0}100%{opacity:0}}\r
}\r
/* ⚠️ WITHOUT the animation (reduced motion, or an engine that skips it) the\r
   FIRST review must still be visible — otherwise the section is blank. */\r
[data-palette="stone"] .rev-card:first-child{opacity:1}\r
@media (prefers-reduced-motion: no-preference){\r
  [data-palette="stone"] .rev-card:first-child{animation:revcyc 15s step-end infinite}\r
}\r
[data-palette="stone"] .rev-dots{display:flex;gap:7px;margin-top:16px}\r
[data-palette="stone"] .rev-dots i{width:7px;height:7px;border-radius:999px;background:var(--line)}\r
\r
/* 7. HOW IT WORKS: a connected line, dots on it, text beneath ----------- */\r
[data-palette="stone"] .proc-grid{display:grid;gap:0;border-top:0;position:relative;\r
  grid-template-columns:repeat(auto-fit,minmax(190px,1fr));\r
  margin-top:clamp(34px,4vw,56px);padding-top:46px}\r
[data-palette="stone"] .proc-grid::before{content:"";position:absolute;left:6%;right:6%;top:13px;\r
  height:2px;background:linear-gradient(90deg,var(--brick) 0%,rgba(158,59,46,.35) 100%)}\r
[data-palette="stone"] .step{padding:0 clamp(14px,1.8vw,26px) 0 0;border:0;position:relative}\r
[data-palette="stone"] .step::before{content:"";position:absolute;top:-46px;left:0;\r
  width:26px;height:26px;border-radius:999px;background:var(--paper);\r
  border:3px solid var(--brick);box-sizing:border-box}\r
[data-palette="stone"] .step::after{content:"";position:absolute;top:-38px;left:8px;\r
  width:10px;height:10px;border-radius:999px;background:var(--brick)}\r
[data-palette="stone"] .step b{font-family:var(--mono);font-size:12px;letter-spacing:.1em;\r
  color:var(--brick);display:block}\r
[data-palette="stone"] .step h3{font-size:17px;margin:8px 0 0;line-height:1.26}\r
@media (max-width:820px){\r
  [data-palette="stone"] .proc-grid{grid-template-columns:1fr;padding-top:0}\r
  [data-palette="stone"] .proc-grid::before{left:12px;right:auto;top:0;bottom:0;width:2px;height:auto;\r
    background:linear-gradient(180deg,var(--brick),rgba(158,59,46,.3))}\r
  [data-palette="stone"] .step{padding:0 0 26px 46px}\r
  [data-palette="stone"] .step::before{top:0;left:0}\r
  [data-palette="stone"] .step::after{top:8px;left:8px}\r
}\r
\r
/* 4. SERVICES: a large photograph beside the list, not text alone -------- */\r
[data-palette="stone"] .svcs .wrap{display:grid;gap:clamp(24px,3.2vw,56px);\r
  grid-template-columns:minmax(0,1fr)}\r
[data-palette="stone"] .svcs:has(.svc-photo) .wrap{grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);\r
  align-items:start}\r
[data-palette="stone"] .svcs .eyebrow,[data-palette="stone"] .svcs .h2{grid-column:1/-1}\r
[data-palette="stone"] .svc-photo .shot{aspect-ratio:4/5;min-height:340px}\r
[data-palette="stone"] .svc-photo{position:sticky;top:26px}\r
[data-palette="stone"] .svcs .svc-list,[data-palette="stone"] .svcs .svc-group{grid-column:2}\r
[data-palette="stone"] .svcs:not(:has(.svc-photo)) .svc-list,\r
[data-palette="stone"] .svcs:not(:has(.svc-photo)) .svc-group{grid-column:1/-1}\r
[data-palette="stone"] .svc-list{grid-template-columns:1fr}\r
[data-palette="stone"] .svc:nth-child(odd){border-right:0}\r
[data-palette="stone"] .svc{padding-right:0}\r
\r
/* 5. the owner photo drop target ---------------------------------------- */\r
[data-palette="stone"] .pic-empty{aspect-ratio:4/5;min-height:340px;display:flex;\r
  flex-direction:column;align-items:center;justify-content:center;gap:8px;\r
  border:2px dashed rgba(158,59,46,.45);background:rgba(158,59,46,.05);color:var(--brick)}\r
[data-palette="stone"] .pic-empty span{font-family:var(--mono);font-size:12px;letter-spacing:.18em}\r
[data-palette="stone"] .pic-empty small{font-size:12.5px;color:#4E5860}  /* was --muted: 4.50:1 is the threshold itself, not clear of it */\r
\r
@media (max-width:820px){\r
  [data-palette="stone"] .svcs:has(.svc-photo) .wrap{grid-template-columns:1fr}\r
  [data-palette="stone"] .svcs .svc-list,[data-palette="stone"] .svcs .svc-group{grid-column:1}\r
  [data-palette="stone"] .svc-photo{position:static}\r
  [data-palette="stone"] .svc-photo .shot,[data-palette="stone"] .pic-empty{min-height:260px;aspect-ratio:4/3}\r
}\r
\r
/* ---- shared atoms ------------------------------------------------------- */\r
.wrap{max-width:1240px;margin:0 auto;padding-inline:var(--pad)}\r
.eyebrow{font-family:'Bebas',Impact,sans-serif;font-size:clamp(13px,1.1vw,15px);\r
  letter-spacing:.20em;text-transform:uppercase;color:var(--brass);margin:0}\r
.eyebrow.on-paper{color:var(--brass-dim)}\r
.h2{font-family:var(--display);font-weight:600;letter-spacing:-.018em;line-height:1.06;\r
  font-size:clamp(31px,4.2vw,56px);margin:.28em 0 0}\r
.lede{font-size:clamp(17px,1.35vw,20px);line-height:1.6;color:var(--dim);max-width:62ch;margin:1.1em 0 0}\r
.on-paper .lede,.paper .lede{color:#4A5460}\r
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:.02em}\r
.rule{height:1px;background:linear-gradient(90deg,var(--brass),rgba(201,146,47,0));border:0;margin:0}\r
section{position:relative}\r
/* A very fine grain over the whole page. Printed matter is never perfectly\r
   flat and neither is a screen that wants to look considered; at 3% it is\r
   invisible as texture and obvious by its absence. SVG data-URI, ~200 bytes,\r
   no request. */\r
body::after{content:"";position:fixed;inset:0;z-index:200;pointer-events:none;opacity:.035;\r
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E")}\r
.pad-y{padding-block:clamp(56px,7.5vw,116px)}\r
.paper{background:var(--paper);color:var(--paper-ink)}\r
.paper .h2{color:var(--paper-ink)}\r
\r
/* Buttons. TWO only, and the primary is the single most saturated thing on the\r
   page — that is what "one accent used with intent" means here. */\r
.btn{display:inline-flex;align-items:center;gap:.6em;text-decoration:none;\r
  font-weight:700;font-size:16px;padding:16px 26px;border-radius:2px;\r
  border:1px solid transparent;transition:none}\r
.btn-p{background:var(--brass);color:#160F02;border-color:var(--brass)}\r
.btn-s{background:transparent;color:var(--text);border-color:var(--line)}\r
.paper .btn-s,.lane-plan .btn-s{color:var(--paper-ink);border-color:var(--line-ink)}\r
.btn-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}\r
\r
/* ---- THE ONE PHOTO TREATMENT -------------------------------------------\r
   Every image on the page goes through .shot — a real photo from their site, a\r
   purchased stock plate, and the Google Static Maps snapshot alike. That is the\r
   whole point: a rough Maps grab and a bought image must read as one set.\r
   Monochrome + a warm shadow tint + a vignette. ----------------------------- */\r
.shot{position:relative;overflow:hidden;background:var(--ink-3)}\r
.shot>img{width:100%;height:100%;object-fit:cover;\r
  filter:grayscale(.45) contrast(1.04) brightness(1.04) saturate(.9)}\r
.shot::before{content:"";position:absolute;inset:0;pointer-events:none;\r
  background:linear-gradient(175deg,#6B5226 0%,#1B2430 100%);\r
  mix-blend-mode:color;opacity:.26}\r
.shot::after{content:"";position:absolute;inset:0;pointer-events:none;\r
  background:radial-gradient(130% 100% at 50% 34%,rgba(0,0,0,0) 56%,rgba(6,8,10,.30) 100%)}\r
\r
/* ---- BACKGROUND PHOTOGRAPHY behind the dark sections --------------------\r
   Four operator-placed slots. Same treatment as every other image so a\r
   background, a gallery plate and a map snapshot read as one set, then a heavy\r
   scrim on top. ⚠️ THE SCRIM VALUE IS A CONTRAST DECISION, NOT A TASTE ONE:\r
   it is set so every piece of text still passes WCAG AA with a photograph\r
   behind it, measured after each change. Raising the photo's presence means\r
   re-measuring, not guessing.\r
   The page must look correct with all four empty — it does, because each sits\r
   behind an if-guard and the section keeps its own flat background beneath.\r
   ⛔ Do NOT write a literal double-brace construct in a comment in this file:\r
   the renderer tokenises comments too, so prose becomes a real unclosed tag. */\r
.secbg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}\r
.secbg img{width:100%;height:100%;object-fit:cover;\r
  filter:grayscale(1) contrast(1.02) brightness(.9)}\r
.secbg::before{content:"";position:absolute;inset:0;\r
  background:linear-gradient(175deg,#4A3A1E 0%,#10141A 100%);\r
  mix-blend-mode:color;opacity:.55}\r
.secbg::after{content:"";position:absolute;inset:0;background:rgba(9,11,14,.88)}\r
/* content sits above the background layer */\r
section>.wrap,.lane>.lane-in{position:relative;z-index:1}\r
.lane{position:relative}\r
\r
/* ============================ HERO ======================================= */\r
.hero{background:var(--ink);border-bottom:1px solid var(--line-2);overflow:hidden}\r
.hero-bg{position:absolute;inset:0;z-index:0}\r
.hero-bg::after{content:"";position:absolute;inset:0;\r
  background:linear-gradient(90deg,rgba(10,12,15,.96) 0%,rgba(10,12,15,.90) 40%,rgba(10,12,15,.62) 72%,rgba(10,12,15,.42) 100%)}\r
/* No-photo depth: a brass wash and a hairline grid. CSS only, so the hero is\r
   never empty-looking and never waits on an image. */\r
.hero-art{position:absolute;inset:0;z-index:0;\r
  background:\r
    radial-gradient(62% 78% at 4% -6%,rgba(201,146,47,.26),transparent 60%),\r
    radial-gradient(48% 62% at 99% 104%,rgba(201,146,47,.12),transparent 62%),\r
    linear-gradient(180deg,#0B0E12,#080A0D)}\r
.hero-grid{position:absolute;inset:0;z-index:0;\r
  background-image:linear-gradient(var(--grid) 1px,transparent 1px),\r
                   linear-gradient(90deg,var(--grid) 1px,transparent 1px);\r
  background-size:100% 132px,132px 100%;opacity:1;\r
  mask-image:linear-gradient(112deg,#000 0%,rgba(0,0,0,.30) 34%,transparent 62%);\r
  -webkit-mask-image:linear-gradient(112deg,#000 0%,rgba(0,0,0,.30) 34%,transparent 62%)}\r
.hero-in{position:relative;z-index:1;padding-block:clamp(56px,8vw,112px);\r
  display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,.85fr);\r
  gap:clamp(28px,5vw,72px);align-items:end}\r
.hero h1{font-family:var(--display);font-weight:600;letter-spacing:-.026em;line-height:.98;\r
  font-size:clamp(42px,6.9vw,96px);margin:.16em 0 0;max-width:17ch;\r
  text-wrap:balance}\r
.hero-rule{width:112px;height:3px;background:var(--brass);margin:30px 0 0}\r
.hero-sub{font-size:clamp(17px,1.5vw,21px);line-height:1.55;color:var(--dim);\r
  max-width:46ch;margin:26px 0 0}\r
.hero-sub b{color:var(--text);font-weight:700}\r
\r
/* The mono spec strip — the device that makes it read bespoke with no photo. */\r
.spec{margin:0;border-top:1px solid var(--brass);\r
  border-left:1px solid var(--line-2);background:rgba(10,12,15,.90)}\r
.spec>div{padding:17px 20px;border-bottom:1px solid var(--line-2);\r
  display:flex;align-items:baseline;justify-content:space-between;gap:16px}\r
.spec>div:last-child{border-bottom:0}\r
.spec dt{font-family:var(--mono);font-size:10.5px;letter-spacing:.15em;\r
  text-transform:uppercase;color:var(--dimmer);margin:0;white-space:nowrap}\r
.spec dd{margin:0;font-family:var(--mono);font-variant-numeric:tabular-nums;\r
  font-size:clamp(18px,1.55vw,22px);font-weight:500;color:var(--text);\r
  letter-spacing:-.01em;text-align:right}\r
.spec dd small{font-size:12px;color:var(--dim);letter-spacing:.02em}\r
.spec .hl dd{color:var(--brass-lit)}\r
.spec-link{color:inherit;text-decoration:none;border-bottom:1px solid var(--brass-dim);\r
  padding-bottom:2px}\r
.spec-link small{margin-left:6px}\r
\r
/* ============================ TRUST STRIP ================================ */\r
/* WAS ink-2. Paper now: this is the first thing under the hero and it is the\r
   page's reassurance, which should not arrive on a black band. */\r
.trust{background:var(--paper);color:var(--paper-ink);border-bottom:1px solid var(--line-ink)}\r
.trust h3{color:var(--paper-ink)}\r
.trust p{color:#4A5460}\r
.trust ul{list-style:none;margin:0;padding:0;display:grid;\r
  grid-template-columns:repeat(auto-fit,minmax(186px,1fr));\r
  gap:22px clamp(18px,2.2vw,34px)}\r
.trust li{padding:24px 0}\r
.trust h3{font-size:15px;font-weight:700;margin:0;letter-spacing:-.005em}\r
.trust h3::before{content:"";display:block;width:22px;height:2px;background:var(--brass-dim);margin-bottom:13px}\r
.trust p{margin:7px 0 0;font-size:14.5px;line-height:1.5}\r
\r
/* ============================ URGENT / PLANNED =========================== */\r
/* The section that serves two visitors. Deliberately NOT symmetrical cards:\r
   different grounds, different weights, so the page never reads as a grid. */\r
.lanes{display:grid;grid-template-columns:1.06fr .94fr}\r
.lane{padding:clamp(38px,5vw,76px) var(--pad)}\r
.lane-now{background:var(--ink-3);\r
  background-image:radial-gradient(78% 100% at 0% 0%,rgba(201,146,47,.10),transparent 66%)}\r
.lane-plan{background:var(--paper);color:var(--paper-ink)}\r
.lane h2{font-family:var(--display);font-weight:600;letter-spacing:-.016em;line-height:1.1;\r
  font-size:clamp(26px,2.9vw,40px);margin:.34em 0 0}\r
.lane p{font-size:16.5px;line-height:1.62;margin:1em 0 0;color:var(--dim);max-width:44ch}\r
.lane-plan p{color:#4A5460}\r
.lane dl{margin:26px 0 0;display:grid;gap:15px}\r
.lane dt{font-weight:700;font-size:15.5px}\r
.lane dd{margin:3px 0 0;font-size:14.5px;line-height:1.55;color:var(--dim)}\r
.lane-plan dd{color:#525C68}\r
.chip{display:inline-block;font-family:var(--mono);font-size:11.5px;letter-spacing:.12em;\r
  text-transform:uppercase;padding:7px 12px;border:1px solid var(--line);color:var(--dim);margin-top:24px}\r
.lane-plan .chip{border-color:var(--line-ink);color:#525C68}\r
\r
/* ============================ REVIEWS ==================================== */\r
.revs{background:var(--paper-2);color:var(--paper-ink);border-bottom:1px solid var(--line-ink)}\r
.revs .h2{color:var(--paper-ink)}\r
.rev-flag{margin:14px 0 0;font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;\r
  color:#4A3008;background:rgba(201,146,47,.16);border-left:3px solid var(--brass-dim);\r
  padding:9px 14px;display:inline-block}\r
.rev-grid{display:grid;gap:clamp(14px,1.6vw,22px);margin-top:clamp(26px,3vw,40px);\r
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}\r
.rev-card{margin:0;background:var(--paper);border:1px solid var(--line-ink);\r
  padding:clamp(22px,2.4vw,30px);display:flex;flex-direction:column;gap:13px}\r
.rev-stars{display:flex;gap:4px}\r
.rev-stars i{width:15px;height:15px;background:var(--brass-dim);\r
  clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}\r
.rev-card blockquote{margin:0;font-family:var(--display);font-weight:600;\r
  font-size:clamp(17px,1.5vw,20px);line-height:1.45;letter-spacing:-.008em;color:var(--paper-ink)}\r
.rev-card figcaption{font-family:var(--mono);font-size:11px;letter-spacing:.1em;\r
  text-transform:uppercase;color:#5A6470;margin-top:auto}\r
.ph{color:#4A3008;border:1px solid rgba(74,48,8,.45);padding:1px 5px;margin-left:4px}\r
.rev-more{margin:clamp(20px,2.4vw,30px) 0 0;font-size:15.5px}\r
.rev-more a{text-decoration:none;border-bottom:1px solid var(--brass-dim);padding-bottom:2px}\r
\r
/* ============================ THE OWNER ================================== */\r
/* Light ground, a real portrait, generous measure. The one section whose job\r
   is entirely tone rather than information. */\r
.owner{background:var(--paper);color:var(--paper-ink);border-bottom:1px solid var(--line-ink)}\r
.owner-in{display:grid;grid-template-columns:minmax(0,.62fr) minmax(0,1fr);\r
  gap:clamp(26px,4vw,64px);align-items:center}\r
/* No portrait yet -> one column, so the text is not squeezed into 62% of the\r
   width waiting for an image that may never come. */\r
.owner-in:not(:has(.owner-pic)){grid-template-columns:1fr}\r
.owner-pic .shot{aspect-ratio:4/5;background:var(--paper-2)}\r
/* ⛔ THE PORTRAIT IS THE ONE IMAGE THAT IS NOT DESATURATED. Every other photo\r
   goes through the monochrome treatment so the set matches; a greyed-out face\r
   reads as a mugshot, which is the exact opposite of the point of this\r
   section. Warmth beats consistency here, deliberately. */\r
.owner-pic .shot>img{filter:contrast(1.03) saturate(.97) brightness(1.01)}\r
.owner-pic .shot::before{opacity:.10}\r
.owner-pic .shot::after{background:radial-gradient(120% 90% at 50% 30%,rgba(0,0,0,0) 60%,rgba(19,23,27,.15) 100%)}\r
.owner .h2{color:var(--paper-ink)}\r
.owner-bio{font-size:clamp(17px,1.5vw,20px);line-height:1.66;color:#3E4854;\r
  margin:1.05em 0 0;max-width:56ch}\r
.owner-facts{display:flex;flex-wrap:wrap;gap:0 clamp(26px,3.4vw,52px);\r
  margin:clamp(24px,2.8vw,36px) 0 0;padding-top:20px;border-top:1px solid var(--line-ink)}\r
.owner-facts dt{font-family:var(--mono);font-size:10.5px;letter-spacing:.15em;\r
  text-transform:uppercase;color:#5A6470;margin:0 0 7px}\r
.owner-facts dd{margin:0;font-family:var(--mono);font-variant-numeric:tabular-nums;\r
  font-size:19px;color:var(--paper-ink);letter-spacing:-.01em}\r
\r
/* ============================ SERVICES =================================== */\r
/* Six substantial editorial rows, NOT twelve list items and NOT an icon grid.\r
   The mono index and the generous vertical rhythm are what make six feel like\r
   a considered list rather than a menu. */\r
.svcs{background:var(--paper);color:var(--paper-ink)}\r
.svc-list{margin:clamp(34px,4.4vw,58px) 0 0;border-top:1px solid var(--line-ink);\r
  display:grid;grid-template-columns:1fr 1fr}\r
/* Hairlines only — no boxes, no rounding, no icons. Paul ruled out the grid of\r
   identical rounded cards, and a bordered cell IS that card. */\r
.svc{display:grid;grid-template-columns:clamp(38px,3.4vw,54px) minmax(0,1fr);\r
  gap:0 clamp(12px,1.4vw,20px);\r
  padding:clamp(24px,2.7vw,34px) clamp(18px,2vw,30px) clamp(26px,2.9vw,38px) 0;\r
  border-bottom:1px solid var(--line-ink);align-items:start}\r
.svc:nth-child(odd){border-right:1px solid var(--line-ink)}\r
.svc:nth-child(even){padding-left:clamp(24px,3vw,44px);padding-right:0}\r
.svc-i{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:13px;\r
  font-weight:500;color:var(--brass-dim);padding-top:.62em;letter-spacing:.04em}\r
.svc-name{font-family:var(--display);font-weight:600;letter-spacing:-.012em;line-height:1.18;\r
  font-size:clamp(21px,2.1vw,29px);margin:0;text-wrap:balance}\r
.svc-desc{margin:.66em 0 0;font-size:16px;line-height:1.62;color:#4A5460}\r
.svc-price{margin:.9em 0 0;font-family:var(--mono);font-variant-numeric:tabular-nums;\r
  font-size:14.5px;color:var(--paper-ink);border-top:2px solid var(--brass);\r
  padding-top:.7em;display:inline-block;letter-spacing:.02em}\r
.svc-group+.svc-group{margin-top:clamp(26px,3vw,42px)}\r
.grp{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;\r
  color:var(--brass-dim);margin:clamp(26px,3vw,40px) 0 0;font-weight:500}\r
.svc-group:first-of-type .grp{margin-top:clamp(22px,2.6vw,32px)}\r
.svc-group .svc-list{margin-top:14px}\r
/* A single-service group must not leave an empty right-hand cell. Same\r
   reasoning as the gallery: an empty grid cell reads as a fault. */\r
.svc-list:has(.svc:first-child:last-child){grid-template-columns:1fr}\r
.svc-list:has(.svc:first-child:last-child) .svc{border-right:0;padding-right:0}\r
\r
/* ============================ PHOTOS ===================================== */\r
/* WAS ink. Paper-2 now: a photograph of real work on a light ground reads as\r
   a daylight job photo; the same photograph on near-black reads as a thriller\r
   still, which is exactly the note Paul gave. */\r
.gal{background:var(--paper-2);color:var(--paper-ink)}\r
.gal .h2{color:var(--paper-ink)}\r
.gal-grid{display:grid;gap:clamp(10px,1.1vw,16px);margin-top:clamp(30px,3.6vw,48px);\r
  grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(190px,auto)}\r
/* Asymmetric on purpose — an equal 4-up is the stock-site look. One 2x2\r
   feature cell + four singles fills the 8-cell grid exactly. */\r
.gal-grid figure:nth-child(1){grid-column:span 2;grid-row:span 2}\r
.gal-grid figure{margin:0;position:relative;min-width:0;display:flex;flex-direction:column}\r
.gal-grid .shot{flex:1;min-height:190px}\r
.gal-grid figure:nth-child(1) .shot{min-height:392px}\r
\r
/* ---- THE GRID ADAPTS TO HOW MANY PHOTOGRAPHS THERE ACTUALLY ARE ----------\r
   ⚠️ NOT A REFINEMENT — a correctness fix. Paul has THREE of six images, and a\r
   fixed 4-column grid with a 2x2 feature needs exactly 5 to fill its 8 cells.\r
   With three it left two empty cells, which reads as broken images rather than\r
   as a layout choice. Each count below tiles EXACTLY, with no hole:\r
     1 -> one plate           2 -> two equal\r
     3 -> feature 2x2 + 2 stacked beside it   (3 cols x 2 rows = 6 cells)\r
     4 -> four equal, feature span cancelled  (2 cols x 2 rows)\r
     5 -> feature 2x2 + 4 singles             (4 cols x 2 rows = 8 cells)\r
   \`:has()\` counts the children in CSS, so the RENDERER makes no layout\r
   decision — it only says how many photographs exist. */\r
.gal-grid:has(figure:first-child:last-child){grid-template-columns:1fr}\r
.gal-grid:has(figure:nth-child(2):last-child){grid-template-columns:repeat(2,1fr)}\r
.gal-grid:has(figure:nth-child(3):last-child){grid-template-columns:repeat(3,1fr)}\r
.gal-grid:has(figure:nth-child(4):last-child){grid-template-columns:repeat(2,1fr)}\r
.gal-grid:has(figure:first-child:last-child) figure:nth-child(1),\r
.gal-grid:has(figure:nth-child(2):last-child) figure:nth-child(1),\r
.gal-grid:has(figure:nth-child(4):last-child) figure:nth-child(1){\r
  grid-column:auto;grid-row:auto}\r
.gal-grid:has(figure:first-child:last-child) .shot,\r
.gal-grid:has(figure:nth-child(2):last-child) .shot,\r
.gal-grid:has(figure:nth-child(4):last-child) .shot{min-height:300px}\r
figcaption{font-family:var(--mono);font-size:11px;letter-spacing:.10em;\r
  text-transform:uppercase;color:#5A6470;margin-top:10px}\r
/* A real photo with no caption typed yet gets a rule, not a blank: an\r
   uncaptioned figure next to captioned ones reads as a rendering fault. */\r
.cap-none{color:rgba(19,23,27,.20)}\r
\r
/* ============================ AREAS + TIMES ============================== */\r
.areas{background:var(--paper);color:var(--paper-ink);border-top:1px solid var(--line-ink)}\r
.areas .h2{color:var(--paper-ink)}\r
.area-list{margin:clamp(28px,3.4vw,44px) 0 0;border-top:1px solid var(--line-ink)}\r
.area-row{display:flex;flex-wrap:wrap;gap:6px 20px;align-items:baseline;\r
  padding-block:17px;border-bottom:1px solid var(--line-ink)}\r
.area-row dt{margin:0;font-size:18px;font-weight:700;flex:1 1 220px;letter-spacing:-.008em}\r
.area-row dd{margin:0;font-family:var(--mono);font-variant-numeric:tabular-nums;\r
  font-size:17px;color:var(--brass-dim);letter-spacing:-.01em;font-weight:500}\r
.t-none{font-family:var(--mono);font-size:12.5px;letter-spacing:.06em;\r
  color:#5A6470;text-transform:none}\r
.based{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;\r
  text-transform:uppercase;color:#5A6470;margin-left:8px;font-weight:400}\r
.area-note{margin:18px 0 0;font-size:14px;line-height:1.55;color:#5A6470;max-width:74ch}\r
\r
/* ============================ PRICES ===================================== */\r
.prices{background:var(--ink)}\r
.price-table{margin-top:clamp(28px,3.4vw,44px);border-top:1px solid var(--line)}\r
.price-row{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:baseline;\r
  padding-block:20px;border-bottom:1px solid var(--line-2)}\r
.price-row dt{font-weight:700;font-size:17.5px;flex:1 1 230px;margin:0}\r
.price-row dd{margin:0;font-family:var(--mono);font-variant-numeric:tabular-nums;\r
  font-size:19px;color:var(--brass-lit);letter-spacing:-.01em}\r
.price-row .note{font-size:14px;color:var(--dim);flex-basis:100%;font-family:'Manrope',sans-serif}\r
/* THE EMPTY STATE. Most businesses have no prices — measured 0 of 6 — so this\r
   is the NORMAL case, not a degraded one, and it must read as a policy. */\r
.price-none{margin-top:clamp(28px,3.4vw,44px);border:1px solid var(--line);\r
  border-top:2px solid var(--brass);\r
  padding:clamp(30px,3.6vw,48px);display:grid;gap:0;\r
  grid-template-columns:repeat(auto-fit,minmax(228px,1fr));\r
  background:linear-gradient(135deg,rgba(201,146,47,.055),transparent 62%)}\r
.price-none>div{padding:4px clamp(22px,2.4vw,34px) 4px 0;\r
  border-right:1px solid var(--line-2)}\r
.price-none>div:last-child{border-right:0;padding-right:0}\r
.price-none dt{font-family:var(--mono);font-size:11px;letter-spacing:.15em;\r
  text-transform:uppercase;color:var(--brass);margin:0 0 14px;\r
  padding-bottom:12px;border-bottom:1px solid var(--line-2)}\r
.price-none dd{margin:0;font-size:17px;line-height:1.58;color:var(--text)}\r
\r
/* ============================ FAQ ======================================== */\r
/* Plain, always-open Q&A. No <details>, no JS: every word must be in the\r
   initial HTML *and* visible in a screenshot. */\r
/* WAS ink. Paper-2: six questions in white-on-black is the single grimmest\r
   block on the page, and it is the part a nervous customer actually reads. */\r
.faq{background:var(--paper-2);color:var(--paper-ink)}\r
.faq .h2{color:var(--paper-ink)}\r
.faq-grid{display:grid;gap:0 clamp(30px,4vw,72px);margin-top:clamp(30px,3.6vw,48px);\r
  grid-template-columns:repeat(auto-fit,minmax(330px,1fr))}\r
.faq-item{padding-block:clamp(20px,2.4vw,30px);border-top:1px solid var(--line-ink)}\r
.faq-item h3{font-size:18px;font-weight:800;letter-spacing:-.016em;margin:0;line-height:1.28}\r
.faq-item p{margin:.6em 0 0;font-size:16px;line-height:1.6;color:#4A5460;max-width:56ch}\r
\r
/* ============================ CONTACT + FOOTER =========================== */\r
.contact{background:var(--ink-3)}\r
/* Flex, not auto-fit grid: with only two entries (a business with a phone and\r
   areas and nothing else — sample 3) the grid stretched them to half the page\r
   each and left a visibly empty third column. Capped and left-aligned they read\r
   as a deliberate cluster at any count from 2 to 6. */\r
.c-grid{display:flex;flex-wrap:wrap;gap:clamp(24px,3vw,46px);\r
  margin-top:clamp(28px,3.4vw,44px)}\r
.c-grid>div{flex:1 1 232px;max-width:330px}\r
.c-grid dt{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;\r
  text-transform:uppercase;color:var(--dimmer);margin:0 0 9px}\r
.c-grid dd{margin:0;font-size:17px;line-height:1.55}\r
.c-grid dd a{text-decoration:none;border-bottom:1px solid var(--brass-dim)}\r
.c-tel{font-family:var(--mono);font-size:23px;letter-spacing:-.01em;color:var(--brass-lit)}\r
footer{background:var(--ink);border-top:1px solid var(--line-2);\r
  padding-block:34px;font-size:13.5px;color:var(--dimmer)}\r
.f-in{display:flex;flex-wrap:wrap;gap:10px 26px;justify-content:space-between;align-items:baseline}\r
.f-name{font-weight:800;color:var(--dim);letter-spacing:-.01em}\r
\r
/* ============================ STICKY CALL BAR (mobile) =================== */\r
.callbar{display:none}\r
@media (max-width:820px){\r
  .hero-in{grid-template-columns:1fr;gap:34px;align-items:stretch}\r
  .spec{border-left:0;border-top:2px solid var(--brass)}\r
  .spec>div{padding:15px 0}\r
  .lanes{grid-template-columns:1fr}\r
  .svc-list{grid-template-columns:1fr}\r
  .svc:nth-child(odd){border-right:0}\r
  .svc:nth-child(even){padding-left:0}\r
  .svc{padding-right:0}\r
  .price-none>div{border-right:0;border-bottom:1px solid var(--line-2);\r
    padding:18px 0}\r
  .price-none>div:last-child{border-bottom:0}\r
  .faq-grid{grid-template-columns:1fr}\r
  .owner-in{grid-template-columns:1fr;gap:26px}\r
  .owner-pic .shot{aspect-ratio:4/3}\r
  .map-box{grid-template-columns:1fr}\r
  .map-side{border-left:0;border-top:1px solid var(--line-2)}\r
  .gal-grid{grid-template-columns:repeat(2,1fr)}\r
  .gal-grid figure:nth-child(1){grid-column:span 2;grid-row:auto}\r
  .gal-grid figure:nth-child(1) .shot{min-height:236px}\r
  .gal-grid .shot{min-height:148px}\r
  .trust li{border-left:0;padding-left:0;padding-block:20px;\r
    border-top:1px solid var(--line-2)}\r
  .trust li:first-child{border-top:0}\r
  .spec>div{flex:1 1 44%;border-right:0;padding-right:14px}\r
  .callbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;\r
    border-top:1px solid rgba(0,0,0,.4);box-shadow:0 -10px 30px rgba(0,0,0,.42)}\r
  .callbar a{flex:1;display:flex;align-items:center;justify-content:center;gap:.5em;\r
    padding:17px 10px;text-decoration:none;font-weight:700;font-size:16px}\r
  .cb-call{background:var(--brass);color:#160F02}\r
  .cb-wa{background:var(--ink-4);color:var(--text);flex:0 0 40%}\r
  body{padding-bottom:62px}\r
}\r
@media (max-width:430px){\r
  .svc{grid-template-columns:1fr}\r
  .svc-i{padding-top:0;margin-bottom:6px}\r
}\r
</style>\r
\r
<!-- ================================ HERO ================================= -->\r
<section class="hero">\r
  {{#if img hero}}\r
  <div class="hero-bg"><div class="shot" style="height:100%"><img src="{{url img hero}}" alt="{{business.name}}"></div></div>\r
  {{/if}}\r
  {{#if img.no_hero}}\r
  <div class="hero-art"></div>\r
  <div class="hero-grid"></div>\r
  {{/if}}\r
  <div class="wrap hero-in">\r
    <div>\r
    <div class="brandline">\r
      <!-- ⛔ THEIR REAL LOGO BEATS INITIALS EVERY TIME. The picker scrapes it\r
           from their own site; the monogram is what happens when it found\r
           nothing, not the default. business.no_logo is the paired flag,\r
           because an if-guard here has no else branch.\r
           (And note: this comment deliberately does NOT spell that construct\r
           out in braces — the renderer tokenises comments too, so prose becomes\r
           a real unclosed tag. That trap has now bitten twice.) -->\r
      {{#if img logo}}<img class="logo" src="{{url img logo}}" alt="{{business.name}}">{{/if}}\r
      {{#if img.no_logo}}{{#if business.mark}}<span class="mark" aria-hidden="true">{{business.mark}}</span>{{/if}}{{/if}}\r
      <p class="eyebrow">{{business.trade}} &middot; {{business.town}}</p>\r
    </div>\r
    <h1>{{business.name}}</h1>\r
    {{#if business.established}}<p class="heritage"><span>Est.</span> {{business.established}}</p>{{/if}}\r
    <div class="hero-rule"></div>\r
    <p class="hero-sub">\r
{{#if headline_price}}<b>{{headline_price.service}} from {{headline_price.from}}.</b> {{/if}}{{#if business.response_time}}{{business.response_time}} to most {{business.town}} addresses. {{/if}}{{#if services_lead}}{{services_lead}}.{{/if}}\r
    </p>\r
    <div class="btn-row">\r
      {{#if business.phone}}<a class="btn btn-p" href="tel:{{business.phone_digits}}">Call {{business.phone}}</a>{{/if}}\r
      {{#if business.whatsapp_digits}}<a class="btn btn-s" href="https://wa.me/{{business.whatsapp_digits}}">WhatsApp a photo of your lock</a>{{/if}}\r
    </div>\r
    </div>\r
    <dl class="spec">\r
      {{#if business.has_reviews}}\r
      <div class="hl"><dt>Google rating</dt><dd>{{business.rating}} <small>/ 5</small></dd></div>\r
      <div><dt>Reviews</dt><dd>{{#if business.reviews_linked}}<a class="spec-link" href="{{url business.google_reviews_url}}" rel="noopener">{{business.review_count}} <small>read on Google</small></a>{{/if}}{{#if business.reviews_unlinked}}{{business.review_count}}{{/if}}</dd></div>\r
      {{/if}}\r
      {{#if business.established}}<div><dt>Established</dt><dd>{{business.established}}</dd></div>{{/if}}\r
      {{#if business.postcode}}<div><dt>Based in</dt><dd>{{business.postcode}}</dd></div>{{/if}}\r
      {{#if business.hours}}<div><dt>Hours</dt><dd>{{business.hours}}</dd></div>{{/if}}\r
    </dl>\r
  </div>\r
</section>\r
\r
<!-- ============================ TRUST STRIP ============================== -->\r
<section class="trust">\r
  <div class="wrap">\r
    <ul>\r
      {{#each trust_fixed}}\r
      <li>{{#if .icon}}<span class="ico ico-{{.icon}}" aria-hidden="true"></span>{{/if}}\r
        <h3>{{.title}}</h3>{{#if .note}}<p>{{.note}}</p>{{/if}}</li>\r
      {{/each}}\r
      {{#each trust_typed}}\r
      <li>{{#if .icon}}<span class="ico ico-{{.icon}}" aria-hidden="true"></span>{{/if}}\r
        <h3>{{.title}}</h3>{{#if .note}}<p>{{.note}}</p>{{/if}}</li>\r
      {{/each}}\r
    </ul>\r
  </div>\r
</section>\r
\r
{{#if img badges}}\r
<!-- Their real directory badges, scraped by the picker. A row, not a grid of\r
     invented icons — these are marks they have actually earned. -->\r
<div class="badges"><div class="wrap badges-in">\r
  {{#each img badges}}<img class="badge" src="{{url .}}" alt="">{{/each}}\r
</div></div>\r
{{/if}}\r
\r
<!-- ======================== URGENT vs PLANNED ============================ -->\r
<section class="lanes">\r
  <div class="lane lane-now">\r
    <!-- ⛔ NO BACKGROUND PHOTOGRAPH ON THIS LANE. The one that was here read as\r
         a nightclub, and an irrelevant photograph is worse than none: it is the\r
         one band where the reader is already stressed. The slot stays wired for\r
         a RELEVANT image; it is simply not rendered in this variant. -->\r
    <div class="lane-in">\r
    <p class="eyebrow">Locked out right now</p>\r
    <h2>We can usually open it without damaging the door.</h2>\r
    <p>Call and describe the door. You will be told what it costs before anyone sets off.</p>\r
    <dl>\r
      <dt>Non-destructive entry</dt>\r
      <dd>The lock is picked or bypassed so it still works afterwards. Drilling is a last resort, and you are told first.</dd>\r
      {{#if business.response_time}}<dt>Response</dt><dd>{{business.response_time}} to most {{business.town}} addresses.</dd>{{/if}}\r
    </dl>\r
    {{#if business.phone}}\r
    <div class="btn-row"><a class="btn btn-p" href="tel:{{business.phone_digits}}">Call {{business.phone}}</a></div>\r
    {{/if}}\r
    </div>\r
  </div>\r
  <div class="lane lane-plan">\r
    <p class="eyebrow on-paper">Planning a lock change</p>\r
    <h2>New locks, insurance upgrades and key control.</h2>\r
    <p>Moving in, changing a tenant, or told by your insurer to upgrade. Booked in for when it suits you.</p>\r
    <dl>\r
      <dt>BS3621 insurance standard</dt>\r
      <dd>Most home insurers ask for a British Standard lock on final exit doors. That is a specific kitemarked lock, and it can be fitted to your existing door.</dd>\r
      <dt>Price agreed before work starts</dt>\r
      <dd>You get the figure first. Nothing starts until you have agreed it.</dd>\r
    </dl>\r
    {{#if business.whatsapp_digits}}\r
    <div class="btn-row"><a class="btn btn-s" href="https://wa.me/{{business.whatsapp_digits}}">Send a photo, ask for a price</a></div>\r
    {{/if}}\r
  </div>\r
</section>\r
\r
<!-- ============================== SERVICES =============================== -->\r
{{#if services}}\r
<section class="svcs pad-y">\r
  <div class="wrap">\r
    <p class="eyebrow on-paper">Services</p>\r
    <h2 class="h2">Lock and key work in {{business.town}}, done properly.</h2>\r
    {{#if img services}}\r
    <div class="svc-photo"><div class="shot"><img src="{{url img services}}" alt="" loading="lazy"></div></div>\r
    {{/if}}\r
    {{#if services_flat}}\r
    <div class="svc-list">\r
      {{#each services}}\r
      <article class="svc">\r
        <div class="svc-i">{{.index}}</div>\r
        <div>\r
          <h3 class="svc-name">{{.name}}</h3>\r
          {{#if .description}}<p class="svc-desc">{{.description}}</p>{{/if}}\r
          {{#if .price}}<p class="svc-price">{{.price}}</p>{{/if}}\r
        </div>\r
      </article>\r
      {{/each}}\r
    </div>\r
    {{/if}}\r
    {{#each service_groups}}\r
    <div class="svc-group">\r
      {{#if .label}}<h3 class="grp">{{.label}}</h3>{{/if}}\r
      <div class="svc-list">\r
        {{#each .items}}\r
        <article class="svc">\r
          <div class="svc-i">{{.index}}</div>\r
          <div>\r
            <h3 class="svc-name">{{.name}}</h3>\r
            {{#if .description}}<p class="svc-desc">{{.description}}</p>{{/if}}\r
            {{#if .price}}<p class="svc-price">{{.price}}</p>{{/if}}\r
          </div>\r
        </article>\r
        {{/each}}\r
      </div>\r
    </div>\r
    {{/each}}\r
  </div>\r
</section>\r
{{/if}}\r
\r
<div class="swoop" aria-hidden="true"></div>\r
<!-- ===================== CARDS STRADDLING A SECTION EDGE ================== -->\r
<!-- ⛔ MOVED OFF THE HERO 2026-09-11. On the hero it fought the headline and\r
     cut the photograph in half; Paul's call, and he is right — the device needs\r
     a quieter boundary. It now straddles services -> photographs, where it\r
     reads as depth rather than as clutter. Real services, real prices. -->\r
{{#if services}}\r
<div class="straddle">\r
  <div class="wrap straddle-in">\r
    {{#each services_top3}}\r
    <a class="scard" href="tel:{{business.phone_digits}}">\r
      <span class="scard-i">{{.index}}</span>\r
      <span class="scard-n">{{.name}}</span>\r
      {{#if .price}}<span class="scard-p">{{.price}}</span>{{/if}}\r
      {{#if .no_price}}<span class="scard-p muted">Ask for a price</span>{{/if}}\r
    </a>\r
    {{/each}}\r
  </div>\r
</div>\r
{{/if}}\r
\r
<!-- =============================== THE OWNER ============================= -->\r
<!-- The warmth. A name, a face and a year, in their own words. Drops entirely\r
     when owner_bio is absent — and it IS absent on most prospects, so the page\r
     has to be complete without it. Never generated; see render.mjs. -->\r
{{#if owner}}\r
<section class="owner pad-y">\r
  <div class="wrap owner-in">\r
    <!-- ⛔ THE PHOTO SLOT ALWAYS RENDERS. An empty slot shows a visible drop\r
         target rather than collapsing, so the picker has somewhere to aim and\r
         Paul can see that a photograph is missing rather than not knowing the\r
         slot exists. -->\r
    {{#if img owner}}\r
    <div class="owner-pic"><div class="shot"><img src="{{url img owner}}" alt="{{owner.name}}{{#if owner.name}}, {{/if}}{{business.trade}} at {{business.name}}"></div></div>\r
    {{/if}}\r
    {{#if img.no_owner_photo}}\r
    <div class="owner-pic"><div class="pic-empty"><span>OWNER PHOTO</span><small>drop their own picture here</small></div></div>\r
    {{/if}}\r
    <div class="owner-txt">\r
      <p class="eyebrow on-paper">Who you are calling</p>\r
      {{#if owner.name}}<h2 class="h2">{{owner.name}}</h2>{{/if}}\r
      {{#if business.no_owner_name}}<h2 class="h2">About {{business.name}}.</h2>{{/if}}\r
      <p class="owner-bio">{{owner.bio}}</p>\r
      <dl class="owner-facts">\r
        {{#if owner.years}}<div><dt>Doing this</dt><dd>{{owner.years}} years</dd></div>{{/if}}\r
        {{#if owner.established}}<div><dt>Established</dt><dd>{{owner.established}}</dd></div>{{/if}}\r
        <div><dt>Based in</dt><dd>{{business.town}}</dd></div>\r
      </dl>\r
    </div>\r
  </div>\r
</section>\r
{{/if}}\r
\r
<div class="swoop" aria-hidden="true"></div>\r
<!-- ====================== RESPONSE TIMES BY AREA ========================== -->\r
<!-- Replaced the map panel on 2026-09-11. The map needed an API, showed one\r
     dot, and was the weakest thing on the page; a town list with a realistic\r
     travel window against each is the pattern that actually works in this\r
     trade. ⛔ No time is ever invented — see area_rows in render.mjs. -->\r
{{#if area_rows}}\r
<section class="areas pad-y">\r
  <div class="wrap">\r
    <p class="eyebrow on-paper">Where we work</p>\r
    {{#if areas_timed}}<h2 class="h2">How long we usually take to reach you.</h2>{{/if}}\r
    {{#if areas_untimed}}<h2 class="h2">Areas we cover.</h2>{{/if}}\r
    <dl class="area-list">\r
      {{#each area_rows}}\r
      <div class="area-row">\r
        <dt>{{.area}}{{#if .home}} <span class="based">based here</span>{{/if}}</dt>\r
        {{#if .time}}<dd>{{.time}}</dd>{{/if}}\r
        {{#if .no_time}}<dd class="t-none">ask when you call</dd>{{/if}}\r
      </div>\r
      {{/each}}\r
    </dl>\r
    {{#if areas_timed}}<p class="area-note">Typical daytime travel times, not a guarantee &mdash; traffic and where the van already is both change it. You are told the real figure when you call.</p>{{/if}}\r
    {{#if business.postcode}}<p class="area-note">Based in {{business.town}}, {{business.postcode}}.</p>{{/if}}\r
  </div>\r
</section>\r
{{/if}}\r
\r
<div class="swoop" aria-hidden="true"></div>\r
<!-- ============================== REVIEWS ================================ -->\r
<!-- ⚠️ PLACEHOLDER COPY. Contract v1.1 forbids republishing review TEXT (a\r
     Google terms position); these are invented, and every card says so on its\r
     face until the real source is decided. Renders nothing without data. -->\r
{{#if reviews}}\r
<section class="revs pad-y">\r
  <div class="wrap">\r
    <p class="eyebrow on-paper">What people say</p>\r
    <h2 class="h2">{{#if business.has_reviews}}{{business.rating}} out of 5 across {{business.review_count}} Google reviews.{{/if}}{{#if business.no_reviews}}In their words.{{/if}}</h2>\r
    {{#if reviews_are_placeholder}}\r
    <p class="rev-flag">Placeholder text &mdash; not real customer reviews. To be replaced before this is sent to anyone.</p>\r
    {{/if}}\r
    <div class="rev-grid">\r
      {{#each reviews}}\r
      <figure class="rev-card">\r
        <div class="rev-stars"><i></i><i></i><i></i><i></i><i></i></div>\r
        <blockquote>{{.quote}}</blockquote>\r
        <figcaption>\r
          {{#if .initial}}<span class="avatar" aria-hidden="true">{{.initial}}</span>{{/if}}\r
          <span class="who">{{#if .name}}{{.name}}{{/if}}{{#if .role}}<em>{{.role}}</em>{{/if}}{{#if .place}}<em>{{.place}}</em>{{/if}}</span>\r
          {{#if .placeholder}}<span class="ph">placeholder</span>{{/if}}\r
        </figcaption>\r
      </figure>\r
      {{/each}}\r
    </div>\r
    {{#if business.google_reviews_url}}\r
    <p class="rev-more"><a href="{{url business.google_reviews_url}}" rel="noopener">Read the real ones on Google</a></p>\r
    {{/if}}\r
  </div>\r
</section>\r
{{/if}}\r
\r
<!-- =============================== PHOTOS ================================ -->\r
{{#if photos}}\r
<section class="gal pad-y">\r
  <div class="wrap">\r
    <p class="eyebrow on-paper">The work</p>\r
    {{#if has_real_photos}}<h2 class="h2">Some recent jobs around {{business.town}}.</h2>{{/if}}\r
    {{#if photos_all_stock}}<h2 class="h2">The sort of work we do most days.</h2>{{/if}}\r
    <div class="gal-grid">\r
      {{#each photos}}\r
      <figure>\r
        <div class="shot"><img src="{{url .src}}" alt="{{.alt}}" loading="lazy"></div>\r
        {{#if .caption}}<figcaption>{{.caption}}</figcaption>{{/if}}\r
        {{#if .uncaptioned}}<figcaption class="cap-none">&mdash;</figcaption>{{/if}}\r
      </figure>\r
      {{/each}}\r
    </div>\r
  </div>\r
</section>\r
{{/if}}\r
\r
<!-- =============================== PROCESS =============================== -->\r
<!-- ABLM's "How it works". Restored 2026-09-11: it was cut earlier as\r
     duplicative of the urgent lane, and against ABLM's structure it is a real\r
     section carrying 6% of the page. It is process, not a claim — every line\r
     describes what happens, none of it asserts anything about this business\r
     that is not already true of the call. -->\r
<section class="proc pad-y">\r
  <div class="wrap">\r
    <p class="eyebrow on-paper">How it works</p>\r
    <h2 class="h2">Four steps, and most of it is us.</h2>\r
    <p class="lede">Describe the door, agree the price, let someone in. That is the whole of your part.</p>\r
    <div class="proc-grid">\r
      <div class="step"><b>01</b><h3>You call and describe the door</h3><p>What kind of door, what kind of lock, and whether the key turns at all. A photo on WhatsApp saves a lot of guessing.</p></div>\r
      <div class="step"><b>02</b><h3>You get a price before anyone sets off</h3><p>A figure for the job, not an estimate that moves{{#if business.response_time}}, and how long it will be{{/if}}. If the job turns out to be different once seen, you are told and asked first.</p></div>\r
      <div class="step"><b>03</b><h3>The lock is opened or changed</h3><p>Non-destructive entry wherever the lock allows it, so you are not paying for a replacement you did not need.</p></div>\r
      <div class="step"><b>04</b><h3>You pay the figure you agreed</h3><p>The same number you were quoted on the phone. Card or cash, and a receipt if you want one.</p></div>\r
    </div>\r
  </div>\r
</section>\r
\r
<!-- =============================== PRICES ================================ -->\r
<section class="prices pad-y">\r
  {{#if img bg_prices}}<div class="secbg"><img src="{{url img bg_prices}}" alt=""></div>{{/if}}\r
  <div class="wrap">\r
    <p class="eyebrow">Prices</p>\r
    {{#if prices}}\r
    <h2 class="h2">What the common jobs cost.</h2>\r
    <dl class="price-table">\r
      {{#each prices}}\r
      <div class="price-row">\r
        <dt>{{.label}}</dt>\r
        <dd>{{.amount}}</dd>\r
        {{#if .note}}<p class="note">{{.note}}</p>{{/if}}\r
      </div>\r
      {{/each}}\r
    </dl>\r
    {{/if}}\r
    {{#if prices_none}}\r
    <h2 class="h2">You get the price before the work starts.</h2>\r
    <dl class="price-none">\r
      <div><dt>How it works</dt><dd>Describe the door and the lock on the phone. You get the figure for the job before it starts.</dd></div>\r
      {{#if fee.none}}<div><dt>No call-out fee</dt><dd>You are not charged for someone turning up and looking at it.</dd></div>{{/if}}\r
      {{#if fee.charged}}<div><dt>The call-out charge</dt><dd>Stated up front, before anyone sets off, as part of the figure for the job.</dd></div>{{/if}}\r
      {{#if fee.unknown}}<div><dt>One figure, up front</dt><dd>Whatever the job comes to, including any call-out charge, you have the number before it starts.</dd></div>{{/if}}\r
      <div><dt>Nothing starts unagreed</dt><dd>If the job turns out to be different once seen, you are told and asked before anything changes.</dd></div>\r
    </dl>\r
    {{/if}}\r
  </div>\r
</section>\r
\r
<!-- ================================ FAQ ================================== -->\r
<!-- ⛔ AN ACCORDION, AND IT NEEDS NO JAVASCRIPT. ABLM's own version is\r
     <button aria-expanded> driven by a 14KB script; we cannot copy that,\r
     because zero-JS is the rule the product sells on. <details>/<summary> gets\r
     the same behaviour natively: it collapses, it expands, and EVERY WORD stays\r
     in the initial HTML so a crawler reads all of it either way.\r
     ⚠️ Stated plainly: collapsed means a SCREENSHOT shows the questions and not\r
     the answers. ABLM's is collapsed by default too, so the before/after image\r
     matches what a visitor first sees — but it is a real consequence, not an\r
     oversight. -->\r
<section class="faq pad-y">\r
  <div class="wrap">\r
    <p class="eyebrow on-paper">Common questions</p>\r
    <h2 class="h2">The things people ask us most.</h2>\r
    <div class="faq-list">\r
      <details class="qa">\r
        <summary class="qh"><span>Is there a call-out fee?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi">{{#if fee.none}}<p>No. You are quoted for the job itself, and that is the figure you pay.</p>{{/if}}\r
          {{#if fee.charged}}<p>Yes, there is a call-out charge. You are told what it is, and the full figure for the job, before anyone sets off &mdash; so nothing on the bill is a surprise.</p>{{/if}}\r
          {{#if fee.unknown}}<p>Ask when you call. You get the full figure for the job, including any call-out charge, before anyone sets off.</p>{{/if}}</div></div>\r
      </details>\r
      <details class="qa">\r
        <summary class="qh"><span>What is BS3621 and do I need it?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi"><p>It is the British Standard for a door lock, and most home insurers ask for one on final exit doors. Check your policy wording. It can usually be fitted to the door you already have.</p></div></div>\r
      </details>\r
      <details class="qa">\r
        <summary class="qh"><span>My uPVC door will not lock. Is that the lock?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi"><p>Usually it is the multipoint mechanism inside the door rather than the cylinder you put the key in. It is a common repair and it does not mean a new door.</p></div></div>\r
      </details>\r
      <details class="qa">\r
        <summary class="qh"><span>I have just moved in. Should I change the locks?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi"><p>You do not know who still has a key. Changing the cylinder is cheaper than changing the whole lock and takes the old keys out of use.</p></div></div>\r
      </details>\r
      <details class="qa">\r
        <summary class="qh"><span>Will you have to drill my lock?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi"><p>Usually not. Most locks open without damage, which means the lock still works once you are back inside. If drilling turns out to be the only way, you are told before it happens and told what a replacement costs.</p></div></div>\r
      </details>\r
      <details class="qa">\r
        <summary class="qh"><span>My key snapped in the lock. Is the lock ruined?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi"><p>Not normally. A snapped key can usually be extracted and the lock kept, as long as the mechanism itself has not been damaged. Trying to dig it out with pliers is what usually turns a cheap job into a replacement.</p></div></div>\r
      </details>\r
      <details class="qa">\r
        <summary class="qh"><span>What is anti-snap, and do I need it?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi"><p>Standard euro cylinders can be snapped in seconds, which is how a lot of break-ins happen on uPVC and composite doors. An anti-snap cylinder is built to break in a controlled place and keep the door shut. If your door is uPVC or composite and the cylinder is more than a few years old, it is worth asking about.</p></div></div>\r
      </details>\r
      <details class="qa">\r
        <summary class="qh"><span>How soon can you get here?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi"><p>It depends where you are and where the van already is. There is a town-by-town list further up this page, and you get a real figure when you call rather than a promise made in advance. If someone quotes you a time before asking where you are, treat it carefully.</p></div></div>\r
      </details>\r
      <details class="qa">\r
        <summary class="qh"><span>Can you get into a uPVC door without breaking it?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi"><p>Usually, yes. Most uPVC doors open by manipulating the cylinder or the mechanism rather than by force. Where the gearbox has already failed completely the door sometimes has to be opened destructively, but that is the exception and you are told before it happens.</p></div></div>\r
      </details>\r
      <details class="qa">\r
        <summary class="qh"><span>Do I need to be there?</span><i aria-hidden="true"></i></summary>\r
        <div class="qb"><div class="qbi"><p>Yes, and you will be asked to prove the property is yours &mdash; a tenancy agreement, a utility bill, a driving licence with the address. Any locksmith who opens a door without asking is one to avoid.</p></div></div>\r
      </details>\r
    </div>\r
  </div>\r
</section>\r
\r
<div class="swoop" aria-hidden="true"></div>\r
<!-- =============================== CONTACT =============================== -->\r
<section class="contact pad-y">\r
  {{#if img bg_contact}}<div class="secbg"><img src="{{url img bg_contact}}" alt=""></div>{{/if}}\r
  <div class="wrap">\r
    <p class="eyebrow">Get in touch</p>\r
    <h2 class="h2">{{#if business.owner_first_name}}Ask for {{business.owner_first_name}}.{{/if}}{{#if business.no_owner_name}}Call {{business.name}}.{{/if}}</h2>\r
    <dl class="c-grid">\r
      {{#if business.phone}}<div><dt>Phone</dt><dd class="c-tel"><a href="tel:{{business.phone_digits}}">{{business.phone}}</a></dd></div>{{/if}}\r
      {{#if business.whatsapp_digits}}<div><dt>WhatsApp</dt><dd><a href="https://wa.me/{{business.whatsapp_digits}}">Send a photo of the lock</a></dd></div>{{/if}}\r
      {{#if business.address}}<div><dt>Address</dt><dd>{{business.address}}</dd></div>{{/if}}\r
      {{#if business.email}}<div><dt>Email</dt><dd><a href="mailto:{{business.email}}">{{business.email}}</a></dd></div>{{/if}}\r
      {{#if business.hours}}<div><dt>Hours</dt><dd>{{business.hours}}</dd></div>{{/if}}\r
      {{#if areas_line}}<div><dt>Areas covered</dt><dd>{{business.town}}, {{areas_line}}</dd></div>{{/if}}\r
    </dl>\r
  </div>\r
</section>\r
\r
<footer>\r
  <div class="wrap f-in">\r
    <span class="f-name">{{business.name}}</span>\r
    <span>{{business.trade}} in {{business.town}}{{#if business.postcode}} &middot; {{business.postcode}}{{/if}}</span>\r
    <span>&copy; {{year}} {{business.name}}</span>\r
  </div>\r
</footer>\r
\r
<!-- ========================= STICKY CALL BAR ============================= -->\r
{{#if business.phone}}\r
<div class="callbar">\r
  <a class="cb-call" href="tel:{{business.phone_digits}}">Call now</a>\r
  {{#if business.whatsapp_digits}}<a class="cb-wa" href="https://wa.me/{{business.whatsapp_digits}}">WhatsApp</a>{{/if}}\r
</div>\r
{{/if}}\r
</template>\r
`,bt={locksmith:ft},de=e=>typeof e=="number"?`${(e*100).toFixed(2)}p`:"—";function vt(){const{data:e,isLoading:t,refetch:r,isFetching:o}=De();return a.jsxs("div",{className:"mx-auto max-w-5xl space-y-4 p-4 sm:p-6",children:[a.jsx(he,{icon:q,tone:"purple",title:"Mockups waiting",subtitle:"Created automatically when a prospect replies to the opener. Nothing here has been sent.",actions:a.jsxs(T,{variant:"outline",size:"sm",onClick:()=>r(),disabled:o,children:[o?a.jsx(M,{className:"mr-2 h-4 w-4 animate-spin"}):a.jsx(ge,{className:"mr-2 h-4 w-4"}),"Refresh"]})}),t?a.jsx(me,{}):e!=null&&e.length?a.jsx("div",{className:"divide-y overflow-hidden rounded-2xl border border-border/70 bg-card",children:e.map(i=>a.jsxs(H,{to:`/mockups/${i.id}`,className:"flex flex-wrap items-center gap-x-4 gap-y-2 p-3 hover:bg-muted/50",children:[a.jsxs("div",{className:"min-w-0 flex-1",children:[a.jsx("div",{className:"truncate font-medium",children:i.business}),a.jsxs("div",{className:"text-xs text-muted-foreground",children:[i.niche," · ",new Date(i.created_at).toLocaleDateString("en-GB")]})]}),a.jsxs("div",{className:"flex min-w-0 flex-wrap items-center gap-2 text-xs",children:[i.scraped?a.jsxs(D,{tone:"grey",children:[i.services," services · ",i.areas," areas"]}):a.jsx(D,{tone:"amber",children:"site not read yet"}),i.pooled?a.jsxs(D,{tone:"grey",children:[i.pool_size," photos"]}):a.jsx(D,{tone:"amber",children:"no photos yet"}),a.jsxs(D,{tone:i.placed?"green":"grey",children:[i.placed," placed"]})]})]},i.id))}):a.jsx(ue,{icon:q,tone:"purple",title:"No mockups waiting.",children:"One is prepared when a prospect replies to your opener and their trade has a template."})]})}function xt({id:e}){var K,$,Q,Z,X,J,ee,te;const{toast:t}=Oe(),{data:r,isLoading:o}=Me(e),{pool:i,place:p,saveServices:s,refill:d,shoot:m}=qe(e),c=(r==null?void 0:r.mockup)??null,h=(c==null?void 0:c.content)??{},y=(r==null?void 0:r.slot_urls)??{},b=bt[String((c==null?void 0:c.template)??"")]??"",E=A.useMemo(()=>b?Je(b):[],[b]),w=A.useMemo(()=>Ue(c==null?void 0:c.template),[c==null?void 0:c.template]),S=A.useMemo(()=>{if(!b||!c)return{html:"",error:""};try{const n=ut(h,(r==null?void 0:r.lead)??null,y);return{html:et(b,"home",lt(n)),error:""}}catch(n){return{html:"",error:n instanceof ye||(n==null?void 0:n.name)==="MissingRequired"?n.message:`render failed: ${(n==null?void 0:n.message)??"unknown"}`}}},[b,c,h,r==null?void 0:r.lead,y]),R=Array.isArray(h.pool)?h.pool:[],l=A.useMemo(()=>{var k;const n=[],g=[];for(const u of R){const C=xe({url:u.url,alt:u.alt??null,width:u.width??null},(k=h.business)==null?void 0:k.name);C.kind==="photo"?n.push(u):g.push({...u,kind:C.kind,why:C.reason,iffy:C.uncertain})}return{photos:n,marks:g}},[R,(K=h.business)==null?void 0:K.name]),v=l.photos,Ee=h.slots??{},Ae=h.services_confirmed??(($=h.scrape)==null?void 0:$.services)??[],[N,I]=A.useState([]),[Y,_]=A.useState(!1);A.useEffect(()=>{I(Ae.map(n=>({...n}))),_(!1)},[c==null?void 0:c.id,h.services_confirmed,(Q=h.scrape)==null?void 0:Q.at]);const[Te,j]=A.useState(null),z=(n,g)=>{p.mutate({slot:n,...g},{onError:k=>t({title:"Could not place that",description:k.message,variant:"destructive"})})};if(o)return a.jsx(me,{});if(!c)return a.jsx("div",{className:"mx-auto max-w-xl p-4 sm:p-6",children:a.jsx(ue,{icon:q,tone:"purple",title:"Mockup not found.",action:a.jsx(T,{asChild:!0,size:"sm",variant:"outline",children:a.jsx(H,{to:"/mockups",children:"Back to the list"})})})});const V=h.business??{};return a.jsxs("div",{className:"mx-auto max-w-6xl p-4 sm:p-6",children:[a.jsx(H,{to:"/mockups",className:"text-sm text-muted-foreground hover:underline",children:"← Mockups waiting"}),a.jsx("div",{className:"mt-2",children:a.jsx(he,{icon:q,tone:"purple",title:String(V.name??"(unnamed)"),subtitle:a.jsxs(a.Fragment,{children:[c.template," · ",V.town??"no town"," · status ",a.jsx("b",{children:c.status}),h.current_site_url&&a.jsxs(a.Fragment,{children:[" · ",a.jsxs("a",{href:h.current_site_url,target:"_blank",rel:"noopener noreferrer",className:"underline",children:["their site ",a.jsx(_e,{className:"inline h-3 w-3"})]})]})]}),actions:a.jsxs(a.Fragment,{children:[a.jsxs(T,{variant:"outline",size:"sm",onClick:()=>d.mutate(),disabled:d.isPending,children:[d.isPending?a.jsx(M,{className:"mr-2 h-4 w-4 animate-spin"}):a.jsx(ge,{className:"mr-2 h-4 w-4"}),"Re-read their site"]}),a.jsxs(T,{size:"sm",onClick:()=>i.mutate(b,{onSuccess:n=>t({title:`${n.counts.merged} photos`,description:`${n.counts.maps} from Maps, ${n.counts.own_site} from their site · cost ${de((n.cost_usd.maps??0)+(n.cost_usd.vision??0))}`+(n.errors.maps?` · Maps: ${n.errors.maps}`:"")}),onError:n=>t({title:"Could not gather photos",description:n.message,variant:"destructive"})}),disabled:i.isPending||!b,children:[i.isPending?a.jsx(M,{className:"mr-2 h-4 w-4 animate-spin"}):null,v.length?"Re-gather photos":"Gather photos",(Z=i.data)!=null&&Z.cost_usd?` · ~${de((i.data.cost_usd.maps??0)+(i.data.cost_usd.vision??0))}`:""]})]})})}),!b&&a.jsxs(re,{tone:"amber",className:"mt-4",children:["No template file for niche ",a.jsx("b",{children:c.template}),", so this screen cannot know which image slots exist. Add ",a.jsxs("code",{className:"break-all",children:["src/mockup/templates/",c.template,".html"]})," and a registry row."]}),a.jsxs("h2",{className:"mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground",children:["Their website today",h.current_site_url?a.jsxs("span",{className:"font-normal normal-case text-muted-foreground",children:[" — ",(()=>{try{return new URL(String(h.current_site_url)).hostname.replace(/^www\./,"")}catch{return""}})()]}):null]}),a.jsx("div",{className:"mt-2 overflow-hidden rounded-md border",children:r!=null&&r.current_site_url?a.jsx("img",{src:r.current_site_url,alt:"Their website as it is today",className:"block w-full"}):a.jsxs("div",{className:"flex items-center justify-between gap-3 p-3 text-sm text-muted-foreground",children:[a.jsx("span",{children:"No screenshot of their site yet."}),a.jsxs(T,{size:"sm",variant:"outline",onClick:()=>m.mutate(),disabled:m.isPending,children:[m.isPending?a.jsx(M,{className:"mr-2 h-3 w-3 animate-spin"}):null,"Photograph their site"]})]})}),a.jsx("h2",{className:"mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground",children:"What we would build"}),S.error?a.jsx(re,{tone:"red",className:"mt-2",children:S.error}):S.html?a.jsx("div",{className:"mt-2 overflow-hidden rounded-md border",children:a.jsx("iframe",{title:"Mockup preview",sandbox:"",className:"h-[560px] w-full border-0 bg-white",srcDoc:`<!doctype html><html><head><meta charset="utf-8"><base href="/"></head><body style="margin:0">${S.html}</body></html>`})}):null,a.jsxs("h2",{className:"mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground",children:["Slots this template asks for (",E.length,")"]}),!b&&a.jsxs("p",{className:"mt-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground",children:["No template for ",a.jsx("span",{className:"font-medium",children:String((c==null?void 0:c.template)??"this trade")})," yet, so there are no slots to fill and nothing to send. Adding one is a template file plus a registry row — no code change."]}),a.jsx("div",{className:"mt-2 grid gap-3",style:{gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))"},children:E.map(n=>{const g=Ee[n],k=Fe(n);return a.jsxs("div",{onDragOver:u=>{u.preventDefault()},onDrop:u=>{u.preventDefault();const C=u.dataTransfer.getData("text/uri-list")||u.dataTransfer.getData("text/plain"),ae=u.dataTransfer.getData("application/x-stock-id");if(ae){z(n,{stock_id:ae});return}C&&z(n,{url:C}),j(null)},className:`rounded-lg border-2 p-2 ${Te?"border-dashed border-primary/60 bg-primary/5":"border-border"}`,children:[a.jsxs("div",{className:"mb-1 flex items-center justify-between",children:[a.jsx("span",{className:"text-sm font-semibold",children:n}),g&&a.jsx("button",{title:"Clear",onClick:()=>z(n,{clear:!0}),className:"text-muted-foreground hover:text-destructive",children:a.jsx(Re,{className:"h-3.5 w-3.5"})})]}),g?a.jsxs("div",{children:[a.jsx("img",{src:g.kind==="stock"?g.path:y[n]??"",alt:"",className:"h-28 w-full rounded object-cover",referrerPolicy:"no-referrer"}),a.jsx("p",{className:"mt-1 text-[11px] text-muted-foreground",children:g.kind==="stock"?"STOCK":g.source==="maps"?"Google Maps":g.source==="own_site"?"their site":g.source})]}):a.jsxs("div",{className:"flex h-28 flex-col items-center justify-center gap-1 rounded bg-muted/50 text-center text-[11px] text-muted-foreground",children:[a.jsx(Le,{className:"h-4 w-4"}),a.jsx("span",{children:"drag a photo here"}),!k&&a.jsxs("span",{className:"px-2 font-medium text-amber-700",children:["real photo or none — no stock in ",n]})]})]},n)})}),l.marks.length>0&&a.jsxs(a.Fragment,{children:[a.jsxs("h2",{className:"mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground",children:["Logo and badges (",l.marks.length,")"]}),a.jsx("p",{className:"mt-1 text-xs text-muted-foreground",children:"Their own logo and any directory badges we found on their site. These carry credential proof nothing else here can source — drag them to the logo or badge slots, never a hero."}),a.jsx("div",{className:"mt-2 grid gap-2",style:{gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))"},children:l.marks.map(n=>a.jsxs("figure",{draggable:!0,onDragStart:g=>{g.dataTransfer.setData("text/uri-list",n.url),g.dataTransfer.setData("text/plain",n.url),g.dataTransfer.effectAllowed="copy",j(n.url)},onDragEnd:()=>j(null),className:"m-0 cursor-grab overflow-hidden rounded-lg border-2 border-border active:cursor-grabbing",title:n.why,children:[a.jsx("img",{src:n.thumb||n.url,alt:"",loading:"lazy",referrerPolicy:"no-referrer",className:"h-24 w-full bg-white object-contain p-1"}),a.jsxs("figcaption",{className:"px-1.5 py-1 text-[10.5px] leading-tight",children:[a.jsx("span",{className:`font-semibold ${n.kind==="logo"?"text-sky-700":"text-emerald-700"}`,children:n.kind==="logo"?"their logo":"badge"}),a.jsxs("span",{className:"text-muted-foreground",children:[" · ",n.why]}),n.iffy&&a.jsx("span",{className:"block text-amber-700",children:"check this one"})]})]},n.url))})]}),a.jsxs("h2",{className:"mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground",children:["Photos (",v.length,") — best first",h.pool_at?` · gathered ${new Date(h.pool_at).toLocaleString("en-GB")}`:""]}),v.length?a.jsx("div",{className:"mt-2 grid gap-2",style:{gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))"},children:v.map(n=>a.jsxs("figure",{draggable:!0,onDragStart:g=>{g.dataTransfer.setData("text/uri-list",n.url),g.dataTransfer.setData("text/plain",n.url),g.dataTransfer.effectAllowed="copy",j(n.url)},onDragEnd:()=>j(null),className:`m-0 cursor-grab overflow-hidden rounded-lg border-2 active:cursor-grabbing ${n.demoted?"border-border opacity-50":"border-border"}`,title:n.demoted??`quality ${n.quality??"?"}`,children:[a.jsx("img",{src:n.thumb||n.url,alt:"",loading:"lazy",referrerPolicy:"no-referrer",className:"h-24 w-full bg-muted object-cover"}),a.jsxs("figcaption",{className:"px-1.5 py-1 text-[10.5px] leading-tight",children:[a.jsx("span",{className:"font-semibold",children:n.source==="maps"?"Maps":n.source==="own_site"?"their site":n.source}),typeof n.quality=="number"&&a.jsxs("span",{className:"text-muted-foreground",children:[" · q",n.quality]}),n.fit&&Object.entries(n.fit).filter(([,g])=>g>=50).map(([g,k])=>a.jsxs("span",{className:"ml-1 rounded bg-green-100 px-1 text-green-900",children:[g," ",k]},g)),n.demoted&&a.jsx("span",{className:"block text-amber-700",children:n.demoted})]})]},n.url))}):a.jsxs("p",{className:"mt-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground",children:["No photos gathered yet. Press ",a.jsx("b",{children:"Gather photos"})," — Google Maps first, their own site as well."]}),a.jsxs("h2",{className:"mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground",children:["Stock (",w.length,") — below the fold only, never the hero"]}),a.jsx("p",{className:"mt-1 text-xs text-muted-foreground",children:"One curated set, reused every build. Captions stay generic and true — never their own work, never a place name."}),a.jsx("div",{className:"mt-2 grid gap-2",style:{gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))"},children:w.map(n=>a.jsxs("figure",{draggable:!0,onDragStart:g=>{g.dataTransfer.setData("application/x-stock-id",n.id),g.dataTransfer.effectAllowed="copy"},className:"m-0 cursor-grab overflow-hidden rounded-lg border-2 border-dashed border-border active:cursor-grabbing",title:n.alt,children:[a.jsx("img",{src:n.path,alt:n.alt,className:"h-24 w-full bg-muted object-cover"}),a.jsx("figcaption",{className:"px-1.5 py-1 text-[10.5px] text-muted-foreground",children:n.caption??n.alt})]},n.id))}),a.jsxs("div",{className:"mt-8 flex items-center justify-between",children:[a.jsxs("h2",{className:"text-xs font-semibold uppercase tracking-wide text-muted-foreground",children:["Services (",N.length,") — the template shows the first ",ze]}),a.jsxs(T,{size:"sm",variant:Y?"default":"outline",disabled:!Y||s.isPending,onClick:()=>s.mutate(N,{onSuccess:()=>{_(!1),t({title:"Services saved"})},onError:n=>t({title:"Could not save",description:n.message,variant:"destructive"})}),children:[s.isPending?a.jsx(M,{className:"mr-2 h-4 w-4 animate-spin"}):null,"Save services"]})]}),!h.scrape&&a.jsx("p",{className:"mt-1 text-xs text-amber-700",children:"Their site has not been read yet — press “Re-read their site”."}),a.jsxs("div",{className:"mt-2 space-y-2",children:[N.map((n,g)=>a.jsxs("div",{className:"flex gap-2",children:[a.jsx(ne,{value:n.name,placeholder:"Service name",onChange:k=>{const u=[...N];u[g]={...u[g],name:k.target.value},I(u),_(!0)}}),a.jsx(ne,{value:n.price??"",placeholder:"Price (optional)",className:"w-40",onChange:k=>{const u=[...N];u[g]={...u[g],price:k.target.value},I(u),_(!0)}}),a.jsx(T,{variant:"ghost",size:"icon",onClick:()=>{I(N.filter((k,u)=>u!==g)),_(!0)},children:a.jsx(Ie,{className:"h-4 w-4"})})]},g)),a.jsxs(T,{variant:"outline",size:"sm",onClick:()=>{I([...N,{name:""}]),_(!0)},children:[a.jsx(je,{className:"mr-2 h-4 w-4"}),"Add a service"]})]}),a.jsxs("h2",{className:"mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground",children:["Areas (",((J=(X=h.scrape)==null?void 0:X.areas)==null?void 0:J.length)??0,") — the template shows the first ",Pe]}),a.jsx("p",{className:"mt-1 text-sm",children:(te=(ee=h.scrape)==null?void 0:ee.areas)!=null&&te.length?h.scrape.areas.join(" · "):a.jsx("span",{className:"text-muted-foreground",children:"Their site names no areas. The template drops that section entirely."})})]})}function kt(){const{id:e}=Ce();return e?a.jsx(xt,{id:e}):a.jsx(vt,{})}export{kt as default};
//# sourceMappingURL=Mockups-Dt7ZaKcw.js.map
