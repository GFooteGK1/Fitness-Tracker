@echo off
setlocal enabledelayedexpansion

echo 🚀 Starting SociusFit Production Server
echo ======================================
echo.

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Check if we're in the right directory
if not exist package.json (
    echo ❌ Error: package.json not found
    echo Make sure you're in the project root directory
    pause
    exit /b 1
)

REM Check if build exists
if not exist .next (
    echo ❌ Error: No production build found
    echo Run 'npm run build' first
    pause
    exit /b 1
)

echo ✅ Found production build
echo Starting server on http://localhost:3000
echo.
echo 🧪 TESTING CHECKLIST:
echo =====================
echo 1. Weight input in onboarding (CRITICAL!)
echo 2. Weight editing in profile (CRITICAL!)
echo 3. Sign up / Sign in flow
echo 4. Dashboard access
echo 5. Mobile responsiveness
echo.
echo Press Ctrl+C to stop the server
echo.

npm start

endlocal