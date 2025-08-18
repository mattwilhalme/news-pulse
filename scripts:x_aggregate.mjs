// scripts/x_aggregate.mjs
// Reads data/x_posts.json, builds PT heatmaps:
//   - x_heatmap_links.json  (count of posts that contain story links)
//   - x_heatmap_engagement.json (sum of engagement in that hour)
// Also writes x_summary.json with a few toplines.

import fs from 'fs';

const PT_ZONE = 'America/Los_Angeles';
const START_HOUR = 6;

function getPTParts(iso){
  const d = new Date(iso);
  const dowName = new Intl.DateTimeFormat('en-US', { timeZone: PT_ZONE, weekday:'short' }).format(d);
  const map = {Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6};
  const dow = map[dowName] ?? 0;
  const hour = Number(new Intl.DateTimeFormat('en-US',{ timeZone: PT_ZONE, hour:'2-digit', hour12:false }).format(d));
  return { dow, hour };
}

function orderCols(start=6){
  return Array.from({length:24}, (_,i)=> (start + i) % 24);
}

const posts = JSON.parse(fs.readFileSync('./data/x_posts.json','utf8', (e)=>[]));

// 7x24 matrices
const gridLinks = Array.from({length:7}, ()=> Array.from({length:24}, ()=>0));
const gridEng = Array.from({length:7}, ()=> Array.from({length:24}, ()=>0));

let totalPosts = 0, totalLinkPosts = 0, totalEng = 0;

for (const p of posts){
  if (!p?.date) continue;
  const { dow, hour } = getPTParts(p.date);
  totalPosts += 1;

  const engagement = (p.replyCount||0) + (p.retweetCount||0) + (p.quoteCount||0) + (p.likeCount||0);
  gridEng[dow][hour] += engagement;
  totalEng += engagement;

  if (p.has_link){
    gridLinks[dow][hour] += 1;
    totalLinkPosts += 1;
  }
}

const cols = orderCols(START_HOUR);
function toJSONGrid(matrix){
  const out = [];
  for (let d=0; d<7; d++){
    for (const h of cols){
      out.push({ dow: d, hour: h, value: matrix[d][h] });
    }
  }
  return out;
}

fs.writeFileSync('./data/x_heatmap_links.json', JSON.stringify(toJSONGrid(gridLinks), null, 2));
fs.writeFileSync('./data/x_heatmap_engagement.json', JSON.stringify(toJSONGrid(gridEng), null, 2));

const summary = {
  generated_at: new Date().toISOString(),
  totals: { posts: totalPosts, link_posts: totalLinkPosts, engagement_sum: totalEng },
  note: "PT timezone; hours ordered starting at 06:00.",
};
fs.writeFileSync('./data/x_summary.json', JSON.stringify(summary, null, 2));
console.log('Wrote x_heatmap_links.json, x_heatmap_engagement.json, x_summary.json');
