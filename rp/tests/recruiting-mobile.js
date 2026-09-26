// Covers the recruiting page's rankings logic and phone layout:
//  - international prospects stay out of a class's national list unless
//    the International region, All Classes, or a name search is used, and
//    national ranks stay gap-free without them
//  - Washington, D.C. is a selectable region
//  - the Class column only appears for All Classes
//  - every row carries position and state (or INTL) ranks
//  - rows carry the stacked mobile lines and show only a logo for commits
//  - school rankings show 5/4/3-star counts, and a school opens a pop-up
//    with its team ranking, class grade and commits as ranking rows
//  - heat-map text colours come from theme variables (light-mode contrast)
const fs=require("fs"),vm=require("vm"),path=require("path");const {JSDOM}=require("jsdom");
function ok(c,m){if(!c)throw new Error("FAILED: "+m);console.log("OK: "+m);}
const R=path.join(__dirname,'..','..','recruiting')+'/';
const html=fs.readFileSync(R+'index.html','utf8');
const css=fs.readFileSync(R+'style.css','utf8');

// Realistic class: domestic players across states + internationals that
// hold sheet ranks in the middle of the list.
const rows=[];
const st=["NC","NC","TX","CA","DC","FL","NC","GA","TX","CA"];
for(let i=0;i<30;i++){
  const intl = (i===2||i===9||i===17);
  rows.push({id:"r"+i,rank:String(i+1),classYear:i<24?"2029":"2030",name:(intl?"Intl ":"Player ")+i,
    pos:["PG","SG","SF","PF","C"][i%5],height:"6'"+(3+i%7)+"\"",weight:(180+i)+" lbs",
    state:intl?"INT":st[i%10],hometown:intl?"Paris, France":"Raleigh, NC",hs:intl?"INSEP":"Prep "+i,
    stars:String(i<6?5:(i<18?4:3)),rating:String(98-i),
    status:i%3===0?"Uncommitted":"Committed to "+(i%2?"Duke":"Texas Christian"),
    committedSchool:i%3===0?"":(i%2?"Duke":"Texas Christian"),
    hs_gp:"20",hs_ppg:String(20-i*0.3),hs_rpg:"6",hs_apg:"3",hs_usg:"25%"});
}
const d=new JSDOM(html,{url:"http://localhost/recruiting/",runScripts:"outside-only",pretendToBeVisual:true});
const w=d.window,c=d.getInternalVMContext();
Object.defineProperty(w,'localStorage',{value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},configurable:true});
w.Papa={parse:(u,o)=>o.complete({data:rows})}; w.alert=()=>{}; w.scrollTo=()=>{};
vm.runInContext(fs.readFileSync(R+'app.js','utf8'),c,{filename:'app.js'});
w.onload();
const ev=x=>vm.runInContext(x,c), $=q=>w.document.querySelector(q), $$=q=>[...w.document.querySelectorAll(q)];
const setF=(id,v)=>{$('#'+id).value=v; ev('filterRecruits()');};

// ---------- internationals ----------
setF('classFilter','2029');
let names=$$('#recruitsTableBody .player-name').map(e=>e.textContent);
ok(!names.some(n=>n.startsWith('Intl')),'class view hides international players ('+names.length+' domestic shown)');
const ranks=$$('#recruitsTableBody .rank-num').map(e=>+e.textContent);
ok(ranks.every((r,i)=>r===i+1),'national ranks run 1..N with no gaps where internationals were: '+ranks.slice(0,6).join(','));
setF('stateFilter','INT');
names=$$('#recruitsTableBody .player-name').map(e=>e.textContent);
ok(names.length>0&&names.every(n=>n.startsWith('Intl')),'International region shows only internationals ('+names.length+')');
ok($$('#recruitsTableBody .rank-intl').length===names.length,'each international row carries an INTL rank');
setF('stateFilter','ALL'); setF('classFilter','OVERALL');
names=$$('#recruitsTableBody .player-name').map(e=>e.textContent);
ok(names.some(n=>n.startsWith('Intl')),'All Classes includes internationals');
setF('classFilter','2029'); $('#searchInput').value='intl 9'; ev('filterRecruits()');
ok($$('#recruitsTableBody .player-name').map(e=>e.textContent).includes('Intl 9'),'searching by name still finds an international');
$('#searchInput').value=''; ev('filterRecruits()');

// ---------- DC ----------
ok(!!$('#stateFilter option[value="DC"]'),'Washington, D.C. is in the region list');
setF('stateFilter','DC');
ok($$('#recruitsTableBody .player-name').length>0,'filtering to DC returns DC players');
setF('stateFilter','ALL');

// ---------- class column ----------
ok(!$('#rankingsTable').classList.contains('show-class'),'Class column hidden for a single class');
ok(/\.recruit-table:not\(\.show-class\) \.col-class\s*\{\s*display:\s*none/.test(css),'CSS hides the column unless show-class');
setF('classFilter','OVERALL');
ok($('#rankingsTable').classList.contains('show-class'),'Class column shown for All Classes');
setF('classFilter','2029');

// ---------- position + state ranks on every row ----------
const firstRow=$('#recruitsTableBody tr.recruit-row');
const subs=[...firstRow.querySelectorAll('.rank-sub')].map(e=>e.textContent);
ok(subs.length===2,'each row shows position rank and state rank: '+subs.join(' | '));
const ri=ev('JSON.stringify(rankIndex)'); const idx=JSON.parse(ri);
// NC players: r0, r1, r6 domestic... verify state ranks increment within NC
// State ranks are per class, so check within the 2029 class only (r0-r23).
const in29=id=>+id.slice(1)<24;
const ncOrder=Object.entries(idx).filter(([id,v])=>in29(id)&&v.stateLabel==='NC').map(([id,v])=>v.state).sort((a,b)=>a-b);
ok(ncOrder.every((v,i)=>v===i+1),'state ranks count up within a state and class: NC '+ncOrder.join(','));
const nc30=Object.entries(idx).filter(([id,v])=>!in29(id)&&v.stateLabel==='NC').map(([id,v])=>v.state).sort((a,b)=>a-b);
ok(nc30.length===0||nc30[0]===1,'the next class starts its own state count at 1');

// ---------- mobile stacked info + logo-only commit ----------
ok(firstRow.querySelector('.player-meta')&&/·/.test(firstRow.querySelector('.player-meta').textContent),'mobile meta line (pos · ht/wt): '+firstRow.querySelector('.player-meta').textContent.trim());
const hsLine=firstRow.querySelectorAll('.player-sub.mobile-only')[0].textContent;
ok(/\(.+\)/.test(hsLine),'mobile school (hometown) line: '+hsLine);
const committed=$$('#recruitsTableBody .commit-cell')[0];
ok(!committed.textContent.includes('Committed to'),'commit cell no longer says "Committed to …"');
ok(committed.querySelector('img.school-logo')&&committed.querySelector('.commit-name.desktop-only'),'logo always, school name desktop-only');
ok(committed.querySelector('img').getAttribute('src').includes('tcu.png')||committed.querySelector('img').getAttribute('src').includes('duke.png'),'commit logo resolves through aliases');
// Search every phone-width block, not just the last one — refinements
// may add later @media blocks.
const m=(css.match(/@media \(max-width: 760px\)[\s\S]*?\n\}/g)||[]).join('\n');
ok(/grid-template-areas:\s*"rank player grade commit"/.test(m),'mobile rows laid out as rank | player | grade | commit');
ok(/\.recruit-row \.col-hs \{ display: none !important; \}/.test(m.replace(/,\n\s*/g,', ').replace(/\.recruit-row \.col-class, \.recruit-row \.col-pos, \.recruit-row \.col-htwt, \.recruit-row \.col-state, /,''))||/\.recruit-row \.col-hs\s*\{\s*display:\s*none !important/.test(m),'overflow columns hidden on phones');
ok(/\.grade-stack\s*\{\s*flex-direction:\s*column/.test(m),'stars stack over the grade on phones');
ok(/\.recruit-table thead/.test(m)&&/display:\s*none/.test(m),'header row hidden on phones');

// ---------- school rankings: star counts ----------
ev('switchTab("schoolRankings")');
$('#schoolRankingsYearFilter').value='2029'; ev('renderSchoolRankings()');
const srow=$('#schoolRankingsTableBody tr.school-row');
ok(!!srow,'school rows render');
ok(!srow.querySelector('.commit-tag'),'recruit names no longer listed in the row');
const sb=[...srow.querySelectorAll('.sb')].map(e=>e.textContent.replace(/\s+/g,''));
ok(sb.length===3&&/^5★\d+$/.test(sb[0])&&/^4★\d+$/.test(sb[1])&&/^3★\d+$/.test(sb[2]),'5/4/3-star counts shown: '+sb.join(' '));
const data=JSON.parse(ev('JSON.stringify(getSchoolRankingsData("2029").map(s=>({n:s.name,c:s.recruitCount,sc:s.starCounts})))'));
data.forEach(s=>ok(s.sc[5]+s.sc[4]+s.sc[3]===s.c,`${s.n}: star counts sum to commits (${s.c})`));

// ---------- pop-up ----------
srow.click();
const modal=$('#schoolModal');
ok(modal&&modal.classList.contains('open'),'clicking a school opens a pop-up');
ok(w.document.body.classList.contains('modal-open'),'page scroll locked behind it');
const txt=modal.textContent;
ok(/Team Ranking/.test(txt)&&/#1/.test(modal.querySelector('.school-stat-val').textContent),'pop-up shows the team ranking: '+modal.querySelector('.school-stat-val').textContent);
ok(/Class Grade/.test(txt),'pop-up shows the class grade');
ok(modal.querySelectorAll('tr.recruit-row').length===data[0].c,'commits listed as ranking rows ('+modal.querySelectorAll('tr.recruit-row').length+')');
ok(modal.querySelector('.rank-sub'),'pop-up rows carry position/state ranks like the rankings page');
// jsdom (outside-only) doesn't run inline handler attributes, so run the
// attribute's own code — which also proves the generated string is valid.
const sel=modal.querySelector('select');
ev(sel.getAttribute('onchange').replace('this.value',"'ALL'"));
ok($('#schoolModal .recruit-table').classList.contains('show-class'),'switching to All Classes shows the class column');
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
ok(!modal.classList.contains('open')&&!w.document.body.classList.contains('modal-open'),'Escape closes it');
srow.click(); modal.click();
ok(!modal.classList.contains('open'),'clicking the backdrop closes it');
ev(modal.querySelector('.school-modal-close')?'openSchoolModal("Duke","2029")':'');
ev(modal.querySelector('.school-modal-close').getAttribute('onclick'));
ok(!modal.classList.contains('open'),'the close button closes it');
srow.click(); modal.querySelector('tr.recruit-row').click();
ok(!modal.classList.contains('open')&&$('#profile-tab').classList.contains('active'),'clicking a recruit closes the pop-up and opens his profile');

// ---------- profile uses the same ranks ----------
const intlP=ev('recruits.find(r=>r.name==="Intl 2").id');
ev(`renderProfile(recruits.find(r=>r.id==="${intlP}"))`);
ok(/INTL/.test($('#profileContainer').textContent),'international profile shows an INTL rank');

// ---------- heat map contrast ----------
const style=ev('getPercentileStyle(95,"ppg")')+'|'+ev('getPercentileStyle(5,"ppg")')+'|'+ev('getPercentileStyle(50,"ppg")');
ok(!/#a3e635|#f87171|#ffffff/i.test(style),'heat-map styles no longer hardcode text colours');
ok(/var\(--heat-good-text\)/.test(style)&&/var\(--heat-bad-text\)/.test(style)&&/var\(--text-main\)/.test(style),'heat text comes from theme variables');
ok(/--heat-good-text:\s*#14532d/.test(css)&&/--heat-bad-text:\s*#7f1d1d/.test(css),'light theme uses the high-contrast shades');
console.log("\nAll mobile / rankings / school / heat-map checks passed.");
