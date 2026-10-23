import{c as o}from"./index-DqyojbXq.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=o("Mic",[["path",{d:"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z",key:"131961"}],["path",{d:"M19 10v2a7 7 0 0 1-14 0v-2",key:"1vc78b"}],["line",{x1:"12",x2:"12",y1:"19",y2:"22",key:"x3vr5v"}]]),d="TEAM",M="TEAM TEMPLATES",m="MY TEMPLATES",r=e=>(e==null?void 0:e.scope)==="team",i=e=>!!(e!=null&&e.archived_at);function u(e,a){const c=e.filter(t=>r(t)&&!i(t)).sort((t,s)=>(t.sort_order??0)-(s.sort_order??0)||String(t.created_at??"").localeCompare(String(s.created_at??""))),n=e.filter(t=>!r(t)&&!!a&&t.user_id===a);return{team:c,mine:n}}function T(e,a){return r(e)?a.isAdmin===!0:!!a.userId&&e.user_id===a.userId}function A(e){return{title:`${e.title} (my copy)`,content:e.content,category:e.category,template_type:e.template_type,scope:"personal"}}export{m as M,M as T,r as a,d as b,l as c,T as d,A as e,i,u as s};
//# sourceMappingURL=teamTemplates-9N9Yg5J7.js.map
