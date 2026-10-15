# Our Picks: sourcing and publishing stock

One catalog backs reaction images/animations now and captionable meme templates. The catalog includes the reviewed Wikimedia Commons cat seed and an expanding Blob-hosted collection; the generated coverage summary records current counts. `Make a Meme` now supports static top/bottom or bottom-only captions and temporary submissions.

## Storage and credentials

- **Local tests:** `public/media/catalog.json` and two small cat WebP files are a test fixture only. Static imports are for local experiments. Growing inventory lives in ignored `media-work/catalog.json`, outside GitHub.
- **Production uses existing Vercel Blob:** set `MEDIA_CATALOG_SOURCE=blob`, `BLOB_READ_WRITE_TOKEN`, and the existing Upstash Redis credentials. Images/previews use `stock/`; immutable catalog snapshots use `stock/catalog/<sha256>.json`. Redis stores a small current-version pointer and retained revision pointers. Blob imports and shortlist publication sync the live catalog after uploads finish; no asset commit or redeployment is required. Storage and bandwidth follow your Blob plan.
- **Pexels search:** set `PEXELS_API_KEY` in `.env.local`, from https://www.pexels.com/api/. This is an offline curator credential, never a `NEXT_PUBLIC_` variable. The script loads `.env.local` automatically. It searches photos only; no video-to-GIF extraction in this release.
- **Wikimedia Commons search:** no key required. It returns source-specific license metadata, not an assurance that every result is usable. GIF/JPEG/PNG/WebP candidates are supported.
- **Original/AI/other licensed files:** use `localFile`. No sourcing API needed. Use the AI generation command below or your own originals, and retain their provenance.
- **Unsplash:** API integrations require hotlinking and download tracking (https://unsplash.com/api-terms and https://unsplash.com/documentation). This script does not use its API as a rehosting pipeline. A separately downloaded standard licensed photo can enter through `localFile` after reviewing its applicable license/rights. Unsplash+ and third-party rights need their own review.

Use Node.js 20.9 or later for image preparation and server meme rendering (`sharp`).

## 1. Search for candidates, not finished inventory

```sh
npm run media -- search --source commons --query 'cat yawning' --limit 20 --out media-work/cats.json
npm run media -- search --source pexels --query 'funny dog' --limit 20 --out media-work/dogs.json
# Pexels supports another bounded page:
npm run media -- search --source pexels --query 'funny dog' --limit 20 --page 2 --out media-work/dogs-page2.json
```

Each command writes JSON and a companion HTML thumbnail contact sheet. Open the HTML in a browser to review source links. Thumbnails load from the original source; full files are not downloaded yet. The search batch is bounded (maximum 50). `media-work/` is ignored by Git; keep originals, private permission documents, and rejected drafts there. Keep permanent rights evidence backed up outside this ignored folder, with a non-sensitive reference in `permissionRecord`.

Commons results can be noisy; refine queries. No Google, GIPHY, KLIPY, Reddit or X scraping/download adapter is included.

## 2. Review and edit the candidate JSON

For each keeper:

- Confirm the specific file's source and permission for hosting, commercial gameplay and the intended modifications. Check license conditions, recognizable people/brands, and whether planned captions fit those conditions. The script cannot determine rights from pixels.
- Write a short `title` and `description`, `categories` and `tags`. The UI chips are Awkward, Panic, Nope, Celebration, Confused, Angry, Suspicious, Facepalm, Fail, Shocked; matching is case-insensitive. Other tags/categories remain searchable.
- Preserve `creator`, `sourceUrl`, `license`, `licenseUrl`, and `attribution: {label, url}`. Confirm downloaded source metadata rather than blindly trusting it. A missing license URL (common for public-domain records) must be completed from the verified source record.
- Fill `permissionRecord` with the reviewed source revision/date, permission evidence reference and any conditions. This text is published in the catalog; exclude private correspondence/personal data.
- Set `captionable: true` only for still images intended for future meme editing. Add `captionLayout: "top-bottom"` or `"bottom"` and `captionMaxLength: 120` (per caption, maximum 300). Animated captioning is deferred.
- Set `reviewStatus: "approved"`. Pending/rejected candidates are skipped.

For manual files, copy `scripts/media/candidate.example.json`, set `localFile` to your original and replace every placeholder. `sourceUrl` and `licenseUrl` should be HTTPS provenance/reference pages even for your original work. For AI originals, record the model/version/date and applicable terms. Do not claim source search proves ownership.

The seed cat is CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Yawning_cat_(20835).jpg. Its credit and license accompany submissions; resizing/conversion is disclosed. Future captioned derivatives must preserve compatible share-alike licensing. The catalog and original metadata remain available independently of any particular game.

## 3. Import, resize, and publish

```sh
npm run media -- import --input media-work/cats.json --storage static
# Optional, using existing Blob storage:
npm run media -- import --input media-work/dogs.json --storage blob
npm run media -- validate
```

The importer validates all approval metadata and duplicate IDs before downloading, then:

1. Reads an approved local file or downloads from the supported Pexels/Commons host.
2. Limits originals to 20 MB, decoded pixels to 40 million, animations to 100 frames. SVGs, videos and other formats are rejected. URLs are HTTPS, no credentials, no redirects to other hosts.
3. Applies orientation, strips EXIF/location metadata, fits within 1200×1200 without upscaling, and converts to WebP. Animation is preserved in the full asset; the 320×320 preview is a still first frame.
4. Stores content-hashed filenames and keeps dimensions, format, rights and caption settings. Credit includes the resize/conversion notice.
5. Atomically writes the published manifest after all selected files are ready. Players only see approved published records.

Imports never silently replace an existing asset ID. Use a new version ID to replace a file. If an import fails after some writes, those files are unpublished orphans; remove them before retrying (including any `stock/` Blob objects). Do not run two imports concurrently. Blob upload is an external write; the CLI does it only when explicitly invoked with `--storage blob`.

Validation checks referenced local files exist; use a playtest to verify external Blob availability. Blob publication becomes visible to new browsing requests within about 15 seconds on healthy instances. Existing room image cleanup does not delete permanent stock.

## 4. Playtest

Make a Meme is available even without a remote GIF key. Search/category filters and template selection use paged `/api/media/catalog` requests (24 per page, maximum 48). The full catalog stays on the server. Players add captions to a template and submit the rendered meme; the separate Our Picks tab is removed. Source attribution and license remain in voting, results and downloaded HTML.

The local catalog is the reusable inventory. The meme editor selects `captionable` records, loads the blank `url`, renders captions, uploads a derived image and retains its original credit/license. Players can write captions or request optional AI suggestions. Arbitrary uploads, animated caption editing and movie-clip extraction remain outside this workflow. Contributions use a protected moderation CLI rather than a separate admin app.


## Make a Meme and temporary storage

Players choose **Make a Meme**, filter captionable templates by category, select one, and type their own text. The browser Canvas preview uses the same caption geometry as the server renderer: wrapped white bold text with black outlines, up to the catalog's per-caption character limit. One or two captions are supported. Font rendering can differ slightly between browser and server; common system sans-serif fonts are used.

`POST /api/memes` accepts only an approved template ID, captions, room code, player ID, room token and the game's submission deadline. It validates room membership/token, checks the active submission phase both before rendering and before uploading, validates caption count/length, and applies a separate per-room limit (30/minute, 300/hour). Arbitrary image uploads and user-provided source URLs aren't accepted. The server renders with `sharp` from local stock or approved `stock/` Blob URLs, then reuses `BLOB_READ_WRITE_TOKEN` to upload under `memes/<room>/<game-id>/`. Configure that existing token locally as well as in Vercel; there is no new storage account requirement.

The submission stores `type: "meme"`, template ID, caption text, rendered URL and source attribution/license in the existing expiring Redis room state. By default the submission stays temporary. Separate buttons support optional AI suggestions and explicit opt-in sharing for moderation; neither is required to submit. Captioned derivatives retain the template license and disclose that the player added captions. This matters for the CC BY-SA seed image.

Keep `stock/` and `memes/` separate: permanent stock is never deleted by meme cleanup. The host's **Play Again** action sends an authenticated room cleanup request. A persistent Redis expiry index also tracks all uploads, including abandoned or unsubmitted ones, so losing the room does not lose the cleanup record. Blob deletion happens before removing expiry entries so failures can be retried. The route rejects arbitrary client URLs for deletion.

A daily Vercel job is configured in `vercel.json` for `/api/cleanup-memes`. Add a random `CRON_SECRET` to the project's server environment; Vercel supplies it in the Authorization header. Without that secret the route refuses scheduled requests. Each run removes up to 1,000 expired images; entries become eligible after 24 hours, so successful daily runs normally remove them within roughly 48 hours. A backlog or failed run extends retention. Check deployment cron logs and increase frequency/batch processing if your plan/traffic warrants it. Documentation: https://vercel.com/docs/cron-jobs/manage-cron-jobs.

Memes remain available through voting and results. The HTML results export embeds fetched temporary images so a successful export can still display them after deletion. Export before Play Again; failed image fetches fall back to URLs and cannot guarantee later availability. Local development does not run Vercel cron automatically.

The catalog is loaded server-side from immutable Blob snapshots, with a 15-second pointer cache and a last-good snapshot fallback for up to five minutes during an outage. The browser receives only one page. Browse ties use a stable player/game/question seed; keyword relevance still ranks first. Page cursors pin the revision, seed and filters. Old revisions remain addressable for seven days after replacement; expired cursors restart browsing while preserving the caption draft. No production fallback to bundled stock is allowed.

```sh
# Once, migrate an existing local catalog (including local seed files) to Blob:
npm run media -- catalog-migrate
# Fresh curator checkout: pull the current inventory before adding assets:
npm run media -- catalog-pull
# Retry a failed publication without downloading/scoring again:
npm run media -- catalog-sync
```

Publication validates safe approved Blob URLs, uploads a checksummed manifest, then atomically swaps the Redis pointer. Concurrent or stale publishers cannot overwrite a newer pointer; accidental removal of existing IDs is rejected. Reviewed removals require editing the local working catalog and explicitly running `catalog-sync --allow-removals true`. Immutable snapshots remain in Blob; manage old-snapshot retention separately from game image cleanup. Keep one archive publisher running at a time. `catalog-pull` replaces working metadata, so back up unpublished edits before pulling.


## AI suggestions and offline preparation

**In the game:** “Suggest captions with AI” sends the selected stock image and current round prompt to Gemini using the host's existing room key. It offers up to three choices; players explicitly apply a choice, then can edit it. Existing typed text is preserved while suggestions load. Suggestions validate the template layout and text limits. The authenticated endpoint allows 12 requests/minute and 120/hour per room. AI failure does not block manual captioning.

**For curation:** set server-only `GEMINI_MEDIA_API_KEY`. `GEMINI_MEDIA_MODEL` configures text/vision processing; `GEMINI_STOCK_IMAGE_MODEL` configures original image generation. Defaults are in `.env.example`. These commands make billable API calls under that key; importing stock needs no AI.

```sh
# Gather up to 48 distinct expressive animal candidates, without an API key:
npm run media -- collect --source commons --limit 8 --out media-work/first-stock.json
# Or use Pexels with PEXELS_API_KEY:
npm run media -- collect --source pexels --limit 8 --out media-work/first-stock.json
# Propose metadata for at most 20 records per invocation (default 10):
npm run media -- tag --input media-work/first-stock.json --limit 10 --out media-work/tagged.json
# Generate a single original draft:
npm run media -- generate --prompt 'A startled real-looking cat staring at an empty dinner bowl, expressive face, absurd mood' --id original-cat-001 --out media-work/original-cat.json
```

`tag` adds `aiSuggestions` with a title, literal description, tags, categories, visible text, caption suitability and a layout recommendation. It never changes source, license, permission record or review status. Copy useful proposals into the candidate's metadata after reviewing. The output is checkpointed after each successful image. The VLM sees a resized first frame; it does not characterize a whole animation. Visible-text and layout proposals need manual checking; licensing is never inferred.

A ready-to-edit ten-scene batch is in `scripts/media/stock-prompts.example.json`: `npm run media -- generate --input scripts/media/stock-prompts.example.json --out media-work/originals.json`.

`generate --input media-work/prompts.json` also accepts `{ "prompts": [{ "id": "original-cat-001", "prompt": "an expressive cat" }] }` with at most 10 unique records, checkpointing after each successful image.

`generate` writes an original WebP and a pending candidate with model, prompt and generation date. License fields stay blank until you choose applicable terms and review the output. It does not generate GIFs, recreate famous characters, or automatically publish stock. Existing files are never overwritten. See [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), and [image understanding](https://ai.google.dev/gemini-api/docs/image-understanding).

Target 30–50 enjoyable reactions and 20–30 captionable templates, with overlap allowed. A candidate batch is a review pool, not a finished collection. Publish the strongest permitted assets and test a full game; the catalog now includes the first strict shortlist; the coverage summary records its size and gaps.

## Optional contributions and moderation

The editor's sharing checkbox defaults off. It asks permission to keep, edit and share the player's original captions under the template's license. Sharing copies the server-rendered temporary meme into `contributions/`, retains source credits, caption text, creation time and the consent version, and queues it as pending. The durable record omits room/player identifiers and credentials. An expiring server upload receipt verifies ownership; clients cannot submit arbitrary URLs or forged source/license metadata. Retries deduplicate the same upload, and room cleanup still removes the original `memes/` object.

Pending contributions are public Blob files by URL, but do not appear in Our Picks. Review content and permissions before approving. Set a random server-only `MEDIA_ADMIN_SECRET` of at least 24 characters locally and on Vercel. It protects both review and stats routes. No secret appears in the review files or command arguments.

```sh
npm run media -- moderate --site https://gifbattles.com --action list --out media-work/contributions.json
# Inspect companion HTML and JSON; approve/reject one returned ID:
npm run media -- moderate --site https://gifbattles.com --action approve --id REPLACE_WITH_ID
npm run media -- moderate --site https://gifbattles.com --action reject --id REPLACE_WITH_ID
# Export up to 50 approved records plus their local WebP files:
npm run media -- moderate --site https://gifbattles.com --action export --out media-work/approved.json
npm run media -- import --input media-work/approved.json --storage blob
npm run media -- validate
```

Use `--offset` with the returned `nextOffset` to page review/export. Approving alone does not publish: export, then import with `--storage blob` to sync the live catalog. Exported memes are captioned reaction images (`captionable: false`) with original licensing and the player's consent recorded. Rejection deletes the copied Blob before removing the queue entry; failure leaves the entry for retry. A minimal rejection tombstone prevents resubmitting the same upload. Removing an already published asset also requires removing its catalog entry and stock files. Pending copies remain until you review/reject them; monitor this queue and Blob usage. Approval/export copies can be retained as provenance.

## Stock usage measurements

Authenticated, bounded event batches record visible browser thumbnails, completed local submissions, voting appearances for eligible voters, and votes mapped to stored vote sides. An asset becomes a browsing exposure when at least half of its card intersects the viewport. Events deduplicate per game, player, round and asset (plus matchup for voting). The aggregate records omit captions, search queries, room codes and player IDs. Temporary hashed deduplication records expire after one day; aggregate counters expire after 90 days without an update.

```sh
npm run media -- moderate --site https://gifbattles.com --action stats --out media-work/stock-stats.json
```

Stats include browsing exposure/selection counts and selection rate, voting exposure/vote counts and vote rate, plus categories. Fetch further pages with `--offset`. Compare assets with similar exposure and enough samples; these are approximate browser-delivered counters, not a strict rolling time window or authoritative scoring data. A meme vote counts toward its underlying blank template, so caption quality influences that number. Do not remove assets automatically based on early results.


## Resumable collection across 20 categories

`batch-collect` targets a separate candidate count in each of 20 sourcing buckets. Search labels are provisional and do not become published categories automatically. The collector filters known source hosts, complete credit/license links, supported formats and minimum 480×480 source dimensions. It excludes exact source IDs/source-page duplicates, including already published stock. Commons licensing uses a conservative CC BY/CC BY-SA/CC0/public-domain allowlist; unknown or incomplete records are skipped. Source metadata screening is not proof of rights or visual suitability.

```sh
npm run media -- batch-collect --sources commons,pexels --per-category 50 --max-requests 120 --out media-work/stock-diverse/candidates.json
# After fixing credentials or waiting for a source's rate limit to reset:
npm run media -- batch-collect --sources commons,pexels --per-category 50 --max-requests 120 --retry-sources true --out media-work/stock-diverse/candidates.json
# Billable vision screening: default 20 images, up to 1000 explicitly:
npm run media -- batch-screen --input media-work/stock-diverse/candidates.json --limit 1000 --concurrency 2
# Import reviewed approved records into Blob, skipping previously published IDs:
npm run media -- batch-import --input media-work/stock-diverse/candidates.json --storage blob --limit 50
```

Each completed source search is checkpointed; resuming skips it. To raise the candidate target while retaining existing metadata and vision proposals, pass --grow true with a larger --per-category value (up to 500). Sources and category definitions must stay the same. For example, --per-category 100 --grow true targets 2,000 candidates across 20 buckets without restarting the review pool. Failed authentication or rate-limited sources are disabled in the checkpoint while other sources continue. `--retry-sources true` explicitly clears that state after the underlying condition changes. Other network errors stop safely with previous progress saved. `--max-requests` bounds each invocation, not a rolling provider quota: respect provider limits across repeated runs. Source search requests and thumbnail downloads are different operations. See [Pexels API guidelines](https://www.pexels.com/api/documentation/) and [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

The output includes a candidate JSON, an interactive HTML review sheet, and a category/count summary. The review sheet defaults to score ≥70 with flagged images hidden, supports actual AI category/captionable filters and pages 60 cards at a time. Select reviewed files, confirm the source/license check and download approved-stock.json. Exporting is local only; run batch-import with that file to upload. The downloaded records apply the selected metadata proposals while retaining source credits and license links. `batch-screen` downloads thumbnails, compares normalized thumbnail hashes to identify exact image duplicates, and asks the VLM for reaction usefulness (0–100), categories, existing text, caption suitability/layout and risk flags. It processes sourcing buckets in round-robin order, with bounded concurrency (1–4); saved proposals survive interruption and are skipped on resume. A failed request stops after in-flight work settles. It does not auto-approve assets, invent licenses or upload unreviewed candidates to Blob. Scores are fallible recommendations.

For publishing, copy reviewed proposals into title/description/categories/tags and caption settings, retain source/license/attribution, fill permissionRecord, and set reviewStatus to approved. `batch-import` validates selected approved metadata, invokes the existing importer in sequential chunks of 50, and updates the catalog after each successful chunk. A later invocation skips manifest IDs already published. Failed partial chunks can leave unlisted files, as described in the importer section; check those before retrying. The default import limit is 50; explicit values up to 1000 are supported. Never run multiple imports or collection/screening writers against the same output file concurrently.

A thousand collected records are not a thousand approved production templates. The coverage summary distinguishes search-bucket counts from high-scoring, unflagged VLM category matches. The approved catalog remains the source of truth for what players can use. All 20 category chips are available for local browsing; remote GIF search keeps its existing category shortcuts.


## Optional strict automated publication

`publish-shortlist` is an external write command: it downloads originals, uploads full/preview WebPs to the configured Blob store and changes the local published catalog. Use it only when you have chosen automated publication under this policy. It accepts score ≥80, no reported risk flags, complete allowlisted source/credit/license metadata, known categories/tags, still JPEG/PNG/WebP originals and ≤40 million source pixels. It preserves credits/licenses and records the source-metadata and model-based selection method honestly in permissionRecord. Source records and AI screening can be wrong; no independent human rights review is claimed. Failed/flagged/low-scoring files are held. Animations remain outside this automatic first collection.

```sh
npm run media -- publish-shortlist --input media-work/stock-diverse/candidates.json --sources pexels --storage blob --min-score 80 --limit 50
# When Commons original downloads are no longer rate limited:
npm run media -- publish-shortlist --input media-work/stock-diverse/candidates.json --sources commons --storage blob --min-score 80 --limit 50
```

The default limit is 50; explicit limits up to 1000 are supported. publication.json records successful IDs and failed attempts. Each asset checkpoints independently; completed uploads are published together when the invocation finishes. Resume skips existing catalog IDs. On HTTP 429, subsequent files from that source are held for the rest of the invocation; wait for the source to recover before retrying. Do not use alternate hosts to work around a rate limit. An upload interrupted between full and preview can still leave an unlisted Blob object; remove it before retrying that asset. After the invocation, the publisher syncs the live Blob catalog. A failed sync leaves the working catalog checkpointed; retry `catalog-sync` without rescoring. Uploading files alone still does not publish them: the atomic catalog switch completes publication.

## Subject diversity and duplicate control

New batch collection uses `subject-balanced-v1`: each reaction bucket reserves slots independently for cats, dogs, other animals, food, objects, situations, historical material and art. A successful cat search cannot consume the food/art slots. Empty groups remain underfilled; increasing the target does not guarantee enough usable inventory. The queries are in `lib/media/stock-subjects.cjs`; subject is independent of the game's reaction categories. Gemini now proposes `primarySubject` and a literal `sceneDescription` from the image, rather than treating the search label as truth. Legacy catalog subject counts use conservative title/description/tag matching and can be `unknown`.

Use a **new output file** for this sourcing policy. Old candidates and vision proposals remain usable for review/import; changing the collection plan in an old checkpoint is intentionally rejected.

```sh
npm run media -- batch-collect --sources commons,pexels --per-category 50 --max-requests 120 --out media-work/stock-diverse/candidates.json
npm run media -- batch-screen --input media-work/stock-diverse/candidates.json --limit 1000 --concurrency 2
npm run media -- publish-shortlist --input media-work/stock-diverse/candidates.json --storage blob --min-score 80 --limit 50
npm run media -- audit-similarity
npm run media -- gallery
```

Screening compares normalized exact hashes, full-image and center-crop DCT perceptual hashes, and color distributions. It compares both the current batch and cached fingerprints from published catalog previews (`media-work/catalog-fingerprints.json`). Exact matches skip VLM work and cannot be published. Close matches retain the VLM assessment but receive `similarTo` plus a pending `similarityReview`; they cannot be automatically published or exported as approved. Same creator/subject plus similar visual structure/color also flags a probable photo series. These are conservative review holds, not proof that two pictures are identical. Arbitrary crops and photo series with very different poses can still escape detection; this is not an embedding-based semantic search system.

Resolve a genuinely distinct pair only after visual review: set `similarityReview.status` to `distinct` while retaining its matched reference `id`. Recomputed publication checks can require a new review if the closest matching reference changes. Retired repetitive series are registered in `lib/media/stock-exclusions.json` so collection/import/automatic publication do not reintroduce those source records. Catalog removal preserves Blob objects used by existing submissions. The source records for the nine retired initial images are backed up locally in `media-work/retired-stock-assets.json`.

Automatic publication also limits each visually assessed subject to 25% of the growing published catalog (configurable with `--max-subject-share`, range 0.125–0.5). Existing overrepresented subjects are grandfathered, but more of that subject are held until other subjects catch up. Unknown subjects need assessment before automatic publication. This limit does not delete existing entries or relax the score/license/risk filters. Curator imports are explicit overrides of the automatic diversity quota, but still cannot import unresolved similarity holds or registered retired images.

`audit-similarity` writes JSON and a side-by-side HTML review, marking specifically reviewed distinct pairs separately. It never deletes files. `gallery` regenerates the local published gallery with subject/search filters and 48-card pagination; image files load from Blob or the local seed. The gallery embeds catalog metadata locally; the production Our Picks browser continues to use server pagination.

A refused or malformed model answer is saved as `screeningFailure` for that image; it does not receive an approval or score. Other candidates continue. Normal resume skips these failures; `batch-screen --retry-failed true` explicitly retries them. Authentication, quota, download and other operational failures still stop the run after in-flight work settles. Summary files distinguish successful screening from failed assessments.

## Commons humor collections

`collect-humor` starts from **Humor photos**, **Humorous animals** and **Humor**, rather than ordinary stock-photo searches. It reads file metadata with the official categorymembers/imageinfo API, discovers up to 20 direct subcategories per page, and walks a bounded category graph. Children are queued ahead of continued parent pages so a large root does not consume the entire budget. The depth is 0–2 (default 1), the discovered category cap is 100, and each file-metadata page has at most 20 members. Roots/subcategories can overlap; visited-category and source-ID/source-URL checks avoid cycles and repeated candidates. Published and retired source records are excluded. Category membership is a discovery hint, not a rights or quality approval.

```sh
npm run media -- collect-humor --limit 120 --depth 1 --max-requests 12 --out media-work/commons-humor/candidates.json
npm run media -- batch-screen --input media-work/commons-humor/candidates.json --limit 120 --concurrency 1 --cache-previews true
npm run media -- publish-shortlist --input media-work/commons-humor/candidates.json --sources commons --storage blob --min-score 80 --limit 50
```

Candidate source/license metadata and checkpoints are saved locally. With `--cache-previews true`, successfully downloaded thumbnails are converted to bounded WebP previews under the input file's adjacent `previews/` folder; the generated review gallery uses these local files. Gemini sees the actual thumbnail and adds descriptions, tags, subject/reaction labels, risk flags, interaction descriptions/scores, caption potential and up to three caption angles. These angles are curator suggestions; users still write their own text or use the game's optional caption suggestion button. Review galleries show the additional assessment fields.

Originals are downloaded only for publication/import. `--storage blob` stores processed full images and previews in permanent `stock/` Blob storage; it does not retain a separate local original-image archive. Existing score, license, risk, similarity and subject-share filters apply equally to humor discoveries. Animated candidates are discoverable, but automatic still-template publication does not accept GIF originals.

Repeat the collection command to resume saved continuation tokens; use `--grow true --limit 240` to increase an existing target. `--categories 'Humor photos,Humorous animals'` selects up to 10 custom Commons roots (use a separate output file if changing roots/depth). On HTTP 429/401/403 collection stops, keeps the queue and requires a later explicit `--retry-sources true` to retry. Do not run collection and screening writers on the same JSON simultaneously.

Visual curator concerns can be recorded in `curatorFlags` without changing the model's original `riskFlags` assessment. A nonempty curator flag list blocks automatic publication and approved-file export/import until those concerns are resolved. The humor pilot's visual check found two recognizable faces missed by the model and held those records; a high model score does not override that check.

## Durable archive, family/work screening and controlled pilots

The archive commands require **Node.js 22.13 or later** (`node:sqlite`); the CLI may show Node's experimental SQLite warning. They are offline curator commands, not a new production room database. Default storage is `media-work/archive/candidates.sqlite` with WAL transactions. Candidate identity/source deduplication, immutable assessment history, human flags/review events, run counters and API attempt records survive interruption. Keep the SQLite database **and** its adjacent `previews/` directory backed up locally. They are ignored by Git.

`family-work-v1` requires explicit clear assessments for sexual content, nudity, graphic violence, animal cruelty, hate/harassment, offensive text, drugs, dangerous acts and disturbing imagery, plus both child/work suitability booleans. Missing, uncertain or stale assessments fail closed. Existing model/curator rights concerns, licenses, source verification, duplicates, similarity holds and diversity limits remain separate checks. A current safe assessment is now required for new imports and automatic publication. The runtime catalog and server meme-template lookup also exclude missing/stale/non-safe assessments. This screens **stock images**; player captions, prompts and remote-provider results are not covered by this stock policy. Do not advertise the whole game as family-safe solely because stock passed this classifier.

```sh
# Import old tagging work without paying to repeat it. Each different assessment is retained in history.
npm run media -- archive-import --input media-work/commons-humor/candidates.json
# Add published assets to the archive and audit their actual served previews.
npm run media -- archive-catalog
npm run media -- archive-screen --catalog-only true --limit 100 --max-calls 100 --max-usd 1
# Apply only after every existing catalog asset has a current assessment; incomplete audits change nothing.
npm run media -- archive-apply-safety

# Collect a balanced, new pilot; source data are checkpointed directly into SQLite.
npm run media -- pilot-collect --target 1000 --max-source-requests 100 --cohort family-pilot-1000
npm run media -- archive-screen --cohort family-pilot-1000 --limit 1000 --max-calls 1000 --max-usd 5 --concurrency 4
npm run media -- archive-export --out media-work/archive/candidates.json
npm run media -- publish-shortlist --input media-work/archive/candidates.json --storage blob --min-score 80 --limit 50
```

Pilot collection reserves subject slots across eight subjects and excludes previously archived source records. Its source limit counts search calls; Openverse origin verification performs additional bounded calls. Openverse defaults to `wikimedia,met` sources, verifies Commons licenses/credits through imageinfo, and verifies Met `isPublicDomain` through its collection API. `OPENVERSE_SOURCES` can select other Openverse source filters. Supported Flickr records need matching photo IDs/CDN URLs and Creative Commons license evidence on the original public page; unavailable or unverified origins stay metadata-only and never trigger image downloads or Gemini spending. Only vetted download hosts are permitted; redirects are rejected. The Openverse API requests non-mature content and licenses allowing commercial modification. Discovery metadata is not a substitute for the original source or visual assessment. Anonymous Openverse/Commons service limits can prevent mixed-source collection; a Pexels fallback pilot should be reported as such rather than a measure of Openverse quality.

Archive screening permits 1–4 workers and uses an exclusive expiring worker lock to avoid duplicate processes. Every request **and retry** reserves capacity in an atomic transaction before calling Gemini. Default limits are 1,000 requests and $5 estimated spend, with a conservative $0.01 reservation per outstanding call. Standard `gemini-3.5-flash-lite` rates ($0.30/M input, $2.50/M output including thinking, checked 2026-10-13) reconcile reservations from response token usage. Cached-input discounts/free-tier allowances are not assumed. Calls with missing usage retain their full reservation, including failed/time-out calls. Estimates are not a provider billing guarantee: review rates when changing models/plans. The archive runner currently refuses other models until its pricing configuration is updated. Request caps are exact; dollar caps are conservative local estimates. Outstanding results are saved even if another worker reaches the cap.

Retries are bounded; 429/5xx/timeouts back off, and server Retry-After is honored up to 60 seconds. Persistent 429 or rejected credentials stop the worker with checkpointed state. To resume an interrupted still-active run while preserving its original limits, pass its printed `--run-id`; do not start a second worker while one is active. Completed/budget-limited runs require an explicit new run. Already-assessed records under the current safety policy are skipped; changing the policy intentionally requires a new assessment. Unsafe pixels are removed from the owned local cache; metadata/decisions remain. Safe and uncertain review previews stay local, with uncertain previews hidden by default in the review gallery.

Optional `archive-backup` uses **only** `MEDIA_ARCHIVE_BLOB_READ_WRITE_TOKEN`, for a separately configured private store, and sends `access: 'private'` for safe previews and a consistent SQLite snapshot. It never falls back to the public stock token. The current setup deliberately uses local archive storage. Public `stock/` still contains only approved game assets; removing a catalog entry preserves historical public objects for existing submissions.

Training rights default to **unreviewed**. Existing tagging licenses are not automatically interpreted as training permission. An explicit curator can record a decision:

```sh
npm run media -- archive-review --id ASSET_ID --reviewer 'Curator name' --note 'Evidence and applicable terms reviewed' --training-rights approved
npm run media -- archive-training-export --out media-work/archive/training-manifest.json
```

Training export includes only current safe records with a cached preview and explicitly approved training rights. It labels model assessments as model-generated, not human ground truth. A curator can explicitly clear a resolved concern with `archive-review --clear-curator-flags true`, supplying a reviewer and note; source import/re-screening never silently erases human flags. No model training is performed by these commands.

### Source pacing and collection at scale

All Commons metadata queries and Commons image downloads share a serial request queue. The default gap is 5 seconds (`COMMONS_REQUEST_INTERVAL_MS`); Openverse search defaults to 45 seconds (`OPENVERSE_REQUEST_INTERVAL_MS`). The interval is enforced underneath the collectors, so origin verification and concurrent screening downloads cannot bypass it. These settings apply only to offline stock sourcing, not players' GIPHY/KLIPY searches.

The request helper honors numeric/date `Retry-After`, handles Commons HTTP-200 `maxlag`/`ratelimited` errors, and retries transient failures at most twice. It adds `maxlag=5` to Commons API queries, following [MediaWiki guidance](https://www.mediawiki.org/wiki/Manual:Maxlag_parameter). Cooldowns are saved in `media-work/source-rate-limits.json` and survive restarting the script. A cooldown exceeding 30 seconds checkpoints the source instead of holding the process; subsequent runs still respect it. Without a 429 Retry-After, the cooldown is one minute. Service quotas remain in force; pacing cannot bypass an exhausted daily/hourly quota or a 403 denial. The search-call cap counts logical searches; each can perform at most three HTTP attempts per metadata request, plus bounded origin verifications. Run one importer at a time; queues coordinate one process, while persisted cooldowns protect later invocations.

For a Commons/Openverse-only batch that cannot be filled by Pexels fallback:

```sh
npm run media -- pilot-collect --sources commons,openverse --target 1000 --max-source-requests 100 --cohort humor-mixed-002
npm run media -- archive-screen --cohort humor-mixed-002 --limit 1000 --max-calls 1000 --max-usd 5 --concurrency 4
npm run media -- archive-export --out media-work/archive/candidates.json
```

Repeat the same cohort collection command after a source recovers: completed discovery tasks and archived URLs are skipped, while incomplete tasks can resume. Use separate cohorts for further batches rather than one unlimited job. Screening skips assessments already completed under the current policy.

Manual review of every candidate is optional for the automated strict workflow. `publish-shortlist` accepts only current-safe records with score ≥80, complete supported source metadata, no model/curator concerns and no unresolved duplicate hold. It enforces the separate catalog subject-share limit, then downloads originals and uploads processed game images to public Blob. Review/unsafe/low-scoring candidates stay out of the game. A sample check is useful for tuning the model and searches; a high model score does not guarantee humor or perfect safety. Source/legal concerns that cannot be established from supported evidence remain held.

```sh
# Publish the automatically selected safe stock; no per-image approval checkbox required.
npm run media -- publish-shortlist --input media-work/archive/candidates.json --storage blob --min-score 80 --limit 1000
npm run media -- gallery
```

On 2026-10-14, 80 of the pilot's 187 strict candidates were published (catalog 72 → 152: 34 situations, 33 other animals, 7 dogs, 3 objects, 3 food). The other 107 (62 cats, 38 dogs, 7 other animals) are held only by the subject-share limit in `media-work/archive/publication.json`; rerunning `publish-shortlist` releases them as other subjects grow, without rescoring. Collection, screening and export do not upload new stock. Only import/publication does. See [pilot results](media-pilot-2026-10-13.md).

A Commons/Openverse yield check the same day (cohort `mixed-yield-2026-10-14`, stopped after 16 searches) found Openverse rate-limited on its first anonymous request and Commons keyword search producing 5 metadata-eligible records out of 47 — all 19th/early-20th-century prints, including hateful historical caricatures. The earlier Commons humor-category walk published 3 of 118. Treat Commons/Openverse as small supplements; Pexels (18.7% strict yield) is the practical volume source.

### Local game verification

Run `npm run dev` and open `http://localhost:3000`. Create a room and join it from a separate private browser window as a second player.

- **GIFs:** use Search GIFs, search, submit and vote. With both keys configured, exhausted quota automatically switches to the other provider and replaces the grid and credit. Players do not choose providers; pagination stays within one provider.
- **Make a Meme:** browse the published catalog by category, pick a template, add captions, preview, submit and vote. Templates load from public Blob (plus the bundled cat); rendered submissions upload through `/api/memes` to the existing Blob store. Local candidate-gallery files are not game inventory.
- **AI:** the host adds a Gemini key in the lobby for that room. Meme questions can revise an answer, suggest captions or generate a meme image. Offline `GEMINI_MEDIA_API_KEY` does not automatically become a room key. The room key must have access to the configured text/image models.

Local runs use the configured Upstash/Blob services. With the current shared configuration, they create real room records and temporary rendered files; permanent `stock/` assets are reused. Use fresh room codes and Play Again cleanup after testing. Scheduled expiry cleanup still needs a deployed `CRON_SECRET` and configured cron; room expiry alone does not delete Blob files.

Authenticated heartbeats run every 8 seconds. Lobby takeover waits 2 minutes; active games use a 40-second grace period. The server atomically checks the current host and its last heartbeat before transferring ownership. A resumed tab refreshes room state and renews its heartbeat if it is still host. Explicit Leave transfers ownership immediately; the last Leave deletes the room. Abandoned lobbies expire 30 minutes after the last activity; active rooms expire after 4 hours. Meme mode checks whether the room has a Gemini key and disables AI tools with a clear host/guest message when it is missing; text answers and manual captions remain available.


## Required answer mode per question

The host-only **Alternate GIF and Meme rounds** checkbox defaults on (`alternateModes: true`). New games with it enabled store `alternate-v2` and rotate **GIF → Meme → GIF → Meme** by round cycle. With it disabled, games store `choice-v2` and display **Search GIFs** / **Create Meme** tabs on every question. Guests see the selected setting as read-only text. Room-state writes reject guest setting changes, freeze the selected policy for the active game, and permit both supported formats in choice mode, including Meme AI on any question. Multiple heats in a cycle share the same mode. There is no third Write Answer mode. Alternating games have one required mode per question; normal games let each player choose either tab. Old `rotate-v1` games remain readable: their Write Answer questions are interpreted as Meme questions, preserving submissions.

Meme mode includes a 280-character answer/idea field, optional AI wording suggestions, direct AI meme-image generation, and the paged template picker with manual or AI-suggested captions. AI wording suggestions never overwrite the draft automatically: the player explicitly applies one and can edit it. A selected template pre-fills its bottom caption from the current draft (bounded to that template's caption limit). Text answers and manual template captioning work without a Gemini key; AI controls are disabled with host/guest setup guidance when no room key exists.

`POST /api/meme-answers` validates membership, player token, submission deadline, question assignment, Meme mode and the room's Gemini key. It uses canonical room prompts, returns up to three distinct short suggestions, and shares the room caption-AI rate limit. Direct meme-image requests use `/api/generate-image` with `memeImage: true` and authenticated game/question context. Their generation prompt requests an original visual with the player's supplied caption as legible text. Model-rendered text can vary; players preview the result before submitting. No image-generation key is exposed to the browser.

If every GIF provider is in quota cooldown, the question switches to Meme for remaining players via shared room state. Previously submitted answers remain intact. Empty template catalogs do not change the mode: written answers and AI creation stay available inside Meme mode. Submission validation permits GIF media only on GIF questions and template memes, text or AI images on Meme questions. Start a fresh game to get the new two-mode sequence.


## Host recovery and room lifecycle

The host renews an authenticated, server-timestamped heartbeat every 8 seconds and when returning to a visible tab. Lobby takeover waits 120 seconds without a valid host heartbeat; active-game takeover waits 40 seconds. Any connected, authenticated room member can request takeover. Redis checks the expected host and heartbeat atomically, so only one competing claimant wins. An old host cannot renew the new host's heartbeat or restore themselves through an outdated room-state write.

Explicit Leave removes a player immediately. When the host leaves, the first remaining roster member becomes host; when the last player leaves, the room, heartbeat and missing-heartbeat marker are deleted and credentials revoked. Closing/crashing a browser does not guarantee a Leave request: disconnected players can remain in the roster, with host takeover and expiry handling abandonment. A frozen host stays in the roster so they can resume as a player; a new lobby host can remove them if needed. No remaining player needs to leave just to recover host control.

Active host heartbeats renew the room TTL. If everyone disappears without leaving, lobbies expire after 30 minutes without activity and active rooms after 4 hours; finished rooms expire after 15 minutes. Temporary HTTP/network/Redis read failures are not treated as confirmed lobby deletion. The live leave API accepts both string and SDK-decoded object results from Lua.

To verify server/Redis behavior, run a local production server on port 3102 after building, then `node scripts/test-host-presence.mjs`. This creates one owned fixture room using the configured Redis, verifies healthy/frozen host handling, concurrent claims, stale snapshots, Leave transfer and last-player deletion, and cleans its own records. It never prints credentials. Refresh existing browser clients to use the authenticated heartbeat endpoint; generic `/api/store` no longer permits heartbeat writes.

### Unified Meme composer

Players write one answer/caption, optionally accept an AI rewrite, then browse categories or click Search to find templates using the current text. Search ranks matching catalog keywords; it is not a general web image search or semantic AI search. Selecting a template overlays the same text in the preview. Editing or accepting an AI suggestion updates that caption. Captions longer than a template's limit are preserved with a shortening message, rather than truncated.

There is one Submit action: a selected template saves a rendered meme, an AI preview submits the generated image, and Text only submits the original text. AI image generation optionally uses the selected catalog template's title and description as inspiration for a new original scene; it does not edit the source image's pixels. Changing the caption clears an obsolete generated image. Manual text and template captions work without a room Gemini key.

### GIF quota recovery during a question

A search or Load more that hits a provider's quota tries the alternate provider. On pagination fallback, the alternate starts at its first page using the original searched query; the grid, selection and attribution are replaced together. If all configured providers are paused, only that question switches to Meme for unanswered players. Submitted GIFs and later questions remain intact. If saving the shared switch fails, players can retry with Switch this question to Meme. Temporary network/service failures retain existing GIF results and permit retry. GIF submission errors are displayed, and submission is disabled while a search is in flight.

## Growing toward 10,000 playable meme templates

The target counts **published, captionable still images**, not downloaded records or model-approved candidates. `grow-library` runs collect → screen → publish in resumable batches. Review files and SQLite remain local; only strict approved game assets go to public Blob `stock/`. Deployment remains a separate step.

```sh
# One importer process at a time. Defaults target 10k, 2k candidate batches,
# a cumulative $100 token-usage estimate cap and 100k model-attempt cap.
npm run media -- grow-library --target 10000 --batch-size 2000 --max-usd 100 --max-calls 100000

# For a bounded pilot, keep the same settings and stop after one batch:
npm run media -- grow-library --target 10000 --batch-size 2000 --max-usd 100 --max-calls 100000 --max-batches 1
```

Rerun the same command to resume `media-work/growth/state.json`. Resume settings are immutable; a different state file intentionally starts separate accounting and must not be used to circumvent an exhausted budget. Model requests and retries count toward the same cumulative job caps. Unknown usage keeps the conservative reservation. The cost figure is an estimate rather than an invoice or a guaranteed billing ceiling. Interrupted active screening runs preserve their run IDs. Completed assessments are skipped. The runner exits on target completion, budget exhaustion, source throttling, exhausted search tasks or no progress; it never reports 10,000 merely because it collected that many candidates.

`media-work/growth/report.json` tracks the published target, subject/detail distribution, all 20 reaction-category counts, per-query screening yield, model attempts and estimated spend. `shortlist.json` contains only strict candidates and has no 5,000-record export truncation. `publication.json` records holds and upload failures. The published gallery can be refreshed with `npm run media -- gallery`.

The expanded plan uses specific photographed scenes and broad species coverage. Pexels returns up to 80 candidates per search, with a default 19-second gap between API searches (about 189/hour), persisted across process restarts. Image CDN downloads use a separate bucket. Provider throttling still checkpoints the run. See [Pexels API documentation](https://www.pexels.com/api/documentation/) for its default 200/hour and 20,000/month limits. Do not run another importer in parallel against the same archive/catalog.

Publication keeps the existing 25% subject cap, adds a 10% per-detail cap for non-cat/dog subjects and a 2% per-creator cap, with a three-image bootstrap allowance. Existing inventory is grandfathered, not removed. Unknown details are held. VLM detail labels are checked against a fixed taxonomy; legacy descriptions/tags supply conservative fallback labels without rescoring. Exact fingerprint duplicates are checked against the whole archive before VLM spending; near duplicates remain held by the visual checks. Strongly overlapping literal scene descriptions from the same creator and subject/detail are held as probable photo series, independently of perceptual hash distance. These are conservative holds, not proof of identical images.

Commons humor category traversal now follows both file and subcategory continuation independently, so finishing a file listing cannot replay it while walking more subcategories. It discovers up to 500 subcategories and retains source and safety gates. Category results may still be historical, sensitive, repetitive or weak meme material. API accessibility and publishable humor yield are reported separately.

Check current progress without starting another importer:

```sh
npm run media -- growth-status
```

This reads the current archive, model-run accounting and catalog rather than relying on a possibly stale report snapshot during collection. `running` checks the local job PID; `phase` distinguishes collection, screening and publication. The gallery refreshes after successful publication batches and includes a species/scene filter.

Stock uploads are immutable and use content-hash filenames. If a process stopped after uploading a file but before recording it in the catalog, retry can reuse the existing Blob only after pathname, size, content type, storage hostname and actual bytes match; it never overwrites a different object.

### Commons growth validation, 2026-10-14

A fresh depth-two category walk collected 171 source-metadata-eligible records and discovered 244 category names before Commons throttled it again. Existing archived records were skipped, leaving 88 new candidates for visual assessment. All 88 were assessed in 88 Gemini calls (estimated token cost $0.143994, a separate bounded $2 validation run). Model safety decisions: 82 safe, 5 review, 1 unsafe. Twenty-one passed the initial strict score/metadata gates. Publication added seven files, then a visual spot-check held one taxidermy scene from the family catalog. The net gain is **six templates**, 152 → 158. Public Blob files for held stock are preserved for historical references; the exclusion registry prevents republication.

This demonstrates that category collection and screening work, while rate limits and uneven quality still constrain yield. A supplemental metadata gate now holds taxidermy and explicitly hateful/sensitive historical descriptions before VLM spending or publication, even if an existing model assessment said safe. Ordinary visual assessments still apply to every published candidate. A small spot-check caught this case; automated screening is not presented as perfect.

The resumed Pexels growth job targets 10,000 actual published templates, with the cumulative $20 screening-estimate limit in its state file. It has not reached that target as of this checkpoint. No production deployment is part of collection.

### Automatic Commons resumption

`collect-humor --auto-resume true` now waits through quota cooldowns (in 30-second sleep chunks), checkpoints the retry time, and retries the same category automatically. Authentication failures still stop; retries still count toward `--max-requests`. Individual cooldowns longer than six hours are checkpointed for later resumption. Growing the collection limit retains completed pages:

```sh
npm run media -- collect-humor --limit 1000 --depth 2 --max-requests 100 --out media-work/commons-humor-expanded/candidates.json --grow true --auto-resume true
```

Production source requests now use cross-process per-source locks and a separate checkpoint-write lock. Commons metadata-only discovery can run alongside the Pexels growth worker without racing its Commons downloads or overwriting another source's cooldown. Archive screening and catalog publication still belong to a single worker; discovery writes its own JSON checkpoint and newly discovered records are imported afterward.

The user raised their Gemini service cap to $20 on 2026-10-14. The active growth job was resumed from its existing run ID and its **local cumulative estimate cap was lowered from $100 to $20** to match. Existing spending and completed assessments remain in its accounting. New successful Gemini responses were verified after resumption. Resume this particular job with:

```sh
npm run media -- grow-library --target 10000 --batch-size 2000 --max-usd 20 --max-calls 100000
```


## Commons preparation and operation budgeting

Archive and queue commands require Node.js 22.13 or later. These commands prepare work locally without new source requests, Gemini calls, Redis reads or Blob uploads:

```sh
npm run media -- commons-prepare --input media-work/commons-humor-expanded/candidates.json --out media-work/commons-ready
npm run media -- upload-budget --action status
npm run media -- publish-shortlist --input media-work/commons-ready/publication-candidates.json --dry-run true --limit 50
```

Preparation reads the archive in read-only mode. `screening.json` contains pending candidates ordered by photo/interaction priority and category rotation; `publication-candidates.json` reuses complete current assessments; `holds.json` records policy, duplicate and metadata holds; `metadata-audit.json` records repairs and evidence gaps; `publication-plan.json` includes duplicate/diversity checks and operation estimates. All are ignored by Git. `report.md` is a readable summary.

The collector now prioritizes humor photos, forced perspectives, animal situations and food/objects ahead of common pets and broad historical art. Sensitive metadata remains held. Future metadata exclusions retain per-file evidence, bounded at 10,000 records per collection with an explicit truncation indicator. Older exclusion counters overlap and do not retain file identities: the 420 missing source/license URL events cannot be reconstructed offline. Refetch those categories in a later bounded source run before claiming recovery. Exact Creative Commons names/URLs can repair missing counterparts; conflicting assertions, missing credits and ambiguous public-domain records remain held. Metadata repair never supplies visual approval or invents authorship.

When a new Gemini allowance is available and a bounded screening run is authorized, first import the saved queue into the archive, then pass the same file to the runner. The queue controls execution order, and already-completed assessments are skipped before applying the limit:

```sh
npm run media -- archive-import --input media-work/commons-ready/screening.json
# Billable: run only when the screening budget is available.
npm run media -- archive-screen --queue media-work/commons-ready/screening.json --limit 50 --max-calls 60 --max-usd 1 --concurrency 2
# Rebuild the publication queue from the saved results:
npm run media -- commons-prepare
```

Permanent stock writes require a configured `media-work/upload-budget.json`. Missing, paused, invalid or expired configurations block writes; there is no automatic calendar-month reset. Obtain the actual quota-window dates and current Advanced Operations usage from Vercel, then configure them explicitly. Example syntax (replace every placeholder):

```sh
npm run media -- upload-budget --action configure --period-start ACTUAL_START_ISO --period-end ACTUAL_END_ISO --quota 2000 --used OBSERVED_USED --reserve 500
```

The remaining local stock allowance is `quota - observed usage - gameplay reserve - subsequent local attempts`. The default 500-operation reserve is configurable. Overlapping quota windows cannot lower accounted usage. The growth runner checks the upload allowance before starting another source/model batch. Each permanent `put` reserves an operation atomically before calling Blob, including failed/interrupted attempts. Offline SDK retries and multipart uploads are disabled so attempts cannot multiply silently. The publisher limits batches to fit image + preview + one catalog snapshot; direct Blob imports preflight the full requested batch. Budget errors stop publication rather than being swallowed as per-image errors. Checkpointed files can be synchronized later without rescoring.

This is a conservative local accounting guard, not a Vercel account-wide spending limit. Dashboard actions, other checkouts, other projects and live gameplay can consume additional operations; reserve accordingly and refresh the observed usage baseline. Existing files may reduce actual upload needs, but dry runs budget two attempts per template. The full-image/preview estimate does not measure storage or download allowances. Only `publish-shortlist` supports `--dry-run true`; other commands reject that flag instead of silently performing writes.
