param([switch]$Kaldir)

# Keyvotion Console - kurulum / kaldirma (yonetici gerekmez, HKCU)
# Yaptigi: uygulamayi %LOCALAPPDATA%'ya kopyalar + masaustu ve baslangic
# menüsüne kisayol koyar. Registry'ye YAZMAZ (Anayasa: registry yasak).

$ErrorActionPreference = "Stop"
$AppName  = "Keyvotion Console"
$ExeName  = "Keyvotion Console.exe"
$Src      = $PSScriptRoot
$Target   = Join-Path $env:LOCALAPPDATA "Programs\$AppName"
$Desktop  = [Environment]::GetFolderPath("Desktop")
$StartDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$LnkD = Join-Path $Desktop "$AppName.lnk"
$LnkS = Join-Path $StartDir "$AppName.lnk"
$ExeTarget = Join-Path $Target $ExeName

if ($Kaldir) {
    Write-Host "[...] Kaldiriliyor: $AppName"
    foreach ($l in @($LnkD, $LnkS)) { if (Test-Path $l) { Remove-Item $l -Force } }
    if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
    Write-Host "[OK] Kaldirildi. (Ayarlariniz %APPDATA%\keyvotion-console altinda duruyor.)"
    exit 0
}

Write-Host "[...] Kuruluyor: $AppName"
if (-not (Test-Path (Join-Path $Src $ExeName))) {
    Write-Host "[HATA] '$ExeName' bulunamadi. Kur.cmd dosyasini uygulama klasorunden calistirin." -ForegroundColor Red
    exit 1
}

# 1) Dosyalari kopyala
if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Target | Out-Null
Copy-Item -Path (Join-Path $Src "*") -Destination $Target -Recurse -Force

# 2) Kisayollar
$sh = New-Object -ComObject WScript.Shell
foreach ($lnkPath in @($LnkD, $LnkS)) {
    $sc = $sh.CreateShortcut($lnkPath)
    $sc.TargetPath       = $ExeTarget
    $sc.WorkingDirectory = $Target
    $sc.IconLocation     = (Join-Path $Target "icon.ico")
    $sc.Description      = $AppName
    $sc.Save()
}

Write-Host ""
Write-Host "[OK] Kurulum tamam." -ForegroundColor Green
Write-Host "  Masaustu kisayolu : $LnkD"
Write-Host "  Baslangic menusu  : $LnkS"
Write-Host "  Kurulum yeri      : $Target"
Write-Host ""
Write-Host "Masaustundeki '$AppName' kisayoluna cift tiklayin."
Write-Host "Kaldirmak icin: Kur.cmd /Kaldir"
