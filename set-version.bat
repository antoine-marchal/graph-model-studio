@echo off
REM ==========================================================================
REM  set-version.bat  -  set the Graph Model Studio version in every manifest
REM
REM  Usage:  set-version.bat 2.1.0
REM
REM  Updates: .version, package.json, src-tauri\tauri.conf.json,
REM           src-tauri\Cargo.toml
REM
REM  Real work lives in set-version.ps1 (avoids cmd quote-escaping issues).
REM ==========================================================================
setlocal

if "%~1"=="" (
  echo ERROR: no version supplied.
  echo Usage: set-version.bat ^<major.minor.patch^>
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-version.ps1" %~1
exit /b %ERRORLEVEL%
