#!/usr/bin/env python3
"""Back up data.json to an Airtable table (upsert by `id`).

Env:
  AIRTABLE_PAT      personal access token (scope: data.records:write, schema optional)
  AIRTABLE_BASE_ID  e.g. appXXXXXXXXXXXXXX
  AIRTABLE_TABLE    table name or id (default: "Watchlist")

Run locally:  AIRTABLE_PAT=... AIRTABLE_BASE_ID=... python3 scripts/airtable_sync.py
Runs in CI daily via .github/workflows/airtable-backup.yml
"""
import json, os, sys, time, urllib.request, urllib.error

PAT = os.environ.get("AIRTABLE_PAT")
BASE = os.environ.get("AIRTABLE_BASE_ID")
TABLE = os.environ.get("AIRTABLE_TABLE", "Watchlist")
DATA = os.path.join(os.path.dirname(__file__), "..", "data.json")

if not PAT or not BASE:
    print("ERROR: set AIRTABLE_PAT and AIRTABLE_BASE_ID", file=sys.stderr)
    sys.exit(1)

def field_map(it):
    return {
        "id": it.get("id", ""),
        "Title": it.get("title", ""),
        "Type": it.get("type", ""),
        "Year": it.get("year"),
        "Author": it.get("author", ""),
        "Genres": ", ".join(it.get("tags", []) or []),
        "Summary": it.get("summary", ""),
        "Blurb": it.get("blurb", ""),
        "Poster": it.get("poster", ""),
        "Verdict": it.get("verdict") or "",
        "Status": it.get("status", ""),
        "Source": it.get("source", ""),
    }

def post_batch(records):
    url = f"https://api.airtable.com/v0/{BASE}/{urllib.parse.quote(TABLE)}"
    body = json.dumps({
        "performUpsert": {"fieldsToMergeOn": ["id"]},
        "records": [{"fields": f} for f in records],
        "typecast": True,
    }).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "Authorization": f"Bearer {PAT}",
        "Content-Type": "application/json",
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return len(json.loads(r.read()).get("records", []))
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "ignore")[:200]
            if e.code == 429 or e.code >= 500:
                time.sleep(2 * (attempt + 1)); continue
            print(f"HTTP {e.code}: {msg}", file=sys.stderr); raise
        except Exception:
            if attempt == 3: raise
            time.sleep(2 * (attempt + 1))
    return 0

import urllib.parse
def main():
    data = json.load(open(DATA))
    total = 0
    batch = []
    for it in data:
        batch.append(field_map(it))
        if len(batch) == 10:
            total += post_batch(batch); batch = []; time.sleep(0.25)
    if batch:
        total += post_batch(batch)
    print(f"Upserted {total} of {len(data)} records to Airtable base {BASE}/{TABLE}.")

if __name__ == "__main__":
    main()
