@echo off
REM ==========================================================================
REM  build-exe.bat  -  build the Graph Model Studio Windows executable
REM
REM  Produces a standalone .exe and an NSIS installer via Tauri.
REM  Output:
REM    src-tauri\target\release\Graph Model Studio.exe        (raw exe)
REM    src-tauri\target\release\bundle\nsis\*-setup.exe       (installer)
REM ==========================================================================
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo === Reading version ===
set /p VERSION=<.version
echo Building Graph Model Studio v%VERSION%

echo === Installing JS dependencies ===
call pnpm install
if errorlevel 1 ( echo pnpm install failed & exit /b 1 )

echo === Generating app icons from favicon.ico ===
call pnpm tauri icon favicon.ico
if errorlevel 1 ( echo icon generation failed - continuing with existing icons )

echo === Building Tauri release bundle ===
call pnpm tauri build
if errorlevel 1 ( echo tauri build failed & exit /b 1 )

echo.
echo === Build complete ===
echo Raw exe   : src-tauri\target\release\Graph Model Studio.exe
echo Installer : src-tauri\target\release\bundle\nsis\
dir /b "src-tauri\target\release\bundle\nsis" 2>nul
endlocal
