@echo off
chcp 65001 >nul
title Parasail Auto Bot - Quick Starter
color 0A

echo ============================================================
echo              Parasail Auto Bot - Quick Starter
echo ============================================================
echo.
echo This tool will install and start the Parasail Node Bot
echo The bot will automatically rotate through all private keys
echo.
echo Make sure your private keys are properly set in config.json
echo.
echo Author: Airdrop Insiders
echo ============================================================
echo.

timeout /t 3 >nul

echo Checking if Node.js is installed...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not detected! Please install Node.js first.
    echo You can download it from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo Checking if npm is installed...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm not detected! Please make sure Node.js is installed correctly.
    echo.
    pause
    exit /b 1
)

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies! Check your internet connection or run npm install manually.
    echo.
    pause
    exit /b 1
)

echo Dependencies installed!
echo.
echo Starting Parasail Node Bot...
echo.
echo [TIP] Press Ctrl+C to exit anytime
echo.
timeout /t 3 >nul

echo Launching bot...
call npm start

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Program encountered an error, error code: %errorlevel%
    echo Check the logs for more information.
    echo.
    pause
)

exit /b 