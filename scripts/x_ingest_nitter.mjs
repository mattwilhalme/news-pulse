#!/usr/bin/env node
// scripts/x_ingest_nitter.mjs — robust Nitter RSS -> data/x_raw.json

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ACCOUNTS = process.env.ACCOUNTS_FILE || path.join(ROOT, "accounts_x.txt");
const OUTFILE = process.env.OUTFILE || path.join(DATA_DIR, "x_raw.json");

const MAX_PER_ACCOUNT = Number(process.env.MAX_PER_ACCOUNT || 200);
const DAYS_BACK = Number(process.env.DAYS_BACK || 14);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 12000);
const RETRIES = Number(process.env.RETRIES || 3);

// A broader pool; we'll randomize each request
const NITTERS = (process.env.NITTER_HOSTS || `
https://nitter.net
https://nitter.fdn.fr
https://nitter.privacydev.net
https://nitter.poast.org
https://nitter.lacontrevoie.fr
https://nitter.cz
https://nitter.mint.lgbt
https://ntrqq.onrender.com
`).trim().split(/\s+/).filter(Boolean);

// Basic RSS parser (no deps)
function parseRSS(xml) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const it = m[1];
    const pick = (tag) => (new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(it)?.[1] || "").trim();
    const title = decode(pick("title")).replace(/<!\[CDATA\[|\]\]>/g, "");
    const link = decode(pick("link"));
    const pubDate = decode(pick("pubDate")) || decode(pick("dc:date"));
    const description = decode(pick("description")).replace(/<!\[CDATA\[|\]\]>/g, "");
    items.push({ title, link, pubDate, description });
  }
  return items;
}
function decode(s) {
  return (s || "")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#039;/g,"'");
}
function isoFrom(pubDate) {
  const d = new Date(pubDate || "");
  return isNaN(d) ? null : d.toISOString();
}
function withinDays(iso, days) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= Date.now() - days*24*3600*1000;
}
function extractIdFromLink(link) {
  const m = /status\/(\d+)/.exec(link);
  return m ? m[1] : null;
}

function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms)),
  ]);
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchText(url) {
  const res = await withTimeout(fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      "Accept": "application/rss+xml,text/xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
  }), TIMEOUT_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

// Try: random Nitter -> (retry/backoff) -> r.jina.ai proxy as last resort
async function fetchRSSWithFallback(handle) {
  const shuffled = [...NITTERS].sort(() => Math.random() - 0.5);
  let lastErr;
  for (let attempt = 0; attempt < Math.min(RETRIES, shuffled.length); attempt++) {
    const host = shuffled[attempt];
    const url = `${host.replace(/\/+$/,"")}/${handle}/rss`;
    try {
      return await fetchText(url);
    } catch (e) {
      lastErr = e;
      const backoff = Math.min(2000 * (attempt + 1), 6000);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  // Final fallback through read-only proxy (returns the raw content, good for RSS too)
  try {
    const proxied = `https://r.jina.ai/http://${"nitter.net"}/${handle}/rss`;
    return await fetchText(proxied);
  } catch (e) {
    throw lastErr || e;
  }
}

async function readAccounts(file) {
  try {
    const txt = await fs.readFile(file, "utf8");
    return txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter(s => !s.startsWith("#")).map(s => s.replace(/^@/,""));
  } catch {
    return [];
  }
}

async function main() {
  const accounts = await readAccounts(ACCOUNTS);
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!accounts.length) {
    await fs.writeFile(OUTFILE, "[]");
    console.log(`[x_ingest_nitter] No accounts; wrote empty array to ${OUTFILE}`);
    return;
  }

  const all = [];
  for (const u of accounts) {
    try {
      const xml = await fetchRSSWithFallback(u);
      const items = parseRSS(xml);
      const rows = items
        .map(it => {
          const iso = isoFrom(it.pubDate);
          if (!iso) return null;
          return {
            id: extractIdFromLink(it.link) || `${u}-${iso}`,
            date: iso,
            user: u,
            url: it.link,
            content: it.title || it.description || "",
            likeCount: 0, replyCount: 0, retweetCount: 0, quoteCount: 0,
          };
        })
        .filter(Boolean)
        .filter(r => withinDays(r.date, DAYS_BACK))
        .slice(0, MAX_PER_ACCOUNT);

      console.log(`[x_ingest_nitter] @${u}: ${rows.length} items`);
      all.push(...rows);
    } catch (e) {
      console.error(`[x_ingest_nitter] ERROR for @${u}: ${e.message || e}`);
    }
  }

  // De-dupe by id; newest first
  const map = new Map();
  for (const r of all) map.set(r.id, r);
  const list = [...map.values()].sort((a,b) => new Date(b.date) - new Date(a.date));

  await fs.writeFile(OUTFILE, JSON.stringify(list, null, 2));
  console.log(`[x_ingest_nitter] ✅ wrote ${list.length} items to ${OUTFILE}`);
}

main().catch(e => {
  console.error("[x_ingest_nitter] FATAL", e);
  process.exit(1);
});
