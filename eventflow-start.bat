@echo off
rem EventFlow lokal starten (Entwicklungsmodus)
rem Datei in den Projektordner legen (neben package.json) und doppelklicken.

title EventFlow
cd /d "%~dp0"

if not exist package.json (
  echo Diese Datei muss im EventFlow-Projektordner liegen ^(neben package.json^).
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installiere Abhaengigkeiten ...
  call npm install || (pause & exit /b 1)
)

rem Browser nach kurzer Wartezeit oeffnen
start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000"

echo EventFlow startet auf http://localhost:3000  (Beenden mit Strg+C)
call npm run dev

pause
