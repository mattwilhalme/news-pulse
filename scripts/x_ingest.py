#!/usr/bin/env python3
# x_ingest.py — use snscrape CLI to fetch tweets into ./data/x_raw.json

import os, sys, json, subprocess, shutil
from datetime import datetime, timedelta, timezone

DAYS_BACK = int(os.getenv("DAYS_BACK", "14"))
MAX_PER_ACCOUNT = int(os.getenv("MAX_PER_ACCOUNT", "200"))
ACCOUNTS_FILE = os.getenv("ACCOUNTS_FILE", "./accounts_x.txt")
OUTFILE = os.getenv("OUTFILE", "./data/x_raw.json")

def find_snscrape_cmd():
    # Prefer CLI if available, else python -m snscrape
    if shutil.which("snscrape"):
        return ["snscrape"]
    # Fall back to current python
    return [sys.executable, "-m", "snscrape"]

def read_accounts(path):
    if not os.path.exists(path):
        return []
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            h = line.strip()
            if not h or h.startswith("#"):
                continue
            if h.startswith("@"): h = h[1:]
            out.append(h)
    return out

def iso_utc(dt):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()

def run_search(handle, since_iso, max_results):
    # Use twitter-search (more robust than twitter-user) to honor 'since:'
    q = f'from:{handle} since:{since_iso}'
    cmd = find_snscrape_cmd() + ["--jsonl", "--max-results", str(max_results), "twitter-search", q]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except Exception as e:
        sys.stderr.write(f"[x_ingest] FATAL: could not run snscrape: {e}\n")
        return []

    rows = []
    if proc.returncode != 0:
        sys.stderr.write(f"[x_ingest] snscrape nonzero for @{handle}: {proc.returncode}\n{proc.stderr}\n")
        return rows

    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line: continue
        try:
            j = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Normalize for our aggregator
        date = j.get("date")
        if not date:
            continue
        content = j.get("rawContent") or j.get("content") or ""
        user = (j.get("user") or {}).get("username") or handle
        url = j.get("url") or f"https://twitter.com/{user}/status/{j.get('id')}"
        # snscrape names are usually these:
        likeCount    = int(j.get("likeCount") or 0)
        replyCount   = int(j.get("replyCount") or 0)
        retweetCount = int(j.get("retweetCount") or 0)
        quoteCount   = int(j.get("quoteCount") or 0)

        rows.append({
            "id": str(j.get("id")),
            "date": date,           # ISO string
            "user": user,
            "url": url,
            "content": content,
            "likeCount": likeCount,
            "replyCount": replyCount,
            "retweetCount": retweetCount,
            "quoteCount": quoteCount
        })
    return rows

# inside scripts/x_ingest.py
import shutil, subprocess, sys, json, pathlib

sns = shutil.which("snscrape")
if not sns:
    sys.exit("snscrape not found on PATH (activate venv)")

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

# example usage:
# res = run([sns, 'twitter-search', 'from:nytimes since:2025-08-04'])

def main():
    accounts = read_accounts(ACCOUNTS_FILE)
    if not accounts:
        sys.stderr.write(f"[x_ingest] No accounts in {ACCOUNTS_FILE}\n")
        os.makedirs(os.path.dirname(OUTFILE), exist_ok=True)
        with open(OUTFILE, "w", encoding="utf-8") as f:
            json.dump([], f)
        print(f"[x_ingest] wrote empty list to {OUTFILE}")
        return

    since_dt = datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)
    since_str = since_dt.strftime("%Y-%m-%d")

    all_rows = []
    for h in accounts:
        rows = run_search(h, since_str, MAX_PER_ACCOUNT)
        sys.stderr.write(f"[x_ingest] @{h}: {len(rows)} tweets\n")
        all_rows.extend(rows)

    # Sort newest first
    all_rows.sort(key=lambda r: r.get("date",""), reverse=True)

    os.makedirs(os.path.dirname(OUTFILE), exist_ok=True)
    with open(OUTFILE, "w", encoding="utf-8") as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=2)

    print(f"[x_ingest] ✅ wrote {len(all_rows)} tweets to {OUTFILE}")

if __name__ == "__main__":
    main()