#!/usr/bin/env python3
"""
Ingest X (Twitter) posts for specific brand accounts using snscrape.
Fetches the last 14 days of posts, including engagement metrics.
Outputs JSON into data/x_raw.json.
"""

import subprocess
import sys
import json
import os
from datetime import datetime, timedelta

# List of X handles to scrape
HANDLES = [
    "nytimes",
    "washingtonpost",
    "wsj",
    "ap",
    "cnn",
    "abc",
    "nbcnews",
    "cbsnews"
]

OUTFILE = "data/x_raw.json"


def run_snscrape(query):
    """
    Run snscrape as a subprocess and yield parsed JSON lines.
    Uses the current Python executable to ensure the right environment.
    """
    cmd = [sys.executable, "-m", "snscrape", "--jsonl", query]
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    for line in process.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue

    process.wait()


def main():
    since = (datetime.utcnow() - timedelta(days=14)).strftime("%Y-%m-%d")
    all_posts = []

    for handle in HANDLES:
        print(f"Fetching posts for @{handle} since {since}...")
        query = f"from:{handle} since:{since}"
        for post in run_snscrape(query):
            # Only keep fields we care about
            item = {
                "id": post.get("id"),
                "date": post.get("date"),
                "content": post.get("content"),
                "url": post.get("url"),
                "user": post.get("user", {}).get("username"),
                "replyCount": post.get("replyCount"),
                "retweetCount": post.get("retweetCount"),
                "likeCount": post.get("likeCount"),
                "quoteCount": post.get("quoteCount"),
            }
            all_posts.append(item)

    # Ensure output folder exists
    os.makedirs("data", exist_ok=True)

    with open(OUTFILE, "w", encoding="utf-8") as f:
        json.dump(all_posts, f, indent=2)

    print(f"✅ Saved {len(all_posts)} posts to {OUTFILE}")


if __name__ == "__main__":
    main()
