#!/usr/bin/env python3
"""
Ingest X (Twitter) posts using snscrape.
- Reads handles from accounts_x.txt (one per line) if present, else uses defaults.
- Scrapes last 14 days of public posts.
- Saves to data/x_raw.json
"""

import subprocess, sys, json, os
from datetime import datetime, timedelta

DEFAULT_HANDLES = ["nytimes","washingtonpost","wsj","ap","cnn","abc","nbcnews","cbsnews"]
OUTFILE = "data/x_raw.json"

def load_handles():
    path = "accounts_x.txt"
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            hs = [ln.strip().lstrip("@") for ln in f if ln.strip() and not ln.strip().startswith("#")]
        return hs or DEFAULT_HANDLES
    return DEFAULT_HANDLES

def run_snscrape(query):
    # call the module with the same Python interpreter used by the runner
    cmd = [sys.executable, "-m", "snscrape", "--jsonl", query]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in p.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            # ignore odd lines; keep streaming
            continue
    p.wait()

def main():
    handles = load_handles()
    since = (datetime.utcnow() - timedelta(days=14)).strftime("%Y-%m-%d")
    all_rows = []

    print(f"Using handles: {', '.join(handles)}")
    print(f"Since: {since}")

    for h in handles:
        q = f"from:{h} since:{since}"
        print(f"→ Scraping @{h} ...")
        for t in run_snscrape(q):
            all_rows.append({
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
        json.dump(all_rows, f, indent=2)

    print(f"✅ Wrote {len(all_rows)} rows to {OUTFILE}")

if __name__ == "__main__":
    main()
