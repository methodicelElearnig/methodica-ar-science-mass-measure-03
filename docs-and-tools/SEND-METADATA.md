# Sending metadata to the Kata catalog

`send-metadata.ps1` pushes the `metadata/` folder (5 components + their items, into
the existing Hebrew unit — see below) into the Katalog (Kata) catalog at
`https://kata.cet.ac.il/api/v1`.
It **upserts**: for each entity it does a `GET` by uniqueKey, then `PATCH` if it
already exists or `POST` if it doesn't — so it's safe to run more than once.

See [KATA-API-DETAILED.md](../../KATA-API-DETAILED.md) for the full endpoint schemas.

## This unit: Arabic components inside the existing Hebrew unit

`methodica-ar-science-mass-measure-03` has **no unit of its own in Kata**. Kata binds a learning
objective to exactly one unit: a separate Arabic unit was rejected for the ratio unit
(`409 "objective already bound to a unit (strict 1:1)"`, 2026-09-24), and this unit shares its
objective with the Hebrew unit. The Kata team's instruction is to add the Arabic components to the
existing unit, as `methodica-ar-math-ratio-01` and `methodica-ar-science-mass-measure-01` / `-02` do.

So the script runs in **parent-unit mode** by default: `$ParentUnitKey =
'methodica-science-mass-measure-03'` (the Hebrew unit; override with `-ParentUnitKey`,
`-ParentUnitKey ''` restores the own-unit upsert).

- The parent unit is **read-only**. One `GET` confirms it exists; then the 5 Arabic components
  and their items are created under
  `/api/v1/content-units/methodica-science-mass-measure-03/components`. No `POST` / `PATCH` ever
  goes to the unit, and `metadata/*_unit.json` is not read.
- The key file is **`docs-and-tools/kata-api-key.txt`**, next to the scripts.
- Values that must match the live Hebrew components (`order`, `isRequired`, item `mediaFormat` …)
  are taken from Kata, not from the Hebrew repo's `metadata/`, which went stale after 22.09.
  Components 05 and 06 share order 4, as in Kata (06 is 05's second-chance version).
- A first send creates 5 components + 22 items and links 02 → 01 and 05 → 06:
  `created=27 updated=2 failed=0`. A re-send: `created=0 updated=29`.
- **Check every send** with `retrieve-metadata.ps1 -UnitKey methodica-science-mass-measure-03
  -KeepRaw -MetadataDir '' -OutDir ..\..\deployments\!kata-snapshots\<date>-<what>` before and
  after, and diff the two: the Hebrew records must stay byte-identical.

**Sent 2026-09-29** from `64b30d2`: `created=27 updated=2 failed=0`, re-send `created=0
updated=29`, Hebrew records unchanged, Kata equals `metadata/` (0 differences). Full record:
`deployments/!kata-snapshots/KATA-SEND-2026-09-29.md`.

## Requirements

- **PowerShell 7+** (`pwsh`). The script declares `#Requires -Version 7.0` and will
  not run on Windows PowerShell 5.1 (needed for correct array + UTF-8 JSON handling).
- **curl.exe** — bundled with Windows 10/11.

## One-time setup

Get an API key from the Kata UI → **מפתחות API** (`/api-credentials`), then make it
available in any **one** of these ways — the script checks them in this order:

1. `-ApiKey '<key>'` on the command line.
2. The `KATA_API_KEY` environment variable.
3. **`kata-api-key.txt`** next to the script — one line, just the key. This is the
   usual choice; the file is git-ignored.

```powershell
# option 3, once:
'<your-key>' | Set-Content kata-api-key.txt -NoNewline
```

Outside `-DryRun` the script refuses to run when no key is found. The key is never
written to the log, and both scripts share the same file.

> **Never hard-code a key in the scripts** — unlike before, `send-metadata.ps1` and
> `retrieve-metadata.ps1` are committed. `kata-api-key.txt` is the only place a live key
> may sit on disk, and `.gitignore` excludes it.

## Usage

```powershell
# 1) Dry run — builds and prints every payload, no network, no key needed.
pwsh -File send-metadata.ps1 -DryRun

# 2) Live run — after setting up the key (see above).
pwsh -File send-metadata.ps1

# Optional overrides:
pwsh -File send-metadata.ps1 -BaseUrl 'https://kata.cet.ac.il' -MetadataDir '.\metadata'
```

Progress prints to the console and to `send-metadata.log` (git-ignored). Each line is
`CREATED` / `UPDATED` / `FAILED` with the HTTP status; the run ends with a
`created / updated / failed` summary and a non-zero exit code if anything failed.

## What the script does to the metadata

The metadata schema doesn't match the API 1:1, so the script transforms it. All of
this is controlled from the **CONFIG** block at the top of the file.

| Metadata | Sent to API |
|---|---|
| `id` (full URL) | `uniqueKey` = last path segment (slug), e.g. `methodica-math-scale-01-01` |
| unit `title` (string) | `title` object `{ "Hebrew": "…" }` (`$TitleLangKey`) |
| unit — (no manufacture) | `manufacture` = `'methodica'` (`$UnitManufacture`) |
| component — (missing) | `relativeDifficulty` falls back to component `order`; `depthLevel` to `core-curriculum-basic` — see `$ComponentOverrides` to force per-component values |
| component `manufacture` | dropped (owning group is derived from the API key) |
| item — (no order) | `order` = 1-based position in `subContent[]` |
| `questions[]` | passed through unchanged |

### Enums are kebab-case — no translation needed

Since the metadata was aligned to 720 v2.3 it stores the **same kebab-case vocabulary
the API uses** (`core-curriculum-basic`, `project-or-inquiry-task`,
`interactive-content`, `applying-a-model-or-procedure`, `state-general`, …), verified
live against the API on 2026-07-25. So values pass straight through and are only
*checked* against `$ValidContentType` / `$ValidMediaFormat` / `$ValidDepthLevel` /
`$ValidComponentPurpose` in CONFIG section (4).

> ⚠️ The Title Case tables in **`KATA-API.md` → "Controlled Vocabularies"** and in
> `KATA-API-DETAILED.md` are **stale** — the API neither returns nor accepts that form.

`$ComponentPurposeMap` / `$ContentTypeMap` / `$CognitiveLevelMap` now only rewrite
leftover **pre-v2.3** spellings (`ClassroomTask`, `Assessment`, `Analyzing`, …), which
current metadata no longer contains. Any value outside the API enums makes the script
**stop with an error** naming the offender rather than send bad data.

### `cognitiveLevel` — all 12 science levels are live

> Updated 2026-09-22. The four levels this section used to list as blocked (`analyzing` among them)
> have been released: `$PendingCognitiveLevel` is empty, and the 2026-09-19 live run created
> components 04, 05 and 06 with them. Treat the "still blocked" wording below as historical.

KATA validates `cognitiveLevel` against a **per-discipline coded taxonomy**
(`GET /api/v1/cognitive-levels`). Those codes turned out to be kebab-case slugs
**identical to what the metadata stores**, so no mapping is required — the value passes
through and is checked against `$ValidCognitiveLevel`.

Verified live 2026-07-25: 12 codes exist, 8 `science` + 4 `mathematics`. The science
ones available are `identifying`, `describing`, `retrieving-information`,
`providing-examples`, `making-connections`, `interpreting`,
`applying-a-model-or-procedure`, `explaining`.

⚠️ Four of the 12 science levels in 720 v2.2 pp.17-18 are **still not loaded**:
`providing-scientific-reasoning`, `analyzing`, `synthesizing`,
`evaluating-and-justifying` (listed in `$PendingCognitiveLevel`). Parts **04**
(`analyzing`) and **05** (`evaluating-and-justifying`) therefore still stop the run with
an explicit message instead of taking a `422`. Parts 01–03 build fine. When MOE/CET
release the rest, move the code from `$PendingCognitiveLevel` into
`$ValidCognitiveLevel` and re-run. (See `docs/note-to-cet-science-cognitive-levels.md`.)

`depthLevel`, by contrast, is a **plain enum** (720 v2.2 p.16) and is read straight
from the metadata. `relativeDifficulty`, `depthLevel`, and `recommendedAfterFail` are
now all read from the metadata (not defaulted); `recommendedAfterFail` URLs are
reduced to component keys and may be forward references (see the note in
`New-ComponentBody`).

## Going the other way

[`retrieve-metadata.ps1`](RETRIEVE-METADATA.md) pulls a unit back out of the catalog
into `metadata-from/`, in this same file format, so you can diff the catalog against
the repo.

## Assumptions to verify on the first live run

Two mappings are best-guesses and isolated to single config points, so a first-call
`422` is a one-line fix:

1. **`uniqueKey` = URL slug.** If the catalog wants the full URL or a different
   format, change `Get-Slug` / the uniqueKey logic. (`GET /api/v1/content/next-unique-key?entityType=…`
   shows the catalog's expected format.)
2. **Unit `title` is an object** `{ "Hebrew": "…" }`. If rejected, adjust the
   title builder in `New-UnitBody`.

## Verify the result

- `GET /api/v1/content-units/methodica-math-scale-01` returns the unit with
  its components; spot-check `GET /api/v1/components/methodica-math-scale-01-01`
  and one item.
- In the Kata UI: **יחידות תוכן** (`/author`).
- Re-run once — every entity should report `UPDATED` (not duplicated).

## The log is overwritten on every run — archive one before you care about it

`send-metadata.log` at the repo root is rewritten by `Set-Content` at the top of **every** run,
**including `-DryRun`** (the write happens before the mode branch). It is also git-ignored by
name. So a single dry run silently destroys the record of whatever ran last, and there is no
second copy anywhere.

Archive the run you care about before the next one, under a name `.gitignore` does not list:

```bash
cp send-metadata.log docs-and-tools/send-metadata-$(date +%Y-%m-%d)-<what-it-did>.log
```

`docs-and-tools/` is excluded wholesale from packages and `.log` is excluded by extension
(`package-allowlist.ps1`), so an archived log can never leak into a release.

Archived so far:

| file | what it records |
|---|---|
| `send-metadata-2026-09-19-create.log` | the unit's **birth** in Kata — `created=26 updated=1 failed=0`: 1 unit, 5 components (01, 02, 04, 05, 06 — 03 was archived before the push) and 20 items, plus the `02 → 01` `recommendedAfterFail` link. This is the only evidence of what the catalogue rows were originally created as, and it predates the 2026-09-22 update that renumbered the part 01 items. |

Note the log carries **no per-line timestamps** — only `[INFO]`/`[ERROR]` prefixes — so the
date belongs in the filename. A stale `docs-and-tools/send-metadata.log` also survives from an
older layout in which the log sat next to the script; it is a 4-line dry-run stub, it is
git-ignored, and nothing writes to it any more.

## Clearing a field: `null` and `[]` mean "remove it", absent means "leave it"

`masteryLevel` and an item's `questions` are keyed on **presence in the metadata**, not on
whether they hold anything:

| metadata                 | payload                  | effect on Kata              |
|--------------------------|--------------------------|-----------------------------|
| `"masteryLevel": "basic"`| `"masteryLevel": "basic"`| set to `basic`              |
| `"masteryLevel": null`   | `"masteryLevel": null`   | **cleared**                 |
| key absent               | key omitted              | left at whatever Kata holds |

The same three rows apply to an item's `questions`, with `[]` in place of `null`.

Both fields used to be keyed on truthiness, so `null` and `[]` were indistinguishable from an
absent key and the PATCH quietly left the old value in place. That is how five components in
mass-measure-03 went on serving `basic`/`intermediate`/`advanced` after the metadata had
dropped them. It matters for `questions` in particular because **there is no per-question
delete endpoint** - `ItemUpdate.questions` is the only way to remove a question from an item
short of deleting the whole item.

Practical consequence: an item you no longer want graded needs `"questions": []` written into
the metadata explicitly. Removing the `questions` key does nothing.

## Trap: removing an item from a component makes every later item 409

`order` is computed from the item's **position in `subContent`**, not from its 3-digit suffix. So
deleting an item from a component's JSON shifts the order of every item after it - and Kata rejects
a PATCH that moves an item onto an `order` another item still holds:

```
(HTTP 409) {"code":"resource.conflict","detail":"item order/key already taken in component"}
```

This bit percent-02 when items `001`/`002` moved out of component `-02` into `-01`. The remaining
five items `003`-`007` went from positions 3-7 to positions 1-5, but the two moved items were still
in the catalogue holding orders 1 and 2, so all five PATCHes failed. **The upsert is idempotent, so
nothing was created or corrupted** - the five items simply kept their previous content and order.

The fix is to DELETE the moved items from the catalogue, which the API supports:

```
DELETE /api/v1/components/{unique_key}/items/{item_key}      -> 204
```

then re-run the sender. Deleting a catalogue record is not reversible through this tool, so confirm
with the producer first, and only after verifying the content exists at its new id (a GET on the new
item, checking the title and question count).

Two related notes:

- **The failure log used to lie about which call failed.** It printed `$CreateMethod`/`$CreatePath`
  unconditionally, so a rejected PATCH was reported as a failed `POST /items`, which is a create
  path that never ran. Fixed - it now logs the method and path actually used. If you are reading an
  older log, do not trust the verb.
- **`Test-Exists` treats any non-200 as "does not exist"** and falls through to a create. That is
  usually right, but it means a transient 429 or 5xx presents as a spurious create attempt.
