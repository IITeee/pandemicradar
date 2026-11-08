"""Pandemicradar: fetches open sources, computes risk scores, writes out/snapshot.json + out/newsletter.md"""
import json, re, math, datetime as dt, pathlib, urllib.request, urllib.parse
from zoneinfo import ZoneInfo
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "out"
OUT.mkdir(parents=True, exist_ok=True)
UA={"User-Agent":"curl/8.5.0","Accept":"*/*"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read().decode("utf-8","replace")
def strip(h): return re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",h or "")).strip()
status={}
# --- WHO DON
don=[]
try:
    q="?sf_culture=en&$orderby=PublicationDateAndTime%20desc&$top=80&$select=Title,PublicationDateAndTime,ItemDefaultUrl,Summary"
    for x in json.loads(get("https://www.who.int/api/news/diseaseoutbreaknews"+q))["value"]:
        don.append({"date":x["PublicationDateAndTime"][:10],"title":x["Title"],
          "url":"https://www.who.int/emergencies/disease-outbreak-news/item"+x["ItemDefaultUrl"],"summary":strip(x["Summary"])})
    status["WHO DON"]="ok"
except Exception as e: status["WHO DON"]=f"error: {e}"
# --- CDC travel notices
cdc=[]
try:
    for t in re.findall(r"<title>(Level \d[^<]+)",get("https://wwwnc.cdc.gov/travel/rss/notices.xml")):
        cdc.append(t.replace("&#233;","é").strip())
    status["CDC travel notices"]="ok"
except Exception as e: status["CDC travel notices"]=f"error: {e}"
# --- CDC H5
h5=None
try:
    t=strip(re.sub(r"<style.*?</style>|<script.*?</script>"," ",get("https://www.cdc.gov/bird-flu/situation-summary/index.html"),flags=re.S))
    m=re.search(r"Of the (\d+) total reported human cases of A\(H5\)",t); u=re.search(r"Updated: (\w+ \d+, \d{4})",t)
    h5={"us_cases_since_2024":int(m.group(1)) if m else None,"updated":u.group(1) if u else None,"cdc_risk":"low" if "public health risk is low" in t else "?"}
    status["CDC H5N1"]="ok"
except Exception as e: status["CDC H5N1"]=f"error: {e}"
# --- ECDC CDTR
ecdc=[]
try:
    x=get("https://www.ecdc.europa.eu/en/taxonomy/term/1505/feed")
    for it in re.findall(r"<item>(.*?)</item>",x,re.S)[:4]:
        g=lambda k:(re.search(rf"<{k}>(.*?)</{k}>",it,re.S) or [None,""])[1]
        ecdc.append({"title":strip(g("title")),"url":strip(g("link")),"date":strip(g("pubDate"))[:16],
                     "desc":strip(re.sub(r"&lt;.*?&gt;|&amp;nbsp;"," ",g("description")))})
    status["ECDC CDTR"]="ok"
except Exception as e: status["ECDC CDTR"]=f"error: {e}"
# --- Scoring (transparent)
CLASS=[("novel/unknown",4,r"undetermined|unknown|novel|first documented|Disease X"),
       ("respiratory/influenza/corona",4,r"influenza|H5N|H7N|H9N|coronavirus|MERS|SARS|pneumonia"),
       ("henipa/hanta",3,r"Nipah|Hendra|hantavirus"),
       ("haemorrhagic",2,r"Ebola|Marburg|Lassa|Crimean|Bundibugyo"),
       ("mpox/pox",2,r"mpox|monkeypox|smallpox"),
       ("vector/other",1,r".")]
today=dt.date.today()
def score(d):
    txt=d["title"]+" "+d["summary"]
    for i,w_ in enumerate("one two three four five six seven eight nine ten eleven twelve".split(),1): txt=re.sub(rf"\b{w_}\b",str(i),txt,flags=re.I)
    cls,w=next((c,w) for c,w,p in CLASS if re.search(p,txt,re.I))
    nums=[int(n.replace(" ","")) for n in re.findall(r"(\d[\d ]{0,7}\d|\d) (?:confirmed |laboratory-confirmed |suspected )?cases",txt)]
    cases=max(nums) if nums else 1
    dm=re.findall(r"(\d[\d ]{0,6}\d|\d) (?:confirmed )?deaths",txt); deaths=max([int(n.replace(" ","")) for n in dm]) if dm else 0
    multi=1 if re.search(r",| and |Multi|Global|Region",d["title"].split(" - ")[-1]) else 0
    age=(today-dt.date.fromisoformat(d["date"])).days
    s=w*2+min(3,math.log10(cases+1))+2*multi+(2 if age<=14 else 1 if age<=45 else 0)
    return {**d,"class":cls,"cases":cases if nums else None,"deaths":deaths or None,"multi":bool(multi),"score":round(min(10,s*10/17),1)}
latest={}
for d in don:  # one row per event (newest)
    key=d["title"].lower()[:9]
    latest.setdefault(key,d)
signals=sorted([score(d) for d in latest.values() if (today-dt.date.fromisoformat(d["date"])).days<=180],key=lambda r:-r["score"])
# hotspot: DON reports per country last 365 d
COUNTRIES=["Democratic Republic of the Congo","Uganda","Kenya","Nigeria","India","Bangladesh","China","Cambodia","Viet Nam","Saudi Arabia","France","Russian Federation","Brazil","Chile","Argentina","Ghana","Guinea","Liberia","United States","Mexico","Peru","Ethiopia","Sudan","Pakistan","Indonesia","Egypt","Rwanda","Tanzania","Burkina Faso","Côte d’Ivoire","Cameroon","Colombia","Bolivia","Afghanistan","Yemen","Haiti","Sierra Leone","Angola"]
cnt={}
for d in don:
    if (today-dt.date.fromisoformat(d["date"])).days<=365:
        for c in COUNTRIES:
            if c in d["title"] or c in d["summary"][:400]: cnt[c]=cnt.get(c,0)+1
# base rates
def cum(p,n): return 1-(1-p)**n
base={k:{"p_annual":p,"1":cum(p,1),"5":cum(p,5),"10":cum(p,10)} for k,p in [("covid_scale_marani2021",0.02),("severe_1918_scale_madhav2017",0.01)]}
now=dt.datetime.now(ZoneInfo("Europe/Stockholm"))
snap={"updated":now.strftime("%Y-%m-%d %H:%M"),"status":status,"signals":signals[:15],"don_count_365d":dict(sorted(cnt.items(),key=lambda x:-x[1])),
      "cdc_travel":cdc,"h5":h5,"ecdc":ecdc,"base_rates":base}
def _write(path, text):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
_write(OUT / "snapshot.json", json.dumps(snap, ensure_ascii=False, indent=1))
L=[f"# Pandemicradar – newsletter {now:%Y-%m-%d}","",f"*Last updated {snap['updated']} (Stockholm time). Risk indicator, not a forecast.*","",
   "## Base risk","At ~2% per year for a COVID-scale pandemic (Marani et al. 2021): "+", ".join(f"{base['covid_scale_marani2021'][n]*100:.0f}% within {n} year(s)" for n in "1 5 10".split())+".","",
   "## Strongest signals right now"]
for s in signals[:5]: L.append(f"- **{s['title']}** ({s['date']}) – score {s['score']}/10. [WHO]({s['url']})")
if h5: L+=["","## H5N1 (bird flu)",f"CDC: {h5['us_cases_since_2024']} human cases in the US since 2024; risk to the general public assessed as {h5['cdc_risk']} (updated {h5['updated']})."]
if ecdc: L+=["","## Latest ECDC weekly report",f"[{ecdc[0]['title']}]({ecdc[0]['url']})"]
L+=["","Source status: "+", ".join(f"{k}: {v}" for k,v in status.items())]
_write(OUT / "newsletter.md", "\n".join(L)+"\n")
print(json.dumps({"status":status,"top":[(s["title"],s["score"],s["cases"],s["deaths"]) for s in signals[:12]],"cnt":snap["don_count_365d"],"h5":h5},ensure_ascii=False,indent=1))
