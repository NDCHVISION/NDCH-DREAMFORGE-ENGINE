/**
 * Build the NDCH Post Kit web page (the copy-and-paste page) from the post kit files, so the page
 * always matches posts/: every platform's copy, location tag with fallbacks, symbol caption and
 * alt text, covers and schedule.
 *
 *   npm run posts:page            writes renders/post-kit/index.html
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { FIELDS, FREQ_DIR, PLATFORMS, loadPosts, label, postedOn, type ReelPost } from '../lib/post-kit.ts';

const LABEL: Record<string, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', linkedin: 'LinkedIn' };
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';

const entry = (p: ReelPost) => ({
  id: (p.series === 'freq' ? 'freq-' : 'r') + p.posting,
  num: label(p),
  name: p.title,
  status: p.status,
  schedule: Object.entries(p.schedule ?? {}).map(([k, v]) => `${LABEL[k]}: ${when(v as string)}`).join(' · '),
  note: p.note ?? '',
  live: postedOn(p).map((x) => ({ role: x.role, date: x.posted_ct.slice(0, 10), url: x.url, location: x.location })),
  covers: [p.cover?.vertical, p.cover?.horizontal, p.cover?.instagram].filter(Boolean).map((c) => c!.split('/').pop()),
  location: p.location ? { name: p.location.name, why: p.location.why, search: p.location.search ?? [] } : null,
  symbol: p.symbol ? { caption: p.symbol.caption, alt: p.symbol.alt_text ?? '', image: p.symbol.image.split('/').pop(), place: p.symbol.place ?? '' } : null,
  alt: p.alt_text ?? '',
  platforms: PLATFORMS.filter((k) => p.platforms[k]).map((k) => ({
    key: k,
    label: LABEL[k],
    fields: FIELDS[k].filter((f) => (p.platforms[k] as Record<string, string>)[f.key]).map((f) => ({ label: f.label, max: f.max ?? 0, title: f.key === 'title', text: (p.platforms[k] as Record<string, string>)[f.key] })),
  })),
});

const reels = loadPosts().sort((a, b) => b.posting.localeCompare(a.posting)).map(entry);
const freq = loadPosts(FREQ_DIR).map(entry);
const data = JSON.stringify({ reels, freq }).replace(/</g, '\\u003c');

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>NDCH Post Kit</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Hanken+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
/* VOICE: a working desk, calm and exact. IDEA: the engraved plaque on stone, as on the covers.
   PICTURE: the copy itself, one card per platform. COLOUR and TYPE: NDCH stone and antique gold;
   Cormorant for names, Hanken Grotesk for copy. LAYOUT: newest reel first, platform cards in two columns. */
:root{color-scheme:dark;--stone:#0e0f12;--slab:#16181d;--vein:#2a2620;--gold:#c9a45c;--gold-soft:#8f7a4f;--ink:#ebe6dc;--mute:#a19c92;--ok:#7fae84;--blue:#1b2a4a;
--display:"Cormorant Garamond",Georgia,serif;--body:"Hanken Grotesk",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}
*{box-sizing:border-box;min-width:0}
body{margin:0;background:var(--stone);color:var(--ink);font:15px/1.55 var(--body);overflow-x:clip}
.wrap{max-width:1120px;margin:0 auto;padding:40px max(16px,env(safe-area-inset-right)) 64px max(16px,env(safe-area-inset-left))}
header{display:grid;gap:8px;margin-bottom:20px}
h1{font-family:var(--display);font-weight:600;font-size:clamp(34px,6vw,52px);line-height:1.05;margin:0;color:var(--gold)}
header p{margin:0;color:var(--mute);max-width:66ch}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 28px}
nav a{font-size:13px;color:var(--ink);text-decoration:none;border:1px solid var(--vein);padding:8px 12px;border-radius:999px;min-height:36px}
nav a:hover,nav a:focus-visible{border-color:var(--gold);outline:none}
nav a.freq{border-color:var(--gold-soft)}
.reel{border-top:1px solid var(--vein);padding-top:28px;margin-top:36px;display:grid;gap:16px}
.head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 18px}
.head h2{font-family:var(--display);font-weight:600;font-size:34px;letter-spacing:.12em;margin:0;color:var(--gold)}
.head h2 span{font-family:var(--mono);font-size:14px;letter-spacing:0;color:var(--mute);margin-left:10px}
.meta{font-size:13px;color:var(--mute)}
.tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--vein);margin-right:8px;color:var(--ink)}
.tag.draft{border-color:#7a5a3a}
.note{font-size:13px;color:var(--mute);margin:0}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.wide{grid-column:1/-1}
@media(max-width:760px){.grid{grid-template-columns:1fr}}
.panel{background:var(--slab);border:1px solid var(--vein);border-radius:10px;padding:16px;display:grid;gap:12px;align-content:start}
.panel.place{background:linear-gradient(var(--slab),var(--slab)) padding-box,linear-gradient(135deg,var(--gold-soft),var(--vein)) border-box;border:1px solid transparent}
.panel.sym{background:#121826;border-color:var(--blue)}
.ph{display:flex;justify-content:space-between;align-items:center;gap:10px}
.platform{font-size:13px;font-weight:600;color:var(--gold)}
.done{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mute);cursor:pointer;min-height:32px}
.done input{accent-color:var(--ok);width:18px;height:18px}
.panel.is-done{opacity:.55}
.field{display:grid;gap:6px}
.ft{display:flex;justify-content:space-between;align-items:center;gap:8px}
.label{font-size:12px;color:var(--mute)}
.count{font-family:var(--mono);font-size:11px;color:var(--mute)}
.count.over{color:#d98a6a}
.text{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--stone);border:1px solid var(--vein);border-radius:6px;padding:10px 12px;font-size:14px}
.text.title{font-weight:600}
.small{font-size:13px;color:var(--mute);margin:0}
.small b{color:var(--ink);font-weight:500}
ol.alts{margin:0;padding-left:20px;font-size:13px;color:var(--ink)}
button.copy{font:inherit;font-size:12px;color:var(--ink);background:transparent;border:1px solid var(--gold-soft);border-radius:6px;padding:6px 12px;min-height:32px;cursor:pointer}
button.copy:hover,button.copy:focus-visible{border-color:var(--gold);color:var(--gold);outline:none}
button.copy.copied{border-color:var(--ok);color:var(--ok)}
h3.series{font-family:var(--display);font-size:30px;color:var(--gold);margin:56px 0 0;font-weight:600}
footer{margin-top:48px;color:var(--mute);font-size:13px;display:grid;gap:6px}
</style></head><body>
<div class="wrap">
<header>
<h1>NDCH Post Kit</h1>
<p>Every reel's copy for YouTube, Instagram, TikTok, Facebook and LinkedIn, plus its location tag and its symbol post for the Instagram grid. Tap Copy and paste. Tick Posted as you go; ticks stay in this browser only. Built from the engine repo's posts folder, newest reel first.</p>
</header>
<nav id="nav"></nav>
<main id="reels"></main>
<footer>
<div>YouTube: "NNN | TITLE emoji #philosophy #motivation"; hashtags at the end of the description. Set Video location in Studio.</div>
<div>Instagram: the first line is the hook, five hashtags at most, first comment within a minute. Symbol posts use the short grid caption.</div>
<div>TikTok: "NNN| TITLE", a blank line, one line, no hashtags.</div>
<div>Facebook: three hashtags at most. LinkedIn: title, line, paragraph, hashtags; no location tag.</div>
<div>Location: if the name isn't listed, try the fallbacks in order; if none show, leave it blank rather than tag a look-alike.</div>
</footer>
</div>
<script>
{
const DATA=${data};
const store=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
function copyField(lab,text,{title=false,max=0}={}){
  const f=el('div','field'),top=el('div','ft');top.appendChild(el('span','label',lab));
  const right=el('span');right.style.cssText='display:flex;gap:10px;align-items:center';
  if(max){const c=el('span','count'+(text.length>max?' over':''),text.length+'/'+max);right.appendChild(c)}
  const b=el('button','copy','Copy');b.type='button';right.appendChild(b);top.appendChild(right);f.appendChild(top);
  const t=el('div','text'+(title?' title':''),text);f.appendChild(t);
  b.addEventListener('click',()=>{const ok=()=>{b.textContent='Copied';b.classList.add('copied');setTimeout(()=>{b.textContent='Copy';b.classList.remove('copied')},1400)};
    const sel=()=>{const s=getSelection(),r=document.createRange();r.selectNodeContents(t);s.removeAllRanges();s.addRange(r);b.textContent='Selected';};
    try{navigator.clipboard.writeText(text).then(ok,sel)}catch(e){sel()}});
  return f;
}
function panel(title,id,cls){
  const p=el('div','panel'+(cls?' '+cls:'')),h=el('div','ph');h.appendChild(el('div','platform',title));
  if(id){const l=el('label','done'),c=el('input');c.type='checkbox';c.id=id;l.htmlFor=id;l.appendChild(c);l.appendChild(document.createTextNode('Posted'));h.appendChild(l);
    if(store(id)==='1'){c.checked=true;p.classList.add('is-done')}
    c.addEventListener('change',()=>{store(id,c.checked?'1':'0');p.classList.toggle('is-done',c.checked)})}
  p.appendChild(h);return p;
}
const nav=document.getElementById('nav'),main=document.getElementById('reels');
function render(r,freq){
  const a=el('a',freq?'freq':'',r.num+' '+r.name);a.href='#'+r.id;nav.appendChild(a);
  const s=el('section','reel');s.id=r.id;
  const h=el('div','head'),h2=el('h2',null,r.name);h2.appendChild(el('span',null,r.num));h.appendChild(h2);
  const m=el('div','meta');m.appendChild(el('span','tag'+(r.status==='draft'?' draft':''),r.status));if(r.schedule)m.appendChild(document.createTextNode(r.schedule));h.appendChild(m);s.appendChild(h);
  if(r.note)s.appendChild(el('p','note',r.note));
  if(r.live.length){const lv=el('p','note');lv.appendChild(document.createTextNode('Already on Instagram: '));r.live.forEach((x,i)=>{if(i)lv.appendChild(document.createTextNode(' · '));const a=el('a',null,x.role+' '+x.date+(x.location?' ('+x.location+')':''));a.href=x.url;a.style.color='var(--gold)';lv.appendChild(a)});s.appendChild(lv)}
  const g=el('div','grid');
  if(r.location){const p=panel('Location tag',null,'place wide');p.appendChild(copyField('Tag this place',r.location.name,{title:true}));
    if(r.location.search.length){p.appendChild(el('div','label','If it isn\\'t listed, search in order'));const ol=el('ol','alts');r.location.search.forEach(x=>ol.appendChild(el('li',null,x)));p.appendChild(ol)}
    const w=el('p','small');w.appendChild(el('b',null,'Why: '));w.appendChild(document.createTextNode(r.location.why));p.appendChild(w);
    p.appendChild(el('p','small','Instagram, TikTok, Facebook and YouTube (Video location). Use the same tag on the symbol post.'));g.appendChild(p)}
  r.platforms.forEach(pl=>{const p=panel(pl.label,'done-'+r.id+'-'+pl.key);pl.fields.forEach(f=>p.appendChild(copyField(f.label,f.text,{title:f.title,max:f.max})));g.appendChild(p)});
  if(r.symbol){const p=panel('Symbol · Instagram grid','done-'+r.id+'-symbol','sym');
    p.appendChild(el('p','small',(r.symbol.place?r.symbol.place+'. ':'')+'Image: '+r.symbol.image));
    p.appendChild(copyField('Caption',r.symbol.caption));if(r.symbol.alt)p.appendChild(copyField('Alt text',r.symbol.alt));g.appendChild(p)}
  if(r.alt||r.covers.length){const p=panel('Reel extras',null);if(r.covers.length)p.appendChild(el('p','small','Covers: '+r.covers.join(', ')));if(r.alt)p.appendChild(copyField('Alt text',r.alt));g.appendChild(p)}
  s.appendChild(g);main.appendChild(s);
}
DATA.reels.forEach(r=>render(r,false));
if(DATA.freq.length){main.appendChild(el('h3','series','NDCH FREQ'));DATA.freq.forEach(r=>render(r,true))}
if(location.hash){const t=document.getElementById(location.hash.slice(1));if(t)t.scrollIntoView()}
}
</script></body></html>
`;
mkdirSync('renders/post-kit', { recursive: true });
writeFileSync('renders/post-kit/index.html', html);
console.log(`wrote renders/post-kit/index.html (${reels.length} reels, ${freq.length} FREQ)`);
