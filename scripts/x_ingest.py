=#!/usr/bin/env python3
"""
Ingest X (Twitter) posts using snscrape.
- Reads handles from accounts_x.txt (one per line) if present, else defaults.
- Scrapes last 14 days.
- Saves to data/x_raw.json
"""

import subprocess, sys, json, os
from datetime import datetime, timedelta

DEFAULT_HANDLES = ["nytimes","washingtonpost","wsj","ap","cnn","abc","nbcnews","cbsnews"]
OUTFILE = "data/x_raw.json"
PER_HANDLE_MAX = 500  # safety cap so we don't pull thousands per account

def load_handles():
    path = "accounts_x.txt"
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            hs = [ln.strip().lstrip("@") for ln in f if ln.strip() and not ln.strip().startswith("#")]
        return hs or DEFAULT_HANDLES
    return DEFAULT_HANDLES

def run_snscrape(module, query, max_results=None):
    """
    Run snscrape module (e.g., 'twitter-search') and yield JSONL rows.
    """
    cmd = [sys.executable, "-m", "snscrape", "--jsonl"]
    if max_results:
        cmd += ["--max-results", str(max_results)]
    cmd += [module, query]

    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in p.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue
    p.wait()

def main():
    handles = load_handles()
    since_date = (datetime.utcnow() - timedelta(days=14)).date()
    until_date = (datetime.utcnow() + timedelta(days=1)).date()  # exclusive upper bound

    print("Using handles:", ", ".join(handles))
    print(f"Since: {since_date}  Until: {until_date}")

    rows = []
    for h in handles:
        # twitter-search returns across time with filters; we supply from:, since:, until:
        q = f'from:{h} since:{since_date} until:{until_date}'
        print(f"→ Scraping @{h} with query: {q}")
        for t in run_snscrape("twitter-search", q, max_results=PER_HANDLE_MAX):
            rows.append({
                "id": t.get("id"),
                "date": t.get("date"),
                "content": t.get("content"),
                "url": t.get("url"),
                "user": (t.get("user") or {}).get("username"),
                "replyCount": t.get("replyCount") or 0,
                "retweetCount": t.get("retweetCount") or 0,
                "likeCount": t.get("likeCount") or 0,
                "quoteCount": t.get("quoteCount") or 0,
            })

    os.makedirs("data", exist_ok=True)
    with open(OUTFILE, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)

    print(f"✅ Wrote {len(rows)} rows to {OUTFILE}")

if __name__ == "__main__":
    main()
