@echo off
echo Starting SociusFit Development Server...
echo.
echo Current directory: %CD%
echo.
echo Checking environment...
if exist package.json (
    echo ✅ package.json found
) else (
    echo ❌ package.json not found
    pause
    exit /b 1
)

if exist node_modules (
    echo ✅ node_modules found
) else (
    echo ❌ node_modules not found - running npm install...
    npm install
)

echo.
echo Starting Next.js development server...
npm run dev