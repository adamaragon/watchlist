#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
LIMIT="${LIMIT:-50}"
USE_LLM=""
for a in "$@"; do
  case "$a" in
    --limit=*) LIMIT="${a#--limit=}";;
    --limit)   shift; LIMIT="$1";;
    --use-llm) USE_LLM="--use-llm";;
  esac
done

INBOX="$HERE/inbox"; OCR="$HERE/ocr_out"; POSTERS="$ROOT/posters"
mkdir -p "$INBOX" "$OCR" "$POSTERS" "$HERE/bin"

echo "[1/6] Export — limit=$LIMIT"
"$HERE/export_screenshots.sh" "$INBOX" "$LIMIT"

echo "[2/6] OCR"
[ -x "$HERE/bin/ocr" ] || make -C "$HERE/ocr"
shopt -s nullglob
IMGS=("$INBOX"/*)
"$HERE/bin/ocr" "$OCR" "${IMGS[@]}"

echo "[3/6] Classify $USE_LLM"
node "$HERE/classify.js" "$INBOX" "$OCR" "$HERE" $USE_LLM

echo "[4/6] Dedup"
cd "$HERE" && node -e "
import('./dedup.js').then(async ({ dedupCandidates }) => {
  const fs = await import('node:fs');
  const c = JSON.parse(fs.readFileSync('$HERE/candidates.json','utf8'));
  fs.writeFileSync('$HERE/candidates.json', JSON.stringify(dedupCandidates(c), null, 2));
  console.log('dedup: ' + c.length + ' -> ' + dedupCandidates(c).length);
});"

echo "[5/6] Enrich"
cd "$HERE" && node -e "
import('./enrich.js').then(async ({ enrichAll }) => {
  const fs = await import('node:fs');
  const c = JSON.parse(fs.readFileSync('$HERE/candidates.json','utf8'));
  const out = await enrichAll(c, { postersDir: '$POSTERS' });
  fs.writeFileSync('$HERE/candidates.enriched.json', JSON.stringify(out, null, 2));
  console.log('enriched ' + out.length);
});"

echo "[6/6] Emit"
cd "$HERE" && node -e "
import('./emit.js').then(async ({ emitDataFile }) => {
  const fs = await import('node:fs');
  const inc = JSON.parse(fs.readFileSync('$HERE/candidates.enriched.json','utf8'));
  const merged = emitDataFile({ dataPath: '$ROOT/data.json', incoming: inc });
  console.log('data.json items: ' + merged.length);
});"

echo "Done. Review: $HERE/skipped.json and $ROOT/data.json"
