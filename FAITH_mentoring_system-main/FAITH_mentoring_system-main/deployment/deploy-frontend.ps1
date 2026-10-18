# Publishes the static frontend (HTML/CSS/JS/images) to the EC2 Nginx web root.
# Run from anywhere:  .\deployment\deploy-frontend.ps1
$ErrorActionPreference = 'Stop'
$key  = "$HOME\.ssh\astra-key.pem"
$ec2  = 'ec2-user@18.136.217.232'
$root = Split-Path -Parent $PSScriptRoot
$tgz  = "$HOME\site.tgz"

Write-Host '1/3 Packaging frontend...'
tar -czf $tgz -C $root `
    --exclude=./AstraMentoring-Backend --exclude=./SQL --exclude='./ERD DATABASE' `
    --exclude=./deployment --exclude=./tests --exclude=./.git --exclude=./Mentees `
    --exclude=./node_modules --exclude=./ARCHITECTURE.md --exclude=./export-accounts.ps1 `
    --exclude=./sample_import.csv --exclude=./.gitignore --exclude=./.vercelignore `
    --exclude=./package-lock.json .

Write-Host '2/3 Uploading...'
scp -i $key $tgz "${ec2}:/tmp/site.tgz"

Write-Host '3/3 Installing on server...'
ssh -i $key $ec2 "sudo tar -xzf /tmp/site.tgz -C /var/www/astra && sudo chown -R nginx:nginx /var/www/astra && sudo find /var/www/astra -type d -exec chmod 755 {} + && sudo find /var/www/astra -type f -exec chmod 644 {} +"
Remove-Item $tgz
Write-Host 'Done. Hard-refresh the browser (Ctrl+Shift+R) if you still see the old version.'
