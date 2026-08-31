param(
    [string]$ReleasePath = ".\dist-update-release",
    [string]$UpdaterPath = ".\dist\NexPlay Updater.exe",
    [string]$OutputRoot = ".\dist-windows-updater",
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).ProviderPath
Set-Location -LiteralPath $RepoRoot

function Resolve-FullPath([string]$PathValue) {
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PathValue)
}

function Test-PathWithin([string]$Candidate, [string]$Root) {
    $CandidateFull = [IO.Path]::GetFullPath($Candidate).TrimEnd('\', '/')
    $RootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    return $CandidateFull.StartsWith($RootFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparsePath([string]$PathValue, [string]$Label) {
    $Current = [IO.Path]::GetFullPath($PathValue).TrimEnd('\', '/')
    while (-not [string]::IsNullOrWhiteSpace($Current)) {
        if (Test-Path -LiteralPath $Current) {
            $Item = Get-Item -LiteralPath $Current -Force
            if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "$Label cannot pass through a junction, symbolic link, or other reparse point: $Current"
            }
        }

        $Parent = [IO.Path]::GetDirectoryName($Current)
        if ([string]::IsNullOrWhiteSpace($Parent) -or $Parent -eq $Current) {
            break
        }
        $Current = $Parent.TrimEnd('\', '/')
    }
}

function Assert-NoReparseTree([string]$RootPath, [string]$Label) {
    Assert-NoReparsePath $RootPath $Label
    if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) {
        return
    }

    $Pending = New-Object 'System.Collections.Generic.Stack[string]'
    $Pending.Push([IO.Path]::GetFullPath($RootPath))
    while ($Pending.Count -gt 0) {
        $Directory = $Pending.Pop()
        foreach ($Entry in [IO.Directory]::EnumerateFileSystemEntries($Directory)) {
            $Attributes = [IO.File]::GetAttributes($Entry)
            if (($Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "$Label cannot contain a junction, symbolic link, or other reparse point: $Entry"
            }
            if (($Attributes -band [IO.FileAttributes]::Directory) -ne 0) {
                $Pending.Push($Entry)
            }
        }
    }
}

$Release = (Resolve-Path -LiteralPath $ReleasePath).ProviderPath
Assert-NoReparsePath $Release "The release directory"
$ManifestPath = Join-Path $Release "latest.json"
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "The update release manifest was not found: $ManifestPath"
}
Assert-NoReparsePath $ManifestPath "The release manifest"

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$ManifestVersion = [string]$Manifest.version
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = $ManifestVersion
}
if ([string]::IsNullOrWhiteSpace($Version) -or $Version -ne $ManifestVersion) {
    throw "Bundle version '$Version' does not match manifest version '$ManifestVersion'."
}

$Artifact = $null
if ($Manifest.platforms -and $Manifest.platforms.'win-x64') {
    $Artifact = $Manifest.platforms.'win-x64'
} else {
    $Artifact = $Manifest
}
$ArtifactUrl = [string]$Artifact.url
if ([string]::IsNullOrWhiteSpace($ArtifactUrl)) {
    throw "The update manifest does not contain a win-x64 artifact URL."
}
if ([Uri]::IsWellFormedUriString($ArtifactUrl, [UriKind]::Absolute)) {
    throw "The offline updater bundle requires a local release artifact, not an absolute URL."
}

$ArtifactPath = [IO.Path]::GetFullPath((Join-Path $Release $ArtifactUrl))
if (-not (Test-PathWithin $ArtifactPath $Release)) {
    throw "The manifest artifact must remain inside the release directory."
}
if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
    throw "The update artifact was not found: $ArtifactPath"
}
Assert-NoReparsePath $ArtifactPath "The release artifact"

$ExpectedSize = [long]$Artifact.size
$ActualSize = (Get-Item -LiteralPath $ArtifactPath).Length
if ($ExpectedSize -le 0 -or $ExpectedSize -ne $ActualSize) {
    throw "The update artifact size does not match latest.json. Expected $ExpectedSize, got $ActualSize."
}
$ExpectedSha256 = ([string]$Artifact.sha256).Trim().ToLowerInvariant()
$ActualSha256 = (Get-FileHash -LiteralPath $ArtifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ExpectedSha256.Length -ne 64 -or $ExpectedSha256 -ne $ActualSha256) {
    throw "The update artifact SHA-256 does not match latest.json."
}

$Updater = (Resolve-Path -LiteralPath $UpdaterPath).ProviderPath
if (-not (Test-Path -LiteralPath $Updater -PathType Leaf)) {
    throw "The updater executable was not found: $UpdaterPath"
}
Assert-NoReparsePath $Updater "The updater executable"

$Output = Resolve-FullPath $OutputRoot
if (-not (Test-PathWithin $Output $RepoRoot)) {
    throw "The updater bundle output must be a child of the repository root."
}
Assert-NoReparsePath $Output "The updater bundle output"
New-Item -ItemType Directory -Path $Output -Force | Out-Null
Assert-NoReparsePath $Output "The updater bundle output"

$BundleName = "NexPlay-Windows-Updater-$Version"
$BundleDirectory = Join-Path $Output $BundleName
if (-not (Test-PathWithin $BundleDirectory $Output)) {
    throw "Refusing to create an updater bundle outside the output root."
}
if (Test-Path -LiteralPath $BundleDirectory) {
    Assert-NoReparseTree $BundleDirectory "The existing updater bundle"
    Remove-Item -LiteralPath $BundleDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $BundleDirectory -Force | Out-Null
Assert-NoReparsePath $BundleDirectory "The updater bundle directory"

Copy-Item -LiteralPath $Updater -Destination (Join-Path $BundleDirectory "NexPlay Updater.exe") -Force
Copy-Item -LiteralPath $ManifestPath -Destination (Join-Path $BundleDirectory "latest.json") -Force
$ArtifactRelativePath = $ArtifactUrl.Replace('/', [IO.Path]::DirectorySeparatorChar)
$BundleArtifactPath = [IO.Path]::GetFullPath((Join-Path $BundleDirectory $ArtifactRelativePath))
if (-not (Test-PathWithin $BundleArtifactPath $BundleDirectory)) {
    throw "Refusing to place the release artifact outside the updater bundle."
}
$BundleArtifactDirectory = [IO.Path]::GetDirectoryName($BundleArtifactPath)
Assert-NoReparsePath $BundleArtifactDirectory "The bundled artifact directory"
New-Item -ItemType Directory -Path $BundleArtifactDirectory -Force | Out-Null
Assert-NoReparsePath $BundleArtifactDirectory "The bundled artifact directory"
Copy-Item -LiteralPath $ArtifactPath -Destination $BundleArtifactPath -Force

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$ConfigJson = [ordered]@{ manifestUrl = "latest.json" } | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText((Join-Path $BundleDirectory "nexplay-updater.json"), $ConfigJson + [Environment]::NewLine, $Utf8NoBom)

$Launcher = @'
@echo off
setlocal
cd /d "%~dp0"
"%~dp0NexPlay Updater.exe"
exit /b %ERRORLEVEL%
'@
[IO.File]::WriteAllText((Join-Path $BundleDirectory "Install NexPlay Update.cmd"), $Launcher + [Environment]::NewLine, [Text.Encoding]::ASCII)

$Readme = @"
NexPlay Windows Update $Version

1. Extract the complete updater ZIP before running it.
2. Keep all files in this folder together.
3. Double-click "Install NexPlay Update.cmd".
4. Review the update details and allow Windows elevation if requested.
5. The updater verifies the payload SHA-256, closes NexPlay, installs the update, validates the result, and can relaunch the app.

The updater targets the installed NexPlay desktop app and does not update NexPlay Offline.

This local package is unsigned. Windows may show an Unknown publisher warning.
Do not use the package if latest.json or the payload ZIP has been replaced.
"@
[IO.File]::WriteAllText((Join-Path $BundleDirectory "README.txt"), $Readme, $Utf8NoBom)

$BundleArchivePath = Join-Path $Output "$BundleName.zip"
if (Test-Path -LiteralPath $BundleArchivePath) {
    Assert-NoReparsePath $BundleArchivePath "The existing updater archive"
    Remove-Item -LiteralPath $BundleArchivePath -Force
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $BundleDirectory,
    $BundleArchivePath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
)

$BundleArchive = Get-Item -LiteralPath $BundleArchivePath
$BundleSha256 = (Get-FileHash -LiteralPath $BundleArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
$BundleShaPath = "$BundleArchivePath.sha256"
if (Test-Path -LiteralPath $BundleShaPath) {
    Assert-NoReparsePath $BundleShaPath "The existing updater checksum"
}
[IO.File]::WriteAllText($BundleShaPath, "$BundleSha256  $($BundleArchive.Name)`n", [Text.Encoding]::ASCII)

Write-Host "[NexPlay] Windows updater bundle created:"
Write-Host "  Folder:   $BundleDirectory"
Write-Host "  ZIP:      $BundleArchivePath"
Write-Host "  Version:  $Version"
Write-Host "  SHA-256:  $BundleSha256"
