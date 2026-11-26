param([switch]$Dev)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$ExePath = Join-Path $Root "electron\electron.exe"

if (!(Test-Path $ExePath)) {
    Write-Error "Critical Error: electron.exe not found at $ExePath"
    exit 1
}

# Duplicate Process Check
$currentProc = Get-Process electron -ErrorAction SilentlyContinue
if ($currentProc) {
    Write-Host "[WARN] Another instance of Keyvotion Console is already running." -ForegroundColor Cyan
}

# Arguments Setup
$ArgsList = @(".")
if ($Dev) {
    $ArgsList += "--remote-debugging-port=9333"
    Write-Host "[INFO] Debugging enabled (Port 9333)." -ForegroundColor Magenta
}

# Launch Without Window
# DIKKAT: `-WorkingDirectory $Root` ZORUNLU. electron.exe "." argumanini
# cagiranin calisma dizinine gore cozer; farkli bir dizinden baslatilirsa
# uygulama bulunamaz ve "Error" penceresi acilir (olculdu, 2026-11-01).
try {
    Start-Process -FilePath $ExePath -ArgumentList $ArgsList -WorkingDirectory $Root -WindowStyle Hidden
    Write-Host "[OK] Portable Application launched." -ForegroundColor Green
    exit 0
} catch {
    Write-Error "Launch failed: $($_.Exception.Message)"
    exit 1
}
