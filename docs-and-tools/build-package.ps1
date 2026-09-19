#Requires -Version 7.0
<#
.SYNOPSIS
    Cut a deployment package from the working tree, using the shared allowlist.

.DESCRIPTION
    Copies exactly the files package-allowlist.ps1 accepts into a dated folder under
    ../../deployments/, then verifies its own output before reporting success.

    ⚠️ ALLOWLIST, NEVER DENYLIST. docs-and-tools/ holds kata-api-key.txt, so a
    denylist with one missing entry publishes a live API key. The rules live in
    package-allowlist.ps1, which verify-package.ps1 also reads — that shared file is
    what stops a package being built to one definition and checked against another.

    The build refuses to run when:
      • the working tree is dirty      (the package could not be reproduced from a commit)
      • the target folder already exists and is not empty  (use -Force, see below)

    After copying it re-reads what it wrote and asserts, against the tree: every file
    byte-identical (MD5), nothing missing, nothing extra, no secret or dev file. A
    build that cannot verify itself exits non-zero and says so.

    Runtime: PowerShell 7+. No network.

.PARAMETER OutDir
    Where to write. Default: ../../deployments/<today, yyyy-MM-dd>.

.PARAMETER Force
    ⚠️ DESTRUCTIVE. Delete the target folder and rebuild it. A package is not in git —
    deployments/ sits outside the repo — so an overwritten package is GONE. Use only
    when re-cutting a package that has not been uploaded, and say so in its DEPLOY.md.

.PARAMETER DryRun
    List what would be copied and stop. Writes nothing. No -Force needed.

.PARAMETER AllowDirty
    Build from a dirty working tree. The result cannot be reproduced from any commit,
    so verify-package.ps1's COMMIT check will fail against it. For experiments only.

.PARAMETER NoDeployStub
    Do not write a draft DEPLOY.md when the target has none.

.PARAMETER DiscardPackageDocs
    ⚠️ With -Force, destroy the existing DEPLOY.md instead of carrying it across.
    DEPLOY.md is written by hand and is NOT in git, so this cannot be undone. The
    default is to preserve it: it is the one file in a package that cannot be rebuilt
    from the tree.

.PARAMETER RepoRoot
    The tree to build from. Default: one level up from this script's docs-and-tools/ home.

.EXAMPLE
    pwsh -File docs-and-tools/build-package.ps1 -DryRun
    See exactly what would ship, and what would not.

.EXAMPLE
    pwsh -File docs-and-tools/build-package.ps1
    Cut today's package.

.EXAMPLE
    pwsh -File docs-and-tools/build-package.ps1 -OutDir ../../deployments/2026-09-07 -Force
    Re-cut an existing package in place, discarding what is there.

.OUTPUTS
    Exit code 0 if the package was written AND verified, 1 otherwise.
#>
[CmdletBinding()]
param(
    [string] $OutDir,
    [switch] $Force,
    [switch] $DryRun,
    [switch] $AllowDirty,
    [switch] $NoDeployStub,
    [switch] $DiscardPackageDocs,
    [string] $RepoRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'package-allowlist.ps1')

if (-not $RepoRoot) { $RepoRoot = Join-Path $PSScriptRoot '..' }
if (-not (Test-Path -LiteralPath $RepoRoot)) { throw "Repo root not found: $RepoRoot" }
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path

if (-not $OutDir) {
    $OutDir = Join-Path $RepoRoot '..' '..' 'deployments' (Get-Date -Format 'yyyy-MM-dd')
}
# Normalise without requiring existence.
$OutDir = [IO.Path]::GetFullPath($OutDir)

$sep = '-' * 72
Write-Host $sep
Write-Host 'build-package'
Write-Host "  tree   : $RepoRoot"
Write-Host "  out    : $OutDir"

# ── provenance ────────────────────────────────────────────────────────────────
Push-Location $RepoRoot
try {
    $head   = (git rev-parse --short HEAD 2>$null)
    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    $dirty  = @(git status --porcelain 2>$null)
} finally { Pop-Location }
Write-Host "  commit : $head on $branch, $($dirty.Count) uncommitted change(s)"
Write-Host $sep

if ($dirty.Count -gt 0 -and -not $AllowDirty -and -not $DryRun) {
    Write-Host 'REFUSING: the working tree is dirty.' -ForegroundColor Red
    Write-Host '  A package must be reproducible from a commit, and DEPLOY.md names one.'
    Write-Host '  Commit first, or pass -AllowDirty for an experiment.'
    $dirty | Select-Object -First 10 | ForEach-Object { Write-Host "    $_" }
    exit 1
}

# ── what ships ────────────────────────────────────────────────────────────────
$ship = @(Get-ShippableFiles $RepoRoot)
if ($ship.Count -eq 0) { Write-Host 'REFUSING: the allowlist matched no files.' -ForegroundColor Red; exit 1 }

$bytes = ($ship | ForEach-Object {
    (Get-Item -LiteralPath (Join-Path $RepoRoot ($_ -replace '/', [IO.Path]::DirectorySeparatorChar))).Length
} | Measure-Object -Sum).Sum
Write-Host ("  {0} file(s), {1:N0} bytes" -f $ship.Count, $bytes)

if ($DryRun) {
    Write-Host $sep
    $ship | ForEach-Object { Write-Host "  + $_" }
    # The excluded set is the more interesting half of a dry run: it is where a
    # secret would hide if a rule were wrong.
    $all = Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Force |
        ForEach-Object { [IO.Path]::GetRelativePath($RepoRoot, $_.FullName).Replace('\', '/') }
    $skipped = @($all | Where-Object { $_ -notin $ship -and $_ -notlike '.git/*' })
    Write-Host $sep
    Write-Host ("  {0} file(s) deliberately NOT packaged:" -f $skipped.Count)
    $skipped | Sort-Object | ForEach-Object { Write-Host "  - $_" }
    Write-Host $sep
    Write-Host 'DRY RUN — nothing written.'
    exit 0
}

# ── target ────────────────────────────────────────────────────────────────────
if (Test-Path -LiteralPath $OutDir) {
    $existing = @(Get-ChildItem -LiteralPath $OutDir -Recurse -File -Force)
    if ($existing.Count -gt 0) {
        if (-not $Force) {
            Write-Host "REFUSING: $OutDir already holds $($existing.Count) file(s)." -ForegroundColor Red
            Write-Host '  deployments/ is OUTSIDE the git repo, so overwriting is not recoverable.'
            Write-Host '  Pass -Force to re-cut it in place, and record the re-cut in its DEPLOY.md.'
            exit 1
        }
        # DEPLOY.md is the ONE file in a package that cannot be rebuilt from the tree:
        # it is written by hand, it is not in git, and deployments/ is outside the repo.
        # A -Force re-cut carries it across rather than destroying it.
        $preserved = @{}
        if (-not $DiscardPackageDocs) {
            foreach ($n in $PackageOnlyFiles) {
                $p = Join-Path $OutDir $n
                if (Test-Path -LiteralPath $p) { $preserved[$n] = [IO.File]::ReadAllBytes($p) }
            }
        }
        Write-Host ("  -Force: deleting {0} existing file(s)" -f $existing.Count) -ForegroundColor Yellow
        Remove-Item -LiteralPath $OutDir -Recurse -Force
        New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
        foreach ($n in $preserved.Keys) {
            [IO.File]::WriteAllBytes((Join-Path $OutDir $n), $preserved[$n])
            Write-Host ("  preserved {0} across the re-cut ({1:N0} bytes)" -f $n, $preserved[$n].Length)
        }
        if ($DiscardPackageDocs) {
            Write-Host '  -DiscardPackageDocs: the existing DEPLOY.md was destroyed' -ForegroundColor Yellow
        }
    }
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# ── copy ──────────────────────────────────────────────────────────────────────
foreach ($rel in $ship) {
    $src = Join-Path $RepoRoot ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    $dst = Join-Path $OutDir  ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    $dir = Split-Path -Parent $dst
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dst -Force
}
Write-Host ("  copied {0} file(s)" -f $ship.Count)

# ── DEPLOY.md ─────────────────────────────────────────────────────────────────
# verify-package.ps1 reads the build commit out of DEPLOY.md, so a package without
# one cannot have its provenance checked. Write a draft rather than leave none.
$deploy = Join-Path $OutDir 'DEPLOY.md'
if (-not $NoDeployStub -and -not (Test-Path -LiteralPath $deploy)) {
    $unit = Split-Path -Leaf $RepoRoot
    @"
# Deployment — ``$unit``, $(Get-Date -Format 'yyyy-MM-dd')

> ## ⚠️ DRAFT — written by build-package.ps1, NOT yet a deployment record
> Replace this file before handing the package on. It must say what changed, what was
> verified, what is still outstanding, and where to upload. A package whose DEPLOY.md
> still carries this banner has not been reviewed by anyone.

Built against the working tree at commit **``$head``** on branch **``$branch``**,
working tree clean. $($ship.Count) content files, $('{0:N0}' -f $bytes) bytes.

Built from the allowlist in ``docs-and-tools/package-allowlist.ps1`` and verified by
``docs-and-tools/verify-package.ps1``: every file byte-identical to the tree, nothing
missing, nothing extra, no secret or development file.

⚠️ Do not remove the ``commit **``$head``**`` reference above — ``verify-package.ps1``
reads it to tell a current package from a stale one.

## Deploy target

    TODO — the unit folder on the CDN

⚠️ This CDN answers HTTP 200 with Content-Length: 0 for paths that do not exist.
**Verify any upload by byte size, not by status.**

## Still outstanding

    TODO — carry forward the open items from the previous package's DEPLOY.md
"@ | Set-Content -LiteralPath $deploy -Encoding utf8
    Write-Host '  wrote a DRAFT DEPLOY.md (replace it before handing the package on)' -ForegroundColor Yellow
}

# ── verify what was just written ──────────────────────────────────────────────
Write-Host $sep
$problems = [System.Collections.Generic.List[string]]::new()

$pkgAll   = @(Get-ChildItem -LiteralPath $OutDir -Recurse -File -Force |
              ForEach-Object { [IO.Path]::GetRelativePath($OutDir, $_.FullName).Replace('\', '/') })
$pkgFiles = @($pkgAll | Where-Object { $_ -notin $PackageOnlyFiles })

foreach ($e in @($pkgFiles | Where-Object { $_ -notin $ship }))  { $problems.Add("EXTRA   : $e") }
foreach ($m in @($ship     | Where-Object { $_ -notin $pkgFiles })) { $problems.Add("MISSING : $m") }

foreach ($rel in @($pkgFiles | Where-Object { $_ -in $ship })) {
    $a = (Get-FileHash -LiteralPath (Join-Path $OutDir  ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)) -Algorithm MD5).Hash
    $b = (Get-FileHash -LiteralPath (Join-Path $RepoRoot ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)) -Algorithm MD5).Hash
    if ($a -ne $b) { $problems.Add("DRIFTED : $rel") }
}

# @() matters: a function whose pipeline yields nothing unrolls to $null, and
# $null.Count throws under StrictMode. Wrap the CALL, not the variable.
$hits = @(Get-HygieneHits $pkgAll)
foreach ($h in $hits) { $problems.Add("SECRET/DEV FILE IN PACKAGE : $h") }

Write-Host ("  [{0}] self-check  {1} file(s), {2} problem(s), {3} secret/dev hit(s)" -f
    $(if ($problems.Count -eq 0) { 'PASS' } else { 'FAIL' }), $pkgFiles.Count, $problems.Count, $hits.Count)
Write-Host $sep

if ($problems.Count -gt 0) {
    Write-Host 'BUILD FAILED ITS OWN VERIFICATION — do not upload this package.' -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  $_" }
    exit 1
}

Write-Host ("PACKAGE BUILT: {0} file(s), {1:N0} bytes, from {2}" -f $ship.Count, $bytes, $head) -ForegroundColor Green
Write-Host "  $OutDir"
Write-Host '  Next: write DEPLOY.md, then re-check with docs-and-tools/verify-package.ps1'
exit 0
