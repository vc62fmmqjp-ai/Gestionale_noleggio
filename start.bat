@echo off
setlocal
title Gestionale AutocentroBrutia
color 0A
cd /d "%~dp0"

echo.
echo  =====================================================
echo   GESTIONALE AUTOCENTROBRUTIA S.R.L.S.
echo  =====================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  [ERRORE] Node.js non trovato nel sistema.
    echo  Installa Node.js da https://nodejs.org e riprova.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo  Installazione dipendenze in corso, attendi...
    call npm install
    if errorlevel 1 (
        echo  [ERRORE] Installazione dipendenze non riuscita.
        pause
        exit /b 1
    )
)

echo  Server in avvio...
echo  Apri: http://localhost:3000
echo  Per chiudere il server premi CTRL+C in questa finestra.
echo  =====================================================
echo.

node server.js
set "SERVER_EXIT=%ERRORLEVEL%"
echo.
echo  Il server si e' chiuso con codice %SERVER_EXIT%.
pause
