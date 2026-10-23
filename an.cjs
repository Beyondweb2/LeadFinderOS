const fs=require('fs');
for (const f of fs.readdirSync('dist-map/assets').filter(f=>/^(index|statusFilter|serviceScope|twilio|aiAuditReportDownload)-.*\.js\.map$/.test(f))){
 const m=JSON.parse(fs.readFileSync('dist-map/assets/'+f));
 const g={};
 m.sources.forEach((s,i)=>{const c=(m.sourcesContent&&m.sourcesContent[i]||'').length;
  let k=s.replace(/^(\.\.\/)+/,'');
  const mm=k.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  k=mm?'pkg:'+mm[1]:(k.match(/^src\/[^/]+(\/[^/]+)?/)||[k])[0];
  g[k]=(g[k]||0)+c;});
 console.log('==',f);
 Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,14).forEach(([k,v])=>console.log((v/1024).toFixed(0)+'KB',k));
}
