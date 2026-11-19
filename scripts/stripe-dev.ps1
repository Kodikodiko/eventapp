# EventFlow: Entwicklung mit Stripe (Testmodus) starten.
# Aufruf ueber stripe-dev.bat im Projektordner.
#  1. liest STRIPE_SECRET_KEY aus .env.local (nur Testschluessel sk_test_/rk_test_ erlaubt)
#  2. holt das Webhook-Secret der Stripe-CLI fuer genau dieses Konto und traegt es als STRIPE_WEBHOOK_SECRET ein
#  3. startet "stripe listen" in einem eigenen Fenster
#  4. startet die App (eventflow-start.bat)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($msg) {
  Write-Host ''
  Write-Host "FEHLER: $msg" -ForegroundColor Red
  Write-Host ''
  exit 1
}

$stripe = Join-Path $root 'stripe.exe'
if (-not (Test-Path $stripe)) { Fail "stripe.exe fehlt im Projektordner ($root). Stripe-CLI herunterladen: https://github.com/stripe/stripe-cli/releases (Datei stripe_..._windows_x86_64.zip), stripe.exe hierher legen." }

$envFile = Join-Path $root '.env.local'
if (-not (Test-Path $envFile)) { Fail ".env.local fehlt. Kopiere .env.example nach .env.local und trage STRIPE_SECRET_KEY ein." }

$text = [IO.File]::ReadAllText($envFile)
$m = [regex]::Match($text, '(?m)^[ \t]*STRIPE_SECRET_KEY[ \t]*=[ \t]*([^\r\n#]*)')
$key = if ($m.Success) { $m.Groups[1].Value.Trim().Trim('"').Trim("'") } else { '' }
if (-not $key) {
  Fail @"
In .env.local ist kein STRIPE_SECRET_KEY eingetragen.
       Stripe-Dashboard (Sandbox) > Entwickler > API-Schluessel > Geheimschluessel kopieren
       und in .env.local eintragen:   STRIPE_SECRET_KEY=sk_test_...
"@
}
if ($key -notmatch '^(sk|rk)_test_') { Fail "STRIPE_SECRET_KEY ist kein Testschluessel (muss mit sk_test_ oder rk_test_ beginnen). Dieses Skript ist nur fuer die Entwicklung gedacht." }
Write-Host "Stripe-Testschluessel gefunden: $($key.Substring(0, 12))..." -ForegroundColor Green

# Schluessel nur ueber die Umgebung an die CLI geben (nicht auf der Kommandozeile sichtbar)
$env:STRIPE_API_KEY = $key

Write-Host 'Hole Webhook-Secret von Stripe ...'
# Hinweise der CLI auf stderr (z. B. "newer version available") duerfen das Skript nicht abbrechen
$ErrorActionPreference = 'Continue'
$out = (& $stripe listen --print-secret 2>&1 | Out-String)
$sm = [regex]::Match($out, 'whsec_[A-Za-z0-9]+')
if (-not $sm.Success) {
  # neuere CLI-Versionen verlangen eine Ereignis-Auswahl
  $out = (& $stripe listen --all-snapshot --print-secret 2>&1 | Out-String)
  $sm = [regex]::Match($out, 'whsec_[A-Za-z0-9]+')
}
$ErrorActionPreference = 'Stop'
if (-not $sm.Success) { Fail "Stripe-CLI lieferte kein Webhook-Secret. Ausgabe:`n$out" }
$secret = $sm.Value

$line = "STRIPE_WEBHOOK_SECRET=$secret"
$nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
$pattern = '(?m)^[ \t]*STRIPE_WEBHOOK_SECRET[ \t]*=[^\r\n]*'
if ([regex]::IsMatch($text, $pattern)) {
  $old = [regex]::Match($text, $pattern).Value
  if ($old.Trim() -ne $line) {
    $text = [regex]::Replace($text, $pattern, $line)
    [IO.File]::WriteAllText($envFile, $text, (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Neues Webhook-Secret in .env.local eingetragen.' -ForegroundColor Green
  } else {
    Write-Host 'Webhook-Secret in .env.local ist aktuell.' -ForegroundColor Green
  }
} else {
  if (-not $text.EndsWith($nl)) { $text += $nl }
  $text += $line + $nl
  [IO.File]::WriteAllText($envFile, $text, (New-Object Text.UTF8Encoding($false)))
  Write-Host 'Webhook-Secret in .env.local ergaenzt.' -ForegroundColor Green
}

Write-Host 'Starte "stripe listen" in einem eigenen Fenster (offen lassen!) ...'
$listenCmd = "title Stripe listen & `"$stripe`" listen --all-snapshot --forward-to localhost:3000/api/stripe/webhook & pause"
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $listenCmd -WorkingDirectory $root | Out-Null

# Schluessel nicht an die App vererben (die liest ihn aus .env.local)
Remove-Item Env:STRIPE_API_KEY -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'Starte EventFlow ...' -ForegroundColor Green
& cmd.exe /c (Join-Path $root 'eventflow-start.bat')
