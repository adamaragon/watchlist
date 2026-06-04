# Watchlist ingest pipeline

End-to-end: `./run.sh --limit 50` (test batch) or `./run.sh` (full).

Stages: export → ocr → classify → dedup → enrich → emit.

Outputs `../data.json` and `../posters/`. The site reads those directly.

## Setup

The export stage uses [osxphotos](https://github.com/RhetTbull/osxphotos)
to pull screenshots out of the system Photos library:

```
pipx install --python python3.13 osxphotos
```

**One-time grant: Full Disk Access.** osxphotos reads
`~/Pictures/Photos Library.photoslibrary/database/Photos.sqlite`, which
macOS protects. Open *System Settings → Privacy & Security → Full Disk
Access* and enable it for your terminal app (Terminal, iTerm, etc.).
Restart the terminal after granting.

Quick check: `pipeline/export.test.sh` exports the 3 most recent
screenshots into `pipeline/inbox/`.
