@echo off
setlocal enabledelayedexpansion

echo 🔍 Diagnosing Production Server Issues
echo =====================================
echo.

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo Current directory: %CD%
echo.

REM Check basic requirements
echo Step 1: Checking basic requirements...
if exist package.json (
    echo ✅ package.json found
) else (
    echo ❌ package.json not found
    pause
    exit /b 1
)

if exist .next (
    echo ✅ .next build directory found
) else (
    echo ❌ .next build directory not found
    echo You need to run 'npm run build' first
    pause
    exit /b 1
)

if exist node_modules (
    echo ✅ node_modules found
) else (
    echo ❌ node_modules not found
    echo Run 'npm install' first
    pause
    exit /b 1
)

if exist .env.local (
    echo ✅ .env.local found
) else (
    echo ⚠️  .env.local not found - this may cause issues
)
echo.

REM Check if port 3000 is already in use
echo Step 2: Checking if port 3000 is in use...
netstat -an | find "3000" >nul
if !ERRORLEVEL! EQU 0 (
    echo ⚠️  Port 3000 is already in use
    echo Showing processes using port 3000:
    netstat -ano | find "3000"
    echo.
    echo You may need to:
    echo 1. Close other applications using port 3000
    echo 2. Kill Node.js processes: taskkill /f /im node.exe
    echo 3. Try a different port: npm start -- --port 3001
    echo.
) else (
    echo ✅ Port 3000 is available
)
echo.

REM Check Node.js and npm
echo Step 3: Checking Node.js and npm...
node --version >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    for /f %%i in ('node --version') do echo ✅ Node.js: %%i
) else (
    echo ❌ Node.js not found
    pause
    exit /b 1
)

npm --version >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    for /f %%i in ('npm --version') do echo ✅ npm: %%i
) else (
    echo ❌ npm not found
    pause
    exit /b 1
)
echo.

REM Try to start the server with verbose output
echo Step 4: Attempting to start production server...
echo This will show detailed error messages if it fails
echo Press Ctrl+C to stop if it hangs
echo.

npm start

echo.
echo If the server failed to start, the error messages above should help identify the issue.
pause

endlocal