@echo off
setlocal
if "%~1"=="" (
  start "" "%~dp0Plain.html"
  exit /b 0
)
where node >nul 2>nul
if not errorlevel 1 goto system_node
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" goto bundled_node
echo Plain terminal tools need Node.js 18 or newer. The Studio works without it.
exit /b 1
:system_node
node "%~dp0plain.cjs" %*
exit /b %errorlevel%
:bundled_node
"%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "%~dp0plain.cjs" %*
exit /b %errorlevel%
