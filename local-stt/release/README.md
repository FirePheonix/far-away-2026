# Windows Installer Release (R2 / S3)

This folder contains helper scripts to publish `ClawvioSetup.exe` as a direct download link.

## Prerequisites

- Built installer at `local-stt/dist/installer/ClawvioSetup.exe`
- AWS CLI v2 installed and authenticated

## 1. Build installer

```powershell
cd E:\far-away-japan\far-away-2026\local-stt
.\build_installer_windows.bat
```

## 2A. Upload to Cloudflare R2

```powershell
cd E:\far-away-japan\far-away-2026\local-stt\release
.\upload-r2.ps1 `
  -AccountId "<cloudflare-account-id>" `
  -Bucket "<r2-bucket-name>" `
  -PublicBaseUrl "https://downloads.clawvio.ai" `
  -Version "1.0.0"
```

Notes:
- `PublicBaseUrl` is your public R2 custom domain or `*.r2.dev` domain.
- Script uploads:
  - `windows/ClawvioSetup-<version>.exe`
  - `windows/ClawvioSetup-latest.exe`

## 2B. Upload to AWS S3

```powershell
cd E:\far-away-japan\far-away-2026\local-stt\release
.\upload-s3.ps1 `
  -Bucket "<s3-bucket-name>" `
  -Region "us-east-1" `
  -PublicBaseUrl "https://downloads.clawvio.ai" `
  -Version "1.0.0"
```

Notes:
- Ensure your bucket/object policy allows public reads or CloudFront access.
- Script uploads:
  - `windows/ClawvioSetup-<version>.exe`
  - `windows/ClawvioSetup-latest.exe`

## 3. Point website download button

Set frontend env:

```env
NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL=https://downloads.clawvio.ai/windows/ClawvioSetup-latest.exe
```
