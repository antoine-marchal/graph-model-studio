param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# UTF-8 without BOM. Windows PowerShell 5.1 -Encoding utf8 writes a BOM,
# which breaks JSON.parse (e.g. vite reading package.json).
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-NoBom {
  param([string]$FullPath, [string]$Text)
  [System.IO.File]::WriteAllText($FullPath, $Text, $utf8NoBom)
}

function Set-FirstMatch {
  param([string]$Path, [string]$Pattern, [string]$Replacement)
  $full = Join-Path $root $Path
  $content = Get-Content $full -Raw
  $rx = [regex]$Pattern
  $new = $rx.Replace($content, $Replacement, 1)
  if ($new -eq $content) {
    Write-Warning "No version match changed in $Path"
  }
  Write-NoBom $full $new
}

Write-Host "Setting version to $Version ..."

# .version (plain text)
Write-NoBom (Join-Path $root '.version') "$Version`n"

# package.json
Set-FirstMatch 'package.json' '("version"\s*:\s*")[^"]*(")' "`${1}$Version`${2}"

# src-tauri\tauri.conf.json
Set-FirstMatch 'src-tauri\tauri.conf.json' '("version"\s*:\s*")[^"]*(")' "`${1}$Version`${2}"

# src-tauri\Cargo.toml
Set-FirstMatch 'src-tauri\Cargo.toml' '(?m)^(version\s*=\s*")[^"]*(")' "`${1}$Version`${2}"

Write-Host "Done. Version is now $Version."
