# scripts/x_ingest.py
# Fetches last 14 days of posts from accounts_x.txt using snscrape and writes data/x_posts.json

import json, subprocess, sys, time, pathlib, datetime, re
from datetime import timezone, timedelta

ROOT = pathlib.Path(__file__).resolve().parent.parent
ACC_FILE = ROOT / "accounts_x.txt"
OUT_DIR = ROOT / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_FILE = OUT_DIR / "x_posts.json"

DAYS = 14
since = (datetime.datetime.now(timezone.utc) - datetime.timedelta(days=DAYS)).strftime("%Y-%m-%d")

def run_snscrape(query):
    # Returns JSON lines from snscrape; each line is a JSON object
    cmd = ["snscrape", "--jsonl", query]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in p.stdout:
        if line.strip():
            yield json.loads(line)
    p.wait()

def normalize(t):
    # t is a raw snscrape tweet dict
    content = t.get("content") or ""
    urls = []
    # collect expandedUrls if present, else from content
    for u in (t.get("outlinks") or []):
        urls.append(u)
    # quick URL regex fallback
    urls += re.findall(r'https?://\S+', content)
    urls = list(dict.fromkeys(urls))  # dedupe, keep order

    has_link = len(urls) > 0
    # basic link domains for quick filtering/heatmap of story links
    domains = []
    for u in urls:
        try:
            domains.append(re.sub(r"^www\.", "", re.findall(r"https?://([^/]+)/?", u)[0]))
        except:
            pass

    return {
        "id": t.get("id"),
        "date": t.get("date"),                      # ISO timestamp (UTC)
        "username": t.get("user", {}).get("username"),
        "displayname": t.get("user", {}).get("displayname"),
        "url": t.get("url"),
        "content": content,
        "replyCount": t.get("replyCount") or 0,
        "retweetCount": t.get("retweetCount") or 0,
        "likeCount": t.get("likeCount") or 0,
        "quoteCount": t.get("quoteCount") or 0,
        "viewCount": t.get("viewCount") or 0,
        "has_link": has_link,
        "link_urls": urls,
        "link_domains": list(dict.fromkeys(domains)),
    }

def main():
    if not ACC_FILE.exists():
        print(f"Missing {ACC_FILE} — create it with one handle per line.")
        sys.exit(1)

    handles = [h.strip() for h in ACC_FILE.read_text().splitlines() if h.strip() and not h.strip().startswith("#")]

    all_rows = []
    for h in handles:
        # Query: from:handle since:YYYY-MM-DD
        q = f"twitter-user:{h} since:{since}"
        # Note: "twitter-user:" works in snscrape >= 0.7.0; older versions use "from:"
        # If needed, switch to: q = f"from:{h} since:{since}"
        for raw in run_snscrape(q):
            all_rows.append(normalize(raw))

    # Sort newest first
    all_rows.sort(key=lambda r: r["date"] or "", reverse=True)
    OUT_FILE.write_text(json.dumps(all_rows, indent=2))
    print(f"Wrote {len(all_rows)} posts to {OUT_FILE}")

if __name__ == "__main__":
    main()
