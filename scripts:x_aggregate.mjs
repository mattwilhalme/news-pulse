// scripts/x_aggregate.mjs
// Build PT heatmaps for X posts: link volume and engagement intensity.

import fs from 'fs';

const INFILE = './data/x_raw.json';
const PT_ZONE = 'America/Los_Angeles';
const START_HOUR = 6; // show columns as 06..23, 00..05

function getPTParts(iso) {
  const d = new Date(iso);
  const dowName = new Intl.DateTimeFormat('en-US', { timeZone: PT_ZONE, weekday: 'short' }).format(d);
  const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  const dow = map[dowName] ?? 0;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: PT_ZONE, hour:'2-digit', hour12:false }).format(d));
  return { dow, hour };
}

function orderCols(start=6) {
  return Array.from({length:24}, (_,i)=> (start + i) % 24);
}

// ---- Read input safely
let raw = [];
try {
  raw = JSON.parse(fs.readFileSync(INFILE, 'utf8'));
} catch (e) {
  console.error(`No input at ${INFILE}. Did ingest run?`, e.message);
  process.exit(0);
}

// Normalize + compute engagement
const posts = raw.map(t => {
  const likes = Number(t.likeCount || 0);
  const replies = Number(t.replyCount || 0);
  const rts = Number(t.retweetCount || 0);
  const quotes = Number(t.quoteCount || 0);
  const engagement = likes + replies + rts + quotes;

  // quick link detection (urls in text or t.url itself points to tweet permalink; we want external links)
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const found = [];
  const text = String(t.content || '');
  (text.match(urlRegex) || []).forEach(u => found.push(u));

  return {
    id: t.id,
    date: t.date, // ISO
    username: t.user,
    url: t.url,
    content: text,
    likes, replies, rts, quotes, engagement,
    has_link: found.length > 0,
    link_urls: Array.from(new Set(found)),
  };
});

// 7x24 matrices
const gridLinks = Array.from({length:7}, ()=> Array.from({length:24}, ()=>0));
const gridEng   = Array.from({length:7}, ()=> Array.from({length:24}, ()=>0));

let totalPosts = 0, totalLinkPosts = 0, engagementSum = 0;

for (const p of posts) {
  if (!p.date) continue;
  const { dow, hour } = getPTParts(p.date);
  totalPosts += 1;

  gridEng[dow][hour] += p.engagement;
  engagementSum += p.engagement;

  if (p.has_link) {
    gridLinks[dow][hour] += 1;
    totalLinkPosts += 1;
  }
}

// Flatten to {dow, hour, value} ordered by START_HOUR for easy rendering
const cols = orderCols(START_HOUR);
function toJSONGrid(matrix) {
  const out = [];
  for (let d=0; d<7; d++) {
    for (const h of cols) {
      out.push({ dow: d, hour: h, value: matrix[d][h] });
    }
  }
  return out;
}

// Write outputs
fs.mkdirSync('./data', { recursive: true });
fs.writeFileSync('./data/x_posts.json', JSON.stringify(posts, null, 2));
fs.writeFileSync('./data/x_heatmap_links.json', JSON.stringify(toJSONGrid(gridLinks), null, 2));
fs.writeFileSync('./data/x_heatmap_engagement.json', JSON.stringify(toJSONGrid(gridEng), null, 2));

const summary = {
  generated_at: new Date().toISOString(),
  timezone: 'PT (America/Los_Angeles)',
  start_hour: START_HOUR,
  totals: {
    posts: totalPosts,
    link_posts: totalLinkPosts,
    engagement_sum: engagementSum
  }
};
fs.writeFileSync('./data/x_summary.json', JSON.stringify(summary, null, 2));
console.log('Wrote x_posts.json, x_heatmap_links.json, x_heatmap_engagement.json, x_summary.json');
