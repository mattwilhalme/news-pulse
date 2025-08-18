import 'dotenv/config';
import Parser from 'rss-parser';
import fs from 'fs';

const parser = new Parser();
const publishers = [
  { id:'nyt',  name:'New York Times',    url:'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  { id:'wapo', name:'Washington Post',   url:'https://feeds.washingtonpost.com/rss/politics' },
  { id:'wsj',  name:'Wall Street Journal', url:'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
  { id:'ap',   name:'Associated Press',  url:'https://apnews.com/hub/ap-top-news?utm_source=rss' },
  { id:'cnn',  name:'CNN',               url:'http://rss.cnn.com/rss/edition.rss' },
  { id:'abc',  name:'ABC News',          url:'https://abcnews.go.com/abcnews/topstories' },
  { id:'nbc',  name:'NBC News',          url:'https://feeds.nbcnews.com/nbcnews/public/news' },
  { id:'cbs',  name:'CBS News',          url:'https://www.cbsnews.com/latest/rss/main' },
];

const DAYS = 14;
const cutoff = Date.now() - DAYS*24*3600*1000;
const out = [];

for (const p of publishers) {
  try {
    const feed = await parser.parseURL(p.url);
    for (const item of feed.items ?? []) {
      const ts = new Date(item.isoDate || item.pubDate || item.date || '').getTime();
      if (!ts || ts < cutoff) continue;
      out.push({
        publisher_id: p.id,
        publisher_name: p.name,
        title: (item.title || '').trim(),
        url: item.link,
        created_at: new Date(ts).toISOString(),
        section: (Array.isArray(item.categories) ? item.categories[0] : (item.categories || '')) || '',
        description: (item.contentSnippet || item.content || '').toString().slice(0, 800),
      });
    }
  } catch (e) {
    console.error('Feed failed', p.name, e?.message);
  }
}

fs.writeFileSync('./data/posts.json', JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} posts to data/posts.json`);
