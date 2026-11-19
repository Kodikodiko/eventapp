@echo off
rem EventFlow mit Stripe (Testmodus) starten: Webhook-Secret eintragen, "stripe listen" und App starten.
rem Einfach doppelklicken. Voraussetzung: STRIPE_SECRET_KEY=sk_test_... in .env.local
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stripe-dev.ps1"
if errorlevel 1 pause
