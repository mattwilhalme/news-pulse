// scripts/x_aggregate.mjs
// Aggregate raw X items into normalized posts + heatmaps + summary.
// Inputs:  ./data/x_raw.json
// Outputs: ./data/x_posts.json, ./data/posts.json,
//          ./data/x_heatmap_links.json, ./data/x_heatmap_engagement.json,
//          ./data/x_summary.json
//
// Heatmap rules:
// - Times are binned in PT (America/Los_Angeles)
// - 7 (Sun..Sat) × 24 matrix
// - Columns ordered starting at 6AM PT → 5AM PT (6..23, 0..5)

import fs from 'fs';

const DATA_DIR = './data';
const RAW = `${DATA_DIR}/x_raw.json`;
const POSTS = `${DATA_DIR}/x_posts.json`;
const POSTS_ALIAS = `${DATA_DIR}/posts.json`; // <-- also write for index.html
const HMAP_LINKS = `${DATA_DIR}/x_heatmap_links.json`;
const HMAP_ENG = `${DATA_DIR}/x_heatmap_engagement.json`;
const SUMMARY = `${DATA_DIR}/x_summary.json`;

const PT_TZ = 'America/Los_Angeles';
const START_HOUR = 6; // columns start at 6AM PT

function readJSON(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJSON(path, obj) {
  fs.writeFileSync(path, JSON.stringify(obj, null, 2));
}

// Build empty 7×24 matrix
function zeros7x24() {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

// Map hour (0..23) to column with 6AM offset: 6..23, 0..5
function colFromHourPT(hour) {
  // hour is already 0..23 in PT
  return (hour - START_HOUR + 24) % 24;
}

// Extract PT (dow, hour) from ISO date
function ptDowHour(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return { dow: null, hour: null };

  // Use Intl to get PT parts
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: PT_TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const wd = parts.find(p => p.type === 'weekday')?.value || 'Sun';
  const hourStr = parts.find(p => p.type === 'hour')?.value || '0';

  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[wd] ?? 0;
  const hour = Number(hourStr);
  return { dow, hour };
}

// Detect a link post
function isLinkPost(item) {
  const t = `${item.content || ''} ${item.url || ''}`.toLowerCase();
  return t.includes('http://') || t.includes('https://');
}

// Engagement sum
function engagement(item) {
  const likes = Number(item.likes ?? item.likeCount ?? 0);
  const rts = Number(item.rts ?? item.retweetCount ?? 0);
  const replies = Number(item.replies ?? item.replyCount ?? 0);
  const quotes = Number(item.quotes ?? item.quoteCount ?? 0);
  return likes + rts + replies + quotes;
}

// Normalize to frontend shape
function normalizeItem(raw) {
  return {
    id: raw.id ?? undefined,
    username: raw.username ?? raw.user ?? raw.author ?? 'unknown',
    content: raw.content ?? raw.text ?? raw.body ?? '',
    url: raw.url ?? raw.link ?? '',
    date: raw.date ?? raw.isoDate ?? raw.published ?? null,
    likes: Number(raw.likes ?? raw.likeCount ?? 0),
    replies: Number(raw.replies ?? raw.replyCount ?? 0),
    rts: Number(raw.rts ?? raw.retweetCount ?? 0),
    quotes: Number(raw.quotes ?? raw.quoteCount ?? 0),
  };
}

// Convert 7×24 matrix to the expected (7×24) with 6AM-based columns
// (We keep it as a 7×24 matrix, already using the 6AM offset in column calc)
function to7x24JSON(matrix) {
  return matrix;
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const raw = readJSON(RAW, []);
  if (!Array.isArray(raw)) {
    console.error(`[aggregate] ${RAW} not an array; writing empties.`);
  }

  const posts = [];
  const heatLinks = zeros7x24();
  const heatEng = zeros7x24();

  let totalPosts = 0;
  let totalLinkPosts = 0;
  let engagementSum = 0;

  for (const r of raw || []) {
    const n = normalizeItem(r);
    if (!n.date) continue; // need a time to bin

    const { dow, hour } = ptDowHour(n.date);
    if (dow === null || hour === null) continue;

    // bump heatmaps
    const col = colFromHourPT(hour);
    heatEng[dow][col] += engagement(n);
    if (isLinkPost(n)) {
      heatLinks[dow][col] += 1;
      totalLinkPosts += 1;
    }

    posts.push(n);
    totalPosts += 1;
    engagementSum += engagement(n);
  }

  // Sort newest first
  posts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Write outputs (note: posts.json added for the frontend to read)
  writeJSON(POSTS, posts);
  writeJSON(POSTS_ALIAS, posts); // <-- the fix (also write posts.json)

  writeJSON(HMAP_LINKS, to7x24JSON(heatLinks));
  writeJSON(HMAP_ENG, to7x24JSON(heatEng));

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
  writeJSON(SUMMARY, summary);

  console.log(
    `[aggregate] Wrote: ${POSTS}, ${POSTS_ALIAS}, ${HMAP_LINKS}, ${HMAP_ENG}, ${SUMMARY}`
  );
}

main();
