param([Alias('Kaldir')][switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$AppName = 'Keyvotion Console'
$ExeName = "$AppName.exe"
$Programs = Join-Path $env:LOCALAPPDATA 'Programs'
$Target = Join-Path $Programs $AppName
$ExeTarget = Join-Path $Target $ExeName
$StartDir = Join-Path ([Environment]::GetFolderPath('Programs')) $AppName
$Desktop = [Environment]::GetFolderPath('Desktop')
$Shortcuts = @(
  (Join-Path $Desktop "$AppName.lnk"),
  (Join-Path $StartDir "$AppName.lnk")
)

if ($Uninstall) {
  if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
  foreach ($Shortcut in $Shortcuts) {
    if (Test-Path -LiteralPath $Shortcut) { Remove-Item -LiteralPath $Shortcut -Force }
  }
  Write-Host 'Uygulama kaldirildi. Projeler ve yerel profil korundu.'
  exit 0
}

$Source = $PSScriptRoot
if ([string]::Equals($Source.TrimEnd('\'), $Target.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
  Write-Host 'Keyvotion zaten bu klasorde kurulu. Guncellemek icin yeni ZIP paketini baska bir klasore acin.'
  exit 0
}
foreach ($Required in @($ExeName, 'resources\app\package.json', 'resources\app\main\main.js')) {
  if (-not (Test-Path -LiteralPath (Join-Path $Source $Required) -PathType Leaf)) {
    throw 'Paket eksik. ZIP dosyasinin tamamini cikarip Kur.cmd dosyasini o klasorden acin.'
  }
}

New-Item -Path $Programs -ItemType Directory -Force | Out-Null
$Nonce = [Guid]::NewGuid().ToString('N')
$Stage = Join-Path $Programs "$AppName.install-$Nonce"
$Backup = Join-Path $Programs "$AppName.backup-$Nonce"
$PreviousMoved = $false
$Activated = $false

try {
  New-Item -Path $Stage -ItemType Directory | Out-Null
  Write-Host 'Uygulama dosyalari hazirlaniyor...'
  foreach ($Item in Get-ChildItem -LiteralPath $Source -Force) {
    if ($Item.Name -in @('conversations.json', 'config.json', 'secrets.bin', 'keys.bin', 'remote.json', '.keyvotion', '.team', 'logs')) { continue }
    Copy-Item -LiteralPath $Item.FullName -Destination $Stage -Recurse
  }
  if (Test-Path -LiteralPath $Target) {
    Write-Host 'Onceki kurulum yedekleniyor...'
    [IO.Directory]::Move($Target, $Backup)
    $PreviousMoved = $true
  }
  [IO.Directory]::Move($Stage, $Target)
  $Activated = $true
  New-Item -Path $StartDir -ItemType Directory -Force | Out-Null
  $Shell = New-Object -ComObject WScript.Shell
  foreach ($Link in $Shortcuts) {
    $Shortcut = $Shell.CreateShortcut($Link)
    $Shortcut.TargetPath = $ExeTarget
    $Shortcut.WorkingDirectory = $Target
    $Shortcut.Description = $AppName
    $Shortcut.Save()
  }
} catch {
  if ($Activated -and (Test-Path -LiteralPath $Target)) { Remove-Item -LiteralPath $Target -Recurse -Force }
  if ($PreviousMoved -and (Test-Path -LiteralPath $Backup)) { [IO.Directory]::Move($Backup, $Target) }
  throw "Kurulum tamamlanamadi. Acik Keyvotion pencerelerini kapatip tekrar deneyin. $($_.Exception.Message)"
} finally {
  if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
}
if (Test-Path -LiteralPath $Backup) {
  Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host 'Kurulum tamamlandi. Keyvotion masaustu ve Baslat menusu kisayollarindan acilabilir.' -ForegroundColor Green
