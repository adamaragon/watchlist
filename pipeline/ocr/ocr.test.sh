#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INBOX="$ROOT/inbox"
OUT="$ROOT/ocr_out"
mkdir -p "$OUT"
shopt -s nullglob
IMGS=("$INBOX"/*)
[ ${#IMGS[@]} -gt 0 ] || { echo "no images in inbox — run export first"; exit 1; }
"$ROOT/bin/ocr" "$OUT" "${IMGS[@]}"
ls "$OUT" | head
