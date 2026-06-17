param(
  [Parameter(Mandatory = $true)]
  [string]$AccountId,

  [Parameter(Mandatory = $true)]
  [string]$Bucket,

  [Parameter(Mandatory = $true)]
  [string]$PublicBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$InstallerPath = "..\dist\installer\ClawvioSetup.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "AWS CLI not found. Install AWS CLI v2 first."
}

$installerCandidate = Join-Path $PSScriptRoot $InstallerPath
if (-not (Test-Path $installerCandidate)) {
  throw "Installer not found at: $InstallerPath"
}
$resolvedInstaller = (Resolve-Path $installerCandidate).Path

$endpoint = "https://$AccountId.r2.cloudflarestorage.com"
$versionedKey = "windows/ClawvioSetup-$Version.exe"
$latestKey = "windows/ClawvioSetup-latest.exe"

Write-Host "[release] Uploading versioned installer: $versionedKey"
aws --endpoint-url $endpoint s3 cp $resolvedInstaller "s3://$Bucket/$versionedKey"

Write-Host "[release] Uploading latest alias: $latestKey"
aws --endpoint-url $endpoint s3 cp $resolvedInstaller "s3://$Bucket/$latestKey"

$sha256 = (Get-FileHash -Path $resolvedInstaller -Algorithm SHA256).Hash.ToLowerInvariant()

Write-Host ""
Write-Host "[release] Completed."
Write-Host "Versioned URL: $PublicBaseUrl/$versionedKey"
Write-Host "Latest URL:    $PublicBaseUrl/$latestKey"
Write-Host "SHA256:        $sha256"
