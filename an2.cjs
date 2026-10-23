const fs=require('fs');
const m=JSON.parse(fs.readFileSync('dist-map/assets/'+fs.readdirSync('dist-map/assets').find(f=>/^index-.*\.js\.map$/.test(f))));
let pk=0,src=0;const big=[];
m.sources.forEach((s,i)=>{const c=(m.sourcesContent[i]||'').length;if(/node_modules/.test(s))pk+=c;else{src+=c;big.push([c,s.replace(/^(\.\.\/)+/,'')]);}});
console.log('pkg',(pk/1024|0),'KB src',(src/1024|0),'KB');
big.sort((a,b)=>b[0]-a[0]).slice(0,25).forEach(([c,s])=>console.log((c/1024|0)+'KB',s));
