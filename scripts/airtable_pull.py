#!/usr/bin/env python3
"""Airtable -> data.json (the pull half of the 2-way sync).

Updates tracked fields on existing items (by `id`), adds rows created in
Airtable, and removes items deleted in Airtable — but only ones present in the
last snapshot (so a locally-added, not-yet-synced item is never wrongly
deleted). Set DRY_RUN=1 to report without writing. Runs in CI via
airtable-pull.yml.
"""
import json, os, re, sys, time, datetime, urllib.parse, urllib.request

PAT = os.environ.get("AIRTABLE_PAT")
BASE = os.environ.get("AIRTABLE_BASE_ID")
TABLE = os.environ.get("AIRTABLE_TABLE", "Watchlist")
DRY = os.environ.get("DRY_RUN") == "1"
DATA = os.path.join(os.path.dirname(__file__), "..", "data.json")
SNAP = os.path.join(os.path.dirname(__file__), "airtable_snapshot.json")
if not PAT or not BASE:
    print("ERROR: need AIRTABLE_PAT + AIRTABLE_BASE_ID", file=sys.stderr); sys.exit(1)

BASEURL = f"https://api.airtable.com/v0/{BASE}/{urllib.parse.quote(TABLE)}"
HDR = {"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"}

def slugify(s):
    s = re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')
    return re.sub(r'-{2,}', '-', s) or 'item'

def fetch_all():
    out, offset = [], ""
    while True:
        u = BASEURL + "?pageSize=100" + (f"&offset={offset}" if offset else "")
        with urllib.request.urlopen(urllib.request.Request(u, headers={"Authorization": f"Bearer {PAT}"}), timeout=30) as r:
            j = json.loads(r.read())
        out += j.get("records", [])
        offset = j.get("offset", "")
        if not offset: break
        time.sleep(0.2)
    return out

def patch_id(rid, new_id):
    if DRY: return
    body = json.dumps({"fields": {"id": new_id}}).encode()
    try:
        urllib.request.urlopen(urllib.request.Request(f"{BASEURL}/{rid}", data=body, method="PATCH", headers=HDR), timeout=30).read()
    except Exception as e:
        print("  id write-back failed:", e, file=sys.stderr)

def tracked(f):
    y = f.get("Year")
    if isinstance(y, (int, float)):
        y = int(y) if float(y).is_integer() else y
    else:
        y = None
    g = f.get("Genres") or ""
    return {
        "title": (f.get("Title") or "").strip(),
        "type": (f.get("Type") or "").strip().lower(),
        "year": y,
        "author": (f.get("Author") or "").strip(),
        "tags": [t.strip() for t in g.split(",") if t.strip()],
        "summary": (f.get("Summary") or "").strip(),
        "blurb": (f.get("Blurb") or "").strip(),
        "poster": (f.get("Poster") or "").strip(),
        "verdict": (f.get("Verdict") or "").strip() or None,
        "status": (f.get("Status") or "").strip() or "todo",
        "source": (f.get("Source") or "").strip(),
    }

def differs(cur, k, v):
    if k == "tags": return (cur or []) != (v or [])
    if k == "year": return cur != v
    if k == "verdict": return (cur or None) != (v or None)
    return (cur or "") != (v or "")

# Never overwrite these with an EMPTY Airtable value (protects content against
# the ~2-min push-sync lag). verdict/status excluded so re-bucketing works.
NEVER_BLANK = {"poster", "title", "year", "author", "summary", "blurb", "tags", "type", "source"}

def main():
    data = json.load(open(DATA))
    recs = fetch_all()
    if not recs or len(recs) < len(data) * 0.5:
        print(f"Pull ABORTED: Airtable returned {len(recs)} vs data.json {len(data)} (too few — likely a fetch error).", file=sys.stderr)
        sys.exit(0)
    current_ids = {(r.get("fields") or {}).get("id") for r in recs if (r.get("fields") or {}).get("id")}
    changed = []

    # Deletions: ids in the last snapshot but gone from Airtable now.
    deleted = 0
    try:
        prev_ids = set(json.load(open(SNAP)))
    except Exception:
        prev_ids = set()
    if prev_ids:
        gone = {it.get("id") for it in data if it.get("id") in prev_ids and it.get("id") not in current_ids}
        if len(gone) > 100:
            print(f"Deletion guard: {len(gone)} would be removed — skipping as suspicious.", file=sys.stderr)
        elif gone:
            changed += ["[deleted] " + (it.get("title") or "") for it in data if it.get("id") in gone]
            data = [it for it in data if it.get("id") not in gone]
            deleted = len(gone)

    by_id = {it.get("id"): it for it in data}
    updated = added = 0
    today = datetime.date.today().isoformat()
    for rec in recs:
        f = rec.get("fields") or {}
        rid, iid = rec["id"], (f.get("id") or "").strip()
        tr = tracked(f)
        if not tr["title"]:
            continue
        if iid and iid in by_id:
            it = by_id[iid]; chg = False
            for k, v in tr.items():
                if k in NEVER_BLANK and v in (None, "", []):
                    continue
                if differs(it.get(k), k, v):
                    it[k] = v; chg = True
            if chg:
                updated += 1; changed.append(tr["title"])
        else:
            new_id = iid or slugify(tr["title"]); b = new_id; n = 2
            while new_id in by_id:
                new_id = f"{b}-{n}"; n += 1
            if not tr["type"]: tr["type"] = "other"
            item = {"id": new_id, **tr, "link": "", "notes": "", "rating": None, "added": today}
            data.append(item); by_id[new_id] = item; added += 1; changed.append("[new] " + tr["title"])
            if not iid: patch_id(rid, new_id)

    if not DRY:
        if updated or added or deleted:
            json.dump(data, open(DATA, "w"), ensure_ascii=False, indent=2)
        json.dump(sorted(current_ids), open(SNAP, "w"))
    print(f"Pull{' (DRY)' if DRY else ''}: updated {updated}, added {added}, deleted {deleted}, total {len(data)}.")
    for t in changed[:30]:
        print("  ~", t)

if __name__ == "__main__":
    main()
