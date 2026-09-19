// Covers the recruiting page's chrome: the universal BYTHERIM header and
// footer are present and point at the right paths, the section masthead
// leads with the recruiting logo, the accent is sampled from that logo
// rather than the NCAA RP's blue, and school marks are shown uncropped.
const fs=require("fs"),vm=require("vm"),path=require("path");const {JSDOM}=require("jsdom");
function ok(c,m){if(!c)throw new Error("FAILED: "+m);console.log("OK: "+m);}
const R=path.join(__dirname,'..','..','recruiting')+'/';
const html=fs.readFileSync(R+'index.html','utf8');
const css=fs.readFileSync(R+'style.css','utf8');
const main=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');

// --- universal header matches the main site ---
['podcast.html','draft.html','nba.html','about.html'].forEach(p=>{
  ok(html.includes('../'+p),`universal nav links ${p} (path stepped up one level)`);});
ok(html.includes('href="../rp/"'),'links to the RP sim');
ok(html.includes('href="../"'),'BYTHERIM logo returns to the site home');
const mainLinks=(main.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)||[''])[0];
const mainItems=(mainLinks.match(/>([A-Za-z ]+)</g)||[]).map(x=>x.slice(1,-1).trim()).filter(Boolean);
const ourNav=(html.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)||[''])[0];
const missing=mainItems.filter(t=>t&&!ourNav.includes(t));
ok(missing.length===0,'every main-site nav item present: '+mainItems.join(', '));

// --- logo.png moved out of the recruiting header ---
const recHeader=(html.match(/<div class="recruiting-header">[\s\S]*?<\/div>\s*<\/div>/)||[''])[0];
ok(!recHeader.includes('logo.png')||recHeader.includes('recruitingrplogo'),'main logo no longer sits in the recruiting header');
ok(html.indexOf('class="navbar"')<html.indexOf('recruiting-header'),'universal header sits above the section header');

// --- recruiting logo large and left ---
ok(html.includes('recruiting-logo-img'),'recruiting logo has its own class');
ok(/\.recruiting-logo-img\s*\{[^}]*height:\s*76px/.test(css),'recruiting logo rendered large (76px)');
ok(/\.recruiting-header\s*\{[^}]*display:\s*flex/.test(css),'section header is a flex row');
ok(/\.recruiting-nav\s*\{[^}]*margin-left:\s*auto/.test(css),'tabs pushed right, logo anchored left');

// --- accent from the recruiting logo, not the NCAA RP ---
ok(css.includes('--accent: #F0761F'),'accent is the logo orange');
ok(!css.includes('--accent: #4FAEF5'),'NCAA RP blue no longer used as the accent');
ok(css.includes('rgba(240, 118, 31'),'soft accent derived from the same orange');
ok(css.includes('--accent: #C04E00'),'light theme uses a darker orange for contrast');

// --- school logos uncropped ---
ok(/\.school-logo,[\s\S]{0,140}object-fit:\s*contain/.test(css),'school logos use contain, not cover');
ok(/\.school-logo,[\s\S]{0,140}border-radius:\s*0/.test(css),'school logos are no longer circles');
ok(/\.player-avatar-sm\s*\{[^}]*border-radius:\s*50%/.test(css),'player avatars stay circular');

// --- footer ---
ok(html.includes('footer-container')&&html.includes('footer-bottom'),'universal footer present');
ok(html.includes('footerYear'),'footer year is set dynamically');

// --- page still boots ---
const d=new JSDOM(html,{url:"http://localhost/recruiting/",runScripts:"outside-only"});
const w=d.window,c=vm.createContext(w);
const store={};
Object.defineProperty(w,'localStorage',{value:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;},removeItem:k=>{}},configurable:true});
w.Papa={parse:(u,o)=>o.complete({data:[{id:"1",name:"Test",pos:"C",rank:"1",classYear:"2029",rating:"95",status:"Committed",committedSchool:"Duke",hs_gp:"20",hs_ppg:"18"}]})};
w.alert=()=>{};
vm.runInContext(fs.readFileSync(R+'app.js','utf8'),c,{filename:'app.js'});
w.onload();
ok(vm.runInContext('recruits.length',c)===1,'page still parses recruits after the restructure');
vm.runInContext('toggleTheme()',c);
ok(w.document.documentElement.getAttribute('data-theme')==='light','theme toggle still works from the new header');
console.log("\nHeader, footer and branding verified.");
