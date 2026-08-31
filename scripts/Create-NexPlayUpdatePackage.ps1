param(
    [string]$PayloadPath = ".\dist-updater-payload\win-unpacked",
    [string]$OutputPath = ".\dist-update-release",
    [string]$Version = "",
    [string]$BaseUrl = "",
    [string]$Notes = "NexPlay update"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
Set-Location -LiteralPath $RepoRoot

if ([string]::IsNullOrWhiteSpace($Version)) {
    $PackageJson = Get-Content -LiteralPath ".\package.json" -Raw | ConvertFrom-Json
    $BuildVersion = if ($PackageJson.build -and $PackageJson.build.buildVersion) {
        [string]$PackageJson.build.buildVersion
    } else {
        ""
    }
    $Version = if ([string]::IsNullOrWhiteSpace($BuildVersion)) {
        [string]$PackageJson.version
    } else {
        $BuildVersion
    }
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    throw "Version was not provided and could not be read from package.json."
}

$Payload = Resolve-Path -LiteralPath $PayloadPath
$Required = @(
    "NexPlay.exe",
    "chrome_100_percent.pak",
    "chrome_200_percent.pak",
    "icudtl.dat",
    "resources.pak",
    "v8_context_snapshot.bin",
    "resources\app.asar",
    "locales\en-US.pak"
)

foreach ($RelativePath in $Required) {
    $Candidate = Join-Path $Payload $RelativePath
    if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
        throw "Update payload is missing required file: $RelativePath"
    }
}

New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
$Output = Resolve-Path -LiteralPath $OutputPath
$ZipName = "NexPlay-win-x64-$Version.zip"
$ZipPath = Join-Path $Output $ZipName
$ManifestPath = Join-Path $Output "latest.json"

if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$PayloadDirectory = $Payload.ProviderPath
$ZipDestination = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ZipPath)
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $PayloadDirectory,
    $ZipDestination,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
)

$ZipItem = Get-Item -LiteralPath $ZipPath
$Sha256 = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$ResolvedBaseUrl = $BaseUrl.Trim().TrimEnd("/")
$ArtifactUrl = if ([string]::IsNullOrWhiteSpace($ResolvedBaseUrl)) {
    $ZipName
} else {
    "$ResolvedBaseUrl/$ZipName"
}

$Manifest = [ordered]@{
    version = $Version
    pubDate = (Get-Date).ToUniversalTime().ToString("o")
    notes = $Notes
    platforms = [ordered]@{
        "win-x64" = [ordered]@{
            url = $ArtifactUrl
            sha256 = $Sha256
            size = $ZipItem.Length
        }
    }
}

$ManifestJson = $Manifest | ConvertTo-Json -Depth 8
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($ManifestPath, $ManifestJson + [Environment]::NewLine, $Utf8NoBom)

Write-Host "[NexPlay] Update package created:"
Write-Host "  ZIP:      $ZipPath"
Write-Host "  Manifest: $ManifestPath"
Write-Host "  Version:  $Version"
Write-Host "  SHA-256:  $Sha256"
