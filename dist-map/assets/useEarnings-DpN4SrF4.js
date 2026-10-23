import{aH as a,aB as r,a4 as u}from"./index-DqyojbXq.js";const i=(e,s)=>["sales-earnings",e??null,s];function m(e="me",s=!0){const{role:n}=a();return r({queryKey:i(n,n==="admin"?e:"me"),enabled:!!n&&s,staleTime:6e4,refetchOnWindowFocus:!0,queryFn:()=>u("sales-earnings",{mode:"summary",person:n==="admin"?e:"me"})})}export{m as u};
//# sourceMappingURL=useEarnings-DpN4SrF4.js.map
