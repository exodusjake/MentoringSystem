# Builds the React app and uploads it to the EC2 server in a NEW folder (/var/www/astra-react).
# The live site (/var/www/astra) is not touched; switch Nginx over afterwards (see DEPLOY.md).
# Run from anywhere:  .\deployment\deploy-frontend.ps1
$ErrorActionPreference = 'Stop'
$key  = "$HOME\.ssh\astra-key.pem"
$ec2  = 'ec2-user@18.136.217.232'
$api  = '/api'     # same-origin: the API on whatever host served the page (Nginx proxies /api/). Must end with /api
$root = Split-Path -Parent $PSScriptRoot
$tgz  = 'astra-react.tgz'    # relative name on purpose: GNU tar (Git) reads 'C:\...' as a remote host

Push-Location $root
try {
    Write-Host '1/4 Building...'
    # A process variable beats .env / .env.local, so the build always points at the real API.
    $env:VITE_API_BASE_URL = $api
    $env:VITE_PROXY_TARGET = ''
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

    Write-Host '2/4 Packaging dist/...'
    tar -czf $tgz -C dist .
    if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }

    Write-Host '3/4 Uploading...'
    scp -i $key $tgz "${ec2}:/tmp/astra-react.tgz"
    if ($LASTEXITCODE -ne 0) { throw 'Upload failed' }

    Write-Host '4/4 Installing on server (new folder, live site untouched)...'
    ssh -i $key $ec2 "sudo rm -rf /var/www/astra-react && sudo mkdir -p /var/www/astra-react && sudo tar -xzf /tmp/astra-react.tgz -C /var/www/astra-react && sudo chown -R nginx:nginx /var/www/astra-react && sudo find /var/www/astra-react -type d -exec chmod 755 {} + && sudo find /var/www/astra-react -type f -exec chmod 644 {} +"
    if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
}
finally {
    if (Test-Path $tgz) { Remove-Item $tgz }
    Pop-Location
}
Write-Host 'Uploaded to /var/www/astra-react. Now switch Nginx to it (DEPLOY.md, step 2).'
