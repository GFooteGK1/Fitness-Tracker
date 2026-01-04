@echo off
echo 🏗️ SociusFit Production Build Test
echo ===================================
echo.

REM Check if we're in the right directory
if not exist package.json (
    echo ❌ Error: package.json not found
    echo Make sure you're in the project root directory
    pause
    exit /b 1
)

echo ✅ Found package.json - starting build test
echo Current directory: %CD%
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
    echo ✅ Cleaned .next directory
) else (
    echo ℹ️  No previous build found
)
echo.

REM Step 3: Run production build
echo Step 3: Running production build...
echo This may take 1-3 minutes...
echo.

npm run build

set BUILD_RESULT=%ERRORLEVEL%
echo.

if %BUILD_RESULT% EQU 0 (
    echo ✅ Build completed successfully!
    echo.
    
    REM Check build output
    if exist .next (
        echo ✅ Build output directory created
        echo Build size:
        dir .next /s | find "File(s)"
    ) else (
        echo ❌ Build output directory not found
        pause
        exit /b 1
    )
    
    echo.
    echo Step 4: Starting production server...
    echo The server will start on http://localhost:3000
    echo.
    echo ⚠️  IMPORTANT: Test these features:
    echo 1. Sign up / Sign in
    echo 2. Onboarding flow
    echo 3. Profile weight input
    echo 4. Dashboard access
    echo 5. Mobile responsiveness
    echo.
    echo Press Ctrl+C to stop the server when testing is complete
    echo.
    
    npm start
    
) else (
    echo.
    echo ❌ Build failed with error code: %BUILD_RESULT%
    echo.
    echo Common build issues and solutions:
    echo 1. TypeScript errors - check console output above
    echo 2. Missing dependencies - run npm install
    echo 3. Environment variables - check .env.local
    echo 4. Import/export errors - check file paths
    echo.
    echo Scroll up to see the specific error messages
    pause
    exit /b %BUILD_RESULT%
)