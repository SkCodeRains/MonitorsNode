@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Backend Git Commit ^& Vercel Auto-Deploy Script
echo ===================================================
echo.

:: Get current Git branch name
for /f "tokens=*" %%a in ('git branch --show-current') do set CURRENT_BRANCH=%%a

if "%CURRENT_BRANCH%"=="" (
    echo [ERROR] Not a git repository or unable to determine branch.
    pause
    exit /b 1
)

echo [INFO] Current branch: %CURRENT_BRANCH%
echo.

:: Check for uncommitted changes
git status --short > nul
if errorlevel 1 (
    echo [ERROR] Git status failed.
    pause
    exit /b 1
)

:: Prompt for commit message (or use default if blank)
set /p COMMIT_MSG="Enter commit message (Press Enter for default: 'refactor: clean layered architecture'): "

if "%COMMIT_MSG%"=="" (
    set COMMIT_MSG=refactor: clean layered architecture and optimize query sorting
)

echo.
echo [1/3] Staging all modified and new files...
git add .

echo [2/3] Committing changes...
git commit -m "%COMMIT_MSG%"

if errorlevel 1 (
    echo [WARNING] Nothing new to commit or commit failed.
)

echo.
echo [3/3] Pushing to origin/%CURRENT_BRANCH% (Vercel will detect and deploy automatically)...
git push origin %CURRENT_BRANCH%

if errorlevel 1 (
    echo.
    echo [ERROR] Git push failed. Please check your network connection or repository permissions.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo   SUCCESS! Pushed to GitHub / Remote Repository.
echo   Vercel will automatically build and deploy now!
echo ===================================================
echo.
pause
