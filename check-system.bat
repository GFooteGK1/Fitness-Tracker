@echo off
echo 🔍 System Diagnostic for SociusFit
echo ===================================
echo.

echo Checking Node.js installation...
node --version
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js not found or not working
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
) else (
    echo ✅ Node.js is installed
)
echo.

echo Checking npm installation...
npm --version
if %ERRORLEVEL% NEQ 0 (
    echo ❌ npm not found or not working
    pause
    exit /b 1
) else (
    echo ✅ npm is installed
)
echo.

echo Checking current directory...
echo Current directory: %CD%
if exist package.json (
    echo ✅ package.json found
) else (
    echo ❌ package.json not found
    echo Make sure you're in the project directory
    pause
    exit /b 1
)
echo.

echo Checking existing installations...
if exist node_modules (
    echo ⚠️  node_modules directory exists
    echo Size: 
    dir node_modules | find "File(s)"
) else (
    echo ℹ️  node_modules not found (this is expected for clean install)
)

if exist package-lock.json (
    echo ⚠️  package-lock.json exists
) else (
    echo ℹ️  package-lock.json not found (this is expected for clean install)
)
echo.

echo Checking for running Node processes...
tasklist | find "node.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo ⚠️  Node.js processes are running:
    tasklist | find "node.exe"
    echo You may need to stop these before installing
) else (
    echo ✅ No Node.js processes running
)
echo.

echo Checking npm configuration...
npm config get registry
echo.

echo Checking disk space...
dir | find "bytes free"
echo.

echo System check complete!
echo.
echo If everything looks good, you can now run:
echo 1. clean-install-safe.bat (recommended)
echo 2. Or follow manual-install-steps.txt
echo.
pause