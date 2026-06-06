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

# Fallback: read the same public config the website uses, so the daily GitHub
# Action needs NO repo secrets — the token is already public in airtable-config.js.
if not PAT or not BASE:
    import re
    cfg = os.path.join(os.path.dirname(__file__), "..", "assets", "airtable-config.js")
    try:
        txt = open(cfg).read()
        if not PAT:
            m = re.search(r"PAT:\s*'([^']*)'", txt);  PAT = m.group(1) if m else PAT
        if not BASE:
            m = re.search(r"BASE:\s*'([^']*)'", txt); BASE = m.group(1) if m else BASE
    except OSError:
        pass

if not PAT or not BASE:
    print("ERROR: set AIRTABLE_PAT + AIRTABLE_BASE_ID (env) or fill assets/airtable-config.js", file=sys.stderr)
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

def fetch_all_ids():
    """Return [(recordId, idField)] for every Airtable record (id field only)."""
    base_url = f"https://api.airtable.com/v0/{BASE}/{urllib.parse.quote(TABLE)}"
    out, offset = [], ""
    while True:
        u = base_url + "?pageSize=100&fields%5B%5D=id" + (f"&offset={offset}" if offset else "")
        req = urllib.request.Request(u, headers={"Authorization": f"Bearer {PAT}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.loads(r.read())
        for rec in j.get("records", []):
            out.append((rec["id"], (rec.get("fields") or {}).get("id")))
        offset = j.get("offset", "")
        if not offset:
            break
        time.sleep(0.2)
    return out

def delete_records(record_ids):
    base_url = f"https://api.airtable.com/v0/{BASE}/{urllib.parse.quote(TABLE)}"
    n = 0
    for i in range(0, len(record_ids), 10):
        qs = "&".join("records[]=" + rid for rid in record_ids[i:i+10])
        req = urllib.request.Request(base_url + "?" + qs, method="DELETE",
                                     headers={"Authorization": f"Bearer {PAT}"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    n += sum(1 for x in json.loads(r.read()).get("records", []) if x.get("deleted"))
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 or e.code >= 500:
                    time.sleep(2 * (attempt + 1)); continue
                raise
        time.sleep(0.2)
    return n

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

    # Prune: delete Airtable records whose id is no longer in data.json, so the
    # mirror reflects deletions. Guarded against nuking on a bad/empty load.
    ids = {it.get("id") for it in data if it.get("id")}
    if len(ids) < 100:
        print("Prune skipped (data.json < 100 ids — safety guard).", file=sys.stderr); return
    allrecs = fetch_all_ids()
    stale = [rid for rid, idf in allrecs if idf and idf not in ids]
    if allrecs and len(stale) > len(allrecs) * 0.5:
        print(f"Prune ABORTED: would delete {len(stale)}/{len(allrecs)} (suspicious).", file=sys.stderr); return
    if stale:
        print(f"Pruned {delete_records(stale)} stale records.")
    else:
        print("Nothing to prune.")

if __name__ == "__main__":
    main()
