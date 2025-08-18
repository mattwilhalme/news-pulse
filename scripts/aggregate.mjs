import fs from 'fs';

const posts = JSON.parse(fs.readFileSync('./data/posts.json','utf8'));

// Heatmap counts by day-of-week & hour (UTC)
const heat = new Map();
for (const p of posts) {
  const d = new Date(p.created_at);
  const dow = d.getUTCDay();    // 0..6
  const hour = d.getUTCHours(); // 0..23
  const key = `${dow}-${hour}`;
  heat.set(key, (heat.get(key) || 0) + 1);
}
const heatmap = [...heat.entries()].map(([k, count]) => {
  const [dow, hour] = k.split('-').map(Number);
  return { dow, hour, count };
});
fs.writeFileSync('./data/heatmap.json', JSON.stringify(heatmap, null, 2));

// Simple aggregates for LLM
const byPub = posts.reduce((m,p)=>(m[p.publisher_id]=(m[p.publisher_id]||0)+1, m), {});
const topPublishers = Object.entries(byPub).sort((a,b)=>b[1]-a[1]).slice(0,3);

const insights = {
  generated_at: new Date().toISOString(),
  metrics: {
    total_posts: posts.length,
    top_publishers: topPublishers.map(([id,count])=>({id,count})),
    top_slots_utc: [...heatmap].sort((a,b)=>b.count-a.count).slice(0,3),
  },
  summary: "LLM summary not generated yet.",
  bullets: [],
};
fs.writeFileSync('./data/insights.json', JSON.stringify(insights, null, 2));
console.log('Wrote heatmap.json and insights.json stub');
