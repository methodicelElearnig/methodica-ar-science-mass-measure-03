# Retrieving metadata from the Kata catalog

`retrieve-metadata.ps1` is the opposite direction of [`send-metadata.ps1`](SEND-METADATA.md):
it reads a content unit out of the Katalog (Kata) catalog at `https://kata.cet.ac.il/api/v1`
and writes it back out as metadata files — same schema, same key order, same formatting
as the `metadata/` folder — into **`metadata-from/`**. It never writes to `metadata/`.

The script lives in `docs-and-tools/`; both `metadata/` and `metadata-from/` sit at the
repo root, so run it from there. `metadata-from/` is git-ignored.

The point is comparison. Diff the two folders to see exactly where the catalog and the
repo disagree:

```bash
git diff --no-index metadata metadata-from
```

## Requirements

- **PowerShell 7+** (`pwsh`). PowerShell 7.5+ additionally keeps `createdAt`/`updatedAt`
  exactly as KATA sent them; on 7.0–7.4 they are re-serialized to microsecond precision
  (`ConvertFrom-Json` converts ISO-8601 strings to `[datetime]` and there is no
  `-DateKind` to switch it off before 7.5).
- **curl.exe** — bundled with Windows 10/11.
- An API key, resolved in this order: the `-ApiKey` parameter, the `KATA_API_KEY`
  environment variable, or **`kata-api-key.txt`** next to the script (one line, just the
  key — git-ignored, and shared with `send-metadata.ps1`). See
  [SEND-METADATA.md → One-time setup](SEND-METADATA.md#one-time-setup). Never hard-code
  a key in the script; it is committed.

## Usage

```powershell
# Unit key is taken from metadata/*_unit.json
pwsh -File retrieve-metadata.ps1

# Also save the untouched API response under metadata-from/_raw/
pwsh -File retrieve-metadata.ps1 -KeepRaw

# Any other unit / server / destination
pwsh -File retrieve-metadata.ps1 -UnitKey some-other-unit -OutDir .\snapshot
```

Progress prints to the console and to `retrieve-metadata.log` (git-ignored). The run
ends with a `unit=1 components=N items=M warnings=W` summary.

`-UnitKey` is resolved in this order: the parameter → the `id` in `metadata/*_unit.json`
→ `GET /api/v1/content-units` when the account owns exactly one unit (otherwise it
stops and lists the available keys).

## How it maps KATA back to the metadata format

A single `GET /api/v1/content-units/{unitKey}` returns the whole tree — unit,
`components[]`, each component's `subContent[]`, and each item's `questions[]` — so
there is one request per run regardless of size.

**Enum values are passed through untouched.** KATA stores the same kebab-case
vocabulary the metadata files use (`state-general`, `core-curriculum-basic`,
`project-or-inquiry-task`, `interactive-content`, …), so unlike the sender this script
has no enum-mapping tables. `send-metadata.ps1` uses the same kebab-case vocabulary in
its `$Valid*` lists; any Title-Case table you encounter in older notes is stale.

| Metadata | Rebuilt from KATA |
|---|---|
| `id` (full URL) | the entity's own `uniqueKey`, which **is** the id since the 2026-09-15 IRI migration — for components, items and the URL prefix alike. Falls back to component `hostedContentRef` minus `/index.html` for a pre-migration row (with a warning), then to `-IdBase`. ⚠️ Until 2026-09-16 `hostedContentRef` came first, which put a `720` content path where a `720active` identifier belongs and produced `id` DRIFT rows that were not drift. |
| unit `title` (string) | `title.Hebrew` (`$TitleLangKey`) |
| component `learningUnitId` | the unit's `id` URL (KATA returns the bare key) |
| component `manufacture` | the `$Manufacture` constant, `'methodica'` — KATA returns the provider display name (`מתודיקה`) instead. Set `$Manufacture = $null` to pass KATA's value through. |
| `recommendedAfterFail` | each key expanded back to `<prefix>/<key>/` |
| item `id` | the item's `uniqueKey` verbatim when it is already an absolute IRI (the case since 2026-09-15); otherwise the legacy `<component id>/<item uniqueKey>` |
| `questions[]` | verbatim, minus each question's `order` |

> **Every id now comes from its `uniqueKey`** (2026-09-16). Since the IRI migration the
> `uniqueKey` **is** the identifier, so component ids, item ids and the URL prefix are all
> taken from it, and `metadata-from/` matches `metadata/` byte-for-byte.
>
> ⚠️ **What this block used to warn about, and why it was the retriever's fault.** Component
> ids were rebuilt from `hostedContentRef` while item ids came from `uniqueKey`, so a file
> held a `720` component id above `720active` item ids and neither matched `metadata/`. That
> was read as "the `720` vs `720active` divergence, not a retrieval bug", and it was exactly
> a retrieval bug: `hostedContentRef` is a CONTENT address and an id is an IDENTIFIER, and
> 720 v2.5 p.11 frees an identifier from resolving. The divergence itself is correct by
> design — **identifiers and the shared library → `720active`, unit content hosting → `720`**.
> The measured effect: mass-measure-01's `verify-metadata.ps1` went from 11 drift rows to 6,
> the six being genuine and pre-existing.
>
> `hostedContentRef` remains the fallback for a catalogue row that predates the migration and
> still carries a bare slug; taking that path now emits a warning.

**Dropped**, because the metadata format has no place for them — use `-KeepRaw` if you
need them: unit `kind`, `providerName`, `providerLogoUrl`, `componentCount`, `createdAt`,
`updatedAt`; component `status`, `manufacturerGroupId`, `hostedContentRef`; item
`uniqueKey`, `hostedContentRef`, `order`; question `order`.

Component **`masteryLevel` is kept** (inserted after `relativeDifficulty`, where the
hand-authored files hold it) whenever KATA returns one. `send-metadata.ps1` pushes the
value, so dropping it here would make a retrieve → overwrite cycle silently lose it. In
this unit all six components are `masteryLevel: null`, so in practice nothing is emitted.

Component `createdAt`/`updatedAt` **are** kept — they are KATA's real timestamps, so
they always differ from the placeholder dates in `metadata/`.

## Output formatting

Files are written **UTF-8 without BOM, CRLF, 2-space indent, trailing newline**, and the
formatter reproduces the hand-authored style of `metadata/` rather than using
`ConvertTo-Json` (which expands every array and would add whitespace noise to every
diff). The rule, all of it configurable in the CONFIG block:

- an empty array is `[]`; an empty object is `{}`
- an array of primitives goes on one line while its compact form is ≤ `$InlineArrayMaxChars`
  (96) — so `answers`, `correctAnswers`, `targetSector`, `skills` and
  `recommendedAfterFail` get one element per line, and each element shows up as its own
  line in a diff
- arrays under `languages` / `source` / `target` (`$InlineArrayKeys`) are short tuples and
  get a larger budget, `$InlineTupleMaxChars` (62)
- a flat object of at most `$InlineObjectMaxProps` (3) primitive values goes on one line —
  that's how the `matching` questions' `correctAnswers` pairs are stored

**Fidelity.** ⚠️ The two array budgets (96 / 62) were fitted against a **different unit's**
metadata — they came in with this script and have **not** been re-measured against this
repo's 6 files. They are a reasonable starting point, not a verified fit here. Before
trusting a `metadata` vs `metadata-from` diff to be noise-free, re-measure: parse each
`metadata/*.json` and re-emit it through this formatter, then compare byte for byte and
adjust `$InlineArrayMaxChars` / `$InlineTupleMaxChars` if the residuals are formatting
rather than content.

## First run against this unit

`methodica-ar-science-mass-measure-03` was created in the catalog on 2026-09-19
(`send-metadata.log`: `created=26 updated=1 failed=0`) and updated on 2026-09-22 with the
re-extracted metadata. Record here which fields genuinely drift between the catalog and
the repo, so later diffs can be read quickly.

Known blind spots in `-FailOnDrift`, worth knowing before you trust an exit code of 0:
the audit compares `uniqueKey`, `hostedContentRef` and every `questions[]` entry, and
**nothing else**. `masteryLevel`, `order`, `isRequired`, `depthLevel`, `cognitiveLevels`,
titles, `contentType` and the unit's `targetSectors` are emitted into `metadata-from/`
but never compared — so a drift in any of them shows up only in the text diff.
