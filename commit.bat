@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ========================================
echo  Backend Git Commit and Push Utility
echo ========================================
echo.

:: Check current git status
echo Current Git Status:
echo ----------------------------------------
git status -s
echo ----------------------------------------
echo.

:: Check if there are any changes (modified, deleted, untracked)
for /f "tokens=*" %%i in ('git status --porcelain') do set "HAS_CHANGES=1"
if not defined HAS_CHANGES (
    echo [INFO] No changes detected in the working tree.
    echo Nothing to commit.
    echo.
    pause
    exit /b 0
)

:: Prompt for commit message
set "COMMIT_MSG="
set /p "COMMIT_MSG=Enter commit message (or press Enter for default): "

if "!COMMIT_MSG!"=="" (
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"') do set "NOW_TIME=%%i"
    set "COMMIT_MSG=feat: support device-scoped deletion and synchronized count tracking (!NOW_TIME!)"
)

echo.
echo ========================================
echo  Staging and Committing Changes
echo ========================================
echo.

git add -A
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git add failed.
    pause
    exit /b %ERRORLEVEL%
)

git commit -m "!COMMIT_MSG!"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git commit failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [SUCCESS] Changes committed with message: "!COMMIT_MSG!"
echo.

:: Prompt to push to remote repository
set "PUSH_PROMPT=Y"
set /p "PUSH_PROMPT=Do you want to push to remote? (Y/n): "

if /i "!PUSH_PROMPT!"=="Y" (
    echo.
    echo ========================================
    echo  Pushing to Remote Repository
    echo ========================================
    echo.
    for /f "tokens=*" %%a in ('git branch --show-current') do set CURRENT_BRANCH=%%a
    if "!CURRENT_BRANCH!"=="" set CURRENT_BRANCH=main
    git push origin !CURRENT_BRANCH!
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [WARNING] Git push failed. Please verify your network or remote branch configuration.
    ) else (
        echo.
        echo [SUCCESS] Successfully pushed to remote!
    )
) else (
    echo.
    echo [INFO] Push skipped by user.
)

echo.
echo ========================================
echo  Process Finished
echo ========================================
echo.

endlocal
exit /b 0
