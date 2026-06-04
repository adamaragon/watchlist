#!/usr/bin/env bash
# Export the N most recent screenshots from the macOS Photos library
# using osxphotos. Requires Full Disk Access for the terminal app.
#
# Usage: export_screenshots.sh <outDir> <limit>
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <outDir> <limit>" >&2
  exit 2
fi

OUT_DIR="$1"
LIMIT="$2"

# Start clean so the count is honest and stale files don't survive a
# narrowing batch.
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Query for the N most-recent screenshot uuids.
UUIDS=$(osxphotos query --screenshot --json 2>/dev/null \
  | jq -r --argjson n "$LIMIT" 'sort_by(.date) | reverse | .[:$n] | .[].uuid')

if [[ -z "$UUIDS" ]]; then
  echo "No screenshots found in Photos library." >&2
  echo "Exported: 0"
  exit 0
fi

# Build --uuid args. Single batched export call (per-uuid in a loop
# misbehaves with iCloud-missing originals).
UUID_ARGS=()
while IFS= read -r u; do
  [[ -n "$u" ]] && UUID_ARGS+=(--uuid "$u")
done <<< "$UUIDS"

osxphotos export "$OUT_DIR" \
  "${UUID_ARGS[@]}" \
  --skip-edited \
  --download-missing \
  --no-progress \
  </dev/null 2>&1 | tail -5

ACTUAL=$(find "$OUT_DIR" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.heic' \) | wc -l | tr -d ' ')
echo "Exported: $ACTUAL"
