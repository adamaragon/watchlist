#!/usr/bin/env python3
"""Back up data.json to an Airtable table (upsert by `id`).

Env:
  AIRTABLE_PAT      personal access token (scope: data.records:write, schema optional)
  AIRTABLE_BASE_ID  e.g. appXXXXXXXXXXXXXX
  AIRTABLE_TABLE    table name or id (default: "Watchlist")

Run locally:  AIRTABLE_PAT=... AIRTABLE_BASE_ID=... python3 scripts/airtable_sync.py
Runs in CI daily via .github/workflows/airtable-backup.yml
"""
import json, os, socket, sys, time, urllib.error, urllib.parse, urllib.request

PAT = os.environ.get("AIRTABLE_PAT")
BASE = os.environ.get("AIRTABLE_BASE_ID")
TABLE = os.environ.get("AIRTABLE_TABLE", "Watchlist")
DATA = os.path.join(os.path.dirname(__file__), "..", "data.json")
MAX_ATTEMPTS = 4

if not PAT or not BASE:
    print("ERROR: set AIRTABLE_PAT + AIRTABLE_BASE_ID", file=sys.stderr)
    sys.exit(1)

def request_bytes(req, *, label):
    last_exc = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "ignore")[:200]
            if e.code != 429 and e.code < 500:
                print(f"{label} failed: HTTP {e.code}: {body}", file=sys.stderr)
                raise
            last_exc = RuntimeError(f"HTTP {e.code}: {body}")
            detail = str(last_exc)
        except (TimeoutError, urllib.error.URLError, socket.timeout, OSError) as e:
            last_exc = e
            detail = str(e)
        if attempt == MAX_ATTEMPTS - 1:
            print(f"{label} failed after {MAX_ATTEMPTS} attempts: {detail}", file=sys.stderr)
            raise last_exc
        print(f"{label} retrying after transient error: {detail}", file=sys.stderr)
        time.sleep(2 * (attempt + 1))

def validate_local_data(data):
    seen = set()
    dupes = set()
    for idx, item in enumerate(data, start=1):
        iid = (item.get("id") or "").strip()
        if not iid:
            print(f"Local data.json item #{idx} is missing an id.", file=sys.stderr)
            sys.exit(1)
        if iid in seen:
            dupes.add(iid)
        seen.add(iid)
    if dupes:
        sample = ", ".join(sorted(dupes)[:10])
        print(f"Local data.json has duplicate ids ({len(dupes)}): {sample}", file=sys.stderr)
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
    records_written = len(json.loads(request_bytes(req, label=f"Upsert Airtable batch of {len(records)}"))["records"])
    if records_written != len(records):
        print(f"Upsert mismatch: wrote {records_written} of {len(records)} requested records.", file=sys.stderr)
        sys.exit(1)
    return records_written

def fetch_all_ids():
    """Return [(recordId, idField)] for every Airtable record (id field only)."""
    base_url = f"https://api.airtable.com/v0/{BASE}/{urllib.parse.quote(TABLE)}"
    out, offset, page = [], "", 1
    while True:
        u = base_url + "?pageSize=100&fields%5B%5D=id" + (f"&offset={offset}" if offset else "")
        req = urllib.request.Request(u, headers={"Authorization": f"Bearer {PAT}"})
        j = json.loads(request_bytes(req, label=f"Fetch Airtable prune page {page}"))
        for rec in j.get("records", []):
            out.append((rec["id"], (rec.get("fields") or {}).get("id")))
        offset = j.get("offset", "")
        if not offset:
            break
        page += 1
        time.sleep(0.2)
    return out

def delete_records(record_ids):
    base_url = f"https://api.airtable.com/v0/{BASE}/{urllib.parse.quote(TABLE)}"
    n = 0
    for i in range(0, len(record_ids), 10):
        qs = "&".join("records[]=" + rid for rid in record_ids[i:i+10])
        req = urllib.request.Request(base_url + "?" + qs, method="DELETE",
                                     headers={"Authorization": f"Bearer {PAT}"})
        deleted = json.loads(request_bytes(req, label=f"Delete Airtable stale batch starting at {i + 1}")).get("records", [])
        n += sum(1 for x in deleted if x.get("deleted"))
        time.sleep(0.2)
    return n

def main():
    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    validate_local_data(data)
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
