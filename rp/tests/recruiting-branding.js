// Covers the recruiting page's chrome: the shared BYTHERIM header and
// footer (assets/chrome.css + site.js, same as every other page), the
// section masthead
// leads with the recruiting logo, the accent is sampled from that logo
// rather than the NCAA RP's blue, and school marks are shown uncropped.
const fs=require("fs"),vm=require("vm"),path=require("path");const {JSDOM}=require("jsdom");
function ok(c,m){if(!c)throw new Error("FAILED: "+m);console.log("OK: "+m);}
const R=path.join(__dirname,'..','..','recruiting')+'/';
const html=fs.readFileSync(R+'index.html','utf8');
const css=fs.readFileSync(R+'style.css','utf8');
// The main site's header is generated from CONFIG.nav in assets/site.js.
const siteJs=fs.readFileSync(path.join(__dirname,'..','..','assets','site.js'),'utf8');

// --- shared header and footer, same as the rest of the site ---
ok(html.includes('href="../assets/chrome.css"')&&html.includes('src="../assets/site.js"'),'loads the shared header and footer');
ok(html.indexOf('../assets/chrome.css')<html.indexOf('href="style.css"'),'shared chrome loads before the recruiting styles');
ok(html.includes("BTR.mount('rp', { base: '../' })"),'header mounted with a ../ base path, under BYTHERIM RP');
ok(html.indexOf("BTR.mount(")<html.indexOf('recruiting-header'),'site header sits above the section masthead');
ok(!html.includes('class="navbar"')&&!html.includes('class="footer"')&&!html.includes('footerYear'),'old hand-copied header and footer removed');
ok(!html.includes('bytherim-recruiting-theme')&&!html.includes('toggleTheme'),'no separate theme switch; the site header button owns it');
const navBlock=(siteJs.match(/nav:\s*\[([\s\S]*?)\]/)||['',''])[1];
ok([...navBlock.matchAll(/label:\s*'([^']+)'/g)].length>=4,'main-site nav comes from assets/site.js');
// Host-page rules for bare header/nav elements can't reach the shared header.
const chrome=fs.readFileSync(path.join(__dirname,'..','..','assets','chrome.css'),'utf8');
ok(/\.site-header\s*\{\s*display:\s*block;\s*padding:\s*0/.test(chrome),'chrome.css resets padding/layout a page might put on <header>');

// --- About tab removed (the main site has one); its dead feedback form too ---
ok(!/switchTab\('about'\)/.test(html)&&!html.includes('about-tab'),'no About Me tab');
ok(!html.includes('feedback-form'),'feedback form (which never sent anywhere) removed');

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

// --- page still boots ---
const d=new JSDOM(html,{url:"http://localhost/recruiting/",runScripts:"outside-only"});
const w=d.window,c=d.getInternalVMContext();
const store={};
Object.defineProperty(w,'localStorage',{value:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;},removeItem:k=>{}},configurable:true});
w.Papa={parse:(u,o)=>o.complete({data:[{id:"1",name:"Test",pos:"C",rank:"1",classYear:"2029",rating:"95",status:"Committed",committedSchool:"Duke",hs_gp:"20",hs_ppg:"18"}]})};
w.alert=()=>{};
vm.runInContext(fs.readFileSync(R+'app.js','utf8'),c,{filename:'app.js'});
w.onload();
ok(vm.runInContext('recruits.length',c)===1,'page still parses recruits after the restructure');
ok(!/function submitFeedback/.test(fs.readFileSync(R+'app.js','utf8')),'feedback handler removed from app.js');
console.log("\nHeader, footer and branding verified.");
