#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/inbox"
mkdir -p "$OUT"
"$DIR/export_screenshots.sh" "$OUT" 3
echo "Files in inbox:"
ls "$OUT" | head
