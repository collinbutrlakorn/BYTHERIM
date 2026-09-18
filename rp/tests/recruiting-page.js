// Covers the recruiting page: that a failed or empty sheet produces a
// visible message instead of a blank page, that school logos resolve
// through the alias table, and that the dashboard renders quickly.
const fs=require("fs"),vm=require("vm"),path=require("path");const {JSDOM}=require("jsdom");
const RECRUITING = path.join(__dirname, '..', '..', 'recruiting');
function ok(c,m){if(!c)throw new Error("FAILED: "+m);console.log("OK: "+m);}
const html=fs.readFileSync(path.join(RECRUITING,'index.html'),'utf8');
// --- error path: sheet unreachable ---
const d1=new JSDOM(html,{url:"http://localhost/recruiting/",runScripts:"outside-only"});
const w1=d1.window,c1=vm.createContext(w1);
w1.Papa={parse:(url,opts)=>{ opts.error(new Error("network")); }};
w1.alert=()=>{};
vm.runInContext(fs.readFileSync(path.join(RECRUITING,'app.js'),'utf8'),c1,{filename:'app.js'});
w1.onload();
const ls=w1.document.getElementById('loadState');
ok(!!ls,'a load-state element is created');
ok(/Recruiting data unavailable/.test(ls.innerHTML),'unreachable sheet shows a visible error');
ok(ls.className.includes('load-error'),'error styling applied');

// --- empty sheet ---
const d2=new JSDOM(html,{url:"http://localhost/recruiting/",runScripts:"outside-only"});
const w2=d2.window,c2=vm.createContext(w2);
w2.Papa={parse:(url,opts)=>{ opts.complete({data:[]}); }};
w2.alert=()=>{};
vm.runInContext(fs.readFileSync(path.join(RECRUITING,'app.js'),'utf8'),c2,{filename:'app.js'});
w2.onload();
ok(/contained no rows/.test(w2.document.getElementById('loadState').innerHTML),'empty sheet is reported clearly');

// --- happy path with real-shaped rows ---
const d3=new JSDOM(html,{url:"http://localhost/recruiting/",runScripts:"outside-only"});
const w3=d3.window,c3=vm.createContext(w3);
const rows=[];
for(let i=0;i<40;i++) rows.push({id:"r"+i,rank:String(i+1),classYear:"2029",name:"Recruit "+i,
  pos:["PG","SG","SF","PF","C"][i%5],height:"6'6\"",weight:"200 lbs",state:"NC",hometown:"Raleigh, NC",
  stars:"4",rating:String(95-i*0.5|0),status:i%3?"Committed":"Uncommitted",
  committedSchool:i%3?"Texas Christian":"",hs:"Prep",
  hs_gp:"25",hs_ppg:String(20-i*0.2),hs_rpg:"8",hs_apg:"3",hs_usg:"25%",hs_bpm:"9.0",hs_ts:"58%",
  aau_gp:"20",aau_ppg:String(15-i*0.15),aau_rpg:"7",aau_apg:"2.5",aau_usg:"22%"});
w3.Papa={parse:(url,opts)=>{ opts.complete({data:rows}); }};
w3.alert=()=>{};
vm.runInContext(fs.readFileSync(path.join(RECRUITING,'app.js'),'utf8'),c3,{filename:'app.js'});
const t0=Date.now(); w3.onload(); const ms=Date.now()-t0;
ok(w3.document.getElementById('loadState').style.display==='none','load state clears on success');
const ev=(expr)=>vm.runInContext(expr,c3);
ok(ev('recruits.length')===40,'all recruits parsed: '+ev('recruits.length'));
ok(ev('recruits[0].stats.hs.ppg')>0,'per-tier HS stats parsed');
ok(ev('recruits[0].stats.aau.ppg')>0,'per-tier AAU stats parsed');
ok(ev("getSchoolLogoPath('Texas Christian')").includes('tcu.png'),'logo alias resolves Texas Christian -> tcu.png');
ok(ev("getSchoolLogoPath('Georgia Tech')").includes('gtech.png'),'Georgia Tech -> gtech.png');
ok(ev("generateSchoolBadge('Some Small College')").startsWith('data:image/svg+xml'),'badge fallback generates an image');
console.log("   render time for 40 recruits: "+ms+"ms");
ok(ms<4000,'dashboard renders quickly');
console.log("\nRecruiting page verified.");
