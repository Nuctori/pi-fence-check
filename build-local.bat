@echo off
REM Build locally-compiled grammars (no prebuilt wasm exists anywhere):
REM   sml      -> MatthewFluet/tree-sitter-sml
REM   souffle  -> langston-barrett/tree-sitter-souffle  (Souffle Datalog, .dl)
REM   prolog   -> foxyseta/tree-sitter-prolog
REM Prereqs: emsdk/ installed (emsdk install latest && emsdk activate latest),
REM tree-sitter-cli installed (npm i -D tree-sitter-cli).
REM Run from the extension root. Output: grammars/tree-sitter-<name>.wasm
setlocal
cd /d "%~dp0"
call emsdk\emsdk_env.bat >nul 2>&1

call :build sml    https://github.com/MatthewFluet/tree-sitter-sml.git        || goto :err
call :build souffle https://github.com/langston-barrett/tree-sitter-souffle.git || goto :err
call :build prolog https://github.com/foxyseta/tree-sitter-prolog.git        || goto :err
echo OK: grammars\tree-sitter-{sml,souffle,prolog}.wasm
exit /b 0

:build
set NAME=%~1
set URL=%~2
if not exist third_party\tree-sitter-%NAME% (
  echo === cloning %NAME% ===
  git clone --depth 1 %URL% third_party\tree-sitter-%NAME% || exit /b 1
)
echo === building %NAME% ===
pushd third_party\tree-sitter-%NAME%
call npx tree-sitter build --wasm || (popd & exit /b 1)
if not exist tree-sitter-%NAME%.wasm (
  for /f "delims=" %%f in ('dir /b /s *.wasm 2^>nul') do set WASMF=%%f
) else (
  set WASMF=tree-sitter-%NAME%.wasm
)
copy /y "%WASMF%" ..\..\grammars\tree-sitter-%NAME%.wasm >nul || (popd & exit /b 1)
popd
exit /b 0

:err
echo BUILD FAILED
exit /b 1
