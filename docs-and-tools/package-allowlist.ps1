#Requires -Version 7.0
<#
.SYNOPSIS
    THE ALLOWLIST: the single definition of what a deployment package contains.

.DESCRIPTION
    Dot-sourced by build-package.ps1 and verify-package.ps1. It is not runnable on
    its own and produces no output.

    ⚠️ This is an ALLOWLIST and must never become a denylist. docs-and-tools/ holds
    kata-api-key.txt — a live key — so a denylist with one missing entry publishes it.
    A file ships only if a rule here says it does.

    That is not hypothetical here. Every package before 2026-09-07 was cut by hand from
    a denylist written in prose inside DEPLOY.md, and the 2026-09-01 DEPLOY.md records
    that denylist being patched *after* a new root-level document appeared:
    "the packaging rules previously excluded only README.md, so the build was extended
    to exclude it". An allowlist cannot fail that way — a new file at the root simply
    does not match $RootFiles.

    ⚠️ EDIT THIS FILE AND NOTHING ELSE when what ships changes. The builder and the
    verifier both read it, which is what stops a package from being built to one
    definition and checked against another.

        build-package.ps1   — copies exactly the files Test-Ships accepts
        verify-package.ps1  — asserts the package IS exactly those files

    This file never ships: docs-and-tools/ is excluded wholesale, and *.ps1 twice over.

.NOTES
    Adapted from the methodica-math-ratio-01/-02 copy, which is byte-identical between
    those two. build-package.ps1 and verify-package.ps1 ARE byte-identical here too —
    only this file differs, and only in three places. Keep it that way.

    THE THREE DIFFERENCES FROM THE RATIO COPY, all forced by this unit's shape:

      1. $ComponentGlob is subject-locked. The ratio value 'methodica-math-*-[0-9][0-9]'
         matches nothing here, and the package would silently contain no components at all.
      2. $ComponentSubApps. Component 05 embeds a self-contained site loaded by <iframe>;
         the ratio rule allows depth >= 3 only under assets/, so it would drop all 31 of
         its files and 404 on screen 05.
      3. $ExcludeDirSegment / $ExcludeRelPaths. This unit carries source material and
         superseded files inside otherwise-shipping assets/ trees.

    This unit also has NO unit-assets/ before the 2026-09-07 hoist; the key below is
    harmless while the directory does not exist.

    It ships NO root files (rule set 28.09.26 for all 720 units; Documentation/
    reporting-and-resume/ADDING-REPORTING-AND-RESUME.md §5.2). Platforms launch every component
    by its own .../<component>/index.html link — Kata's hostedContentRef — so a unit-level entry
    point is never used, and the MOE CDN serves a folder URL as 0 bytes (a folder-style redirect
    is a blank page). The root index.html stays in the repo for local browsing only.
#>

# ── Directories that never contribute a single file, whatever is inside them ──
$ExcludeTopLevel = @('_test', 'docs-and-tools', 'metadata-from', '.git')

# ── File names that never ship, wherever they appear ──
#    ARCHITECTURE.md / PROJECT_BRIEF.md / HOWTO-720-REPORTING.md are already refused by
#    the $ComponentFiles and $RootFiles rules below; naming them is defence in depth and
#    documents the intent for whoever adds the next document.
$ExcludeNames = @('index_dev.html', 'README.md', '.gitignore', '.gitattributes', '.DS_Store',
                  'ARCHITECTURE.md', 'PROJECT_BRIEF.md', 'HOWTO-720-REPORTING.md')

# ── Extensions that never ship ──
$ExcludeExt = @('.ps1', '.log')

# ── Any path segment starting with an underscore is a SOURCE, not a deliverable. ──
$ExcludeUnderscoreSegment = $true

# ── Directory names that are source material wherever they appear, even inside assets/ ──
#    originals/ holds pre-edit copies of avatar and scene images — 12 files, 19 MB across
#    the five components, referenced by nothing. Verified by grepping every filename under
#    it against all html/js/css in the unit: zero hits. The only mention of the word
#    anywhere is a COMMENT in 03-02/script.js:177 recording where a source was kept, not a
#    code path that builds the URL.
$ExcludeDirSegment = @('originals', 'originals-backup')

# ── Individual files that look shippable and are not ─────────────────────────
#    Every one verified by grep across all html/js/css in the unit. This is safe to assert
#    because neither the sub-app nor the components build these particular names
#    dynamically: PLANE_IMAGES (plane-mass-simulation/script.js:17-24) is a static literal
#    map, and the components' preloader builds only '-come-in.mp4' / '-questioning.mp4' /
#    '-clapping-hands.mp4' — never the .png twins listed here.
#
#    ⚠️ Do NOT extend this list by eye. An asset that merely looks unused may be built at
#    runtime from a colour or a screen number; a missing image costs more than its bytes.
$ExcludeRelPaths = @(
    # Empty for this unit. The entries inherited from mass-measure-02 named files that do
    # not exist here, and per the warning above this list must never be extended by eye —
    # an asset that merely looks unused may be built at runtime from a colour or a screen
    # number. The bulk exclusion this unit actually needs is the originals/ directory,
    # handled by $ExcludeDirSegment above.
)

# ── What each shipped area contributes ──
$RootFiles = @()                         # none — the root index.html is not deployed (see .NOTES)

$UnitDirs = @{
    'metadata'    = '*.json'             # unit + per-component catalogue records
    'unit-js'     = '*.js'               # the shared layer (its README.md excluded above)
    'unit-css'    = '*.css'              # 25-report.css, the shared issue-report modal
    'unit-assets' = '*'                  # fonts/images/video shared by more than one component
}

# Inside a component folder: these files, plus everything under assets/.
$ComponentFiles = @('index.html', 'script.js', 'styles.css')
$ComponentGlob  = 'methodica-ar-science-mass-measure-03-[0-9][0-9]'

# ── Sub-apps: a self-contained site inside a component, loaded by <iframe> ───
#    A sub-app is a self-contained site inside a component, pulled in by <iframe>. It has
#    its own document, so its relative paths resolve from ITS directory rather than the
#    component's, which is why it needs its own file list. (Note style.css would be
#    SINGULAR there — the components use styles.css.)
#    This unit has no iframe sub-app. The two Hebrew-named folders in component 01 are a
#    dead React prototype of the weighing simulation — the shipped simulation is vanilla JS
#    inside script.js. Neither is referenced, and the component rule ships only assets/ plus
#    the three named files, so both are already excluded without naming them.
#    ⚠️ Component 05's weighting-application/ was NOT stray: screen 2's weighing simulation
#    loads weight-machine.png and gold-necklace.png from it, so every package built by this
#    rule shipped those two images missing (the Hebrew 19-23.09 packages lack them too).
#    Both now live in 05/assets/images/, where the component rule ships them.
$ComponentSubApps = @()
$SubAppFiles      = @('index.html', 'script.js', 'style.css')

# ── Hygiene: if any of these turn up INSIDE a package, it is unsafe to upload ──
$SecretPatterns = @('*key*', '*.ps1', '*.log', 'index_dev.html', 'README.md', '.git*', '_*')

# ── Files a package may contain that are NOT copied from the tree ──
$PackageOnlyFiles = @('DEPLOY.md')

<#
.SYNOPSIS
    Does this repo-relative path (forward slashes) belong in a deployment package?
#>
function Test-Ships([string] $rel) {
    $segs = $rel.Split('/')
    if ($rel -in $ExcludeRelPaths)                     { return $false }
    if ($segs[0] -in $ExcludeTopLevel)                 { return $false }
    if ($segs[-1] -in $ExcludeNames)                   { return $false }
    if ([IO.Path]::GetExtension($rel) -in $ExcludeExt) { return $false }
    if ($ExcludeUnderscoreSegment -and ($segs | Where-Object { $_.StartsWith('_') })) { return $false }
    if ($segs | Where-Object { $_ -in $ExcludeDirSegment }) { return $false }

    if ($segs.Count -eq 1) { return $segs[0] -in $RootFiles }

    if ($UnitDirs.ContainsKey($segs[0])) {
        $glob = $UnitDirs[$segs[0]]
        if ($glob -eq '*') { return $true }              # unit-assets/: everything, at any depth
        return ($segs.Count -eq 2 -and $segs[1] -like $glob)
    }

    if ($segs[0] -like $ComponentGlob) {
        if ($segs.Count -eq 2) { return $segs[1] -in $ComponentFiles }
        if ($segs[1] -eq 'assets') { return $true }      # assets/ at any depth
        if ($segs[1] -in $ComponentSubApps) {
            if ($segs.Count -eq 3) { return $segs[2] -in $SubAppFiles }
            return ($segs[2] -eq 'assets')               # the sub-app's own assets/, any depth
        }
        return $false
    }
    return $false
}

<#
.SYNOPSIS
    Every repo-relative path in $root that ships, sorted.
#>
function Get-ShippableFiles([string] $root) {
    Get-ChildItem -LiteralPath $root -Recurse -File -Force |
        ForEach-Object { [IO.Path]::GetRelativePath($root, $_.FullName).Replace('\', '/') } |
        Where-Object { Test-Ships $_ } |
        Sort-Object
}

<#
.SYNOPSIS
    Secret/dev files present in a package. Anything returned makes it unsafe to upload.
#>
function Get-HygieneHits([string[]] $rels) {
    $hits = @()
    foreach ($pat in $SecretPatterns) {
        $hits += @($rels | Where-Object {
            $_.Split('/')[-1] -like $pat -or ($_.Split('/') | Where-Object { $_ -like $pat })
        })
    }
    @($hits | Sort-Object -Unique | Where-Object { $_ -notin $PackageOnlyFiles })
}
