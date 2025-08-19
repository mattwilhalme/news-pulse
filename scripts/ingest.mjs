import fs from 'fs';
import fetch from 'node-fetch';
import 'dotenv/config';

const accounts = ['nytimes', 'washingtonpost', 'WSJ'];

async function fakeScrape(account) {
  // fallback demo fetch — replace with OpenAI scraping later
  return [
    { username: account, text: `Sample tweet from ${account}`, date: new Date().toISOString() }
  ];
}

async function main() {
  let all = [];
  for (const acc of accounts) {
    console.log(`[ingest] fetching ${acc}`);
    const tweets = await fakeScrape(acc);
    all = all.concat(tweets);
  }
  fs.writeFileSync('./data/x_raw.json', JSON.stringify(all, null, 2));
  console.log(`[ingest] wrote ${all.length} tweets to ./data/x_raw.json`);
}

main();
