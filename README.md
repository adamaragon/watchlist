# Watchlist

A stylish, editable, image-rich media to-do list. Sourced from iPhone screenshots via an on-demand local pipeline; deployed free as a static site (GitHub Pages).

## Run the site locally

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

All edits persist in `localStorage`. Use **Export** to download a fresh `data.json` and commit it back to the repo.

## Run the ingest pipeline (test batch)

Prerequisites — see [`pipeline/README.md`](pipeline/README.md) for one-time setup (`osxphotos` install + Full Disk Access on Terminal).

```bash
pipeline/run.sh --limit 50
# optional, if the `claude` CLI is on PATH:
pipeline/run.sh --limit 50 --use-llm
```

Outputs: `data.json` + `posters/`. Review `pipeline/skipped.json` for what was excluded by the classifier.

## Deploy to GitHub Pages

**Gated.** No remote push happens without explicit approval. To deploy:

```bash
gh repo create watchlist --public --source=. --remote=origin --push
gh repo edit --enable-pages --pages-branch=main --pages-path=/
```

Then visit the Pages URL `gh` prints.

## Architecture

Two independent halves:

1. **Ingest pipeline** (`pipeline/`): `osxphotos` → Swift+Vision OCR → deterministic classifier (optional LLM second opinion) → dedup → Wikipedia enrichment (blurb, year, link, poster) → merged into `data.json`.
2. **Static site** (root): vanilla HTML/CSS/JS. Reads `data.json`, renders a poster-grid card UI with filter/search/inline-edit/drag-reorder/export/import.
