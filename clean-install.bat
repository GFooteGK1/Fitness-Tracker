@echo off
echo 🧹 SociusFit Clean Install Script
echo.

echo Step 1: Stopping any running Node processes...
taskkill /f /im node.exe 2>nul
taskkill /f /im npm.exe 2>nul
timeout /t 2 /nobreak >nul

echo Step 2: Removing package-lock.json...
if exist package-lock.json (
    del package-lock.json
    echo ✅ package-lock.json removed
) else (
    echo ℹ️  package-lock.json not found
)

echo Step 3: Removing node_modules (this may take a moment)...
if exist node_modules (
    echo Attempting to remove node_modules...
    rmdir /s /q node_modules 2>nul
    if exist node_modules (
        echo ⚠️  Some files may be locked. Trying alternative method...
        timeout /t 3 /nobreak >nul
        rmdir /s /q node_modules 2>nul
    )
    if exist node_modules (
        echo ❌ Could not remove all node_modules. Please close any editors/terminals and try again.
        echo You may need to restart your computer to unlock the files.
        pause
        exit /b 1
    ) else (
        echo ✅ node_modules removed successfully
    )
) else (
    echo ℹ️  node_modules not found
)

echo Step 4: Clearing npm cache...
npm cache clean --force
echo ✅ npm cache cleared

echo Step 5: Installing dependencies...
echo This may take several minutes...
npm install

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Clean install completed successfully!
    echo.
    echo Step 6: Starting development server...
    npm run dev
) else (
    echo.
    echo ❌ Installation failed. Please check the error messages above.
    pause
    exit /b 1
)