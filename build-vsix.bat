@echo off
REM ==========================================================================
REM  build-vsix.bat  -  build the Graph Model Studio VS Code extension
REM
REM  The extension imports parser, model, notation, layout, renderer, nodes,
REM  edges, store, and styles directly from ..\src during bundling.
REM
REM  Output: vscode-extension\dist\graph-model-studio-<version>.vsix
REM ==========================================================================
setlocal
set "ROOT=%~dp0"
set /p "VERSION="<"%ROOT%.version"
cd /d "%ROOT%"

echo === Installing Graph Model Studio dependencies ===
call pnpm install
if errorlevel 1 ( echo Root pnpm install failed & exit /b 1 )

echo === Installing VS Code extension build tools ===
pushd vscode-extension
REM Build scripts are not needed here: esbuild ships a platform package and
REM VSCE signing/keytar are not used for an unsigned local VSIX. This also keeps
REM pnpm 11 from requiring an interactive approve-builds step.
REM --force repairs node_modules when npm was run in this pnpm-managed folder.
call pnpm install --force --ignore-workspace --ignore-scripts
if errorlevel 1 ( popd & echo Extension pnpm install failed & exit /b 1 )
popd

echo === Syncing extension version and assets ===
node "vscode-extension\sync-from-root.mjs"
if errorlevel 1 ( echo Extension sync failed & exit /b 1 )

echo === Rebuilding extension sources and webviews ===
pushd vscode-extension
call pnpm run build:source
if errorlevel 1 ( popd & echo VSIX source build failed & exit /b 1 )

echo === Packaging VSIX ===
call pnpm run package
if errorlevel 1 ( popd & echo VSIX build failed & exit /b 1 )
popd

echo.
echo === Build complete ===
echo VSIX: vscode-extension\dist\graph-model-studio-%VERSION%.vsix
endlocal
