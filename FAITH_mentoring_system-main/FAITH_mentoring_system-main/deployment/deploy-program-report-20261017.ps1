# Replaces ONLY the two backend DLLs on EC2 (Mentoring Program Report: each mentee counted once per checkpoint).
# Backs up the current DLLs first. Never touches appsettings*.json or uploads.
$ErrorActionPreference = 'Stop'
$key  = 'C:/itelect4/faith-mentoring-key.pem'
$ec2  = 'ec2-user@46.137.221.251'
$src  = 'C:\Users\DANIEL~1\AppData\Local\Temp\claude\c--REPOSITORIES-FAITH-mentoring-system\a373c7c4-f270-44e8-8e5a-6fbd01f836a3\scratchpad\deploy-program-report'
$dir  = '/home/ec2-user/deployments/program-report-20261017'

Write-Host '1/4 Preparing folders on EC2...'
ssh -i $key $ec2 "mkdir -p $dir/new $dir/app-before"

Write-Host '2/4 Uploading the 2 new DLLs...'
scp -i $key "$src\AstraMentoringAPI.dll" "$src\AstraMentoring-Backend.dll" "${ec2}:$dir/new/"

Write-Host '3/4 Backing up current DLLs, installing new ones, restarting the API...'
ssh -i $key $ec2 "cd $dir && md5sum new/AstraMentoringAPI.dll new/AstraMentoring-Backend.dll && cp -a /home/ec2-user/app/AstraMentoringAPI.dll /home/ec2-user/app/AstraMentoring-Backend.dll app-before/ && md5sum app-before/*.dll && cp new/AstraMentoringAPI.dll new/AstraMentoring-Backend.dll /home/ec2-user/app/ && sudo systemctl restart astramentoring && sleep 6 && echo SERVICE: `$(systemctl is-active astramentoring) && md5sum /home/ec2-user/app/AstraMentoringAPI.dll /home/ec2-user/app/AstraMentoring-Backend.dll"

Write-Host '4/4 Done. Expected installed hashes:'
Write-Host '  385747387c2a1fac7d50cf15cecc1eca  AstraMentoringAPI.dll'
Write-Host '  200d13947bb8b4ceb81d904b889913fb  AstraMentoring-Backend.dll'
Write-Host 'Backed-up (previous) hashes should be 7a1f5ed8... and ce6c0e92... (the section-stats build now live)'
Write-Host 'Original build before today is kept in /home/ec2-user/deployments/dropout-card-20261016/app-before (b17e05df... / 32c714ac...)'
Write-Host ''
Write-Host 'ROLLBACK (only if something is wrong):'
Write-Host "  ssh -i $key $ec2 `"cp $dir/app-before/*.dll /home/ec2-user/app/ && sudo systemctl restart astramentoring && systemctl is-active astramentoring`""
