param([switch]$Dev)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$SrcDir = Join-Path $Root "..\src"
$ExePath = Join-Path $SrcDir "node_modules\electron\dist\electron.exe"

Set-Location $SrcDir

# Ensure Electron Binary Exists
if (!(Test-Path $ExePath)) {
    Write-Host "[!] Electron binary missing. Attempting recovery..." -ForegroundColor Yellow
    try {
        & node "$SrcDir\node_modules\electron\install.js"
    } catch {
        Write-Error "Recovery failed: $($_.Exception.Message)"
        exit 1
    }
    if (!(Test-Path $ExePath)) {
        Write-Error "Recovery failed to produce electron.exe"
        exit 1
    }
    Write-Host "[+] Recovery successful." -ForegroundColor Green
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
try {
    Start-Process -FilePath $ExePath -ArgumentList $ArgsList -WindowStyle Hidden
    Write-Host "[OK] Application launched successfully." -ForegroundColor Green
    exit 0
} catch {
    Write-Error "Launch failed: $($_.Exception.Message)"
    exit 1
}
