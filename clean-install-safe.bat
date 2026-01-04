@echo off
setlocal enabledelayedexpansion

echo 🧹 SociusFit Safe Clean Install Script
echo ========================================
echo.

REM Check if we're in the right directory
if not exist package.json (
    echo ❌ Error: package.json not found in current directory
    echo Please make sure you're running this from the project root
    echo Current directory: %CD%
    pause
    exit /b 1
)

echo ✅ Found package.json - we're in the right directory
echo Current directory: %CD%
echo.

REM Step 1: Stop processes (ignore errors)
echo Step 1: Stopping any running Node processes...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im npm.exe >nul 2>&1
taskkill /f /im next.exe >nul 2>&1
echo ✅ Process cleanup completed
echo.

REM Step 2: Remove package-lock.json
echo Step 2: Removing package-lock.json...
if exist package-lock.json (
    del package-lock.json >nul 2>&1
    if exist package-lock.json (
        echo ⚠️  Could not remove package-lock.json - continuing anyway
    ) else (
        echo ✅ package-lock.json removed
    )
) else (
    echo ℹ️  package-lock.json not found - skipping
)
echo.

REM Step 3: Remove node_modules with multiple attempts
echo Step 3: Removing node_modules directory...
if exist node_modules (
    echo Attempting to remove node_modules (this may take a moment)...
    
    REM First attempt
    rmdir /s /q node_modules >nul 2>&1
    
    if exist node_modules (
        echo First attempt failed, waiting 3 seconds and trying again...
        timeout /t 3 /nobreak >nul
        rmdir /s /q node_modules >nul 2>&1
    )
    
    if exist node_modules (
        echo Second attempt failed, trying alternative method...
        rd /s /q node_modules >nul 2>&1
    )
    
    if exist node_modules (
        echo ⚠️  Warning: Could not completely remove node_modules
        echo Some files may be locked by other processes
        echo The installation will continue, but you may need to:
        echo 1. Close all editors and terminals
        echo 2. Restart your computer
        echo 3. Try again
        echo.
        echo Press any key to continue anyway, or Ctrl+C to abort...
        pause >nul
    ) else (
        echo ✅ node_modules removed successfully
    )
) else (
    echo ℹ️  node_modules not found - skipping
)
echo.

REM Step 4: Clear npm cache
echo Step 4: Clearing npm cache...
npm cache clean --force
if !ERRORLEVEL! EQU 0 (
    echo ✅ npm cache cleared successfully
) else (
    echo ⚠️  npm cache clean had issues - continuing anyway
)
echo.

REM Step 5: Verify npm is working
echo Step 5: Verifying npm installation...
npm --version >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo ✅ npm is working
) else (
    echo ❌ Error: npm is not working properly
    echo Please make sure Node.js and npm are installed correctly
    pause
    exit /b 1
)
echo.

REM Step 6: Install dependencies
echo Step 6: Installing dependencies...
echo This may take several minutes, please be patient...
echo.

npm install
set INSTALL_RESULT=!ERRORLEVEL!

echo.
if !INSTALL_RESULT! EQU 0 (
    echo ✅ Dependencies installed successfully!
    echo.
    
    REM Verify Next.js is installed
    if exist "node_modules\.bin\next.cmd" (
        echo ✅ Next.js CLI found
    ) else (
        echo ⚠️  Next.js CLI not found in expected location
    )
    
    echo.
    echo Step 7: Starting development server...
    echo The server will start on http://localhost:3000
    echo Press Ctrl+C to stop the server when needed
    echo.
    
    npm run dev
) else (
    echo.
    echo ❌ Installation failed with error code: !INSTALL_RESULT!
    echo.
    echo Common solutions:
    echo 1. Check your internet connection
    echo 2. Try running as administrator
    echo 3. Clear npm cache: npm cache clean --force
    echo 4. Delete node_modules manually and try again
    echo 5. Restart your computer and try again
    echo.
    pause
    exit /b !INSTALL_RESULT!
)

endlocal