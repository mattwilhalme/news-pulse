// x_ingest_nitter.mjs
// Ingest latest tweets for the handles in accounts_x.txt using public Nitter RSS.
// Output: ./data/x_raw.json (then x_aggregate.mjs will normalize to x_posts.json, heatmaps, summary)

import fs from 'fs';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'news-pulse/1.0 (+https://github.com/)' }
});

// Rotating list of Nitter instances (fastest first; order matters)
const NITTERS = [
  'https://nitter.net',
  'https://nitter.poast.org',
  'https://nitter.lacontrevoie.fr',
  'https://nitter.hostux.net',
  'https://ntrqq.com' // backup
];

// read handles (one per line; allow comments and @)
const handles = fs
  .readFileSync('./accounts_x.txt','utf8')
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('#'))
  .map(s => s.replace(/^@/, ''));

if (!handles.length) {
  console.error('No handles found in accounts_x.txt');
  process.exit(0);
}

// helper: try fetching rss from multiple instances with retries
async function fetchFeed(handle) {
  const paths = [
    h => `/${h}/rss`,
    h => `/search/rss?f=tweets&q=from%3A${encodeURIComponent(h)}`
  ];
  for (const base of NITTERS) {
    for (const pathBuilder of paths) {
      const url = `${base}${pathBuilder(handle)}`;
      try {
        const feed = await parser.parseURL(url);
        if ((feed.items?.length || 0) > 0) return feed;
      } catch (e) {
        // just try next
      }
    }
  }
  throw new Error(`All Nitter instances failed for ${handle}`);
}

const out = [];
for (const h of handles) {
  let items = [];
  try {
    const feed = await fetchFeed(h);
    items = feed.items ?? [];
  } catch (e) {
    console.error(`[x_ingest_nitter] ERROR for @${h}: ${e.message}`);
    continue;
  }

  let added = 0;
  for (const it of items) {
    // Nitter RSS gives: title, link, pubDate, contentSnippet
    const iso = it.isoDate || it.pubDate || '';
    const url = it.link || '';
    const id = url.split('/status/')[1]?.split(/[?#]/)[0] || undefined;

    const text = [
      it.title?.trim() || '',
      it.contentSnippet?.trim() || ''
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    out.push({
      id,
      user: h,
      date: iso ? new Date(iso).toISOString() : null,
      url,
      content: text,
      // engagement counts are not in RSS; leave zeros so aggregator still works
      likeCount: 0,
      replyCount: 0,
      retweetCount: 0,
      quoteCount: 0
    });
    added++;
  }
  console.log(`[x_ingest_nitter] @${h}: ${added} items`);
}

fs.mkdirSync('./data', { recursive: true });
fs.writeFileSync('./data/x_raw.json', JSON.stringify(out, null, 2));
console.log(`[x_ingest_nitter] ✅ wrote ${out.length} items to ./data/x_raw.json`);