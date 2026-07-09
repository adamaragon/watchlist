#!/usr/bin/env python3
"""Airtable -> data.json (the pull half of the 2-way sync).

Updates tracked fields on existing items (by `id`), adds rows created in
Airtable, and removes items deleted in Airtable — but only ones present in the
last snapshot (so a locally-added, not-yet-synced item is never wrongly
deleted). Set DRY_RUN=1 to report without writing. Runs in CI via
airtable-pull.yml.
"""
import datetime, json, os, re, socket, sys, time, urllib.error, urllib.parse, urllib.request

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
MAX_ATTEMPTS = 4

def slugify(s):
    s = re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')
    return re.sub(r'-{2,}', '-', s) or 'item'

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

def write_json(path, payload, **dump_kwargs):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, **dump_kwargs)
        fh.write("\n")
    os.replace(tmp, path)

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

def validate_airtable_ids(records):
    seen = set()
    dupes = set()
    for rec in records:
        iid = ((rec.get("fields") or {}).get("id") or "").strip()
        if not iid:
            continue
        if iid in seen:
            dupes.add(iid)
        seen.add(iid)
    if dupes:
        sample = ", ".join(sorted(dupes)[:10])
        print(f"Airtable contains duplicate non-empty ids ({len(dupes)}): {sample}", file=sys.stderr)
        sys.exit(1)

def fetch_all():
    out, offset, page = [], "", 1
    while True:
        u = BASEURL + "?pageSize=100" + (f"&offset={offset}" if offset else "")
        req = urllib.request.Request(u, headers={"Authorization": f"Bearer {PAT}"})
        j = json.loads(request_bytes(req, label=f"Fetch Airtable page {page}"))
        out += j.get("records", [])
        offset = j.get("offset", "")
        if not offset: break
        page += 1
        time.sleep(0.2)
    return out

def patch_id(rid, new_id):
    if DRY: return
    body = json.dumps({"fields": {"id": new_id}}).encode()
    req = urllib.request.Request(f"{BASEURL}/{rid}", data=body, method="PATCH", headers=HDR)
    request_bytes(req, label=f"Write back Airtable id for record {rid}")

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
    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    validate_local_data(data)
    recs = fetch_all()
    validate_airtable_ids(recs)
    if not recs or len(recs) < len(data) * 0.5:
        print(f"Pull ABORTED: Airtable returned {len(recs)} vs data.json {len(data)} (too few — likely a fetch error).", file=sys.stderr)
        sys.exit(1)
    current_ids = {(r.get("fields") or {}).get("id") for r in recs if (r.get("fields") or {}).get("id")}
    changed = []

    # Deletions: ids in the last snapshot but gone from Airtable now.
    deleted = 0
    try:
        with open(SNAP, encoding="utf-8") as fh:
            prev_ids = set(json.load(fh))
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
            write_json(DATA, data, ensure_ascii=False, indent=2)
        write_json(SNAP, sorted(current_ids))
    print(f"Pull{' (DRY)' if DRY else ''}: updated {updated}, added {added}, deleted {deleted}, total {len(data)}.")
    for t in changed[:30]:
        print("  ~", t)

if __name__ == "__main__":
    main()
