// scripts/x_aggregate.mjs
// Build PT heatmaps (start 6am) for link posts and engagement.

import fs from 'fs';

const PT_ZONE = 'America/Los_Angeles';
const START_HOUR = 6;

function getPTParts(iso){
  const d = new Date(iso);
  const dowName = new Intl.DateTimeFormat('en-US',{timeZone:PT_ZONE,weekday:'short'}).format(d);
  const map = {Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6};
  const dow = map[dowName] ?? 0;
  const hour = Number(new Intl.DateTimeFormat('en-US',{timeZone:PT_ZONE,hour:'2-digit',hour12:false}).format(d));
  return { dow, hour };
}
const orderCols = (start=6) => Array.from({length:24}, (_,i)=>(start+i)%24);

let raw = [];
try {
  raw = JSON.parse(fs.readFileSync('./data/x_raw.json','utf8'));
} catch {
  console.log('No ./data/x_raw.json yet — skipping aggregation.');
  process.exit(0);
}

const posts = raw.map(t => {
  const likes   = Number(t.likeCount||0);
  const replies = Number(t.replyCount||0);
  const rts     = Number(t.retweetCount||0);
  const quotes  = Number(t.quoteCount||0);
  const engagement = likes + replies + rts + quotes;

  const text = String(t.content||'');
  const urls = Array.from(new Set((text.match(/https?:\/\/\S+/g) || [])));

  return { ...t, engagement, has_link: urls.length>0, link_urls: urls };
});

// Matrices 7x24
const gridLinks = Array.from({length:7},()=>Array.from({length:24},()=>0));
const gridEng   = Array.from({length:7},()=>Array.from({length:24},()=>0));

let totalPosts=0,totalLinkPosts=0,engSum=0;

for(const p of posts){
  if(!p.date) continue;
  const {dow,hour}=getPTParts(p.date);
  totalPosts++;
  gridEng[dow][hour]+=p.engagement; engSum+=p.engagement;
  if(p.has_link){ gridLinks[dow][hour]+=1; totalLinkPosts++; }
}

const cols = orderCols(START_HOUR);
const toFlat = (m)=> {
  const out=[];
  for(let d=0; d<7; d++) for(const h of cols) out.push({dow:d,hour:h,value:m[d][h]});
  return out;
};

fs.mkdirSync('./data', {recursive:true});
fs.writeFileSync('./data/x_posts.json', JSON.stringify(posts, null, 2));
fs.writeFileSync('./data/x_heatmap_links.json', JSON.stringify(toFlat(gridLinks), null, 2));
fs.writeFileSync('./data/x_heatmap_engagement.json', JSON.stringify(toFlat(gridEng), null, 2));
fs.writeFileSync('./data/x_summary.json', JSON.stringify({
  generated_at: new Date().toISOString(),
  timezone: 'PT (America/Los_Angeles)',
  start_hour: START_HOUR,
  totals: { posts: totalPosts, link_posts: totalLinkPosts, engagement_sum: engSum }
}, null, 2));

console.log('✅ Wrote x_posts.json, x_heatmap_links.json, x_heatmap_engagement.json, x_summary.json');
