param([switch]$Force)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$SrcDir = Join-Path $Root "..\src"
$DistBase = Join-Path $Root "..\dist\Keyvotion Console"

# 1. Clean Start
if (Test-Path $DistBase) {
    if (!$Force) {
        Write-Host "[ERROR] Target directory '$DistBase' already exists. Use -Force to overwrite." -ForegroundColor Red
        exit 1
    }
    Write-Host "[...] Wiping old distribution..." -ForegroundColor Gray
    Remove-Item -Recurse -Force $DistBase
}

# Initialize Distribution Folder
New-Item -ItemType Directory -Force -Path $DistBase | Out-Null

# 2. Selective Content Transfer
Write-Host "[...] Copying core assets..."
Get-ChildItem -Path $SrcDir -Exclude "node_modules" | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $DistBase -Recurse -Force
}

# 3. Bundle Electron Binary
Write-Host "[...] Bundling Electron runtime..."
$EleBinSrc = Join-Path $SrcDir "node_modules\electron\dist"
$EleBinDest = Join-Path $DistBase "electron"
New-Item -ItemType Directory -Force -Path $EleBinDest | Out-Null
Copy-Item -Path "$EleBinSrc\*" -Destination $EleBinDest -Recurse -Force

# 4. Inject Portable Launchers
Write-Host "[...] Injecting portable launchers..."
Copy-Item -Path (Join-Path $Root "launch.ps1") -Destination $DistBase -Force
Copy-Item -Path (Join-Path $Root "portable-launcher.vbs") -Destination (Join-Path $DistBase "Keyvotion Console.vbs") -Force

# 5. Metadata Generation
try {
    $pkgJson = Get-Content (Join-Path $SrcDir "package.json") -Raw | ConvertFrom-Json
    $version = $pkgJson.version
    "$version" | Out-File (Join-Path $DistBase "VERSION.txt") -Encoding utf8
    "Keyvotion Console`n-----------------`nDouble-click 'Keyvotion Console.vbs' to start.`nGerekenler: Windows 10/11 64-bit" | Out-File (Join-Path $DistBase "README.txt") -Encoding utf8
} catch {
    Write-Warning "Metadata generation encountered an issue."
}

# 6. Anti-Leak Cleanup & Audit
Write-Host "[...] Auditing for leakages..."
$forbiddenPatterns = @("node_modules", ".env", "config.json", "work", "tests", ".team")
$leakFoundCount = 0
foreach ($pattern in $forbiddenPatterns) {
    $leaks = Get-ChildItem -Path $DistBase -Recurse -Include "*$pattern*" -ErrorAction SilentlyContinue
    if ($leaks) {
        $leakFoundCount += $leaks.Count
        $leaks | ForEach-Object { Remove-Item -Path $_.FullName -Recurse -Force }
    }
}
Write-Host "[Audit] Leaked artifacts removed: $leakFoundCount" -ForegroundColor $(if ($leakFoundCount -eq 0) { "Green" } else { "Yellow" })

# Final Statistics
$count = (Get-ChildItem -Path $DistBase -Recurse).Count
$size = (Get-ChildItem -Path $DistBase -Recurse | Measure-Object -Property Length -Sum).Sum
$sizeMb = [Math]::Round($size / 1MB, 2)

Write-Host "`n[SUCCESS] Idempotent Portable Package Created!" -ForegroundColor Green
Write-Host "Target: $DistBase"
Write-Host "Stats: $count files, $sizeMb MB"
exit 0
