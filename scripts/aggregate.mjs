import fs from 'fs';

function main() {
  const raw = JSON.parse(fs.readFileSync('./data/x_raw.json'));
  const summary = raw.map(t => ({
    username: t.username,
    text: t.text,
    date: t.date
  }));
  // Write outputs
fs.mkdirSync('./data', { recursive: true });
fs.writeFileSync('./data/x_posts.json', JSON.stringify(posts, null, 2));
fs.writeFileSync('./data/posts.json', JSON.stringify(posts, null, 2));  // <-- add this line
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
console.log('Wrote posts.json, x_posts.json, heatmaps, and x_summary.json');


}

main();