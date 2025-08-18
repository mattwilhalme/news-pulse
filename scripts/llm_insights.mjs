import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env or environment. Skipping.');
  process.exit(0);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const posts = JSON.parse(fs.readFileSync('./data/posts.json','utf8'));
const insights = JSON.parse(fs.readFileSync('./data/insights.json','utf8'));

const sample = posts
  .sort((a,b)=> new Date(b.created_at) - new Date(a.created_at))
  .slice(0, 60)
  .map(p => ({publisher:p.publisher_name, title:p.title, section:p.section, created_at:p.created_at}));

const system = `You are an editorial product analyst.
Given recent posts and simple aggregates, write a concise summary (<=120 words)
and 3-5 bullets with plausible reasons certain posts/time slots performed well.
Reference patterns you actually see (topics, timing, cadence).`;

const user = { aggregates: insights.metrics, posts_sample: sample };

const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  temperature: 0.4,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(user) }
  ]
});

const text = resp.choices[0]?.message?.content?.trim() || '';
const lines = text.split('\n').map(s=>s.trim()).filter(Boolean);
let summary = '';
const bullets = [];
for (const line of lines) {
  if (!summary && !line.startsWith('-') && !line.match(/^[•\*]/)) summary = line.replace(/^Summary:\s*/i,'');
  else if (line.startsWith('-') || line.match(/^[•\*]/)) bullets.push(line.replace(/^[-•\*]\s?/, ''));
}

const final = {
  ...insights,
  generated_at: new Date().toISOString(),
  summary: summary || text.slice(0, 280),
  bullets: bullets.slice(0,5),
};

fs.writeFileSync('./data/insights.json', JSON.stringify(final, null, 2));
console.log('Updated insights.json with LLM summary');
