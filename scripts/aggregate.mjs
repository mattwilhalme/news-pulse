import fs from 'fs';

function main() {
  const raw = JSON.parse(fs.readFileSync('./data/x_raw.json'));
  const summary = raw.map(t => ({
    username: t.username,
    text: t.text,
    date: t.date
  }));
  fs.writeFileSync('./data/x_summary.json', JSON.stringify(summary, null, 2));
  console.log(`[aggregate] wrote ${summary.length} items`);
}

main();