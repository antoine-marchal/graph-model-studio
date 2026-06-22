@echo off
REM ==========================================================================
REM  set-version.bat  -  set the Graph Model Studio version in every manifest
REM
REM  Usage:  set-version.bat 2.1.0
REM
REM  Updates: .version, package.json, src-tauri\tauri.conf.json,
REM           src-tauri\Cargo.toml
REM ==========================================================================
setlocal

if "%~1"=="" (
  echo ERROR: no version supplied.
  echo Usage: set-version.bat ^<major.minor.patch^>
  exit /b 1
)

set "VERSION=%~1"
set "ROOT=%~dp0"

echo Setting version to %VERSION% ...

REM --- .version (plain text) ------------------------------------------------
> "%ROOT%.version" echo %VERSION%

REM --- package.json ---------------------------------------------------------
powershell -NoProfile -Command ^
  "$p = Join-Path '%ROOT%' 'package.json';" ^
  "$c = Get-Content $p -Raw;" ^
  "$c = $c -replace '(\"version\"\s*:\s*\")[^\"]*(\")', ('${1}%VERSION%${2}'), 1;" ^
  "Set-Content $p $c -NoNewline -Encoding utf8"

REM --- src-tauri\tauri.conf.json --------------------------------------------
powershell -NoProfile -Command ^
  "$p = Join-Path '%ROOT%' 'src-tauri\tauri.conf.json';" ^
  "$c = Get-Content $p -Raw;" ^
  "$c = $c -replace '(\"version\"\s*:\s*\")[^\"]*(\")', ('${1}%VERSION%${2}'), 1;" ^
  "Set-Content $p $c -NoNewline -Encoding utf8"

REM --- src-tauri\Cargo.toml -------------------------------------------------
powershell -NoProfile -Command ^
  "$p = Join-Path '%ROOT%' 'src-tauri\Cargo.toml';" ^
  "$c = Get-Content $p -Raw;" ^
  "$c = $c -replace '(?m)^(version\s*=\s*\")[^\"]*(\")', ('${1}%VERSION%${2}');" ^
  "Set-Content $p $c -NoNewline -Encoding utf8"

echo Done. Version is now %VERSION%.
endlocal
