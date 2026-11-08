// ===== Configuration =====
// Set to a real endpoint (e.g. Buttondown/Mailchimp/Formspree URL) to enable signups. While empty, submit shows "Coming soon".
const SIGNUP_ENDPOINT = "";

// Community comments via Giscus (GitHub Discussions).
// Announcements is the repository's announcement category: only maintainers and the
// giscus app open new threads. Topic tabs pass data-mapping "specific".
const GISCUS = {
  repo: "IITeee/pandemicradar",
  repoId: "R_kgDOVnXMjA",
  category: "Announcements",
  categoryId: "DIC_kwDOVnXMjM4DKrkn",
  mapping: "specific",
  theme: "preferred_color_scheme",
  lang: "en",
  reactionsEnabled: "1",
  inputPosition: "top",
  loading: "lazy",
  topics: ["General", "H5N1 / bird flu", "Ebola", "MERS & coronaviruses", "Data & methodology"]
};

// ===== Literature constants (embedded, with sources) =====
const LIT = {
  scenarios: [ // Burns, van der Mensbrugghe & Timmer (World Bank, 2008)
    {name:"Mild", ref:"1968 Hong Kong flu", deaths:1.4, gdp:0.7, c:"var(--low)"},
    {name:"Moderate", ref:"1957 Asian flu", deaths:14.2, gdp:2.0, c:"var(--mid)"},
    {name:"Severe", ref:"1918 Spanish flu", deaths:71, gdp:4.8, c:"var(--high)"}],
  sources: [
    ["WHO Disease Outbreak News","Live: outbreak reports (API)","https://www.who.int/emergencies/disease-outbreak-news"],
    ["ECDC Communicable Disease Threats Report","Live: weekly EU/EEA threat report","https://www.ecdc.europa.eu/en/publications-data/monitoring/weekly-threats-reports"],
    ["CDC: A(H5) Bird Flu – Current Situation","Live: US H5N1 human cases","https://www.cdc.gov/bird-flu/situation-summary/index.html"],
    ["CDC Travel Health Notices","Live: travel notice levels","https://wwwnc.cdc.gov/travel/notices"],
    ["Marani et al. 2021, PNAS","Intensity and frequency of extreme novel epidemics (≈2%/yr COVID-scale)","https://www.pnas.org/doi/10.1073/pnas.2105482118"],
    ["Madhav et al. 2017, DCP3","Pandemics: risks, impacts and mitigation (≈1%/yr severe)","https://www.ncbi.nlm.nih.gov/books/NBK525302/"],
    ["Allen et al. 2017, Nature Communications","Global hotspots and correlates of emerging zoonotic diseases","https://www.nature.com/articles/s41467-017-00923-8"],
    ["Fan, Jamison & Summers 2018, WHO Bulletin","Pandemic risk: how large are the expected losses?","https://pubmed.ncbi.nlm.nih.gov/29403116/"],
    ["Burns, van der Mensbrugghe & Timmer 2008, World Bank","Evaluating the economic consequences of avian influenza","https://documents.worldbank.org/"],
    ["Global Health Security Index 2021","Preparedness of 195 countries","https://www.ghsindex.org/"]]
};
const D = window.PR_DATA;
const col = s => s>=6?"var(--high)":s>=4?"var(--mid)":"var(--low)";
const hex = s => s>=6?"#ff5d73":s>=4?"#ffb547":"#3dd6a3";
const fmt = n => n==null?"—":n.toLocaleString("en-US");
const $ = id => document.getElementById(id);

// theme
const root=document.documentElement; root.dataset.theme=localStorage.prTheme||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");
$("theme").onclick=()=>{root.dataset.theme=root.dataset.theme==="light"?"dark":"light";localStorage.prTheme=root.dataset.theme;location.reload()};
const css=v=>getComputedStyle(root).getPropertyValue(v).trim();

$("updated-static").textContent=$("updated-foot").textContent=D.updated+" (Stockholm time)";

// hero metrics (computed from base rates in snapshot)
const b=D.base_rates.covid_scale_marani2021, s=D.base_rates.severe_1918_scale_madhav2017;
$("metrics").innerHTML=[[b["1"],"Within 1 year","COVID-scale pandemic · Marani et al. 2021"],[b["5"],"Within 5 years","1 − 0.98⁵"],[b["10"],"Within 10 years","1 − 0.98¹⁰"],[s["10"],"Severe (1918-scale) in 10 yrs","p ≈ 1%/yr · Madhav et al. 2017"]]
 .map(([p,l,d])=>`<div class="metric"><div class="v">${p<0.03?(p*100).toFixed(0):"≈"+(p*100).toFixed(0)}%</div><div class="l">${l}</div><div class="d">${d}</div><div class="bar"><i style="width:${Math.min(100,p*400)}%"></i></div></div>`).join("");

// map
const map=L.map("map",{scrollWheelZoom:false,zoomSnap:.25,minZoom:1,attributionControl:false}).setView([18,15],window.innerWidth<600?0.75:1.75);
const WA={"Democratic Republic of the Congo":"Dem. Rep. Congo","Russian Federation":"Russia","Côte d’Ivoire":"Côte d'Ivoire","Viet Nam":"Vietnam","United States":"United States of America","Tanzania":"Tanzania"};
const best={};D.signals.forEach(sg=>sg.countries.forEach(c=>{const n=WA[c]||c;best[n]=Math.max(best[n]??0,sg.score)}));
fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then(r=>r.json()).then(t=>{
  const fc=topojson.feature(t,t.objects.countries);fc.features=fc.features.filter(f=>f.properties.name!=="Antarctica");
  const fix=r=>r.map(p=>[p[0]<-100?p[0]+360:p[0],p[1]]);
  fc.features.forEach(f=>{if(["Russia","Fiji"].includes(f.properties.name)){const g=f.geometry;g.coordinates=g.type==="Polygon"?g.coordinates.map(fix):g.coordinates.map(pl=>pl.map(fix))}});
  L.geoJSON(fc,{style:f=>{const v=best[f.properties.name];return{color:css("--line"),weight:.7,fillColor:v==null?css("--bg2"):hex(v),fillOpacity:v==null?1:.8}}}).addTo(map);
  markers.forEach(m=>m.addTo(map));});
const markers=[];
D.signals.forEach(sg=>sg.geo.forEach(([c,la,lo])=>{
  markers.push(L.circleMarker([la,lo],{radius:5+sg.score*1.4,color:"#fff",fillColor:hex(sg.score),fillOpacity:.95,weight:1.5})
   .bindPopup(`<b>${sg.title}</b><br>${c} · ${sg.date}<br>Risk score <b>${sg.score}</b>/10${sg.cases?`<br>Cases: ${fmt(sg.cases)}`:""}${sg.deaths?` · Deaths: ${fmt(sg.deaths)}`:""}<br><a href="${sg.url}" target="_blank">WHO report →</a>`))}));

// table
let sortK="score",asc=false;
const classes=[...new Set(D.signals.map(x=>x.class))];
$("cls").innerHTML+=classes.map(c=>`<option>${c}</option>`).join("");
function render(){
  const q=$("q").value.toLowerCase(),c=$("cls").value;
  const rows=D.signals.filter(x=>(!c||x.class===c)&&(x.title+" "+x.countries.join(" ")).toLowerCase().includes(q))
   .sort((a,b)=>{const A=a[sortK]??-1,B=b[sortK]??-1;return (A>B?1:A<B?-1:0)*(asc?1:-1)});
  document.querySelector("#tbl tbody").innerHTML=rows.map(x=>`<tr><td><span class="pill" style="background:${col(x.score)}">${x.score}</span></td><td><a href="${x.url}" target="_blank">${x.title}</a></td><td>${x.class}</td><td class="num">${x.date}</td><td class="num">${fmt(x.cases)}</td><td class="num">${fmt(x.deaths)}</td></tr>`).join("")||`<tr><td colspan=6 class="muted">No matching signals.</td></tr>`;
  document.querySelectorAll("th").forEach(th=>{th.classList.toggle("sorted",th.dataset.k===sortK);th.classList.toggle("asc",th.dataset.k===sortK&&asc)});
}
document.querySelectorAll("th").forEach(th=>th.onclick=()=>{asc=sortK===th.dataset.k?!asc:false;sortK=th.dataset.k;render()});
$("q").oninput=$("cls").onchange=render; render();

$("travel").innerHTML=D.cdc_travel.map(t=>{const m=t.match(/Level (\d) - (.*)/);return `<span class="chip l${m[1]}"><b>L${m[1]}</b>${m[2]}</span>`}).join("");

// watchlist (qualitative; H5 figure from CDC live data)
const h5=D.h5||{};
const W=[["Influenza A(H5N1) & novel flu","High","var(--high)",`Widespread in wild birds, poultry and US dairy cows. ${h5.us_cases_since_2024??"—"} human cases in the US since Feb 2024; CDC rates public risk as ${h5.cdc_risk??"—"} (updated ${h5.updated??"—"}). Historically the most likely pandemic candidate.`,"CDC"],
["Novel coronaviruses (incl. MERS)","Medium–high","var(--mid)","Sporadic MERS spillover from camels in Saudi Arabia; limited human-to-human transmission.","WHO DON"],
["Disease X (unknown pathogen)","Unknown","var(--mid)","Recent reports of novel or unexplained human infections (Shamonda virus in France, pneumonia in Russia). A WHO R&D priority.","WHO"],
["Ebola / Marburg","Low (pandemic) · High (regional)","var(--mid)","Largest Bundibugyo outbreak on record, with exported cases. Spreads via bodily fluids; has never caused a global pandemic.","WHO DON, CDC"],
["Nipah","Low–medium","var(--low)","Isolated cases in India; very high fatality but limited spread.","WHO DON"],
["Mpox","Low–medium","var(--low)","Still reported in the EU/EEA.","ECDC CDTR"],
["Hantavirus (Andes)","Low","var(--low)","Cruise-ship cluster; Andes virus is the only hantavirus known to spread between people.","WHO DON"]];
$("watch").innerHTML=W.map(([n,l,c,t,src])=>`<div class="wcard" style="--c:${c}"><div class="lvl">${l}</div><h4>${n}</h4><p>${t}</p><div class="src">Source: ${src} · level is an estimate</div></div>`).join("");

// charts
Chart.defaults.color=css("--mut");Chart.defaults.font.family="Inter";Chart.defaults.borderColor=css("--line");
const hot=Object.entries(D.don_count_365d).slice(0,10);
$("topcountry").textContent=hot.length?hot[0][0]:"—";
new Chart($("hot"),{type:"bar",data:{labels:hot.map(h=>h[0].replace("Democratic Republic of the Congo","DR Congo").replace("Russian Federation","Russia")),datasets:[{data:hot.map(h=>h[1]),backgroundColor:hot.map((_,i)=>i<2?"#ff5d73":i<5?"#ffb547":"#7c9cff"),borderRadius:6}]},
 options:{indexAxis:"y",maintainAspectRatio:false,layout:{padding:{left:8}},plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{precision:0}},y:{grid:{display:false}}}}});
$("scen").innerHTML=LIT.scenarios.map(x=>`<div class="scard" style="--c:${x.c}"><div class="t">${x.name}</div><div class="big">≈${x.deaths} million</div><div class="sub">global deaths · like the ${x.ref}</div><div class="big" style="font-size:26px;margin-top:12px">−${x.gdp.toFixed(1)}%</div><div class="sub">global GDP</div></div>`).join("");
new Chart($("scenChart"),{type:"bar",data:{labels:LIT.scenarios.map(x=>x.name),datasets:[{label:"Deaths (millions)",data:LIT.scenarios.map(x=>x.deaths),backgroundColor:"#ff5d73",borderRadius:6,yAxisID:"y"},{label:"GDP loss (%)",data:LIT.scenarios.map(x=>x.gdp),backgroundColor:"#7c9cff",borderRadius:6,yAxisID:"y2"}]},
 options:{maintainAspectRatio:false,scales:{y:{title:{display:true,text:"Deaths (millions)"}},y2:{position:"right",grid:{display:false},title:{display:true,text:"GDP loss (%)"}},x:{grid:{display:false}}}}});

// method
$("status").innerHTML=Object.entries(D.status).map(([k,v])=>`<span class="chip" style="color:${v==="ok"?"var(--low)":"var(--high)"}">● ${k}: ${v}</span>`).join("");
$("sources").innerHTML=LIT.sources.map(([t,d,u])=>`<li><a href="${u}" target="_blank">${t}</a><small>${d}</small></li>`).join("");

// signup
$("signup").onsubmit=async e=>{e.preventDefault();const m=$("signup-msg"),email=e.target.querySelector("input").value;
  if(!SIGNUP_ENDPOINT){m.textContent="Coming soon – the newsletter launches shortly. Thanks for your interest!";return}
  try{await fetch(SIGNUP_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});m.textContent="Thanks! Check your inbox to confirm."}catch{m.textContent="Something went wrong, please try again."}};

// community — topic tabs switch the Giscus term (data-mapping "specific")
(function(){
  const tabs=$("topic-tabs"), slot=$("giscus"), soon=$("community-soon");
  if(!tabs||!slot||!soon) return;
  const ready=!!(GISCUS.repoId&&GISCUS.categoryId);
  const theme=()=>localStorage.prTheme==="light"||localStorage.prTheme==="dark"?localStorage.prTheme:GISCUS.theme;
  let term=GISCUS.topics[0], mounted=false;
  function send(config){
    const frame=slot.querySelector("iframe.giscus-frame");
    if(!frame) return false;
    frame.contentWindow.postMessage({giscus:{setConfig:config}},"https://giscus.app");
    return true;
  }
  function mount(){
    if(mounted) return;
    mounted=true;
    const s=document.createElement("script");
    s.src="https://giscus.app/client.js";
    s.async=true;
    s.crossOrigin="anonymous";
    const attrs={
      "data-repo":GISCUS.repo,
      "data-repo-id":GISCUS.repoId,
      "data-category":GISCUS.category,
      "data-category-id":GISCUS.categoryId,
      "data-mapping":GISCUS.mapping,
      "data-term":term,
      "data-strict":"0",
      "data-reactions-enabled":GISCUS.reactionsEnabled,
      "data-emit-metadata":"0",
      "data-input-position":GISCUS.inputPosition,
      "data-theme":theme(),
      "data-lang":GISCUS.lang,
      "data-loading":GISCUS.loading
    };
    Object.entries(attrs).forEach(([k,v])=>s.setAttribute(k,v));
    slot.replaceChildren(s);
    const watch=new MutationObserver(()=>{if(send({term,theme:theme()})) watch.disconnect()});
    watch.observe(slot,{childList:true,subtree:true});
  }
  function select(next,btn){
    term=next;
    tabs.querySelectorAll("button").forEach(b=>b.setAttribute("aria-selected",b===btn?"true":"false"));
    if(!ready) return;
    if(!send({term})) mount();
  }
  GISCUS.topics.forEach((t,i)=>{
    const b=document.createElement("button");
    b.type="button"; b.role="tab"; b.textContent=t;
    b.setAttribute("aria-selected",i===0?"true":"false");
    b.onclick=()=>select(t,b);
    tabs.appendChild(b);
  });
  if(!ready){soon.hidden=false;return}
  soon.remove();
  select(term,tabs.querySelector("button"));
})();
