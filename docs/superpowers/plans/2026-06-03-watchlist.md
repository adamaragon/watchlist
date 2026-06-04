# Watchlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stylish, editable, free GitHub Pages site that turns iOS screenshots of media recommendations into an organized, image-rich to-do list.

**Architecture:** Two independent halves. (1) An on-demand local ingest pipeline: AppleScript exports the Photos "Screenshots" album → a Swift/Vision OCR binary reads each image → an LLM-driven classifier triages keepers and extracts titles → a keyless web-search enrichment step fetches a poster + blurb + year + source link → emits `data.json` + `posters/`. (2) A zero-build vanilla HTML/CSS/JS site that reads `data.json`, renders editable image cards, persists edits to `localStorage`, and exports/imports the data file.

**Tech Stack:** macOS AppleScript (`osascript`), Swift 6 + Vision framework (`swiftc`), Node.js (orchestration + enrichment + classifier shell-out), vanilla HTML/CSS/JS, GitHub Pages. No frameworks, no build step on the site side, no API keys.

**Repo layout:**

```
watchlist/
├── index.html                  # the site (zero-build, GitHub Pages root)
├── assets/
│   ├── styles.css
│   └── app.js
├── data.json                   # the single source of truth for the site
├── posters/                    # downloaded poster images, committed
├── pipeline/
│   ├── README.md
│   ├── run.sh                  # one command: end-to-end ingest
│   ├── export_screenshots.applescript
│   ├── ocr/
│   │   ├── ocr.swift           # compiles to bin/ocr
│   │   └── Makefile
│   ├── classify.js             # OCR text → keep/skip + title + type
│   ├── dedup.js
│   ├── enrich.js               # web-search → poster + blurb + year + link
│   ├── emit.js                 # merge candidates → data.json
│   ├── bin/                    # compiled ocr binary (gitignored)
│   ├── inbox/                  # exported screenshots (gitignored)
│   ├── ocr_out/                # per-image .txt (gitignored)
│   ├── candidates.json         # post-classify keepers
│   └── skipped.json            # post-classify rejects (auditable)
├── docs/superpowers/{specs,plans}/
└── .gitignore
```

**File responsibilities (one job each):**

- `pipeline/export_screenshots.applescript` — export N most-recent Photos "Screenshots" album items into `inbox/`.
- `pipeline/ocr/ocr.swift` — read image paths from argv, emit `<basename>.txt` of recognized text into a target dir using Vision `VNRecognizeTextRequest` (accurate mode).
- `pipeline/classify.js` — for each `inbox/*` + `ocr_out/*.txt`, decide keep/skip and extract `{title, type, confidence, reason}`. Writes `candidates.json` + `skipped.json`. The classifier is invoked via an LLM CLI (see Task 5); a deterministic fallback ships for offline runs.
- `pipeline/dedup.js` — collapse near-duplicate titles, keep best source.
- `pipeline/enrich.js` — per candidate: web-search for poster, blurb, year, link; download poster to `posters/<id>.jpg`.
- `pipeline/emit.js` — merge enrichment into the existing `data.json` (preserve user edits by id; add new ids; never overwrite user-modified fields).
- `pipeline/run.sh` — orchestrates export → ocr → classify → dedup → enrich → emit, with `--limit N` flag.
- `index.html`, `assets/styles.css`, `assets/app.js` — the site. Renders cards, filtering, search, inline edit, drag-reorder, Export/Import.

**Conventions:**
- Node ≥ 20, ESM (`"type":"module"` in `pipeline/package.json`).
- Tests: Node's built-in `node --test`. Test files live next to their subject as `<name>.test.js`.
- Commits: short summary, blank line, optional context. **Never** add a Claude/AI co-author trailer.
- Push policy: nothing is pushed to GitHub or deployed to Pages without explicit user request.

---

## Task 1: Repo bootstrap

**Files:**
- Create: `pipeline/package.json`
- Create: `pipeline/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Update `.gitignore`**

Replace the file's contents:

```
node_modules/
pipeline/inbox/
pipeline/ocr_out/
pipeline/bin/
.DS_Store
```

- [ ] **Step 2: Create `pipeline/package.json`**

```json
{
  "name": "watchlist-pipeline",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 3: Create `pipeline/README.md`**

```markdown
# Watchlist ingest pipeline

End-to-end: `./run.sh --limit 50` (test batch) or `./run.sh` (full).

Stages: export → ocr → classify → dedup → enrich → emit.

Outputs `../data.json` and `../posters/`. The site reads those directly.
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore pipeline/package.json pipeline/README.md
git commit -m "Scaffold pipeline package"
```

---

## Task 2: AppleScript export of the Screenshots album

**Files:**
- Create: `pipeline/export_screenshots.applescript`
- Create: `pipeline/export.test.sh`

- [ ] **Step 1: Write the AppleScript**

Create `pipeline/export_screenshots.applescript`:

```applescript
on run argv
	set targetFolder to item 1 of argv
	set theLimit to (item 2 of argv) as integer

	tell application "Photos"
		activate
		set scrAlbum to missing value
		repeat with a in albums
			if name of a is "Screenshots" then set scrAlbum to a
		end repeat
		if scrAlbum is missing value then error "No 'Screenshots' album found in Photos."

		set allItems to media items of scrAlbum
		set total to count of allItems
		if total is 0 then return "0"

		set startIdx to total - theLimit + 1
		if startIdx < 1 then set startIdx to 1
		set recent to items startIdx thru total of allItems

		export recent to (POSIX file targetFolder) with using originals
	end tell
	return (count of recent) as string
end run
```

- [ ] **Step 2: Verification harness**

Create `pipeline/export.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/inbox"
mkdir -p "$OUT"
COUNT=$(osascript "$DIR/export_screenshots.applescript" "$OUT" 3)
echo "Exported: $COUNT"
ls "$OUT" | head
```

```bash
chmod +x pipeline/export.test.sh
```

- [ ] **Step 3: Run it (one-time TCC consent expected)**

Run: `pipeline/export.test.sh`
Expected: macOS prompts once to allow Terminal/Claude to control Photos → Allow. Output shows `Exported: 3` (or fewer if the album has fewer) and 3 image filenames.

If the prompt does not appear and the script errors with `not allowed assistive access`, open **System Settings → Privacy & Security → Automation**, enable Photos under the running terminal, and rerun.

- [ ] **Step 4: Commit**

```bash
git add pipeline/export_screenshots.applescript pipeline/export.test.sh
git commit -m "Add Photos Screenshots-album export"
```

---

## Task 3: Vision OCR binary

**Files:**
- Create: `pipeline/ocr/ocr.swift`
- Create: `pipeline/ocr/Makefile`
- Create: `pipeline/ocr/ocr.test.sh`

- [ ] **Step 1: Write `ocr.swift`**

```swift
import Foundation
import Vision
import AppKit

// usage: ocr <outDir> <img1> [img2 ...]
let args = CommandLine.arguments
guard args.count >= 3 else { FileHandle.standardError.write("usage: ocr <outDir> <img...>\n".data(using:.utf8)!); exit(2) }
let outDir = args[1]
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func ocr(path: String) -> String {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return "" }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    try? handler.perform([req])
    let obs = (req.results ?? []) as [VNRecognizedTextObservation]
    return obs.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}

for path in args.dropFirst(2) {
    let base = (path as NSString).lastPathComponent
    let stem = (base as NSString).deletingPathExtension
    let text = ocr(path: path)
    let url = URL(fileURLWithPath: outDir).appendingPathComponent("\(stem).txt")
    try? text.write(to: url, atomically: true, encoding: .utf8)
    print("\(base): \(text.count) chars")
}
```

- [ ] **Step 2: Makefile**

Create `pipeline/ocr/Makefile`:

```make
BIN=../bin/ocr
$(BIN): ocr.swift
	mkdir -p ../bin
	swiftc -O -o $(BIN) ocr.swift
clean:
	rm -f $(BIN)
```

- [ ] **Step 3: Build**

Run: `make -C pipeline/ocr`
Expected: `pipeline/bin/ocr` exists, no errors.

- [ ] **Step 4: Verification script**

Create `pipeline/ocr/ocr.test.sh`:

```bash
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
```

```bash
chmod +x pipeline/ocr/ocr.test.sh
```

- [ ] **Step 5: Run it**

Run: `pipeline/ocr/ocr.test.sh`
Expected: prints `<filename>: <N> chars` per image; `pipeline/ocr_out/` has matching `.txt` files with extracted text.

- [ ] **Step 6: Commit**

```bash
git add pipeline/ocr/ocr.swift pipeline/ocr/Makefile pipeline/ocr/ocr.test.sh
git commit -m "Add Vision OCR binary"
```

---

## Task 4: Pure helpers — id, slug, type-guess, title-clean (TDD)

**Files:**
- Create: `pipeline/lib/text.js`
- Create: `pipeline/lib/text.test.js`

- [ ] **Step 1: Write the failing tests**

Create `pipeline/lib/text.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, idFor, guessType, cleanTitle } from './text.js';

test('slugify lowercases and dashes', () => {
  assert.equal(slugify('The Last of Us: Part II'), 'the-last-of-us-part-ii');
});

test('idFor is stable for same title', () => {
  assert.equal(idFor('Severance'), idFor('  severance '));
});

test('guessType from OCR cues', () => {
  assert.equal(guessType('Watch on Apple TV+\nSeason 2'), 'show');
  assert.equal(guessType('In theaters Friday'), 'movie');
  assert.equal(guessType('Available on Steam'), 'game');
  assert.equal(guessType('by Brandon Sanderson — Hardcover'), 'book');
  assert.equal(guessType('open source on GitHub'), 'project');
  assert.equal(guessType('random words with no cues'), 'other');
});

test('cleanTitle strips platform chrome', () => {
  assert.equal(cleanTitle('Severance — Apple TV+'), 'Severance');
  assert.equal(cleanTitle('Severance | Netflix'), 'Severance');
  assert.equal(cleanTitle('  Severance  '), 'Severance');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd pipeline && node --test lib/text.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline/lib/text.js`**

```js
import { createHash } from 'node:crypto';

export function slugify(s) {
  return s.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function idFor(title) {
  const key = slugify(title.trim());
  return key || createHash('sha1').update(title).digest('hex').slice(0, 10);
}

const CUES = [
  ['show',    /\b(season|episode|apple tv\+?|netflix|hbo|max|hulu|disney\+?|prime video|paramount\+?|peacock)\b/i],
  ['movie',   /\b(in theaters|now playing|directed by|a24|coming soon|trailer)\b/i],
  ['game',    /\b(steam|playstation|xbox|nintendo|epic games|switch|ps5|ps4)\b/i],
  ['book',    /\b(hardcover|paperback|kindle|audiobook|by [A-Z][a-z]+ [A-Z][a-z]+)\b/i],
  ['project', /\b(github|open source|repo|library|framework|kickstarter)\b/i],
  ['music',   /\b(spotify|apple music|album|single|ep|bandcamp)\b/i],
];

export function guessType(text) {
  for (const [type, rx] of CUES) if (rx.test(text)) return type;
  return 'other';
}

export function cleanTitle(s) {
  return s.replace(/\s*[—\-\|·•]\s*(Apple TV\+?|Netflix|HBO( Max)?|Max|Hulu|Disney\+?|Prime Video|Paramount\+?|Peacock|Steam|Spotify|Apple Music)\s*$/i, '')
    .trim();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd pipeline && node --test lib/text.test.js`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/text.js pipeline/lib/text.test.js
git commit -m "Add text helpers with tests"
```

---

## Task 5: Classifier (deterministic fallback first)

**Files:**
- Create: `pipeline/classify.js`
- Create: `pipeline/classify.test.js`
- Create: `pipeline/lib/classifier-rules.js`
- Create: `pipeline/lib/classifier-rules.test.js`

The classifier judges each OCR'd screenshot: keep (media rec) or skip (noise). We TDD the deterministic rule scorer first; the LLM-backed classifier wraps it as a fallback path and is wired in Task 6.

- [ ] **Step 1: Write failing test for the rule scorer**

Create `pipeline/lib/classifier-rules.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOcrText } from './classifier-rules.js';

test('keeps clear media cues', () => {
  const r = scoreOcrText('Severance\nApple TV+\nSeason 2 premieres Jan 17');
  assert.equal(r.keep, true);
  assert.ok(r.score >= 2);
  assert.equal(r.type, 'show');
});

test('skips obvious noise (text message)', () => {
  const r = scoreOcrText('haha lol see u at 8\nReply\nMessages');
  assert.equal(r.keep, false);
});

test('skips receipts', () => {
  const r = scoreOcrText('Subtotal $12.40\nTax $1.08\nTotal $13.48\nVisa ****4242');
  assert.equal(r.keep, false);
});

test('keeps game listings', () => {
  const r = scoreOcrText('Hades II\nAvailable on Steam — Early Access');
  assert.equal(r.keep, true);
  assert.equal(r.type, 'game');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd pipeline && node --test lib/classifier-rules.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline/lib/classifier-rules.js`**

```js
import { guessType, cleanTitle } from './text.js';

const POSITIVE = [
  /\b(apple tv\+?|netflix|hbo|max|hulu|disney\+?|prime video|paramount\+?|peacock)\b/i,
  /\bseason\s+\d+|episode\s+\d+\b/i,
  /\b(in theaters|now playing|directed by|trailer)\b/i,
  /\b(steam|playstation|xbox|nintendo|epic games|switch|ps5)\b/i,
  /\b(hardcover|paperback|kindle|audiobook)\b/i,
  /\b(github\.com|open source)\b/i,
];
const NEGATIVE = [
  /\b(subtotal|tax|total|receipt|visa\s*\*+|mastercard\s*\*+)\b/i,
  /\b(imessage|messages|delivered|read \d+:\d+)\b/i,
  /\b(verification code|two-factor|otp|one-time)\b/i,
  /\bunsubscribe\b/i,
];

function firstNonEmptyLine(text) {
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.trim();
    if (s && s.length >= 2 && !/^\d{1,2}:\d{2}/.test(s)) return s;
  }
  return '';
}

export function scoreOcrText(text) {
  let score = 0;
  for (const rx of POSITIVE) if (rx.test(text)) score += 1;
  for (const rx of NEGATIVE) if (rx.test(text)) score -= 2;
  const type = guessType(text);
  const titleGuess = cleanTitle(firstNonEmptyLine(text));
  return {
    keep: score >= 1 && titleGuess.length >= 2,
    score,
    type,
    title: titleGuess,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd pipeline && node --test lib/classifier-rules.test.js`
Expected: all 4 pass.

- [ ] **Step 5: Write the classifier orchestrator test**

Create `pipeline/classify.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyDir } from './classify.js';

test('classifyDir partitions keepers vs skipped', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const inbox = join(root, 'inbox');
  const ocr = join(root, 'ocr');
  mkdirSync(inbox); mkdirSync(ocr);
  writeFileSync(join(inbox, 'a.png'), '');
  writeFileSync(join(inbox, 'b.png'), '');
  writeFileSync(join(ocr,   'a.txt'), 'Severance\nApple TV+\nSeason 2');
  writeFileSync(join(ocr,   'b.txt'), 'Total $13.48\nVisa ****4242');

  const out = await classifyDir({ inboxDir: inbox, ocrDir: ocr, outDir: root, useLLM: false });

  assert.equal(out.candidates.length, 1);
  assert.equal(out.candidates[0].title, 'Severance');
  assert.equal(out.candidates[0].type, 'show');
  assert.equal(out.skipped.length, 1);

  const cands = JSON.parse(readFileSync(join(root, 'candidates.json'), 'utf8'));
  assert.equal(cands.length, 1);
});
```

- [ ] **Step 6: Run to verify fail**

Run: `cd pipeline && node --test classify.test.js`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `pipeline/classify.js`**

```js
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { idFor } from './lib/text.js';
import { scoreOcrText } from './lib/classifier-rules.js';

export async function classifyDir({ inboxDir, ocrDir, outDir, useLLM = false }) {
  const images = readdirSync(inboxDir).filter(f => !f.startsWith('.'));
  const candidates = [], skipped = [];

  for (const img of images) {
    const stem = parse(img).name;
    const txtPath = join(ocrDir, `${stem}.txt`);
    let text = '';
    try { text = readFileSync(txtPath, 'utf8'); } catch { /* missing OCR */ }

    const r = scoreOcrText(text);
    if (r.keep) {
      candidates.push({
        id: idFor(r.title),
        title: r.title,
        type: r.type,
        confidence: r.score,
        source_screenshot: img,
        ocr_excerpt: text.slice(0, 280),
      });
    } else {
      skipped.push({ source_screenshot: img, reason: `score=${r.score}`, ocr_excerpt: text.slice(0, 160) });
    }
  }

  writeFileSync(join(outDir, 'candidates.json'), JSON.stringify(candidates, null, 2));
  writeFileSync(join(outDir, 'skipped.json'),    JSON.stringify(skipped,    null, 2));
  return { candidates, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , inboxDir, ocrDir, outDir] = process.argv;
  classifyDir({ inboxDir, ocrDir, outDir, useLLM: false })
    .then(r => console.log(`kept=${r.candidates.length} skipped=${r.skipped.length}`));
}
```

- [ ] **Step 8: Run to verify pass**

Run: `cd pipeline && node --test classify.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add pipeline/lib/classifier-rules.js pipeline/lib/classifier-rules.test.js pipeline/classify.js pipeline/classify.test.js
git commit -m "Add deterministic classifier with tests"
```

---

## Task 6: LLM upgrade path for the classifier (optional but wired)

**Files:**
- Modify: `pipeline/classify.js`
- Create: `pipeline/lib/llm-classify.js`
- Create: `pipeline/lib/llm-classify.test.js`

Goal: when the `claude` CLI is on PATH and `--use-llm` is passed to `run.sh`, send borderline items (rule score 0) plus a sample of skipped items to the LLM for a second opinion. If the CLI is missing or fails, fall back silently to the deterministic result.

- [ ] **Step 1: Write the failing test**

Create `pipeline/lib/llm-classify.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLLMVerdicts } from './llm-classify.js';

test('parseLLMVerdicts reads JSON array verdicts', () => {
  const raw = `noise\n[{"id":"a","keep":true,"title":"Severance","type":"show"},{"id":"b","keep":false}]\nmore noise`;
  const v = parseLLMVerdicts(raw);
  assert.equal(v.length, 2);
  assert.equal(v[0].title, 'Severance');
  assert.equal(v[1].keep, false);
});

test('parseLLMVerdicts returns [] on unparseable output', () => {
  assert.deepEqual(parseLLMVerdicts('totally not json'), []);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd pipeline && node --test lib/llm-classify.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline/lib/llm-classify.js`**

```js
import { spawnSync } from 'node:child_process';

export function parseLLMVerdicts(stdout) {
  const m = stdout.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

const PROMPT = `You judge OCR'd iPhone screenshots. Each item has an id and OCR text.
Return a JSON array. For each id, output {"id","keep":boolean,"title":string,"type":one of movie|show|game|project|book|music|other}.
KEEP iff the screenshot is plausibly a media recommendation (a show/movie/game/project/book/music) the user might want to check out.
SKIP texts, receipts, OTPs, memes, screenshots-of-UI without a recommendation.
Only output the JSON array, nothing else.`;

export function llmClassify(items, { cliPath = 'claude', timeoutMs = 60_000 } = {}) {
  if (!items.length) return [];
  const payload = PROMPT + '\n\nITEMS:\n' + JSON.stringify(items, null, 2);
  const res = spawnSync(cliPath, ['-p', payload], { encoding: 'utf8', timeout: timeoutMs });
  if (res.error || res.status !== 0) return [];
  return parseLLMVerdicts(res.stdout || '');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd pipeline && node --test lib/llm-classify.test.js`
Expected: PASS.

- [ ] **Step 5: Wire into `classify.js`**

Replace `classify.js` with:

```js
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { idFor } from './lib/text.js';
import { scoreOcrText } from './lib/classifier-rules.js';
import { llmClassify } from './lib/llm-classify.js';

export async function classifyDir({ inboxDir, ocrDir, outDir, useLLM = false }) {
  const images = readdirSync(inboxDir).filter(f => !f.startsWith('.'));
  const rows = [];
  for (const img of images) {
    const stem = parse(img).name;
    let text = '';
    try { text = readFileSync(join(ocrDir, `${stem}.txt`), 'utf8'); } catch {}
    rows.push({ img, text, r: scoreOcrText(text) });
  }

  if (useLLM) {
    const borderline = rows
      .filter(({ r }) => r.score === 0 || (r.keep && r.score < 2))
      .map(({ img, text }, i) => ({ id: img, ocr: text.slice(0, 600) }));
    const verdicts = llmClassify(borderline);
    const byId = new Map(verdicts.map(v => [v.id, v]));
    for (const row of rows) {
      const v = byId.get(row.img);
      if (!v) continue;
      row.r.keep = !!v.keep;
      if (v.title) row.r.title = v.title;
      if (v.type)  row.r.type  = v.type;
    }
  }

  const candidates = [], skipped = [];
  for (const { img, text, r } of rows) {
    if (r.keep && r.title && r.title.length >= 2) {
      candidates.push({
        id: idFor(r.title),
        title: r.title,
        type: r.type,
        confidence: r.score,
        source_screenshot: img,
        ocr_excerpt: text.slice(0, 280),
      });
    } else {
      skipped.push({ source_screenshot: img, reason: `score=${r.score}`, ocr_excerpt: text.slice(0, 160) });
    }
  }

  writeFileSync(join(outDir, 'candidates.json'), JSON.stringify(candidates, null, 2));
  writeFileSync(join(outDir, 'skipped.json'),    JSON.stringify(skipped,    null, 2));
  return { candidates, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const useLLM = process.argv.includes('--use-llm');
  const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const [inboxDir, ocrDir, outDir] = positional;
  classifyDir({ inboxDir, ocrDir, outDir, useLLM })
    .then(r => console.log(`kept=${r.candidates.length} skipped=${r.skipped.length}`));
}
```

- [ ] **Step 6: Re-run classify tests to confirm no regressions**

Run: `cd pipeline && node --test classify.test.js lib/`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/llm-classify.js pipeline/lib/llm-classify.test.js pipeline/classify.js
git commit -m "Add optional LLM-backed classifier upgrade"
```

---

## Task 7: Dedup (TDD)

**Files:**
- Create: `pipeline/dedup.js`
- Create: `pipeline/dedup.test.js`

- [ ] **Step 1: Write failing test**

Create `pipeline/dedup.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupCandidates } from './dedup.js';

test('collapses duplicate titles, keeps highest confidence', () => {
  const out = dedupCandidates([
    { id: 'severance', title: 'Severance', type: 'show', confidence: 1 },
    { id: 'severance', title: 'Severance', type: 'show', confidence: 3 },
    { id: 'hades-ii', title: 'Hades II', type: 'game', confidence: 2 },
  ]);
  assert.equal(out.length, 2);
  const sev = out.find(x => x.id === 'severance');
  assert.equal(sev.confidence, 3);
});

test('treats fuzzy near-dupes as same id when slug matches', () => {
  const out = dedupCandidates([
    { id: 'severance', title: 'Severance', type: 'show', confidence: 1 },
    { id: 'severance', title: '  severance  ', type: 'show', confidence: 2 },
  ]);
  assert.equal(out.length, 1);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd pipeline && node --test dedup.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline/dedup.js`**

```js
export function dedupCandidates(cands) {
  const best = new Map();
  for (const c of cands) {
    const prev = best.get(c.id);
    if (!prev || (c.confidence ?? 0) > (prev.confidence ?? 0)) best.set(c.id, c);
  }
  return [...best.values()];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd pipeline && node --test dedup.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/dedup.js pipeline/dedup.test.js
git commit -m "Add candidate dedup"
```

---

## Task 8: Enrichment — keyless poster + blurb + year + link

**Files:**
- Create: `pipeline/lib/web.js`
- Create: `pipeline/lib/web.test.js`
- Create: `pipeline/enrich.js`
- Create: `pipeline/enrich.test.js`

Strategy: DuckDuckGo HTML endpoint (no key) for an org-results search, plus Wikipedia REST `summary` for a reliable blurb/year/canonical link. Posters: Wikipedia's `pageimages` (`pithumbsize=500`) → fall back to first plausible image from a DDG image search. Robustly best-effort: enrichment failures don't drop the candidate, they just leave fields blank for in-browser fixing.

- [ ] **Step 1: Write failing test for the URL builders**

Create `pipeline/lib/web.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { wikiSummaryUrl, ddgImagesUrl } from './web.js';

test('wikiSummaryUrl encodes title', () => {
  assert.equal(
    wikiSummaryUrl('Severance (TV series)'),
    'https://en.wikipedia.org/api/rest_v1/page/summary/Severance%20(TV%20series)'
  );
});

test('ddgImagesUrl builds search', () => {
  const u = ddgImagesUrl('Severance show poster');
  assert.match(u, /^https:\/\/duckduckgo\.com\/i\.js\?/);
  assert.match(u, /q=Severance\+show\+poster/);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd pipeline && node --test lib/web.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `pipeline/lib/web.js`**

```js
import { writeFile } from 'node:fs/promises';

export function wikiSummaryUrl(title) {
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title).replace(/%2F/g,'/')}`;
}

export function ddgImagesUrl(q) {
  const params = new URLSearchParams({ q, o: 'json' });
  return `https://duckduckgo.com/i.js?${params.toString()}`;
}

export async function fetchJSON(url, { timeoutMs = 8000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'watchlist-pipeline/0.1 (+local)' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

export async function downloadTo(url, path, { timeoutMs = 15000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'watchlist-pipeline/0.1 (+local)' } });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile(path, buf);
    return true;
  } catch { return false; } finally { clearTimeout(t); }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd pipeline && node --test lib/web.test.js`
Expected: PASS.

- [ ] **Step 5: Write enrichment unit test (offline, injected fetcher)**

Create `pipeline/enrich.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enrichOne } from './enrich.js';

const FAKE_WIKI = {
  title: 'Severance (TV series)',
  extract: 'Severance is an American science fiction psychological thriller.',
  content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Severance_(TV_series)' } },
  originalimage: { source: 'https://example.com/poster.jpg' },
  description: '2022 American TV series',
};

test('enrichOne fills blurb/year/link/poster from wiki', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const fakeFetchJSON = async (url) => url.includes('wikipedia.org') ? FAKE_WIKI : null;
  const fakeDownload  = async (_url, _path) => true;
  const out = await enrichOne(
    { id: 'severance', title: 'Severance', type: 'show' },
    { postersDir: root, fetchJSON: fakeFetchJSON, downloadTo: fakeDownload }
  );
  assert.match(out.blurb, /science fiction/);
  assert.equal(out.year, 2022);
  assert.equal(out.link, 'https://en.wikipedia.org/wiki/Severance_(TV_series)');
  assert.equal(out.poster, 'posters/severance.jpg');
});

test('enrichOne survives total fetch failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wl-'));
  const out = await enrichOne(
    { id: 'unknownia', title: 'Unknownia', type: 'movie' },
    { postersDir: root, fetchJSON: async () => null, downloadTo: async () => false }
  );
  assert.equal(out.id, 'unknownia');
  assert.equal(out.poster, '');
});
```

- [ ] **Step 6: Run to verify fail**

Run: `cd pipeline && node --test enrich.test.js`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `pipeline/enrich.js`**

```js
import { join } from 'node:path';
import { wikiSummaryUrl, fetchJSON as realFetchJSON, downloadTo as realDownloadTo } from './lib/web.js';

const YEAR_RX = /\b(19|20)\d{2}\b/;

export async function enrichOne(cand, opts) {
  const { postersDir, fetchJSON = realFetchJSON, downloadTo = realDownloadTo } = opts;
  const out = { ...cand, blurb: '', year: null, link: '', poster: '' };

  const wiki = await fetchJSON(wikiSummaryUrl(cand.title));
  if (wiki) {
    if (wiki.extract) out.blurb = wiki.extract.split('. ').slice(0, 1).join('. ').trim();
    const yearSource = wiki.description || wiki.extract || '';
    const m = yearSource.match(YEAR_RX);
    if (m) out.year = Number(m[0]);
    if (wiki.content_urls?.desktop?.page) out.link = wiki.content_urls.desktop.page;

    const imgUrl = wiki.originalimage?.source || wiki.thumbnail?.source;
    if (imgUrl) {
      const path = join(postersDir, `${cand.id}.jpg`);
      const ok = await downloadTo(imgUrl, path);
      if (ok) out.poster = `posters/${cand.id}.jpg`;
    }
  }
  return out;
}

export async function enrichAll(candidates, opts) {
  const results = [];
  for (const c of candidates) results.push(await enrichOne(c, opts));
  return results;
}
```

- [ ] **Step 8: Run to verify pass**

Run: `cd pipeline && node --test enrich.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add pipeline/lib/web.js pipeline/lib/web.test.js pipeline/enrich.js pipeline/enrich.test.js
git commit -m "Add keyless enrichment via Wikipedia summary"
```

---

## Task 9: Emit — merge enrichment into `data.json` without clobbering user edits

**Files:**
- Create: `pipeline/emit.js`
- Create: `pipeline/emit.test.js`

- [ ] **Step 1: Write failing test**

Create `pipeline/emit.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeIntoData } from './emit.js';

test('adds new items and preserves user fields on existing', () => {
  const existing = [
    { id: 'severance', title: 'Severance', type: 'show', status: 'done', notes: 'great', rating: 5, blurb: 'old' }
  ];
  const incoming = [
    { id: 'severance', title: 'Severance', type: 'show', blurb: 'new from wiki', year: 2022, poster: 'posters/severance.jpg', link: 'x' },
    { id: 'hades-ii',  title: 'Hades II',  type: 'game', blurb: '...', year: 2024, poster: '', link: '' }
  ];
  const merged = mergeIntoData(existing, incoming);
  const sev = merged.find(x => x.id === 'severance');
  assert.equal(sev.status, 'done');
  assert.equal(sev.notes, 'great');
  assert.equal(sev.rating, 5);
  assert.equal(sev.blurb, 'new from wiki');
  assert.equal(sev.year, 2022);
  assert.equal(merged.length, 2);
  const h = merged.find(x => x.id === 'hades-ii');
  assert.equal(h.status, 'todo');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd pipeline && node --test emit.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `pipeline/emit.js`**

```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const USER_FIELDS = new Set(['status', 'notes', 'rating', 'tags']);
const SYSTEM_FIELDS = ['title','type','blurb','year','poster','link','source_screenshot','ocr_excerpt','confidence'];

export function mergeIntoData(existing, incoming) {
  const byId = new Map(existing.map(x => [x.id, { ...x }]));
  const today = new Date().toISOString().slice(0, 10);
  for (const item of incoming) {
    const prev = byId.get(item.id);
    if (prev) {
      for (const k of SYSTEM_FIELDS) if (item[k] !== undefined && item[k] !== '' && item[k] !== null) prev[k] = item[k];
      for (const k of USER_FIELDS) if (prev[k] === undefined) prev[k] = defaultFor(k);
    } else {
      byId.set(item.id, {
        ...item,
        status: 'todo',
        tags: [],
        rating: null,
        notes: '',
        added: today,
      });
    }
  }
  return [...byId.values()];
}

function defaultFor(k) {
  return ({ status: 'todo', notes: '', rating: null, tags: [] })[k];
}

export function emitDataFile({ dataPath, incoming }) {
  const existing = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf8')) : [];
  const merged = mergeIntoData(existing, incoming);
  writeFileSync(dataPath, JSON.stringify(merged, null, 2));
  return merged;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd pipeline && node --test emit.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/emit.js pipeline/emit.test.js
git commit -m "Add data.json merge that preserves user edits"
```

---

## Task 10: `run.sh` — end-to-end orchestrator

**Files:**
- Create: `pipeline/run.sh`

- [ ] **Step 1: Write `pipeline/run.sh`**

```bash
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
osascript "$HERE/export_screenshots.applescript" "$INBOX" "$LIMIT"

echo "[2/6] OCR"
[ -x "$HERE/bin/ocr" ] || make -C "$HERE/ocr"
shopt -s nullglob
IMGS=("$INBOX"/*)
"$HERE/bin/ocr" "$OCR" "${IMGS[@]}"

echo "[3/6] Classify $USE_LLM"
node "$HERE/classify.js" "$INBOX" "$OCR" "$HERE" $USE_LLM

echo "[4/6] Dedup"
node -e "
import('./dedup.js').then(async ({ dedupCandidates }) => {
  const fs = await import('node:fs');
  const c = JSON.parse(fs.readFileSync('$HERE/candidates.json','utf8'));
  fs.writeFileSync('$HERE/candidates.json', JSON.stringify(dedupCandidates(c), null, 2));
  console.log('dedup: ' + c.length + ' -> ' + dedupCandidates(c).length);
});"

echo "[5/6] Enrich"
node -e "
import('./enrich.js').then(async ({ enrichAll }) => {
  const fs = await import('node:fs');
  const c = JSON.parse(fs.readFileSync('$HERE/candidates.json','utf8'));
  const out = await enrichAll(c, { postersDir: '$POSTERS' });
  fs.writeFileSync('$HERE/candidates.enriched.json', JSON.stringify(out, null, 2));
  console.log('enriched ' + out.length);
});"

echo "[6/6] Emit"
node -e "
import('./emit.js').then(async ({ emitDataFile }) => {
  const fs = await import('node:fs');
  const inc = JSON.parse(fs.readFileSync('$HERE/candidates.enriched.json','utf8'));
  const merged = emitDataFile({ dataPath: '$ROOT/data.json', incoming: inc });
  console.log('data.json items: ' + merged.length);
});"

echo "Done. Review: $HERE/skipped.json and $ROOT/data.json"
```

```bash
chmod +x pipeline/run.sh
```

- [ ] **Step 2: Dry-run with empty inbox (sanity check error paths)**

Run: `rm -rf pipeline/inbox && mkdir -p pipeline/inbox && touch pipeline/ocr_out/.keep`
(skip if the export step is what populates inbox)

- [ ] **Step 3: Commit**

```bash
git add pipeline/run.sh
git commit -m "Add end-to-end pipeline orchestrator"
```

---

## Task 11: Test-batch run + checkpoint

**Files:** (no source changes; this is the gated checkpoint per spec)

- [ ] **Step 1: Execute test batch**

Run: `pipeline/run.sh --limit 75`
Expected: each stage prints progress; `data.json` exists at repo root; `posters/` has ≤75 images; `pipeline/skipped.json` lists rejected screenshots with reasons.

- [ ] **Step 2: Audit**

Inspect `data.json` (length, title quality, year/poster fill rate) and `pipeline/skipped.json` (any obvious false negatives?). Note tuning items if any.

- [ ] **Step 3: User checkpoint**

Surface results to the user (count kept / count skipped / sample of titles + posters). Do NOT proceed to Task 12 until the user confirms the classifier is good enough OR specifies tuning.

- [ ] **Step 4: Commit the first real `data.json` and posters**

```bash
git add data.json posters/ pipeline/skipped.json
git commit -m "Initial Watchlist data (test batch)"
```

---

## Task 12: Site — markup + styles (stylish, dark, image-forward)

**Files:**
- Create: `index.html`
- Create: `assets/styles.css`

The site is intentionally vanilla. Use the `superpowers:frontend-design` skill before writing the markup/CSS so the result is genuinely sharp, not generic. The contract below is the minimum the JS in Task 13 expects.

- [ ] **Step 1: Invoke the frontend-design skill**

Invoke the `superpowers:frontend-design` skill to design a stylish dark UI for a media to-do list: poster grid, type badges, status states (todo/active/done), filter bar, search, and an Export button. Capture the resulting design intent before writing markup.

- [ ] **Step 2: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Watchlist</title>
  <link rel="stylesheet" href="assets/styles.css" />
</head>
<body>
  <header class="topbar">
    <h1>Watchlist</h1>
    <div class="controls">
      <input id="q" type="search" placeholder="Search…" />
      <select id="type">
        <option value="">All types</option>
        <option>movie</option><option>show</option><option>game</option>
        <option>project</option><option>book</option><option>music</option><option>other</option>
      </select>
      <select id="status">
        <option value="">Any status</option>
        <option value="todo">To watch</option>
        <option value="active">In progress</option>
        <option value="done">Done</option>
      </select>
      <button id="add">+ Add</button>
      <button id="export">Export</button>
      <label class="import"><input id="import" type="file" accept="application/json" hidden />Import</label>
    </div>
  </header>
  <main id="grid" class="grid" aria-live="polite"></main>
  <template id="card-tpl">
    <article class="card" draggable="true">
      <div class="poster"><img loading="lazy" /></div>
      <div class="meta">
        <span class="type"></span>
        <span class="year"></span>
        <h2 class="title" contenteditable="true" spellcheck="false"></h2>
        <p class="blurb" contenteditable="true"></p>
        <div class="row">
          <select class="status">
            <option value="todo">To watch</option>
            <option value="active">In progress</option>
            <option value="done">Done</option>
          </select>
          <button class="del" title="Delete">×</button>
        </div>
      </div>
    </article>
  </template>
  <script type="module" src="assets/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `assets/styles.css` per the design output**

Apply the frontend-design output. Required class hooks (used by `app.js`): `.grid`, `.card`, `.poster img`, `.type`, `.year`, `.title`, `.blurb`, `.status`, `.del`, plus `[data-status="todo|active|done"]` on `.card` for visual states.

- [ ] **Step 4: Commit**

```bash
git add index.html assets/styles.css
git commit -m "Add site markup and styles"
```

---

## Task 13: Site — JS behavior with TDD on pure logic

**Files:**
- Create: `assets/app.js`
- Create: `assets/lib/filters.js`
- Create: `assets/lib/filters.test.js`

- [ ] **Step 1: Write failing tests for pure filter logic**

Create `assets/lib/filters.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters } from './filters.js';

const ITEMS = [
  { id:'a', title:'Severance', type:'show',  status:'todo', blurb:'office split memory', tags:[] },
  { id:'b', title:'Hades II',  type:'game',  status:'done', blurb:'roguelite',          tags:['indie'] },
  { id:'c', title:'Dune Pt 2', type:'movie', status:'todo', blurb:'sand worms',         tags:[] },
];

test('search matches title or blurb', () => {
  assert.deepEqual(applyFilters(ITEMS, { q:'worm' }).map(x=>x.id), ['c']);
  assert.deepEqual(applyFilters(ITEMS, { q:'sever' }).map(x=>x.id), ['a']);
});

test('type filter', () => {
  assert.deepEqual(applyFilters(ITEMS, { type:'game' }).map(x=>x.id), ['b']);
});

test('status filter', () => {
  assert.deepEqual(applyFilters(ITEMS, { status:'todo' }).map(x=>x.id), ['a','c']);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd assets/lib && node --test filters.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `assets/lib/filters.js`**

```js
export function applyFilters(items, { q = '', type = '', status = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return items.filter(it => {
    if (type && it.type !== type) return false;
    if (status && it.status !== status) return false;
    if (needle) {
      const hay = `${it.title} ${it.blurb} ${(it.notes||'')}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd assets/lib && node --test filters.test.js`
Expected: PASS.

- [ ] **Step 5: Implement `assets/app.js`**

```js
import { applyFilters } from './lib/filters.js';

const LS_KEY = 'watchlist.v1';
const $ = (s, r=document) => r.querySelector(s);
const grid = $('#grid');
const tpl  = $('#card-tpl');

let items = [];

async function load() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) { items = JSON.parse(saved); return; }
  try {
    const r = await fetch('data.json', { cache: 'no-store' });
    items = r.ok ? await r.json() : [];
  } catch { items = []; }
}

function persist() { localStorage.setItem(LS_KEY, JSON.stringify(items)); }

function render() {
  const q = { q: $('#q').value, type: $('#type').value, status: $('#status').value };
  const view = applyFilters(items, q);
  grid.replaceChildren();
  for (const it of view) grid.appendChild(card(it));
}

function card(it) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = it.id;
  node.dataset.status = it.status || 'todo';
  const img = $('.poster img', node);
  img.src = it.poster || dataPlaceholder(it.title);
  img.alt = it.title;
  $('.type', node).textContent  = it.type || 'other';
  $('.year', node).textContent  = it.year || '';
  $('.title', node).textContent = it.title;
  $('.blurb', node).textContent = it.blurb || '';
  const sel = $('.status', node);
  sel.value = it.status || 'todo';
  sel.addEventListener('change', () => { it.status = sel.value; node.dataset.status = sel.value; persist(); });
  $('.title', node).addEventListener('input', e => { it.title = e.target.textContent.trim(); persist(); });
  $('.blurb', node).addEventListener('input', e => { it.blurb = e.target.textContent.trim(); persist(); });
  $('.del', node).addEventListener('click', () => {
    items = items.filter(x => x.id !== it.id); persist(); render();
  });
  enableDrag(node);
  return node;
}

function dataPlaceholder(title) {
  const t = (title||'?').slice(0,1).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 300'><rect width='200' height='300' fill='#222'/><text x='100' y='170' fill='#888' font-family='sans-serif' font-size='120' text-anchor='middle'>${t}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function enableDrag(node) {
  node.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', node.dataset.id); });
  node.addEventListener('dragover',  e => e.preventDefault());
  node.addEventListener('drop', e => {
    e.preventDefault();
    const from = e.dataTransfer.getData('text/plain');
    const to = node.dataset.id;
    if (from === to) return;
    const i = items.findIndex(x => x.id === from);
    const j = items.findIndex(x => x.id === to);
    if (i < 0 || j < 0) return;
    const [moved] = items.splice(i, 1);
    items.splice(j, 0, moved);
    persist(); render();
  });
}

function addManual() {
  const title = prompt('Title?'); if (!title) return;
  items.unshift({
    id: 'm-' + Date.now().toString(36),
    title, type: 'other', status: 'todo',
    blurb: '', year: null, poster: '', tags: [], notes: '', rating: null,
    added: new Date().toISOString().slice(0,10),
  });
  persist(); render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'data.json'; a.click();
  URL.revokeObjectURL(url);
}

async function importJson(file) {
  const txt = await file.text();
  try { items = JSON.parse(txt); persist(); render(); }
  catch { alert('Import failed: not valid JSON'); }
}

['#q','#type','#status'].forEach(s => $(s).addEventListener('input', render));
$('#add').addEventListener('click', addManual);
$('#export').addEventListener('click', exportJson);
$('#import').addEventListener('change', e => e.target.files[0] && importJson(e.target.files[0]));

await load(); render();
```

- [ ] **Step 6: Smoke-test locally**

Run: `cd ~/Documents/Git/watchlist && python3 -m http.server 8000` (or `npx serve .`)
Open `http://localhost:8000`. Expected: cards render from `data.json`, filters/search/edit/drag/Export work, reloading the page shows your edits (from localStorage).

- [ ] **Step 7: Commit**

```bash
git add assets/app.js assets/lib/filters.js assets/lib/filters.test.js
git commit -m "Add site behavior with filter tests"
```

---

## Task 14: README + ready-to-deploy

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# Watchlist

Stylish, editable, free GitHub Pages site for shows/movies/games/projects/books I want to check out — sourced from iOS screenshots via an on-demand local pipeline.

## Run the site locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Run the ingest pipeline (test batch)

```bash
pipeline/run.sh --limit 50
# optional, if `claude` CLI is on PATH:
pipeline/run.sh --limit 50 --use-llm
```

Outputs: `data.json` + `posters/`. Review `pipeline/skipped.json` for what was excluded.

## Deploy to GitHub Pages

Gated — only run on explicit request. From scratch:

```bash
gh repo create watchlist --public --source=. --remote=origin --push
gh repo edit --enable-pages --pages-branch=main --pages-path=/
```

Then visit the Pages URL printed by `gh`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README"
```

- [ ] **Step 3: Deploy gate (do not run without explicit user OK)**

Stop here. Ask the user whether to push to GitHub and enable Pages. Per Adam's push policy, no remote push happens without explicit approval.

---

## Self-review

- **Spec coverage:** Access (Task 2), OCR (3), classify+title (5,6), dedup (7), enrich w/ poster+blurb+year+link (8), emit preserving user edits (9), test-batch checkpoint (11), stylish editable site with filter/search/edit/drag/export/import (12,13), zero-build static deploy (14). All spec sections mapped.
- **Placeholder scan:** No TBDs, no "handle edge cases" without code. Each code step has its code inline.
- **Type/name consistency:** `idFor`, `slugify`, `cleanTitle`, `guessType`, `scoreOcrText`, `classifyDir`, `dedupCandidates`, `enrichOne`/`enrichAll`, `mergeIntoData`/`emitDataFile`, `applyFilters` — each defined once, called by exact name in later tasks. `candidates.json` → `candidates.enriched.json` → `data.json` flow is consistent across `run.sh` and the module signatures.
