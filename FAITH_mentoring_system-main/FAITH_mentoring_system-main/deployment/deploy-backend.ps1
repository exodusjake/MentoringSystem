# Builds the .NET API and replaces it on the EC2, keeping appsettings.Production.json and uploads.
# Backs up the current app first. Run from anywhere:  .\deployment\deploy-backend.ps1
$ErrorActionPreference = 'Stop'
$key  = "$HOME\.ssh\astra-key.pem"
$ec2  = 'ec2-user@18.136.217.232'
$root = Split-Path -Parent $PSScriptRoot
$out  = "$HOME\astra-publish"
$tgz  = 'app.tgz'    # relative name on purpose: GNU tar (Git) reads 'C:\...' as a remote host

Write-Host '1/4 Building...'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
dotnet publish "$root\AstraMentoring-Backend\AstraMentoringAPI\AstraMentoringAPI.csproj" -c Release -r linux-x64 --self-contained false -o $out
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
# never ship local dev settings or local files
Remove-Item "$out\appsettings.Production.json", "$out\appsettings.Development.json" -ErrorAction SilentlyContinue
Remove-Item "$out\wwwroot\uploads" -Recurse -Force -ErrorAction SilentlyContinue
Push-Location $HOME
tar -czf $tgz -C $out .
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Packaging failed (stopping: never install a stale /tmp/app.tgz)' }

Write-Host '2/4 Uploading...'
scp -i $key $tgz "${ec2}:/tmp/app.tgz"
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Upload failed' }

Write-Host '3/4 Backing up, installing, restarting...'
ssh -i $key $ec2 "rm -rf ~/app-backup && cp -a ~/app ~/app-backup && tar -xzf /tmp/app.tgz -C ~/app && sudo systemctl restart astramentoring && sleep 6 && systemctl is-active astramentoring"
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Install/restart failed - see ROLLBACK below' }

Write-Host '4/4 Done.'
Write-Host 'ROLLBACK if broken:'
Write-Host "  ssh -i $key $ec2 `"rm -rf ~/app && mv ~/app-backup ~/app && sudo systemctl restart astramentoring`""
Remove-Item $tgz, $out -Recurse -Force
Pop-Location
