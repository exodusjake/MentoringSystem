$ErrorActionPreference='Stop'
$source=Get-Content 'AstraMentoring-Backend/AstraMentoring-Backend/Services/ProofOfSessionService.cs' -Raw
$sql=[regex]::Match($source,'SaveUploadSql = """\s*([\s\S]*?)\s*""";').Groups[1].Value
if(!$sql){throw 'Upload SQL missing'}
$sql=$sql.Replace('dbo.Sessions','#Sessions').Replace('dbo.Attendance','#Attendance').Replace('dbo.ProofOfSession','#ProofOfSession')
$conn=New-Object System.Data.SqlClient.SqlConnection 'Server=(localdb)\MSSQLLocalDB;Database=master;Integrated Security=True;Connect Timeout=5'
$conn.Open()
try {
 $cmd=$conn.CreateCommand()
 $cmd.CommandText="CREATE TABLE #Sessions(SessionID int PRIMARY KEY,MentorID int,Status nvarchar(30)); CREATE TABLE #Attendance(SessionID int,IsPresent bit,ScannedAt datetime2); CREATE TABLE #ProofOfSession(ProofID int IDENTITY PRIMARY KEY,SessionID int,UploadedByUserID int,FilePath nvarchar(400),FileType nvarchar(30),UploadedAt datetime2); INSERT #Sessions VALUES(1,303,'Completed'),(2,224,'Completed'); INSERT #Attendance VALUES(1,1,'2026-10-12'),(2,1,'2026-10-12');"
 [void]$cmd.ExecuteNonQuery()
 function Save-Proof($owner,$path,$fail=$false) {
  $tx=$conn.BeginTransaction()
  try {
   $c=$conn.CreateCommand();$c.Transaction=$tx;$c.CommandText=$sql
   foreach($pair in @(@('SessionID',1),@('UploadedByUserID',$owner),@('FilePath',$path),@('FileType','image'),@('UploadedAt',[datetime]::Now))){[void]$c.Parameters.AddWithValue('@'+$pair[0],$pair[1])}
   [void]$c.ExecuteNonQuery()
   if($fail){throw 'Synthetic failure before commit'}
   $tx.Commit()
  } catch { $tx.Rollback();throw }
 }
 function Check-Proof($path) {
  $cmd.CommandText="SELECT COUNT(*) FROM #ProofOfSession WHERE SessionID=1;"
  if($cmd.ExecuteScalar() -ne 1){throw 'One-proof invariant failed'}
  $cmd.CommandText="SELECT FilePath FROM #ProofOfSession WHERE SessionID=1;"
  if($cmd.ExecuteScalar() -ne $path){throw 'Persisted proof mismatch'}
 }
 Save-Proof 303 '/original.jpg';Check-Proof '/original.jpg'
 try{Save-Proof 303 '/failed.jpg' $true;throw 'Failure not raised'}catch{if($_.Exception.Message -eq 'Failure not raised'){throw}}
 Check-Proof '/original.jpg'
 try{Save-Proof 224 '/unauthorized.jpg';throw 'Ownership not enforced'}catch{if($_.Exception.Message -eq 'Ownership not enforced'){throw}}
 Check-Proof '/original.jpg'
 Save-Proof 303 '/replacement.jpg';Check-Proof '/replacement.jpg'
 $cmd.CommandText="DELETE #Attendance WHERE SessionID=1;";[void]$cmd.ExecuteNonQuery()
 try{Save-Proof 303 '/unverified.jpg';throw 'Attendance guard not enforced'}catch{if($_.Exception.Message -eq 'Attendance guard not enforced'){throw}}
 Check-Proof '/replacement.jpg'
 Write-Output 'PASS: SQL-backed first upload, replacement, failed-transaction preservation, ownership and verified-attendance guards; temporary synthetic tables only'
} finally {$conn.Dispose()}
