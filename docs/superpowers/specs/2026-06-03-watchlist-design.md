# Watchlist — Design

**Date:** 2026-06-03
**Status:** Approved (design)
**One-liner:** A stylish, editable, free GitHub Pages site that turns the media gems buried in an iOS screenshot library (shows, movies, games, projects, books) into an organized, image-rich media to-do list.

## Problem

Adam screenshots things he wants to check out later — shows, movies, games, projects — and they pile up in his iOS Photos library, mixed in with thousands of unrelated screenshots (texts, receipts, memes). They're effectively lost. He wants those gems extracted, OCR'd, classified, enriched with cover art, and presented as a stylish, organizable, editable, fun to-do list hosted free on GitHub Pages.

## Goals

- Pull screenshots off the iPhone via iCloud → access them on this Mac.
- OCR every screenshot, then **triage**: keep only genuine media recommendations, drop the noise.
- Classify each keeper (movie / show / game / project / book / other), extract a clean title, enrich with a cover image + one-line blurb + year + source link.
- Render a stylish, image-rich, filterable, editable card list.
- Edit in-browser (add / edit / delete / reorder / mark done) with Export to persist.
- Stay 100% free and static: no API keys, no backend, no build step.

## Non-Goals

- No live multi-device sync / database / auth (in-browser localStorage + Export/Import only).
- No automatic re-scan of the library on a schedule (ingest is run on demand).
- No public AI/LLM mentions are relevant here (this is a personal tool, not Goddard Withings).

## Architecture — two independent halves

### Half 1 — Ingest pipeline (runs on the Mac, on demand)

```
Screenshots album → export → OCR → classify + title → dedup → enrich → emit
```

| Step | Tool | Detail |
|---|---|---|
| Export | AppleScript (`osascript`) | Export the N most recent items from the Photos "Screenshots" smart album into `pipeline/inbox/`. One-time TCC "allow control of Photos" consent. Test run N≈50–100; full run later. |
| OCR | Swift + Vision (`swiftc`) | Compile a small `ocr` tool once. For each image → raw recognized text (offline, free, high accuracy). Output `pipeline/ocr/<name>.txt`. |
| Classify + title | LLM judgment | Over OCR text (+ the image itself for poster-only shots): is this a media rec worth keeping? If yes → clean title + type guess. Keepers → candidates; rejects → `pipeline/skipped.json` with reason (auditable). |
| Dedup | LLM/string | Collapse repeats (same title screenshotted multiple times); keep best source. |
| Enrich | Web search + fetch | Per title: find a representative poster/cover, a 1-line blurb, year, and an official/source link. Download poster into `posters/<id>.jpg`. Keyless — uses web search, not TMDB/IGDB APIs. |
| Emit | — | Write `data.json` (the site's single data source). |

The pipeline lives under `pipeline/` and is **not deployed** — only `index.html`, `data.json`, and `posters/` ship to Pages.

### Half 2 — The site (static, zero build)

A single self-contained page: `index.html` + inline (or sibling) CSS/JS. No framework, no build step → deploys to GitHub Pages directly from the repo. Reads `data.json` at load, renders cards. The `frontend-design` skill is used at implementation time so the result is genuinely sharp (stylish, "chrome," fun), not generic-AI.

## Data model (per item in `data.json`)

```json
{
  "id": "stable-slug-or-hash",
  "title": "Severance",
  "type": "show",
  "year": 2022,
  "blurb": "Office workers surgically split work and personal memories.",
  "poster": "posters/severance.jpg",
  "status": "todo",
  "tags": ["sci-fi", "thriller"],
  "rating": null,
  "notes": "",
  "link": "https://...",
  "source_screenshot": "IMG_4821.png",
  "ocr_excerpt": "Severance — Apple TV+",
  "added": "2026-06-03"
}
```

`type`: `movie | show | game | project | book | music | other`
`status`: `todo | active | done`

## Site features

- **View:** responsive grid of poster cards (title, year, type badge, blurb, status).
- **Filter:** by type, by status, by tag.
- **Search:** title/blurb/notes.
- **Sort:** date added, title, year.
- **Edit (in-browser):** inline edit any field, add a manual item, delete, mark status, drag-reorder, set rating/notes/tags.
- **Persist:** all edits saved to `localStorage`. **Export** downloads the updated `data.json` to commit back to the repo; **Import** loads one.
- **Style:** dark, polished, fun — image-forward cards with hover chrome.

## Deploy

- Repo: `watchlist` (local at `~/Documents/Git/watchlist`).
- GitHub Pages serves the static files. Creating the GitHub repo + first push is a **gated deploy action** — done only on explicit request, per Adam's push policy.

## Test-batch checkpoint

After the first ~50–100 run, present: (a) the rendered site, and (b) the `skipped.json` list, so Adam can confirm the classifier's judgment **before** scaling to the full library. Tune thresholds/prompts, then re-run on everything.

## Risks / mitigations

- **TCC consent for Photos automation** — first `osascript` Photos call triggers a one-time approval dialog; expected, benign.
- **Classifier false negatives** (dropping a real gem) — mitigated by the auditable `skipped.json` and the test-batch checkpoint.
- **Poster fetch quality** — keyless web search may occasionally grab a wrong/low-res image; in-browser editing lets Adam swap any image/field. Upgrading to TMDB/IGDB keys remains an easy future option.
- **Library size** — full run could be thousands of images; OCR is fast, enrichment (web fetch) is the bottleneck — batched, run on demand.

## Future options (out of scope now)

- TMDB/IGDB API enrichment for richer, accurate metadata.
- Git-backed CMS (Sveltia/Decap) for live persistence across devices.
- Scheduled re-scan of new screenshots.
