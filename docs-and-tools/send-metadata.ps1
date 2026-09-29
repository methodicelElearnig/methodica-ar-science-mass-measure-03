#Requires -Version 7.0
<#
.SYNOPSIS
    Send the metadata/ folder (1 unit + 5 components + their items) to the Kata
    (Katalog) catalog API at https://kata.cet.ac.il/api/v1.

.DESCRIPTION
    Walks the metadata tree top-down and UPSERTS each entity (GET by uniqueKey ->
    PATCH if it exists, else POST). Transforms the on-disk metadata into the API
    payloads, filling in required fields the metadata lacks (from the CONFIG block
    below) and remapping values that fall outside the API enums.

    Runtime: PowerShell 7+ and curl.exe (bundled with Windows 10/11).

    SAFETY: never hard-code the API key here — this script is committed. Supply it via
    -ApiKey, $env:KATA_API_KEY, or the git-ignored kata-api-key.txt next to this script
    (see SEND-METADATA.md). The script refuses to run without one and never logs it.

.PARAMETER DryRun
    Build and print every payload WITHOUT any network call. No key required.

.PARAMETER ApiKey
    The Kata API key. Overrides $env:KATA_API_KEY and kata-api-key.txt.

.PARAMETER BaseUrl
    Override the API base URL (default https://kata.cet.ac.il).

.PARAMETER MetadataDir
    Override the metadata folder (default: the metadata/ folder next to this script).

.EXAMPLE
    pwsh -File send-metadata.ps1 -DryRun
.EXAMPLE
    pwsh -File send-metadata.ps1
#>
[CmdletBinding()]
param(
    [switch] $DryRun,
    [string] $ApiKey,
    [string] $BaseUrl,
    [string] $MetadataDir,
    # Populate item hostedContentRef and NOTHING else — 26 single-field PATCHes.
    # ⚠️ ONE-WAY. Probed 2026-09-11: PATCHing hostedContentRef back to null returns
    # HTTP 200 and is silently ignored, and '' is a 422. There is no supported clear.
    # Deliberately sends no `order` and no `questions`, so the item-order 409 trap
    # cannot fire and — far more important right now — so a catalogue-side edit to a
    # question can never be overwritten by this mode.
    [switch] $ItemHostedRefOnly
)

# ============================================================================
#  CONFIG  — edit these before running
# ----------------------------------------------------------------------------
#  REUSE GUIDE — running this for a DIFFERENT unit? Touch only what applies:
#    (1) ALWAYS: set the API key, and point $MetadataDir at the unit's folder.
#    (2) PER-UNIT: usually fine as-is (title language, manufacture, overrides).
#    (3) CONTENT VOCABULARY: adjust ONLY for a different subject or new metadata
#        values — the cognitiveLevel codes (subject-specific!) and the small
#        value-mapping tables. If the metadata contains a value not covered here,
#        the script STOPS with a clear message naming it, so you know what to add.
#    (4) 720 STANDARD ENUMS: rarely change — they mirror the KATA spec.
#  Sections are ordered (1)->(4) below.
# ============================================================================

# ── (1) PER-RUN / ENVIRONMENT — always check ────────────────────────────────
# API key from Kata -> "מפתחות API" (/api-credentials).
# NEVER hard-code it here — this script is committed. It is resolved at runtime, in
# order, from: the -ApiKey parameter, the KATA_API_KEY environment variable, or the
# git-ignored key file below (one line, just the key). See SEND-METADATA.md.
# Repo root is one level up: this script lives in docs-and-tools/, while the
# key file, metadata/, and the log all stay at the repo root.
$RepoRoot = Split-Path $PSScriptRoot -Parent
$ApiKeyFile = Join-Path $RepoRoot 'kata-api-key.txt'
# API base URL (override at launch with -BaseUrl).
if (-not $BaseUrl) { $BaseUrl = 'https://kata.cet.ac.il' }
# Metadata folder to send (override with -MetadataDir). Defaults to repo root's ./metadata.
if (-not $MetadataDir) { $MetadataDir = Join-Path $RepoRoot 'metadata' }
# Run log (git-ignored via *.log).
$LogFile = Join-Path $RepoRoot 'send-metadata.log'

# ── (2) PER-UNIT — usually fine as-is ───────────────────────────────────────
# Where the CONTENT is served from, for hostedContentRef — the field Kata launches the
# component from. It must resolve.
#
# ⚠️ DELIBERATELY NOT DERIVED FROM $Comp.id. Until 2026-09-16 this script built the ref as
#   ($Comp.id.TrimEnd('/')) + '/index.html'
# and an id lives under 720active/ while the content is served from 720/. The split is
# correct by design — 720 v2.5 p.11 says an id "אינו חייב להוביל בפועל לדף אינטרנט פעיל",
# and no clause ties an id to a serving URL — so deriving one from the other produced a
# launch URL that serves 0 bytes. Kata currently holds the correct 720/ values, which means
# the next live run of this script would have overwritten a working launch path with a dead
# one, for every component of this unit.
#
# Take this from the unit's own DEPLOY.md deploy target. No trailing slash.
$ContentBaseUrl = 'https://lomdot.education.gov.il/metodica/720/ar/science/mass-measure/03'
# Title language key: wraps a string title into the API object, e.g.
#   "מדידת מסה" -> { "Hebrew": "מדידת מסה" }. Change only for non-Hebrew content.
$TitleLangKey = 'Arabic'
# ⚠️ NO LONGER SENT (2026-09-09). v2.5 §2.6 renamed the v2.4 component field
# `manufacture` to the unit field `manufacturer` and retyped it as the ministry's
# supplier number. It is moot either way, because KATA derives the value itself
# from the group owning the API key and returns the provider's DISPLAY NAME:
# mass-measure-02's unit metadata carries no manufacturer at all, yet the
# catalogue reports "מתודיקה". Sending anything here is therefore either ignored
# or a chance to be wrong, so New-UnitBody omits the field. Kept only to document
# why. (This unit's metadata does carry manufacturer = "310"; §2.6 asks for a
# number while the standard's own API examples still show a string — unresolved,
# and not worth guessing at when the server overwrites it.)
$UnitManufacture = 'methodica'
# Fallback depthLevel — used ONLY if a component's metadata omits it (components
# normally carry their own relativeDifficulty / depthLevel / cognitiveLevel).
$DefaultDepthLevel = 'core-curriculum-basic'
# Optional per-component overrides, keyed by uniqueKey (URL slug). An override
# WINS over the metadata value; unlisted components use their metadata value.
#   e.g. 'methodica-math-scale-01-05' = @{ relativeDifficulty = 4; depthLevel = 'core-curriculum-advanced' }
$ComponentOverrides = @{
}

# ── (3) CONTENT VOCABULARY — ADJUST PER UNIT / SUBJECT ───────────────────────
# These translate values found in the metadata into what KATA accepts. This is
# THE section to review when reusing. Unmapped/invalid values -> the script stops
# and names the offender (see Map-Enum / New-ComponentBody).
#
# Since metadata v2.3 the metadata files store the SAME kebab-case vocabulary the
# API uses, so these maps are only needed for legacy values left over from the
# pre-v2.3 files. Everything else passes through and is checked against the
# $Valid* lists in section (4).

# 3a. componentPurpose: metadata value -> API enum (see $ValidComponentPurpose).
$ComponentPurposeMap = @{
    'assessment' = 'practice'   # an assessment component (isAssessment already flags it)
}
# 3b. contentType (items): metadata value -> API enum (see $ValidContentType).
#     Both keys are pre-v2.3 spellings; current metadata needs no mapping.
$ContentTypeMap = @{
    'ClassroomTask' = 'project-or-inquiry-task'
    'Assessment'    = 'practice'
}
# 3c. cognitiveLevel: metadata value -> official MOE code — SUBJECT-SPECIFIC.
#     KATA validates against GET /api/v1/cognitive-levels. The codes turned out to
#     be kebab-case slugs identical to what the metadata stores, so this map only
#     translates the pre-v2.3 Title Case labels; a different subject (e.g. math)
#     has a different code set, so replace $ValidCognitiveLevel when reusing.
$CognitiveLevelMap = @{
    'Identifying'                    = 'identifying'                    # זיהוי
    'Describing'                     = 'describing'                     # תיאור
    'Retrieving Information'         = 'retrieving-information'          # איתור מידע
    'Providing Examples'             = 'providing-examples'              # מתן דוגמאות
    'Making Connections'             = 'making-connections'              # קישור
    'Interpreting'                   = 'interpreting'                    # פירוש
    'Applying a Model or Procedure'  = 'applying-a-model-or-procedure'   # שימוש במודל או בפרוצדורה
    'Explaining'                     = 'explaining'                      # הסבר
    'Providing Scientific Reasoning' = 'providing-scientific-reasoning'   # הנמקה מדעית — NOT in KATA yet
    'Analyzing'                      = 'analyzing'                       # ניתוח — NOT in KATA yet
    'Synthesizing'                   = 'synthesizing'                    # סינתזה — NOT in KATA yet
    'Evaluating and Justifying'      = 'evaluating-and-justifying'        # הערכה והצדקה — NOT in KATA yet
}
# The SCIENCE codes KATA actually holds — verified live 2026-07-25 via
# GET /api/v1/cognitive-levels (12 codes total: 8 `science` plus 4 `mathematics`).
# THIS UNIT IS MATHEMATICS, so the four `mathematics` codes are the relevant ones; the
# science codes are kept because the endpoint accepts them and a shared unit could use them.
#
# ⚠️ VOCABULARY MISMATCH — the metadata/ files in this repo currently carry word-reversed
#    spellings that the API will reject with 422 "code does not exist", e.g.
#        metadata says            KATA/720 vocabulary
#        thinking-algorithmic  -> algorithmic-thinking
#        content-interactive   -> interactive-content
#        basic-curriculum-core -> core-curriculum-basic
#        advanced-curriculum-core -> core-curriculum-advanced
#        exercise-solved       -> solved-exercise
#        task-inquiry-or-project  -> project-or-inquiry-task
#    The lists here deliberately hold the LIVE vocabulary rather than the metadata's, so that
#    `send-metadata.ps1 -DryRun` names every offending value instead of failing later against
#    the real API. Confirm the canonical spelling with CET, fix metadata/, then push.
#
# VERIFIED against GET /api/v1/cognitive-levels on 2026-08-05 — 16 codes live, 4 mathematics and
# 12 science. The mathematics four, with their Hebrew titles:
#     algorithmic-thinking         חשיבה אלגוריתמית      (Algorithmic Thinking)
#     process-thinking             חשיבה תהליכית          (Procedural Thinking)
#     interpretation-and-reasoning חיפוש פתוח והנמקה      (Open Interpretation and Reasoning)
#     knowledge-and-recall         ידע וזיהוי             (Knowledge and Recognition)
# Note 'interpretation-and-reasoning' — NOT 'reasoning-and-interpretation', which is what this
# repo's metadata originally carried (the same word-order fault as the rest; see METADATA-FIXES.md).
$ValidCognitiveLevel = @(
    # mathematics — used by this unit
    'algorithmic-thinking'
    'process-thinking'
    'interpretation-and-reasoning'
    'knowledge-and-recall'
    # science — retained for cross-subject reuse. All 12 are live as of the 2026-08-05 check
    # (the four that used to 422 have since been released).
    'identifying'
    'describing'
    'retrieving-information'
    'providing-examples'
    'making-connections'
    'interpreting'
    'applying-a-model-or-procedure'
    'explaining'
    'analyzing'
    'synthesizing'
    'evaluating-and-justifying'
    'providing-scientific-reasoning'
)
# 720 science levels that exist in the spec but NOT in KATA — used only to give a
# clearer error than "unmapped value" when the metadata legitimately uses one.
# Empty as of the 2026-08-05 check: the four science levels that used to 422 are now live and have
# moved up into $ValidCognitiveLevel. Kept as a mechanism — if a future spec level is not yet
# loaded in KATA, list it here to get a clear message instead of "unknown value".
$PendingCognitiveLevel = @()

# ── (4) 720 STANDARD ENUMS — rarely change (mirror the KATA spec) ────────────
# Used to fail fast on any value that maps outside the standard vocabulary.
# NOTE: these are kebab-case, matching what the live API returns and accepts —
# the Title Case tables in KATA-API.md's "Controlled Vocabularies" are stale.
$ValidComponentPurpose = @('instruction','practice','both')
$ValidContentType      = @('instruction','practice','project-or-inquiry-task','educational-game','reading-text','simulation','motivational','solved-exercise','summary')
$ValidMediaFormat      = @('text','image','audio','video','animation','interactive-content','presentation')
# depthLevel is a plain enum (720 v2.2 p.16), not a coded taxonomy.
$ValidDepthLevel       = @('core-curriculum-basic','core-curriculum-advanced','core-curriculum-enrichment','non-core-basic','non-core-advanced','non-core-enrichment')
# masteryLevel (720 v2.2) — this unit's metadata sets it per component. It was previously dropped
# on the floor: the payload never carried it, so the values never reached the catalog.
$ValidMasteryLevel     = @('basic','intermediate','advanced')
# Unit audience vocabularies. These were previously forwarded unvalidated, so a bad value only
# surfaced as a 422 from the live API — after the unit had already been created.
$ValidTargetSector     = @('state-general','state-religious','orthodox','arab-sector','druze-sector','bedouin-sector','special-education')
$ValidTargetAudience   = @('general','excellent','disadvantaged-populations','new-immigrants','students-with-special-needs','students-with-language-gaps','at-risk-students')

# ============================================================================
#  End of CONFIG
# ============================================================================

$ErrorActionPreference = 'Stop'
$script:counts = @{ created = 0; updated = 0; failed = 0 }

function Write-Log {
    param([string] $Message, [string] $Level = 'INFO')
    $line = "[{0}] {1}" -f $Level, $Message
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Get-Slug {
    param([string] $Url)
    # Trim any trailing slash(es) first so a URL like ".../foo/" yields "foo", not "".
    return (($Url.TrimEnd('/')) -split '/')[-1]
}

# Percent-encode a key for a query string. Component and item keys are full IRIs (720
# v2.5 p.11), so they contain '/' and CANNOT travel in a URL path segment — the server
# decodes %2F before routing, which is why the old /components/{key} routes 404 on them.
# In a query parameter %2F is ordinary data. See Documentation/KATA/KATA-API.md.
function Enc {
    param([string] $Value)
    return [uri]::EscapeDataString($Value)
}

# The entity's canonical IRI, normalised to exactly what unit-js/20-xapi.js xapiItemId()
# emits — trailing slash, always — so the catalogue row and every statement's object.id
# are byte-identical strings.
#
# 720 v2.5 p.11 ("הגדרת מזהי רכיבים, פריטים (ID) במטא-דאטה על פי תקן xAPI") requires a
# component's and an item's id to be an IRI — a full URL or a URN — and explicitly says
# it need NOT resolve to a live page. v2.5 §2.7 relaxed that for the UNIT id only.
# KATA has no `id` column at all: it keys on a bare slug `uniqueKey`, so hostedContentRef
# is the only field that can carry the IRI.
function Get-ContentIri {
    param([string] $Id, [string] $Where)
    if ($Id -notmatch '^(https?://|urn:)') {
        throw ("Id '$Id' at $Where is not an IRI. 720 v2.5 p.11 requires component and item ids " +
               'to be a full URL or URN — fix metadata/, not this script. (§2.7 relaxed this for ' +
               'the UNIT id only.)')
    }
    return ($Id -replace '/+$', '') + '/'
}

# -ApiKey > $env:KATA_API_KEY > the git-ignored key file. Returns '' if none is set.
function Resolve-ApiKey {
    if ($ApiKey)            { return $ApiKey.Trim() }
    if ($env:KATA_API_KEY)  { return $env:KATA_API_KEY.Trim() }
    if (Test-Path $ApiKeyFile) {
        return ((Get-Content -Raw -Path $ApiKeyFile -Encoding UTF8) -replace '\s', '')
    }
    return ''
}

function Map-Enum {
    param([string] $Value, [hashtable] $Map, [string[]] $Valid, [string] $FieldName, [string] $Where)
    $mapped = if ($Map.ContainsKey($Value)) { $Map[$Value] } else { $Value }
    if ($Valid -notcontains $mapped) {
        throw "Unmapped $FieldName value '$Value' at $Where — add it to the enum map or fix the metadata."
    }
    return $mapped
}

function Remove-Key {
    param([System.Collections.Specialized.OrderedDictionary] $Dict, [string] $Key)
    $copy = [ordered]@{}
    foreach ($k in $Dict.Keys) { if ($k -ne $Key) { $copy[$k] = $Dict[$k] } }
    return $copy
}

function Invoke-Kata {
    param([string] $Method, [string] $Path, $Body)
    $url = "$BaseUrl$Path"

    if ($DryRun) {
        Write-Log "DRY-RUN $Method $url"
        if ($null -ne $Body) {
            $json = $Body | ConvertTo-Json -Depth 12
            Write-Host $json
        }
        return @{ Code = '000'; Body = '(dry-run)' }
    }

    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $curlArgs = @('-sS', '-X', $Method, $url, '-H', "X-API-Key: $ApiKey")
        if ($null -ne $Body) {
            $json = $Body | ConvertTo-Json -Depth 12
            [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))
            $curlArgs += @('-H', 'Content-Type: application/json; charset=utf-8', '--data-binary', "@$tmp")
        }
        $curlArgs += @('-w', '\n%{http_code}')

        $raw = (& curl.exe @curlArgs 2>&1 | Out-String)
        $text = ($raw -replace "`r", '').TrimEnd("`n")
        $idx  = $text.LastIndexOf("`n")
        if ($idx -ge 0) {
            $code = $text.Substring($idx + 1).Trim()
            $bodyText = $text.Substring(0, $idx)
        } else {
            $code = $text.Trim()
            $bodyText = ''
        }
        return @{ Code = $code; Body = $bodyText }
    }
    finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

function Test-Exists {
    param([string] $Path)
    if ($DryRun) { return $false }
    $code = (& curl.exe -s -o NUL -w '%{http_code}' -X GET "$BaseUrl$Path" -H "X-API-Key: $ApiKey")
    return ($code -eq '200')
}

# Upsert one entity. Returns $true on success (so children may proceed).
function Send-Entity {
    param(
        [string] $Label,
        [string] $GetPath,
        [string] $CreateMethod,
        [string] $CreatePath,
        $CreateBody,
        [string] $PatchPath,
        $PatchBody
    )
    # Track the call ACTUALLY made. The failure log below used to print
    # $CreateMethod/$CreatePath unconditionally, so a rejected PATCH was
    # reported as a failed POST - which sent a real diagnosis (an item order
    # collision on PATCH) chasing a create path that was never used.
    $exists = Test-Exists $GetPath
    if ($exists) {
        $usedMethod = 'PATCH'; $usedPath = $PatchPath
        $r = Invoke-Kata 'PATCH' $PatchPath $PatchBody
        $action = 'UPDATED'
    } else {
        $usedMethod = $CreateMethod; $usedPath = $CreatePath
        $r = Invoke-Kata $CreateMethod $CreatePath $CreateBody
        $action = 'CREATED'
    }

    $ok = $DryRun -or ($r.Code -match '^2\d\d$')
    if ($ok) {
        if ($action -eq 'UPDATED') { $script:counts.updated++ } else { $script:counts.created++ }
        Write-Log ("{0,-7} {1} (HTTP {2})" -f $action, $Label, $r.Code)
    } else {
        $script:counts.failed++
        $snippet = ($r.Body -replace '\s+', ' ')
        if ($snippet.Length -gt 400) { $snippet = $snippet.Substring(0, 400) + '…' }
        Write-Log ("FAILED  {0} — {1} {2} (HTTP {3}) {4}" -f $Label, $usedMethod, $usedPath, $r.Code, $snippet) 'ERROR'
    }
    return $ok
}

# ---- Payload builders -------------------------------------------------------

function New-UnitBody {
    param($Unit)

    # uniqueKey comes from the last path segment of the unit id. Guard against an id that stops at
    # the unit FOLDER (".../scale/01/"), which would silently key the unit as "01" and collide with
    # every other unit numbered 01.
    $unitKey = Get-Slug $Unit.id
    if ($unitKey -notmatch '^methodica-') {
        throw ("Unit uniqueKey resolves to '$unitKey' from id '$($Unit.id)' — expected a slug like " +
               "'methodica-math-scale-01'. The unit id must end with the unit slug, not the folder number.")
    }

    # ── 720 v2.5 field shapes (updated 2026-09-09; see the block comment below) ──
    # targetSectors: PLURAL and a list (v2.5 §2.4). Validated rather than forwarded blind.
    if (-not $Unit.targetSectors) {
        throw ("The unit carries no 'targetSectors'. v2.5 §2.4 renamed the v2.4 singular " +
               "'targetSector' to the plural list 'targetSectors'; if this metadata still uses " +
               'the old name, fix the metadata rather than this script — the live API returns ' +
               'the plural form.')
    }
    foreach ($v in @($Unit.targetSectors)) {
        if ($ValidTargetSector -notcontains $v) {
            throw "Invalid targetSectors entry '$v' on the unit — expected one of: $($ValidTargetSector -join ', ')."
        }
    }
    # targetAudience: a SINGLE value in v2.5 §2.5, no longer an array.
    if ($Unit.targetAudience -is [array]) {
        throw ("The unit's 'targetAudience' is an array. v2.5 §2.5 made it a single value — " +
               "the ministry's stated intent is that a unit targets one audience.")
    }
    if ($ValidTargetAudience -notcontains $Unit.targetAudience) {
        throw "Invalid targetAudience '$($Unit.targetAudience)' on the unit — expected one of: $($ValidTargetAudience -join ', ')."
    }

    # ⚠️ subTopic is deliberately NOT sent. The metadata carries it, and a GET returns
    # it, but POSTing it is rejected: HTTP 422 "a standard unit must not have a
    # subTopic" (observed 2026-09-09 on this unit's first create). KATA derives it
    # from learningObjective for kind="standard" units. Do not add it back.
    return [ordered]@{
        uniqueKey         = $unitKey
        title             = [ordered]@{ $TitleLangKey = $Unit.title }
        learningObjective = $Unit.learningObjective
        targetSectors     = @($Unit.targetSectors)
        targetAudience    = $Unit.targetAudience
    }
}

function New-ComponentBody {
    param($Comp)
    $slug = Get-Slug $Comp.id
    $ov   = if ($ComponentOverrides.ContainsKey($slug)) { $ComponentOverrides[$slug] } else { @{} }

    # relativeDifficulty: override > metadata value > (last resort) component order.
    $relDiff = if ($ov.ContainsKey('relativeDifficulty')) { $ov.relativeDifficulty }
               elseif ($null -ne $Comp.relativeDifficulty)  { $Comp.relativeDifficulty }
               else { $Comp.order }

    # depthLevel: override > metadata value > fallback. Validated against the enum.
    $depth = if ($ov.ContainsKey('depthLevel')) { $ov.depthLevel }
             elseif ($Comp.depthLevel)          { $Comp.depthLevel }
             else { $DefaultDepthLevel }
    if ($ValidDepthLevel -notcontains $depth) {
        throw "Invalid depthLevel '$depth' at $slug — expected one of: $($ValidDepthLevel -join ', ')."
    }

    # cognitiveLevels: PLURAL and a list (v2.5 §2.1 — a component may carry several
    # thinking levels). Override wins; otherwise each metadata value already IS the
    # MOE code (kebab-case), and $CognitiveLevelMap only rewrites pre-v2.3 labels.
    if ($ov.ContainsKey('cognitiveLevels')) {
        $cogs = @($ov.cognitiveLevels)
    } elseif ($ov.ContainsKey('cognitiveLevel')) {
        $cogs = @($ov.cognitiveLevel)          # tolerate a singular override key
    } else {
        if (-not $Comp.cognitiveLevels) {
            throw ("Component $slug carries no 'cognitiveLevels'. v2.5 §2.1 renamed the v2.4 " +
                   "singular 'cognitiveLevel' to the plural array 'cognitiveLevels'; if this " +
                   'metadata still uses the old name, fix the metadata rather than this script — ' +
                   'the live API returns the plural form.')
        }
        $cogs = @()
        foreach ($label in @($Comp.cognitiveLevels)) {
            $cog = if ($CognitiveLevelMap.ContainsKey($label)) { $CognitiveLevelMap[$label] } else { $label }
            if ($PendingCognitiveLevel -contains $cog) {
                throw ("cognitiveLevels entry '$cog' ($slug) is a 720 level that KATA has not loaded yet — " +
                       'it would fail with 422 "cognitiveLevel code does not exist". Re-check ' +
                       'GET /api/v1/cognitive-levels; once the code appears, move it from ' +
                       '$PendingCognitiveLevel into $ValidCognitiveLevel and re-run.')
            }
            if ($ValidCognitiveLevel -notcontains $cog) {
                throw ("Unknown cognitiveLevels entry '$label' at $slug — not one of the codes KATA holds: " +
                       "$($ValidCognitiveLevel -join ', '). Check GET /api/v1/cognitive-levels.")
            }
            $cogs += $cog
        }
    }

    $purpose = Map-Enum $Comp.componentPurpose $ComponentPurposeMap $ValidComponentPurpose 'componentPurpose' $slug

    # masteryLevel: optional in the metadata, but when present it must reach the catalog — this
    # field used to be silently dropped. Absent stays absent rather than being defaulted; an
    # explicit null is a request to CLEAR it — see the note at the payload below.
    $masteryPresent = ($Comp.PSObject.Properties.Name -contains 'masteryLevel')
    $mastery = $null
    if ($null -ne $Comp.masteryLevel -and "$($Comp.masteryLevel)".Trim() -ne '') {
        $mastery = $ValidMasteryLevel | Where-Object { $_ -ieq $Comp.masteryLevel } | Select-Object -First 1
        if (-not $mastery) {
            throw "Invalid masteryLevel '$($Comp.masteryLevel)' at $slug — expected one of: $($ValidMasteryLevel -join ', ')."
        }
    }

    # NOTE: recommendedAfterFail is intentionally NOT set here. Those references can
    # point to components created later in the run (e.g. part 01 -> part 02), which
    # KATA rejects at create time ("... is not a component"). It's applied in a
    # separate PATCH pass after every component exists — see the Main section.

    $body = [ordered]@{
        # The full IRI, verbatim from metadata/ — NOT $slug. 720 v2.5 p.11 requires the
        # catalogue row itself to carry an IRI, and Kata reports `identifier_not_iri` on
        # any key that is a bare slug. $slug remains the lookup key for overrides above.
        uniqueKey              = $Comp.id
        title                  = $Comp.title
        componentPurpose       = $purpose
        isAssessment           = [bool] $Comp.isAssessment
        isRequired             = [bool] $Comp.isRequired
        relativeDifficulty     = [int] $relDiff
        order                  = [int] $Comp.order
        depthLevel             = $depth
        cognitiveLevels        = @($cogs)
        languages              = @($Comp.languages)
        skills                 = @($Comp.skills)
        estimatedTimeInMinutes = [int] $Comp.estimatedTimeInMinutes
        # "כתובת תוכן מתארח" — the component's hosted URL (folder + /index.html).
        # Deliberately NOT the bare IRI: for a component this value names the real
        # launchable page and it does resolve. The IRI stays recoverable from it by
        # dropping the file name (retrieve-metadata.ps1 Get-ContentId does exactly that).
        hostedContentRef       = $ContentBaseUrl.TrimEnd('/') + '/' + $slug + '/index.html'
    }
    # Keyed on PRESENCE, not truthiness. `"masteryLevel": null` in the metadata is a
    # deliberate instruction to clear the field, and a PATCH that omits the key leaves
    # whatever Kata holds — which is how five components went on serving stale
    # basic/intermediate/advanced values after the metadata dropped them.
    # ComponentUpdate.masteryLevel is anyOf [MasteryLevel, null], so an explicit null is
    # legal. An ABSENT key still means "leave it alone", which is the older behaviour.
    if ($masteryPresent) { $body.masteryLevel = $mastery }
    return $body
}

function New-ItemBody {
    param($Item, [int] $Order)
    $slug = Get-Slug $Item.id
    $contentType = Map-Enum $Item.contentType $ContentTypeMap $ValidContentType 'contentType' $slug
    # Canonicalize mediaFormat casing to the exact API enum value. The API is
    # case-SENSITIVE ('Interactive-Content' -> 422), but PowerShell -contains is
    # case-insensitive, so match case-insensitively and send the canonical form.
    $mediaFormat = $ValidMediaFormat | Where-Object { $_ -ieq $Item.mediaFormat } | Select-Object -First 1
    if (-not $mediaFormat) {
        throw "Invalid mediaFormat '$($Item.mediaFormat)' at $slug — expected one of: $($ValidMediaFormat -join ', ')."
    }
    $body = [ordered]@{
        # The full IRI, verbatim from metadata/ — see the note in New-ComponentBody.
        # $slug is kept above only for the enum error messages.
        uniqueKey        = $Item.id
        title            = $Item.title
        informationToBot = $Item.informationToBot
        contentType      = $contentType
        mediaFormat      = $mediaFormat
        # ⚠️ NO hostedContentRef here, since 2026-09-16. This used to send
        #     hostedContentRef = (Get-ContentIri $Item.id $slug)
        # i.e. the item's own 720active IRI, defended on the grounds that an item is a
        # screen group INSIDE the component's page so no such file exists, and that
        # 720 v2.5 p.11 frees an IRI from resolving. p.11 is about IDENTIFIERS; this
        # field is a CONTENT ADDRESS, and 720active/math/percent/02/ serves 0 bytes,
        # so what went in was a URL that resolves to nothing. The component-level ref
        # had the same fault and is what Kata actually launches from — see the CONFIG
        # note on $ContentBaseUrl.
        #
        # Omitted rather than re-pointed: there is genuinely no item-level page to
        # address, and nothing launches an item. Omitting it from a PATCH leaves
        # whatever KATA holds untouched, which is the point — the 26 refs written by
        # the September backfill stay exactly as they are, and the field is ONE-WAY
        # (null is silently ignored, '' is a 422) so they could not be cleared anyway.
        # A newly POSTed item simply has none.
        order            = $Order
    }
    # Keyed on PRESENCE, not emptiness — same reason as masteryLevel in New-ComponentBody.
    # An item carrying "questions": [] has had its questions REMOVED (a screen reclassified
    # motivational, say), and omitting the key would leave Kata serving them forever: there
    # is no per-question delete endpoint, only ItemUpdate.questions. An item with no
    # `questions` key at all is still left untouched.
    if ($Item.PSObject.Properties.Name -contains 'questions') {
        $body.questions = @($Item.questions)
    }
    return $body
}

# ---- Main -------------------------------------------------------------------

# Fresh log per run.
$modeLabel = if ($DryRun) { 'DRY-RUN (no network)' } else { 'LIVE' }
Set-Content -Path $LogFile -Value ("=== send-metadata {0} ===" -f $modeLabel) -Encoding UTF8

$ApiKey = Resolve-ApiKey
if (-not $DryRun -and -not $ApiKey) {
    Write-Log ("API key not set. Pass -ApiKey, set `$env:KATA_API_KEY, or put the key on one line in " +
               "$ApiKeyFile (get it from /api-credentials). Or run with -DryRun.") 'ERROR'
    exit 1
}
if (-not (Test-Path $MetadataDir)) {
    Write-Log "Metadata folder not found: $MetadataDir" 'ERROR'
    exit 1
}

Write-Log ("Base URL     : {0}" -f $BaseUrl)
Write-Log ("Metadata dir : {0}" -f $MetadataDir)
Write-Log ("Mode         : {0}" -f $modeLabel)

# 1) Unit
$unitFile = Get-ChildItem -Path $MetadataDir -Filter '*_unit.json' | Select-Object -First 1
if (-not $unitFile) { Write-Log "No *_unit.json found in $MetadataDir" 'ERROR'; exit 1 }
$unit = Get-Content -Raw -Path $unitFile.FullName -Encoding UTF8 | ConvertFrom-Json
$unitKey = Get-Slug $unit.id

# In -ItemHostedRefOnly the unit is not touched at all — the whole point of that mode
# is that exactly one field on 26 items changes and nothing else in the catalogue moves.
$unitOk = $true
if (-not $ItemHostedRefOnly) {
    $unitBody  = New-UnitBody $unit
    $unitPatch = Remove-Key $unitBody 'uniqueKey'
    $unitOk = Send-Entity -Label "unit $unitKey" `
        -GetPath "/api/v1/content-units/$unitKey" `
        -CreateMethod 'POST' -CreatePath '/api/v1/content-units' -CreateBody $unitBody `
        -PatchPath "/api/v1/content-units/$unitKey" -PatchBody $unitPatch
}

if ($ItemHostedRefOnly) {
    # ── Narrow mode — RETIRED 2026-09-16, and it refuses to run ───────────────
    # One field, 26 rows, nothing else. It existed because the catalogue is NOT a
    # mirror of metadata/ any more: somebody edited questions in KATA after our
    # 2026-09-09 push (see kata-vs-metadata.md), and a full re-send would silently
    # overwrite their work.
    #
    # ⚠️ It wrote a ref that cannot resolve. $ref came from Get-ContentIri $item.id,
    # i.e. the item's 720active IRI — and 720active/math/percent/02/ serves 0 bytes.
    # An id is an identifier, not a fetch URL (720 v2.5 p.11), so deriving one from the
    # other is the same mistake the component ref carried until today; see the CONFIG
    # note on $ContentBaseUrl.
    #
    # It is NOT re-pointed at $ContentBaseUrl, and the 26 rows already in KATA are left
    # exactly as they are. Two reasons. There is no item-level page to point at — items
    # are screens inside one component index.html — so any value here is approximate at
    # best; and the field is ONE-WAY (null is silently ignored, '' is a 422), so a
    # rewrite could not be undone if the guess turned out wrong. Item refs are not what
    # Kata launches; the COMPONENT ref is, and that one is fixed.
    #
    # Re-enable only with a value someone can point at in a browser.
    throw ('-ItemHostedRefOnly is retired: it derived the ref from the item id, which is a ' +
           '720active identifier that serves 0 bytes. The 26 item refs already in KATA are ' +
           'left alone deliberately (the field is one-way). See the block comment here and ' +
           'the CONFIG note on $ContentBaseUrl.')

    $compFiles = Get-ChildItem -Path $MetadataDir -Filter '*.json' |
        Where-Object { $_.Name -notlike '*_unit.json' }
    $comps = foreach ($f in $compFiles) { Get-Content -Raw -Path $f.FullName -Encoding UTF8 | ConvertFrom-Json }
    foreach ($comp in ($comps | Sort-Object { [int] $_.order })) {
        # Keys are IRIs now, so this pass uses the query route too — see the note on the
        # main loop below. The item key travels as a query parameter, not a path segment.
        $compKey = $comp.id
        $compEnc = Enc $compKey
        foreach ($item in @($comp.subContent)) {
            $itemKey = $item.id
            $itemSlug = Get-Slug $item.id
            $ref     = Get-ContentIri $item.id $itemSlug
            $path    = "/api/v1/component/item?componentKey=$compEnc&itemKey=" + (Enc $itemKey)
            # Refuse to create from this mode: a 404 here means the catalogue and
            # metadata/ disagree about which items exist, which is not something a
            # single-field PATCH pass should paper over.
            if (-not $DryRun -and -not (Test-Exists $path)) {
                $script:counts.failed++
                Write-Log "FAILED  item $itemSlug is not in the catalogue — run a full push first." 'ERROR'
                continue
            }
            $r = Invoke-Kata 'PATCH' $path ([ordered]@{ hostedContentRef = $ref })
            if ($DryRun -or ($r.Code -match '^2\d\d$')) {
                $script:counts.updated++
                Write-Log ("HOSTREF item {0} -> {1} (HTTP {2})" -f $itemSlug, $ref, $r.Code)
            } else {
                $script:counts.failed++
                $snippet = ($r.Body -replace '\s+', ' ')
                if ($snippet.Length -gt 400) { $snippet = $snippet.Substring(0, 400) + '…' }
                Write-Log ("FAILED  hostedContentRef on {0} (HTTP {1}) {2}" -f $itemKey, $r.Code, $snippet) 'ERROR'
            }
        }
    }
} elseif (-not $unitOk) {
    Write-Log "Unit upsert failed — skipping components (cannot nest under a missing unit)." 'ERROR'
} else {
    # 2) Components (sorted by order), then 3) their items
    $compFiles = Get-ChildItem -Path $MetadataDir -Filter '*.json' |
        Where-Object { $_.Name -notlike '*_unit.json' }
    $comps = foreach ($f in $compFiles) {
        Get-Content -Raw -Path $f.FullName -Encoding UTF8 | ConvertFrom-Json
    }
    $comps = $comps | Sort-Object { [int] $_.order }

    # Component and item keys are full IRIs, so every route below is the query-string form
    # (/api/v1/component?componentKey=…). The plural /components/{key} routes carry the key
    # as a path segment and 404 on anything containing '/'. The unit key is still a slug
    # (v2.5 §2.7 exempts the content unit), so its routes are unchanged.
    foreach ($comp in $comps) {
        $compKey   = $comp.id
        $compSlug  = Get-Slug $comp.id      # for readable log labels only
        $compEnc   = Enc $compKey
        $compBody  = New-ComponentBody $comp
        $compPatch = Remove-Key $compBody 'uniqueKey'
        $compOk = Send-Entity -Label "component $compSlug" `
            -GetPath "/api/v1/component?componentKey=$compEnc" `
            -CreateMethod 'POST' -CreatePath "/api/v1/content-units/$unitKey/components" -CreateBody $compBody `
            -PatchPath "/api/v1/component?componentKey=$compEnc" -PatchBody $compPatch

        if (-not $compOk) {
            Write-Log "Component $compSlug failed — skipping its items." 'ERROR'
            continue
        }

        $order = 0
        foreach ($item in @($comp.subContent)) {
            $order++
            $itemKey   = $item.id
            $itemSlug  = Get-Slug $item.id
            $itemEnc   = Enc $itemKey
            $itemBody  = New-ItemBody $item $order
            $itemPatch = Remove-Key $itemBody 'uniqueKey'
            [void] (Send-Entity -Label "item $itemSlug" `
                -GetPath "/api/v1/component/item?componentKey=$compEnc&itemKey=$itemEnc" `
                -CreateMethod 'POST' -CreatePath "/api/v1/component/items?componentKey=$compEnc" -CreateBody $itemBody `
                -PatchPath "/api/v1/component/item?componentKey=$compEnc&itemKey=$itemEnc" -PatchBody $itemPatch)
        }
    }

    # 4) recommendedAfterFail — second pass, now that every component exists so
    #    forward references (e.g. part 01 -> part 02) resolve.
    $slugToIri = @{}
    foreach ($c in $comps) { $slugToIri[(Get-Slug $c.id)] = $c.id }

    foreach ($comp in $comps) {
        if (-not $comp.recommendedAfterFail) { continue }
        $compSlug = Get-Slug $comp.id
        $compEnc  = Enc $comp.id
        # A reference is a component KEY, so it must now be that component's IRI. This unit
        # stores these as bare slugs in metadata/ (other units store full IRIs), so resolve
        # either shape against the component ids rather than assuming one.
        $keys = @($comp.recommendedAfterFail | ForEach-Object {
            $s = Get-Slug ([string] $_)
            if ($slugToIri.ContainsKey($s)) { $slugToIri[$s] }
            else { Write-Log ("recommendedAfterFail on {0} names '{1}', not a component of this unit" -f $compSlug, $_) 'ERROR'; [string] $_ }
        })
        $r = Invoke-Kata 'PATCH' "/api/v1/component?componentKey=$compEnc" ([ordered]@{ recommendedAfterFail = $keys })
        if ($DryRun -or ($r.Code -match '^2\d\d$')) {
            $script:counts.updated++
            Write-Log ("LINKED  component {0} recommendedAfterFail -> [{1}] (HTTP {2})" -f $compSlug, (($keys | ForEach-Object { Get-Slug $_ }) -join ', '), $r.Code)
        } else {
            $script:counts.failed++
            $snippet = ($r.Body -replace '\s+', ' ')
            if ($snippet.Length -gt 400) { $snippet = $snippet.Substring(0, 400) + '…' }
            Write-Log ("FAILED  recommendedAfterFail on {0} (HTTP {1}) {2}" -f $compSlug, $r.Code, $snippet) 'ERROR'
        }
    }
}

Write-Log ("Done. created={0} updated={1} failed={2}" -f $script:counts.created, $script:counts.updated, $script:counts.failed)
if ($script:counts.failed -gt 0) { exit 1 }
