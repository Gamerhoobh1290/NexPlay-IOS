param(
    [switch]$Silent,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-PropValue {
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (-not $InputObject) {
        return $null
    }

    $prop = $InputObject.PSObject.Properties[$Name]
    if (-not $prop) {
        return $null
    }

    return $prop.Value
}

function Get-NexPlayUninstallEntry {
    $registryPaths = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    $entries = foreach ($path in $registryPaths) {
        Get-ItemProperty -Path $path -ErrorAction SilentlyContinue | Where-Object {
            $displayName = [string](Get-PropValue -InputObject $_ -Name "DisplayName")
            $displayName -and ($displayName -eq "NexPlay" -or $displayName -like "NexPlay*")
        }
    }

    if (-not $entries) {
        return $null
    }

    return $entries |
        Sort-Object -Property @{ Expression = {
            $raw = [string](Get-PropValue -InputObject $_ -Name "DisplayVersion")
            if (-not $raw) { return [version]"0.0.0.0" }
            $clean = [regex]::Replace($raw, "[^0-9\.]", "")
            if (-not $clean) { return [version]"0.0.0.0" }
            try { [version]$clean } catch { [version]"0.0.0.0" }
        }} -Descending |
        Select-Object -First 1
}

function Parse-CommandLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandLine
    )

    $trimmed = $CommandLine.Trim()
    if (-not $trimmed) {
        throw "Uninstall command is empty."
    }

    if ($trimmed -match '^\s*"(?<exe>[^"]+)"\s*(?<args>.*)$') {
        return @{
            FilePath = $matches.exe
            Arguments = $matches.args.Trim()
        }
    }

    if ($trimmed -match '^\s*(?<exe>\S+)\s*(?<args>.*)$') {
        return @{
            FilePath = $matches.exe
            Arguments = $matches.args.Trim()
        }
    }

    throw "Could not parse uninstall command: $CommandLine"
}

try {
    $entry = Get-NexPlayUninstallEntry
    if (-not $entry) {
        Write-Host "NexPlay uninstall entry was not found on this PC." -ForegroundColor Yellow
        Write-Host "If NexPlay is portable, just delete its folder/exe."
        exit 2
    }

    $quietCommand = [string](Get-PropValue -InputObject $entry -Name "QuietUninstallString")
    $normalCommand = [string](Get-PropValue -InputObject $entry -Name "UninstallString")

    $commandText = if ($Silent -and $quietCommand) {
        $quietCommand
    } else {
        $normalCommand
    }

    if (-not $commandText) {
        throw "NexPlay uninstall command was not found in registry."
    }

    $parsed = Parse-CommandLine -CommandLine $commandText
    $filePath = [string]$parsed.FilePath
    $arguments = [string]$parsed.Arguments

    if ($Silent -and -not $quietCommand -and $filePath -match '(?i)uninstall.*\.exe$' -and $arguments -notmatch '(?i)(^|\s)(/S|/quiet|/qn)\b') {
        $arguments = ($arguments + " /S").Trim()
    }

    if ($DryRun) {
        Write-Host "DryRun: would execute uninstaller command below:"
        Write-Host "$filePath $arguments"
        exit 0
    }

    Write-Host "Starting NexPlay uninstaller..."
    if ($arguments) {
        Start-Process -FilePath $filePath -ArgumentList $arguments -Wait
    } else {
        Start-Process -FilePath $filePath -Wait
    }
    Write-Host "NexPlay uninstall command finished."
    exit 0
} catch {
    Write-Host ("Uninstall failed: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
