#Requires -Version 7.0
<#
.SYNOPSIS
    Retrieve a content unit from the Kata (Katalog) catalog API and write it back out
    as metadata files, in exactly the format of the metadata/ folder.

.DESCRIPTION
    The opposite direction of send-metadata.ps1. One GET of
    /api/v1/content-units/{unitKey} returns the whole tree (unit + components +
    their subContent items + questions); this script splits it into the same file
    layout the metadata/ folder uses — <unitKey>_unit.json plus one <componentKey>.json
    per component — and writes them to metadata-from/ (never touching metadata/).

    Because output formatting matches the hand-authored style of metadata/ byte for
    byte (2-space indent, CRLF, UTF-8 without BOM, short arrays and flat objects
    inlined), you can diff the two folders and see only real content differences:

        git diff --no-index metadata metadata-from

    Enum values are passed through verbatim: KATA now stores the same kebab-case
    vocabulary the metadata files use (state-general, core-curriculum-basic,
    project-or-inquiry-task, interactive-content ...), so no remapping is needed in
    this direction. Fields KATA adds and the metadata format has no place for
    (status, manufacturerGroupId, hostedContentRef, kind, providerName,
    providerLogoUrl, componentCount, per-item/per-question order) are dropped — use
    -KeepRaw to also save the untouched API response.

    masteryLevel IS emitted when KATA returns one: this unit's metadata carries it per
    component and send-metadata.ps1 pushes it, so dropping it here would make a
    retrieve -> overwrite cycle silently lose the value.

    Runtime: PowerShell 7+ and curl.exe (bundled with Windows 10/11).

    SAFETY: never hard-code the API key here — this script is committed. Supply it via
    -ApiKey, $env:KATA_API_KEY, or the git-ignored kata-api-key.txt next to this script,
    shared with send-metadata.ps1 (see SEND-METADATA.md). Never logged.

.PARAMETER ApiKey
    The Kata API key. Overrides $env:KATA_API_KEY and kata-api-key.txt.

.PARAMETER UnitKey
    The unit's uniqueKey in KATA. Omitted: taken from metadata/*_unit.json, or from
    GET /api/v1/content-units when the account owns exactly one unit.

.PARAMETER BaseUrl
    Override the API base URL (default https://kata.cet.ac.il).

.PARAMETER OutDir
    Override the output folder (default: metadata-from/ next to this script).

.PARAMETER IdBase
    URL prefix used to rebuild the `id` URLs when KATA carries no hostedContentRef
    to derive them from. Normally unused.

.PARAMETER KeepRaw
    Also save the untouched API response to <OutDir>/_raw/<unitKey>.json.

.PARAMETER MetadataDir
    The authored metadata/ to audit KATA against. Defaults to <repo>/metadata when it
    exists. The audit compares what KATA ACTUALLY returned — `uniqueKey`,
    `hostedContentRef` and every `questions[]` entry — against these files, and warns
    on each divergence. Pass '' to skip the audit.

.PARAMETER FailOnDrift
    Exit 1 when the run produced any warning. Use this in a pre-release check so a
    silent catalogue divergence stops the pipeline instead of shipping.

.EXAMPLE
    pwsh -File retrieve-metadata.ps1
.EXAMPLE
    pwsh -File retrieve-metadata.ps1 -UnitKey methodica-math-scale-01 -KeepRaw
#>
[CmdletBinding()]
param(
    [string] $UnitKey,
    [string] $ApiKey,
    [string] $BaseUrl,
    [string] $OutDir,
    [string] $IdBase,
    [string] $MetadataDir,
    [switch] $KeepRaw,
    [switch] $FailOnDrift
)

# ============================================================================
#  CONFIG  — check these before running
# ----------------------------------------------------------------------------
#  REUSE GUIDE — retrieving a DIFFERENT unit? Touch only what applies:
#    (1) ALWAYS: the API key (or leave it to be picked up from send-metadata.ps1),
#        and -UnitKey if it can't be auto-detected from metadata/.
#    (2) PER-UNIT: title language, the manufacture value written into components,
#        and the $IdBase fallback.
#    There is deliberately NO enum-mapping section: KATA returns the same
#    kebab-case vocabulary the metadata files store, so values pass through as-is.
# ============================================================================

# ── (1) PER-RUN / ENVIRONMENT — always check ────────────────────────────────
# API key from Kata -> "מפתחות API" (/api-credentials).
# NEVER hard-code it here — this script is committed. It is resolved at runtime, in
# order, from: the -ApiKey parameter, the KATA_API_KEY environment variable, or the
# git-ignored key file below (one line, just the key). Shared with send-metadata.ps1.
# The key file sits next to this script in docs-and-tools/ (the rule for 720 units
# processed from 2026-09-29, as in the Arabic mass-measure-01/-02). Repo root is one
# level up: metadata/, metadata-from/ and the log stay at the repo root.
$RepoRoot = Split-Path $PSScriptRoot -Parent
$ApiKeyFile = Join-Path $PSScriptRoot 'kata-api-key.txt'
# API base URL (override at launch with -BaseUrl).
if (-not $BaseUrl) { $BaseUrl = 'https://kata.cet.ac.il' }
# Where the retrieved metadata files go (override with -OutDir).
if (-not $OutDir)  { $OutDir  = Join-Path $RepoRoot 'metadata-from' }
# Run log (git-ignored via *.log).
$LogFile = Join-Path $RepoRoot 'retrieve-metadata.log'

# ── (2) PER-UNIT — usually fine as-is ───────────────────────────────────────
# Which language to unwrap the unit's title object with:
#   { "Hebrew": "מדידת מסה" } -> "מדידת מסה".
$TitleLangKey = 'Arabic'
# Value written to each component's `manufacture`.
# ⚠️ CHANGED FOR percent-02 (was 'methodica', inherited from scale-01).
# `manufacture` is a v2.4 field. The 720 standard v2.5 §2.6 renamed it to
# `manufacturer`, MOVED it from the component to the UNIT, and changed its type
# from free text to the ministry's supplier number. This unit's metadata is
# v2.5-shaped: no component carries the field, and the unit carries
# `manufacturer`. Forcing a component-level `manufacture` here would therefore
# add a spurious key to all five retrieved components and put five fake lines
# into every diff. $null passes KATA's own value through instead.
$Manufacture = $null
# Fallback URL prefix for rebuilding `id` fields, used ONLY when no component
# carries a hostedContentRef to derive the real prefix from (override with -IdBase).
# ⚠️ SET FOR THIS UNIT — this is the prefix every id in metadata/ is built from;
# verified against metadata/*.json. Note 720active/ (identifiers), not 720/ (content):
# the same split send-metadata.ps1 keeps between $ContentBaseUrl and the IRIs.
# It arrived here pointing at math/percent/02, which is where this script was copied
# from. In practice it is the THIRD fallback and is not reached while components carry
# an IRI uniqueKey, so the wrong value never surfaced — which is exactly why it sat.
if (-not $IdBase) { $IdBase = 'https://lomdot.education.gov.il/metodica/720/ar/science/mass-measure/03' }
# The authored metadata/ that KATA is audited against (override with -MetadataDir,
# or pass '' to skip). Not bound to $OutDir: the point is to compare the catalogue
# with what we MEANT to publish, not with a previous retrieval of itself.
if (-not $PSBoundParameters.ContainsKey('MetadataDir')) { $MetadataDir = Join-Path $RepoRoot 'metadata' }

# ── (3) OUTPUT FORMATTING — mirrors the hand-authored style of metadata/ ─────
# An empty array is always `[]`. A non-empty array of primitives goes on one line
# while its compact form stays within the budget below, otherwise it gets one
# element per line — so the content-bearing lists (answers, correctAnswers,
# targetSector, skills, recommendedAfterFail, …) show each element as its own line
# in a diff. The short tuples in $InlineArrayKeys get a longer allowance, because
# that's how metadata/ stores them.
#
# The two budgets were fitted by round-tripping metadata/ through this formatter:
# 8 / 62 reproduces 5 of the 6 files byte for byte. The single residual line is
# `"answers": ["כן", "לא"]` in part 04, which metadata/ inlines at 12 chars — but a
# 12-char budget re-formats more lines elsewhere than it fixes, because the
# hand-authored files aren't self-consistent there. Re-measure before changing.
# ⚠️ RE-FITTED FOR percent-02 (2026-09-09): was 8, fitted against scale-01's files.
# This unit's hand-authored metadata inlines much longer arrays — ["state-general",
# "state-religious"] (~33 chars of content), ["45/80 · 100", "100/45 · 80",
# "45/100 · 80"] (~44), and single-element Hebrew correctAnswers up to ~95 are all
# inline, while a pair of ~50-char answer strings (~100 total) is expanded.
# Measured by re-running the retrieve at several budgets and counting diff lines
# against metadata/: 8 -> 162+/55-, 50 -> 54+/27-, 96 -> 25+/18-, 110 -> 21+/23-.
# 96 is the best fit; past it, arrays this unit expands start collapsing instead.
# The residual is NOT formatting — see the "expected residual diff" note in
# RETRIEVE-METADATA.md. Re-measure before reusing this number elsewhere.
$InlineArrayMaxChars = 96
$InlineArrayKeys     = @('languages', 'source', 'target')
$InlineTupleMaxChars = 62
# A small flat object (every value primitive) is written on one line — that's how
# the matching questions' correctAnswers pairs are stored. Bigger or nested
# objects always get one key per line.
$InlineObjectMaxProps = 3
$InlineObjectMaxChars = 200

# ============================================================================
#  End of CONFIG
# ============================================================================

$ErrorActionPreference = 'Stop'
$script:counts = @{ components = 0; items = 0; warnings = 0; failed = 0 }

function Write-Log {
    param([string] $Message, [string] $Level = 'INFO')
    $line = "[{0}] {1}" -f $Level, $Message
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Write-Warn {
    param([string] $Message)
    $script:counts.warnings++
    Write-Log $Message 'WARN'
}

# Expected-but-worth-saying. Does NOT bump the warning counter, so -FailOnDrift stays
# a signal about real divergence rather than about KATA's normal shape.
function Write-Note {
    param([string] $Message)
    Write-Log $Message 'NOTE'
}

# Last path segment, tolerating a trailing slash (same helper as send-metadata.ps1).
function Get-Slug {
    param([string] $Url)
    return (($Url.TrimEnd('/')) -split '/')[-1]
}

# -ApiKey > $env:KATA_API_KEY > the git-ignored key file. Returns '' if none is set.
function Resolve-ApiKey {
    if ($ApiKey)           { return $ApiKey.Trim() }
    if ($env:KATA_API_KEY) { return $env:KATA_API_KEY.Trim() }
    if (Test-Path $ApiKeyFile) {
        return ((Get-Content -Raw -Path $ApiKeyFile -Encoding UTF8) -replace '\s', '')
    }
    return ''
}

# ---- API --------------------------------------------------------------------

function Get-Kata {
    param([string] $Path)
    $url = "$BaseUrl$Path"
    # ⚠️ The body is written to a temp file with -o and read back as UTF-8, rather
    # than captured from stdout. Piping curl through `Out-String` decodes its bytes
    # using [Console]::OutputEncoding, which on a Windows console is an OEM codepage
    # (437/850) — every Hebrew string then came back as mojibake ("╫É╫ù╫ò╫û╫Ö╫¥" for
    # "אחוזים"), silently, in the reconstructed files AND in -KeepRaw. Observed
    # 2026-09-09 on PowerShell 7.6.5. Reading the file explicitly is immune to the
    # console codepage, and mirrors how send-metadata.ps1 already writes its request
    # bodies. With -o, stdout carries only the -w status code.
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $curlArgs = @('-sS', '-X', 'GET', $url, '-H', "X-API-Key: $ApiKey",
                      '-o', $tmp, '-w', '%{http_code}')
        $code = (& curl.exe @curlArgs 2>&1 | Out-String).Trim()
        $body = if (Test-Path $tmp) { [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::UTF8) } else { '' }
        return @{ Code = $code; Body = $body }
    }
    finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

# ConvertFrom-Json helpfully turns anything ISO-8601-shaped (createdAt/updatedAt, and
# any timestamp inside a question) into a [datetime], losing the original text. PS 7.5+
# can be told not to; on older 7.x Format-JsonPrimitive re-serializes them instead.
$script:JsonDateKind = (Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')
function Convert-KataJson {
    param([string] $Json)
    if ($script:JsonDateKind) { return ($Json | ConvertFrom-Json -DateKind String) }
    return ($Json | ConvertFrom-Json)
}

function Get-Snippet {
    param([string] $Text)
    $s = ($Text -replace '\s+', ' ')
    if ($s.Length -gt 400) { $s = $s.Substring(0, 400) + '…' }
    return $s
}

# ---- JSON writer ------------------------------------------------------------
#  ConvertTo-Json expands every array, which would add whitespace noise to every
#  diff against metadata/. This formatter reproduces the existing style instead.

function Get-JsonKind {
    param($Value)
    if ($null -eq $Value)                                        { return 'primitive' }
    if ($Value -is [string] -or $Value -is [ValueType])          { return 'primitive' }
    if ($Value -is [System.Collections.IDictionary])             { return 'object' }
    if ($Value -is [System.Management.Automation.PSCustomObject]) { return 'object' }
    if ($Value -is [System.Collections.IEnumerable])             { return 'array' }
    return 'primitive'
}

function Format-JsonPrimitive {
    param($Value)
    if ($null -eq $Value)   { return 'null' }
    if ($Value -is [bool])  { return $(if ($Value) { 'true' } else { 'false' }) }
    if ($Value -is [string]) {
        $t = $Value -replace '\\', '\\' -replace '"', '\"'
        $t = $t -replace "`b", '\b' -replace "`f", '\f' -replace "`r", '\r' -replace "`n", '\n' -replace "`t", '\t'
        $t = [regex]::Replace($t, '[\x00-\x1f]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
        return '"' + $t + '"'
    }
    # ConvertFrom-Json turns ISO-8601 strings into [datetime] on PowerShell < 7.5
    # (see Convert-KataJson); put them back as quoted strings, not bare numbers.
    if ($Value -is [datetime] -or $Value -is [datetimeoffset]) {
        return (Format-JsonPrimitive $Value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ', [System.Globalization.CultureInfo]::InvariantCulture))
    }
    if ($Value -is [ValueType]) {
        return [System.Convert]::ToString($Value, [System.Globalization.CultureInfo]::InvariantCulture)
    }
    return (Format-JsonPrimitive ([string] $Value))
}

# Name/Value pairs of an object, in source order.
function Get-JsonPairs {
    param($Value)
    if ($Value -is [System.Collections.IDictionary]) {
        return @(foreach ($k in $Value.Keys) { [pscustomobject]@{ Name = [string] $k; Value = $Value[$k] } })
    }
    return @($Value.PSObject.Properties | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Value = $_.Value } })
}

function ConvertTo-CompactJson {
    param($Value)
    $kind = Get-JsonKind $Value
    if ($kind -eq 'primitive') { return (Format-JsonPrimitive $Value) }
    if ($kind -eq 'array') {
        $items = @($Value)
        if ($items.Count -eq 0) { return '[]' }
        $parts = foreach ($it in $items) { ConvertTo-CompactJson $it }
        return '[' + ($parts -join ', ') + ']'
    }
    $pairs = @(Get-JsonPairs $Value)
    if ($pairs.Count -eq 0) { return '{}' }
    $parts = foreach ($p in $pairs) { (Format-JsonPrimitive $p.Name) + ': ' + (ConvertTo-CompactJson $p.Value) }
    return '{' + ($parts -join ', ') + '}'
}

# $Key is the property name this value sits under — it decides whether an array is
# written inline (see $InlineArrayKeys).
function Format-Json {
    param($Value, [int] $Indent = 0, [string] $Key = '')
    $kind = Get-JsonKind $Value
    if ($kind -eq 'primitive') { return (Format-JsonPrimitive $Value) }

    $pad  = ' ' * $Indent
    $pad2 = ' ' * ($Indent + 2)

    if ($kind -eq 'array') {
        $items = @($Value)
        if ($items.Count -eq 0) { return '[]' }
        if (-not ($items | Where-Object { (Get-JsonKind $_) -ne 'primitive' })) {
            $budget  = if ($InlineArrayKeys -contains $Key) { $InlineTupleMaxChars } else { $InlineArrayMaxChars }
            $compact = ConvertTo-CompactJson $Value
            if ($compact.Length -le $budget) { return $compact }
        }
        $lines = foreach ($it in $items) { $pad2 + (Format-Json $it ($Indent + 2)) }
        return "[`n" + ($lines -join ",`n") + "`n$pad]"
    }

    $pairs = @(Get-JsonPairs $Value)
    if ($pairs.Count -eq 0) { return '{}' }
    $isFlat = -not ($pairs | Where-Object { (Get-JsonKind $_.Value) -ne 'primitive' })
    if ($isFlat -and $pairs.Count -le $InlineObjectMaxProps) {
        $compact = ConvertTo-CompactJson $Value
        if ($compact.Length -le $InlineObjectMaxChars) { return $compact }
    }
    $lines = foreach ($p in $pairs) {
        $pad2 + (Format-JsonPrimitive $p.Name) + ': ' + (Format-Json $p.Value ($Indent + 2) $p.Name)
    }
    return "{`n" + ($lines -join ",`n") + "`n$pad}"
}

# UTF-8 without BOM, CRLF, trailing newline — matching the metadata/ files.
function Write-TextFile {
    param([string] $Path, [string] $Text)
    $crlf = ($Text -replace "`r`n", "`n") -replace "`n", "`r`n"
    if (-not $crlf.EndsWith("`r`n")) { $crlf += "`r`n" }
    [System.IO.File]::WriteAllText($Path, $crlf, (New-Object System.Text.UTF8Encoding($false)))
}

function Write-JsonFile {
    param([string] $Path, $Value)
    Write-TextFile $Path (Format-Json $Value 0)
}

# ---- Shaping KATA responses into the metadata format ------------------------

# $null / a scalar / an array -> always a real array (never @($null)). The leading
# comma is required: `return @()` collapses to $null and `return @($x)` to a scalar.
function ConvertTo-JsonArray {
    param($Value)
    if ($null -eq $Value) { return ,@() }
    return ,@($Value)
}

# Since 2026-09-15 a uniqueKey is a full IRI (720 v2.5 p.11), not a bare slug. Anywhere a
# key used to be appended to a prefix to rebuild an id, an already-absolute key must be
# taken as the id itself — otherwise the two concatenate into "<prefix>/https://…".
function Test-AbsoluteIri {
    param([string] $Value)
    return ($Value -match '^https?://')
}

# "…/part-01/index.html" -> "…/part-01" (drops a trailing file name, if any).
function Get-ContentId {
    param([string] $Ref)
    if ([string]::IsNullOrWhiteSpace($Ref)) { return $null }
    $r = $Ref.TrimEnd('/')
    $last = $r.Substring($r.LastIndexOf('/') + 1)
    if ($last -match '\.[A-Za-z0-9]+$') { $r = $r.Substring(0, $r.LastIndexOf('/')) }
    return $r
}

# ── Catalogue audit (added 2026-09-11) ──────────────────────────────────────
#
#  WHY THIS EXISTS. On 2026-09-09 a LIVE send logged `updated=35 failed=0`, and a
#  retrieve straight afterwards reported `warnings=0`. Both were true and both were
#  useless: KATA had silently kept an OLDER generation of `questions[]` on 12 of the
#  26 items (wrong `questionType`, `answers` as a string, empty `correctAnswers`, two
#  questions missing outright) and was storing no item IRI at all. Nothing in the
#  round trip could see it, because the retrieve side REBUILT the ids it printed and
#  never compared questions to anything.
#
#  So the audit compares KATA's actual response against the authored metadata/ and
#  says plainly which of the two it is looking at. A silent divergence is the failure
#  mode this tool exists to catch.

# IRI (URL or URN) per 720 v2.5 p.11. Trailing slashes are not significant.
function Test-Iri { param([string] $Value) return ($Value -match '^(https?://|urn:)') }
function Get-IriKey { param($Value) return ([string] $Value).TrimEnd('/') }

# One component or item: is the key an IRI, and does KATA hold the IRI anywhere?
function Test-IdShape {
    param([string] $Kind, [string] $UniqueKey, $HostedRef, [string] $ExpectedIri)

    if (-not (Test-Iri $UniqueKey)) {
        # Expected: KATA keys on a bare slug and exposes no `id` column. Recorded, not
        # counted — see the note to CET about whether this satisfies v2.5 p.11.
        Write-Note ("ID-SHAPE {0} {1}: uniqueKey is a bare slug, not an IRI (expected — KATA keys on the slug)." -f $Kind, $UniqueKey)
    }
    # An empty hostedContentRef is already reported by the caller, which warns as it
    # falls back to synthesising the id. Warning again here would double every such
    # entity in the count and make the summary read twice as bad as it is.
    if ([string]::IsNullOrWhiteSpace([string] $HostedRef)) { return }
    # ⚠️ 2026-09-16: this used to require hostedContentRef to EQUAL the metadata/ id, and
    # warned on all 7 components once the sender was corrected. The requirement was wrong.
    # An id is an IDENTIFIER and lives under 720active/; hostedContentRef is a CONTENT
    # address and lives under 720/, the only root that serves anything. They are SUPPOSED
    # to differ in their prefix, and 720 v2.5 p.11 frees an id from resolving at all.
    # What IS worth checking is that the ref names the same ENTITY: a ref pointing at
    # another component's folder is a real defect, and a whole-URL comparison could never
    # tell that apart from the expected prefix difference.
    if ($ExpectedIri) {
        $refSlug = ((Get-ContentId $HostedRef) -replace '/+$', '' -split '/')[-1]
        $idSlug  = ((Get-IriKey $ExpectedIri)  -replace '/+$', '' -split '/')[-1]
        if ($refSlug -ne $idSlug) {
            Write-Warn ("ID-SHAPE {0} {1}: hostedContentRef '{2}' names '{3}' but the metadata/ id names '{4}' — the ref points at a different entity." -f $Kind, $UniqueKey, $HostedRef, $refSlug, $idSlug)
        }
    }
}

# One item's questions, KATA vs metadata/. This is the check that was missing.
function Test-QuestionSet {
    param([string] $ItemKey, $KataQuestions, $LocalQuestions)

    # ⚠️ NO @() around these. ConvertTo-JsonArray already returns a real array and
    # protects it with a leading comma; wrapping it again produces a ONE-element array
    # holding the original — which silently turns every comparison below into
    # array-vs-array and invents drift on items that actually match.
    $kata  = ConvertTo-JsonArray $KataQuestions
    $local = ConvertTo-JsonArray $LocalQuestions
    if ($kata.Count -ne $local.Count) {
        Write-Warn ("QUESTIONS {0}: KATA has {1}, metadata/ has {2}." -f $ItemKey, $kata.Count, $local.Count)
    }

    $kataById = @{}
    foreach ($q in $kata) { if ($q.questionId) { $kataById[[string] $q.questionId] = $q } }

    foreach ($lq in $local) {
        $id    = [string] $lq.questionId
        $short = Get-Slug $id
        if (-not (Test-Iri $id)) {
            Write-Warn ("QUESTIONS {0}/{1}: metadata/ questionId is not an IRI — 720 v2.5 p.11 requires one." -f $ItemKey, $short)
        }
        if (-not $kataById.ContainsKey($id)) {
            Write-Warn ("QUESTIONS {0}/{1}: MISSING IN KATA — the lomda reports answered against a questionId the catalogue does not have." -f $ItemKey, $short)
            continue
        }
        $kq = $kataById[$id]
        if ([string] $kq.questionType -ne [string] $lq.questionType) {
            Write-Warn ("QUESTIONS {0}/{1}: questionType KATA='{2}' metadata/='{3}'." -f $ItemKey, $short, $kq.questionType, $lq.questionType)
        }
        if ([string] $kq.questionText -ne [string] $lq.questionText) {
            Write-Warn ("QUESTIONS {0}/{1}: questionText differs from metadata/." -f $ItemKey, $short)
        }
        if ((ConvertTo-Json $kq.answers -Depth 12 -Compress) -ne (ConvertTo-Json $lq.answers -Depth 12 -Compress)) {
            Write-Warn ("QUESTIONS {0}/{1}: answers differ from metadata/." -f $ItemKey, $short)
        }
        if ((ConvertTo-Json $kq.correctAnswers -Depth 12 -Compress) -ne (ConvertTo-Json $lq.correctAnswers -Depth 12 -Compress)) {
            Write-Warn ("QUESTIONS {0}/{1}: correctAnswers differ from metadata/." -f $ItemKey, $short)
        }
    }
    foreach ($kq in $kata) {
        $id = [string] $kq.questionId
        if (-not ($local | Where-Object { [string] $_.questionId -eq $id })) {
            Write-Warn ("QUESTIONS {0}/{1}: present in KATA but not in metadata/." -f $ItemKey, (Get-Slug $id))
        }
    }
}

# metadata/*.json -> lookups keyed by slug, so the audit can be driven per entity.
# Returns $null when there is nothing to audit against.
function Import-LocalMetadata {
    param([string] $Dir)
    if ([string]::IsNullOrWhiteSpace($Dir) -or -not (Test-Path $Dir)) { return $null }
    $comps = @{}; $items = @{}
    foreach ($f in (Get-ChildItem -Path $Dir -Filter '*.json' -File | Where-Object { $_.Name -notlike '*_unit.json' })) {
        $d = Get-Content -Raw -Path $f.FullName -Encoding UTF8 | ConvertFrom-Json
        if (-not $d.id) { continue }
        $comps[(Get-Slug $d.id)] = $d
        foreach ($s in (ConvertTo-JsonArray $d.subContent)) { $items[(Get-Slug $s.id)] = $s }
    }
    if ($comps.Count -eq 0) { return $null }
    return @{ Components = $comps; Items = $items; Dir = $Dir }
}

function Get-UnitTitle {
    param($Unit)
    if ($Unit.title -is [string]) { return $Unit.title }
    $props = @(Get-JsonPairs $Unit.title)
    $match = $props | Where-Object { $_.Name -eq $TitleLangKey } | Select-Object -First 1
    if ($match) { return $match.Value }
    if ($props.Count -gt 0) {
        Write-Warn ("Unit title has no '{0}' key — using '{1}' instead." -f $TitleLangKey, $props[0].Name)
        return $props[0].Value
    }
    Write-Warn 'Unit has no title.'
    return ''
}

function New-UnitFileBody {
    param($Unit, [string] $UnitId)
    # ── 720 v2.5 shapes (updated 2026-09-09) ──
    #   §2.4 targetSector  -> targetSectors (plural list)
    #   §2.5 targetAudience -> a SINGLE value, no longer an array
    #   §2.3 prerequisiteLearningObjective REMOVED from the content metadata entirely
    #   §2.6 manufacturer now lives on the unit. KATA derives it from the group owning
    #        the API key and returns the provider's DISPLAY NAME ("מתודיקה"), so it will
    #        not equal the supplier number the metadata carries. A difference on this
    #        one key is EXPECTED and is not catalogue drift.
    return [ordered]@{
        id                = $UnitId
        title             = (Get-UnitTitle $Unit)
        subTopic          = $Unit.subTopic
        learningObjective = $Unit.learningObjective
        targetSectors     = (ConvertTo-JsonArray $Unit.targetSectors)
        targetAudience    = $Unit.targetAudience
        manufacturer      = $Unit.manufacturer
    }
}

function New-ItemFileBody {
    param($Item, [string] $ComponentId)
    $questions = foreach ($q in (ConvertTo-JsonArray $Item.questions)) {
        # Verbatim except `order`, which the metadata format doesn't carry. The
        # answers/correctAnswers shapes differ per questionType (string arrays for
        # choice/fill-in/…, objects for matching), so nothing here is normalized.
        $out = [ordered]@{}
        foreach ($p in (Get-JsonPairs $q)) { if ($p.Name -ne 'order') { $out[$p.Name] = $p.Value } }
        $out
    }
    # ⚠️ PREFER WHAT KATA ACTUALLY HOLDS. KATA keys an item on a bare slug `uniqueKey`
    # and has no `id` column at all, so the IRI the 720 standard requires (v2.5 p.11)
    # survives only in `hostedContentRef`. Until 2026-09-11 this function ALWAYS
    # synthesised the id from the slug, which made a null hostedContentRef — i.e. an
    # item whose IRI is stored nowhere in KATA — read back as a clean IRI and hid the
    # loss through a whole deploy cycle. Synthesis is now the warned fallback, never
    # the silent default.
    # ⚠️ 2026-09-16: the uniqueKey comes first now. The warning below used to say a null
    # hostedContentRef meant "an item whose IRI is stored nowhere in KATA". That stopped
    # being true at the IRI migration: the uniqueKey IS the IRI, and KATA returns it on
    # every row. hostedContentRef is a CONTENT address; send-metadata.ps1 no longer writes
    # one for items at all, because there is no item-level page to address.
    $itemId = if (Test-AbsoluteIri ([string] $Item.uniqueKey)) { ([string] $Item.uniqueKey).TrimEnd('/') + '/' }
              else { Get-ContentId $Item.hostedContentRef }
    if ($itemId) {
        $itemId = $itemId.TrimEnd('/') + '/'
    } else {
        $itemId = "$ComponentId/$($Item.uniqueKey)/"
        Write-Warn ("Item {0} has neither an IRI uniqueKey nor a hostedContentRef — id RECONSTRUCTED as {1} (NOT returned by KATA)." -f $Item.uniqueKey, $itemId)
    }

    if ($script:local) {
        # Import-LocalMetadata indexes by Get-Slug, so an IRI key must be reduced to match;
        # otherwise every item reads as "in KATA but not in metadata/".
        $li = $script:local.Items[(Get-Slug $Item.uniqueKey)]
        if ($li) {
            Test-IdShape 'item' $Item.uniqueKey $Item.hostedContentRef $li.id
            Test-QuestionSet $Item.uniqueKey $Item.questions $li.questions
        } else {
            Write-Warn ("Item {0} is in KATA but not in {1}." -f $Item.uniqueKey, $script:local.Dir)
        }
    }

    return [ordered]@{
        # Trailing slash per the metadata convention for item ids (see New-ComponentFileBody).
        id               = $itemId
        title            = $Item.title
        informationToBot = $Item.informationToBot
        contentType      = $Item.contentType
        mediaFormat      = $Item.mediaFormat
        questions        = (ConvertTo-JsonArray $questions)
    }
}

function New-ComponentFileBody {
    param($Comp, [string] $UnitId, [string] $UrlPrefix)

    # The uniqueKey IS the id since the IRI migration, so prefer it. It used to rebuild
    # the id from hostedContentRef — a CONTENT address under 720/, while the id lives
    # under 720active/ — which is what produced the phantom `id` DRIFT rows. See step 5.
    $compId = if (Test-AbsoluteIri ([string] $Comp.uniqueKey)) { ([string] $Comp.uniqueKey).TrimEnd('/') }
              else { Get-ContentId $Comp.hostedContentRef }
    if (-not $compId) {
        $compId = "$UrlPrefix/$($Comp.uniqueKey)"
        Write-Warn ("Component {0} has neither an IRI uniqueKey nor a hostedContentRef — id rebuilt as {1}" -f $Comp.uniqueKey, $compId)
    }

    if ($script:local) {
        $lc = $script:local.Components[(Get-Slug $Comp.uniqueKey)]
        if ($lc) {
            Test-IdShape 'component' $Comp.uniqueKey $Comp.hostedContentRef $lc.id
        } else {
            Write-Warn ("Component {0} is in KATA but not in {1}." -f $Comp.uniqueKey, $script:local.Dir)
        }
    }

    $afterFail = @(foreach ($r in (ConvertTo-JsonArray $Comp.recommendedAfterFail)) { "$UrlPrefix/$(Get-Slug ([string] $r))/" })

    $items = foreach ($it in ((ConvertTo-JsonArray $Comp.subContent) | Sort-Object { [int] $_.order })) {
        $script:counts.items++
        New-ItemFileBody $it $compId
    }

    # ── 720 v2.5 shapes (updated 2026-09-09) ──
    #   §2.1 cognitiveLevel -> cognitiveLevels (plural array)
    #   §2.6 the component no longer carries `manufacture` at all — the field moved to
    #        the unit and was renamed. Emitting it here (as the original did, forced to
    #        $Manufacture) put a spurious key on every component and seven fake lines
    #        into every diff. $Manufacture is left in CONFIG only to document this.
    # `id` regains the trailing slash the metadata convention carries on unit,
    # component and item ids (verified against metadata/*.json); Get-ContentId strips
    # it, and without it every id in the file differed by one character.
    $out = [ordered]@{
        id                     = "$compId/"
        title                  = $Comp.title
        learningUnitId         = $UnitId
        componentPurpose       = $Comp.componentPurpose
        isAssessment           = [bool] $Comp.isAssessment
        recommendedAfterFail   = $afterFail
        isRequired             = [bool] $Comp.isRequired
        relativeDifficulty     = [int] $Comp.relativeDifficulty
        order                  = [int] $Comp.order
        depthLevel             = $Comp.depthLevel
        cognitiveLevels        = (ConvertTo-JsonArray $Comp.cognitiveLevels)
        languages              = (ConvertTo-JsonArray $Comp.languages)
        skills                 = (ConvertTo-JsonArray $Comp.skills)
        estimatedTimeInMinutes = [int] $Comp.estimatedTimeInMinutes
        createdAt              = $Comp.createdAt
        updatedAt              = $Comp.updatedAt
        subContent             = (ConvertTo-JsonArray $items)
    }
    # Insert masteryLevel where the hand-authored files keep it (after relativeDifficulty), so a
    # metadata/ vs metadata-from/ diff stays clean rather than showing a key-order change.
    # ⚠️ Emitted even when null (changed 2026-09-09). This unit's metadata carries
    # `masteryLevel: null` on every component, and KATA returns null as well; the old
    # non-empty guard dropped the key entirely, which showed up as seven deletions in
    # the diff for a value that actually matches.
    if ($true) {
        $reordered = [ordered]@{}
        foreach ($k in $out.Keys) {
            $reordered[$k] = $out[$k]
            if ($k -eq 'relativeDifficulty') { $reordered['masteryLevel'] = $Comp.masteryLevel }
        }
        return $reordered
    }
    return $out
}

# ---- Main -------------------------------------------------------------------

# Fresh log per run.
Set-Content -Path $LogFile -Value '=== retrieve-metadata ===' -Encoding UTF8

$ApiKey = Resolve-ApiKey
if (-not $ApiKey) {
    Write-Log ("API key not set. Pass -ApiKey, set `$env:KATA_API_KEY, or put the key on one line in " +
               "$ApiKeyFile (get it from /api-credentials).") 'ERROR'
    exit 1
}

Write-Log ("Base URL   : {0}" -f $BaseUrl)
Write-Log ("Output dir : {0}" -f $OutDir)

# 1) Which unit? Parameter, else the local metadata folder, else ask the catalog.
if ($UnitKey) { Write-Log ("Unit key   : {0} (-UnitKey)" -f $UnitKey) }
if (-not $UnitKey) {
    $localUnit = Get-ChildItem -Path (Join-Path $RepoRoot 'metadata') -Filter '*_unit.json' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($localUnit) {
        $UnitKey = Get-Slug ((Get-Content -Raw -Path $localUnit.FullName -Encoding UTF8 | ConvertFrom-Json).id)
        Write-Log ("Unit key   : {0} (from {1})" -f $UnitKey, $localUnit.Name)
    }
}
if (-not $UnitKey) {
    $r = Get-Kata '/api/v1/content-units'
    if ($r.Code -ne '200') {
        Write-Log ("Cannot list content units (HTTP {0}) {1}" -f $r.Code, (Get-Snippet $r.Body)) 'ERROR'
        exit 1
    }
    $keys = @((Convert-KataJson $r.Body) | ForEach-Object { $_.uniqueKey })
    if ($keys.Count -eq 1) {
        $UnitKey = $keys[0]
        Write-Log ("Unit key   : {0} (only unit in the catalog)" -f $UnitKey)
    } else {
        Write-Log ("Cannot pick a unit automatically — pass -UnitKey. Available: {0}" -f ($keys -join ', ')) 'ERROR'
        exit 1
    }
}

# 2) One GET returns the whole tree.
$r = Get-Kata "/api/v1/content-units/$UnitKey"
if ($r.Code -ne '200') {
    Write-Log ("FAILED  GET /api/v1/content-units/{0} (HTTP {1}) {2}" -f $UnitKey, $r.Code, (Get-Snippet $r.Body)) 'ERROR'
    exit 1
}
$unit = Convert-KataJson $r.Body

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# 3) Optionally keep the untouched response — the dropped KATA-only fields live here.
if ($KeepRaw) {
    $rawDir = Join-Path $OutDir '_raw'
    New-Item -ItemType Directory -Path $rawDir -Force | Out-Null
    $rawPath = Join-Path $rawDir "$UnitKey.json"
    Write-TextFile $rawPath $r.Body
    Write-Log ("RAW     {0}" -f (Split-Path -Leaf $rawPath))
}

# 4) Sanity check — the nested response is the only source of component keys.
$components = @((ConvertTo-JsonArray $unit.components) | Sort-Object { [int] $_.order })
if ($null -ne $unit.componentCount -and [int] $unit.componentCount -ne $components.Count) {
    Write-Warn ("Unit reports componentCount={0} but the response carries {1} components." -f $unit.componentCount, $components.Count)
}
if ($components.Count -eq 0) { Write-Warn 'Unit has no components — writing the unit file only.' }

# 5) Rebuild the URL prefix the `id` fields need, from any component's uniqueKey.
#
# ⚠️ 2026-09-16: this took the prefix from hostedContentRef, and that is where the
# false drift came from. hostedContentRef is a CONTENT address and lives under 720/;
# an id is an IDENTIFIER and lives under 720active/. The prefix built from the content
# address then produced a 720/ id where a 720active/ one belongs, and mass-measure-01's
# verify-metadata.ps1 reported `id` DRIFT rows that were not drift.
# Since the IRI migration the component uniqueKey IS an absolute id, so it is the
# authority. hostedContentRef survives only as the fallback for a catalogue row that
# predates the migration and still carries a bare slug.
$sample = $components | Where-Object { Test-AbsoluteIri ([string] $_.uniqueKey) } | Select-Object -First 1
if ($sample) {
    $sampleId  = ([string] $sample.uniqueKey).TrimEnd('/')
    $urlPrefix = $sampleId.Substring(0, $sampleId.LastIndexOf('/'))
} else {
    $sample = $components | Where-Object { $_.hostedContentRef } | Select-Object -First 1
    if ($sample) {
        $sampleId  = Get-ContentId $sample.hostedContentRef
        $urlPrefix = $sampleId.Substring(0, $sampleId.LastIndexOf('/'))
        Write-Warn ("No component uniqueKey is an absolute IRI — prefix rebuilt from hostedContentRef ({0}). Pre-migration catalogue row? The ids below may name the CONTENT path rather than the identifier path." -f $urlPrefix)
    } else {
        $urlPrefix = $IdBase.TrimEnd('/')
        Write-Warn ("No component carries a uniqueKey IRI or a hostedContentRef — rebuilding id URLs from -IdBase ({0})." -f $urlPrefix)
    }
}
# 720 v2.5 §2.7 dropped the IRI requirement for the UNIT id (component and item ids
# are still IRIs). This unit's catalogue entry and its metadata both use the plain
# slug, and KATA returns the bare key in each component's learningUnitId — so build
# the unit id from the key, not from the URL prefix.
$unitId = $UnitKey

# 5b) Load the authored metadata/ so every component and item can be audited against
#     it as the files are built. Without this the run can only tell you what KATA
#     returned, never whether that is what was published.
$script:local = Import-LocalMetadata $MetadataDir
if ($script:local) {
    Write-Log ("Auditing against {0} ({1} components, {2} items)" -f $script:local.Dir, $script:local.Components.Count, $script:local.Items.Count)
} else {
    Write-Warn ("No local metadata to audit against ({0}) — reporting KATA's response only." -f $MetadataDir)
}

# 6) Write the files.
$unitPath = Join-Path $OutDir "$UnitKey`_unit.json"
Write-JsonFile $unitPath (New-UnitFileBody $unit $unitId)
Write-Log ("WROTE   {0}" -f (Split-Path -Leaf $unitPath))

foreach ($comp in $components) {
    $before = $script:counts.items
    $body   = New-ComponentFileBody $comp $unitId $urlPrefix
    # The key is an IRI now, which is not a legal filename — name the file by its slug,
    # the same way send-metadata.ps1 finds it on the way back in.
    $path   = Join-Path $OutDir ("{0}.json" -f (Get-Slug $comp.uniqueKey))
    Write-JsonFile $path $body
    $script:counts.components++
    Write-Log ("WROTE   {0} ({1} items)" -f (Split-Path -Leaf $path), ($script:counts.items - $before))
}

# 7) The other direction: anything authored that KATA never received. An item or
#    component present in metadata/ but absent from the catalogue is invisible to the
#    per-entity audit above, which can only walk what KATA returned.
if ($script:local) {
    # Both sides are compared as SLUGS: $script:local is indexed by Get-Slug, while KATA's
    # uniqueKey is a full IRI since 2026-09-15. Comparing the two shapes directly reported
    # every component and item as missing.
    foreach ($k in $script:local.Components.Keys) {
        if (-not ($components | Where-Object { (Get-Slug $_.uniqueKey) -eq $k })) {
            Write-Warn ("Component {0} is in metadata/ but NOT in KATA." -f $k)
        }
    }
    $kataItemKeys = @(foreach ($c in $components) { foreach ($s in (ConvertTo-JsonArray $c.subContent)) { Get-Slug $s.uniqueKey } })
    foreach ($k in $script:local.Items.Keys) {
        if ($kataItemKeys -notcontains $k) { Write-Warn ("Item {0} is in metadata/ but NOT in KATA." -f $k) }
    }
}

Write-Log ("Done. unit=1 components={0} items={1} warnings={2}" -f
    $script:counts.components, $script:counts.items, $script:counts.warnings)
if ($script:counts.failed -gt 0) { exit 1 }
if ($FailOnDrift -and $script:counts.warnings -gt 0) {
    Write-Log ("FailOnDrift: {0} warning(s) — the catalogue does not match metadata/." -f $script:counts.warnings) 'ERROR'
    exit 1
}
