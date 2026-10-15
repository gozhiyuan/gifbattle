# Family/work-safe stock pilot — 2026-10-13

The fresh pilot collected and assessed 1,000 images. It produced 187 candidates that pass the strict automated shortlist. These are staged for review, not newly published game templates. The existing 72 published templates were separately assessed under the new policy and all were retained.

## Results

| Stage | Count |
| --- | ---: |
| Fresh, verified source candidates | 1,000 |
| Gemini API attempts | 1,000 |
| Current family/work-safe assessments | 985 |
| Uncertain safety; held for review | 10 |
| Unsafe; held and owned cached pixels removed | 5 |
| Strict shortlist: safe, score ≥80, no risk/curator/duplicate hold, valid source metadata | 187 |
| Strict yield | 18.7% |

All 1,000 candidates came from **Pexels**, collected in 44 source-search calls. Commons and Openverse were rate-limited during collection. The Openverse adapter is implemented and verified independently, but this pilot does not measure its retention or humor quality. Its anonymous API needs no additional key for the supported workflow.

| Model-assessed subject | Screened | Strict shortlist |
| --- | ---: | ---: |
| Cats | 125 | 62 |
| Dogs | 121 | 45 |
| Other animals | 124 | 40 |
| Situations and interactions | 339 | 34 |
| Objects | 113 | 3 |
| Food | 65 | 3 |
| History | 46 | 0 |
| Art | 67 | 0 |

Collection reserves slots across eight search subjects. The final subject label comes from the image assessment, so it can differ from the search subject. The shortlist covers 16 primary reaction categories. Cats and dogs still dominate the qualifying subset; the publisher's separate 25% per-subject limit prevents further concentration in the game catalog. That limit and publication-time duplicate checks can hold additional shortlisted images.

## Cost and scaling

Model: `gemini-3.5-flash-lite`. Pilot run: `299c2539-e576-423a-825f-ab3e72c12597`.

- Pilot screening estimate from response token usage: **$1.538606**.
- Separate 72-template safety audit estimate: **$0.109583**.
- Combined estimate for this work: **$1.648189**.

These estimates use standard input/output rates and include reported thinking tokens. They are not a provider billing statement; discounts and free allowances are not assumed. Pricing reference: [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

At this pilot's cost and raw shortlist yield, 10,000 qualifying candidates would require roughly 53,476 assessments and **$82 in model screening**. This excludes source/download/storage costs, human review, diversity limits, publication failures and any change in source quality. It is a planning estimate, not authorization to start a large run.

## Where to review

- Strict pilot gallery: `media-work/archive/pilot-shortlist.html` (187 candidates; 60 cards at a time).
- Full archive gallery: `media-work/archive/candidates.html` (2,243 records, including earlier collections).
- Machine-readable pilot results: `media-work/archive/pilot-report.json`.
- Durable archive: `media-work/archive/candidates.sqlite`, plus adjacent `previews/`.
- Existing published game gallery: `media-work/published-gallery.html`.

Review previews are stored locally. Unsafe pixels are removed from the owned local cache and the gallery never loads their remote thumbnails, even when safety filters are disabled. Metadata and model decisions remain. Older records without the new assessment and uncertain records are hidden by the default family/work-safe filter. Back up the SQLite database and preview directory together while the worker is stopped; these files are ignored by Git.

Approved game files remain in the existing public Blob `stock/` prefix. No remote archive backup was created. The archive keeps bounded previews and metadata, not a full-resolution original for every candidate. Training export requires an explicit training-rights decision and never treats model labels as human ground truth.

The safety gate applies to the prepared stock catalog. Player-written captions, game prompts and external GIF search results do not receive this stock assessment.

## Next collection

Review the strict gallery for humor and missed concerns, then prioritize situations, other animals, objects and food. Start each additional collection with a new cohort and a bounded run, following [the media-library commands](media-library.md#durable-archive-familywork-screening-and-controlled-pilots). Retry Commons/Openverse discovery after their limits recover before extrapolating the Pexels yield to those sources. No 10,000-image run has been started.
