@echo off
setlocal enabledelayedexpansion

echo 🏗️ SociusFit Production Build Test (Fixed)
echo ==========================================
echo.

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"
echo Script location: %SCRIPT_DIR%

REM Change to the script directory (where package.json should be)
cd /d "%SCRIPT_DIR%"
echo Changed to: %CD%
echo.

REM Check if we're in the right directory now
if not exist package.json (
    echo ❌ Error: package.json still not found
    echo Script directory: %SCRIPT_DIR%
    echo Current directory: %CD%
    echo.
    echo Please make sure this batch file is in the same folder as package.json
    echo Expected location: C:\Users\foote\Downloads\All Fitness Tracker Files\fitness-tracker\
    pause
    exit /b 1
)

echo ✅ Found package.json - starting build test
echo Project directory: %CD%
echo.

REM Step 1: Stop development server if running
echo Step 1: Stopping any running development servers...
taskkill /f /im node.exe >nul 2>&1
echo ✅ Development servers stopped
echo.

REM Step 2: Clean previous builds
echo Step 2: Cleaning previous builds...
if exist .next (
    rmdir /s /q .next >nul 2>&1
    if exist .next (
        echo ⚠️  Could not completely remove .next directory
        echo Some files may be locked - continuing anyway
    ) else (
        echo ✅ Cleaned .next directory
    )
) else (
    echo ℹ️  No previous build found
)
echo.

REM Step 3: Verify environment
echo Step 3: Verifying environment...
if exist .env.local (
    echo ✅ Environment file found
) else (
    echo ⚠️  .env.local not found - this may cause issues
)

if exist node_modules (
    echo ✅ Dependencies installed
) else (
    echo ❌ node_modules not found - run npm install first
    pause
    exit /b 1
)
echo.

REM Step 4: Run production build
echo Step 4: Running production build...
echo This may take 1-3 minutes...
echo Building in: %CD%
echo.

npm run build

set BUILD_RESULT=!ERRORLEVEL!
echo.

if !BUILD_RESULT! EQU 0 (
    echo ✅ Build completed successfully!
    echo.
    
    REM Check build output
    if exist .next (
        echo ✅ Build output directory created
        echo.
        echo Build contents:
        dir .next /b
        echo.
    ) else (
        echo ❌ Build output directory not found
        pause
        exit /b 1
    )
    
    echo Step 5: Starting production server...
    echo The server will start on http://localhost:3000
    echo.
    echo 🧪 TESTING CHECKLIST:
    echo =====================
    echo 1. ✅ Sign up / Sign in
    echo 2. ✅ Onboarding flow (especially weight input!)
    echo 3. ✅ Profile weight editing
    echo 4. ✅ Dashboard access
    echo 5. ✅ Mobile responsiveness (F12 → device toolbar)
    echo 6. ✅ No console errors (F12 → Console)
    echo.
    echo ⚠️  IMPORTANT: Test the weight input specifically!
    echo This was our main fix - make sure it works in production.
    echo.
    echo Press Ctrl+C to stop the server when testing is complete
    echo.
    
    npm start
    
) else (
    echo.
    echo ❌ Build failed with error code: !BUILD_RESULT!
    echo.
    echo 🔍 TROUBLESHOOTING:
    echo ===================
    echo 1. TypeScript errors - check red text above
    echo 2. Missing dependencies - run: npm install
    echo 3. Environment variables - check .env.local exists
    echo 4. Import/export errors - check file paths
    echo 5. Memory issues - close other applications
    echo.
    echo 📋 NEXT STEPS:
    echo ==============
    echo 1. Scroll up to see the specific error messages
    echo 2. Fix the errors shown above
    echo 3. Run this script again
    echo 4. Don't deploy until build succeeds
    echo.
    pause
    exit /b !BUILD_RESULT!
)

endlocal