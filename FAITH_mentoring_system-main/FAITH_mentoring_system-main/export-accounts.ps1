# ============================================================
#  ASTRA MENTORING — Account Report Generator
#  Run from PowerShell: .\export-accounts.ps1
#  Opens a formatted HTML report → Print → Save as PDF
# ============================================================

$connString = "Server=(localdb)\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True"

function Invoke-Query($conn, $sql) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $table = New-Object System.Data.DataTable
    $adapter.Fill($table) | Out-Null
    return $table
}

function Esc($val) {
    if ($null -eq $val) { return '<span class="null">—</span>' }
    return [System.Web.HttpUtility]::HtmlEncode($val.ToString().Trim())
}

function Build-Table($dt, $title, $icon) {
    if ($dt.Rows.Count -eq 0) {
        return "<section><h2>$icon $title</h2><p class='empty'>No records found.</p></section>"
    }

    $headers = $dt.Columns | ForEach-Object { "<th>$($_.ColumnName)</th>" }
    $rows = $dt.Rows | ForEach-Object {
        $row = $_
        $cells = $dt.Columns | ForEach-Object {
            $val = $row[$_.ColumnName]
            $cls = ""
            if ($_.ColumnName -eq "IsActive" -or $_.ColumnName -eq "AssignmentActive") {
                $cls = if ($val -eq $true) { ' class="badge-active"' } else { ' class="badge-inactive"' }
                $val = if ($val -eq $true) { "Active" } else { "Inactive" }
            }
            "<td$cls>$(Esc $val)</td>"
        }
        "<tr>$($cells -join '')</tr>"
    }

    return @"
<section>
  <h2>$icon $title <span class='count'>$($dt.Rows.Count) record$(if($dt.Rows.Count -ne 1){'s'})</span></h2>
  <div class='table-wrap'>
    <table>
      <thead><tr>$($headers -join '')</tr></thead>
      <tbody>$($rows -join '')</tbody>
    </table>
  </div>
</section>
"@
}

Write-Host "Connecting to database..." -ForegroundColor Cyan

try {
    Add-Type -AssemblyName System.Web
    $conn = New-Object System.Data.SqlClient.SqlConnection $connString
    $conn.Open()
    Write-Host "Connected." -ForegroundColor Green
} catch {
    Write-Host "ERROR: Could not connect to database." -ForegroundColor Red
    Write-Host $_.Exception.Message
    Read-Host "Press Enter to exit"
    exit
}

# ── Run queries ───────────────────────────────────────────────

$sqlMentors = @"
SELECT
    u.UserID,
    u.FirstName + ' ' + u.LastName                    AS MentorName,
    u.Email,
    u.ContactNumber,
    u.IsActive,
    COALESCE(mp.School, d.School, '—')                AS School,
    COALESCE(d.DepartmentName, mp.Department, '—')    AS Department,
    mp.Expertise,
    (SELECT COUNT(*) FROM MentorMentee mm
     WHERE mm.MentorID = u.UserID AND mm.IsActive = 1) AS AssignedMentees,
    CONVERT(varchar(20), u.CreatedAt, 120)             AS CreatedAt
FROM Users u
LEFT JOIN MentorProfiles mp ON mp.UserID       = u.UserID
LEFT JOIN Departments    d  ON d.DepartmentID  = mp.DepartmentID
WHERE u.Role = 'Mentor'
ORDER BY u.LastName, u.FirstName;
"@

$sqlMentees = @"
SELECT
    u.UserID,
    u.FirstName + ' ' + u.LastName                        AS MenteeName,
    u.Email,
    u.StudentNumber,
    u.ContactNumber,
    u.IsActive,
    COALESCE(mep.Course, '—')                             AS Course,
    COALESCE(mep.YearLevel, '—')                          AS YearLevel,
    COALESCE(sec.SectionCode, mep.Section, '—')           AS Section,
    COALESCE(mep.School, d.School, '—')                   AS School,
    COALESCE(d.DepartmentName, mep.Department, '—')       AS Department,
    CONVERT(varchar(20), u.CreatedAt, 120)                AS CreatedAt
FROM Users u
LEFT JOIN MenteeProfiles mep ON mep.UserID      = u.UserID
LEFT JOIN Departments    d   ON d.DepartmentID  = mep.DepartmentID
LEFT JOIN Sections       sec ON sec.SectionID   = mep.SectionID
WHERE u.Role = 'Mentee'
ORDER BY u.LastName, u.FirstName;
"@

$sqlAssignments = @"
SELECT
    mentor.UserID                                          AS MentorID,
    mentor.FirstName + ' ' + mentor.LastName               AS MentorName,
    mentor.Email                                           AS MentorEmail,
    COALESCE(mp.School, dpt.School, '—')                   AS MentorSchool,
    COALESCE(dpt.DepartmentName, mp.Department, '—')       AS MentorDepartment,
    CONVERT(varchar(20), mm.AssignedDate, 120)             AS AssignedDate,
    mm.IsActive                                            AS AssignmentActive,
    mentee.UserID                                          AS MenteeID,
    mentee.FirstName + ' ' + mentee.LastName               AS MenteeName,
    mentee.Email                                           AS MenteeEmail,
    mentee.StudentNumber,
    COALESCE(mep.Course, '—')                              AS Course,
    COALESCE(mep.YearLevel, '—')                           AS YearLevel,
    COALESCE(sec.SectionCode, mep.Section, '—')            AS Section,
    COALESCE(mep.School, dept2.School, '—')                AS MenteeSchool,
    COALESCE(dept2.DepartmentName, mep.Department, '—')    AS MenteeDepartment
FROM MentorMentee mm
INNER JOIN Users          mentor ON mentor.UserID      = mm.MentorID
INNER JOIN Users          mentee ON mentee.UserID      = mm.MenteeID
LEFT  JOIN MentorProfiles mp     ON mp.UserID          = mentor.UserID
LEFT  JOIN Departments    dpt    ON dpt.DepartmentID   = mp.DepartmentID
LEFT  JOIN MenteeProfiles mep    ON mep.UserID         = mentee.UserID
LEFT  JOIN Departments    dept2  ON dept2.DepartmentID = mep.DepartmentID
LEFT  JOIN Sections       sec    ON sec.SectionID      = mep.SectionID
ORDER BY mentor.LastName, mentor.FirstName, mentee.LastName, mentee.FirstName;
"@

$sqlSummary = @"
SELECT
    SUM(CASE WHEN Role='Mentor' AND IsActive=1 THEN 1 ELSE 0 END) AS ActiveMentors,
    SUM(CASE WHEN Role='Mentee' AND IsActive=1 THEN 1 ELSE 0 END) AS ActiveMentees,
    SUM(CASE WHEN Role='Mentor' AND IsActive=0 THEN 1 ELSE 0 END) AS InactiveMentors,
    SUM(CASE WHEN Role='Mentee' AND IsActive=0 THEN 1 ELSE 0 END) AS InactiveMentees
FROM Users WHERE Role IN ('Mentor','Mentee');
"@

Write-Host "Running queries..." -ForegroundColor Cyan
$dtMentors     = Invoke-Query $conn $sqlMentors
$dtMentees     = Invoke-Query $conn $sqlMentees
$dtAssignments = Invoke-Query $conn $sqlAssignments
$dtSummary     = Invoke-Query $conn $sqlSummary
$conn.Close()
Write-Host "Done. Building report..." -ForegroundColor Cyan

# ── Summary cards ─────────────────────────────────────────────
$s = $dtSummary.Rows[0]
$summaryHtml = @"
<div class='summary-cards'>
  <div class='card card-teal'>
    <div class='card-val'>$($s['ActiveMentors'])</div>
    <div class='card-lbl'>Active Mentors</div>
  </div>
  <div class='card card-blue'>
    <div class='card-val'>$($s['ActiveMentees'])</div>
    <div class='card-lbl'>Active Mentees</div>
  </div>
  <div class='card card-gray'>
    <div class='card-val'>$($s['InactiveMentors'])</div>
    <div class='card-lbl'>Inactive Mentors</div>
  </div>
  <div class='card card-gray'>
    <div class='card-val'>$($s['InactiveMentees'])</div>
    <div class='card-lbl'>Inactive Mentees</div>
  </div>
</div>
"@

# ── Build HTML tables ─────────────────────────────────────────
$tMentors     = Build-Table $dtMentors     "Mentor Accounts"        "👨‍🏫"
$tMentees     = Build-Table $dtMentees     "Mentee Accounts"        "🎓"
$tAssignments = Build-Table $dtAssignments "Mentor → Mentee Assignments" "🔗"

$generatedAt = Get-Date -Format "MMMM dd, yyyy  h:mm tt"

# ── Full HTML document ────────────────────────────────────────
$html = @"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>AstraMentoring — Account Report</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background:#f5f5f5; }

  .page-wrap { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }

  .report-header { display:flex; align-items:flex-start; justify-content:space-between;
                   border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 24px; }
  .report-title  { font-size:22px; font-weight:900; color:#0f766e; letter-spacing:.04em; }
  .report-sub    { font-size:12px; color:#555; margin-top:4px; }
  .report-meta   { text-align:right; font-size:10px; color:#888; line-height:1.7; }

  .summary-cards { display:flex; gap:14px; margin-bottom:28px; flex-wrap:wrap; }
  .card { flex:1; min-width:140px; border-radius:10px; padding:16px 20px;
          color:#fff; font-weight:700; }
  .card-teal  { background:#0f766e; }
  .card-blue  { background:#1d4ed8; }
  .card-gray  { background:#6b7280; }
  .card-val   { font-size:32px; font-weight:900; line-height:1; }
  .card-lbl   { font-size:11px; margin-top:4px; opacity:.85; }

  section { background:#fff; border-radius:10px; padding:20px 22px;
            margin-bottom:24px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  section h2 { font-size:14px; font-weight:700; color:#111; margin-bottom:14px;
               display:flex; align-items:center; gap:8px; }
  .count { font-size:10px; font-weight:600; color:#fff; background:#0f766e;
           border-radius:10px; padding:2px 10px; margin-left:4px; }
  .empty { color:#9ca3af; font-size:12px; padding:8px 0; }

  .table-wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:10.5px; }
  thead tr { background:#f0fdfa; }
  th { padding:8px 10px; text-align:left; font-size:9.5px; font-weight:700;
       text-transform:uppercase; letter-spacing:.06em; color:#0f766e;
       border-bottom:2px solid #ccfbf1; white-space:nowrap; }
  td { padding:7px 10px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
  tr:last-child td { border-bottom:none; }
  tr:hover td { background:#fafafa; }

  .badge-active   { color:#065f46; background:#d1fae5; border-radius:6px;
                    padding:2px 8px; font-weight:700; font-size:9px; display:inline-block; }
  .badge-inactive { color:#991b1b; background:#fee2e2; border-radius:6px;
                    padding:2px 8px; font-weight:700; font-size:9px; display:inline-block; }
  .null { color:#d1d5db; }

  .print-bar { position:fixed; top:0; left:0; right:0; background:#1e293b; color:#fff;
               display:flex; align-items:center; justify-content:space-between;
               padding:10px 24px; z-index:100; font-size:13px; font-family:Arial,sans-serif; }
  .pb-title { font-weight:600; opacity:.85; }
  .pb-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 18px;
            border-radius:7px; font-size:13px; font-weight:600; cursor:pointer; border:none; }
  .pb-print { background:#0f766e; color:#fff; }
  .pb-print:hover { background:#115e59; }
  .body-offset { margin-top: 52px; }

  @media print {
    body { background:#fff; }
    .print-bar { display:none; }
    .body-offset { margin-top:0; }
    .page-wrap { padding:16px; max-width:100%; }
    .card { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    section { box-shadow:none; border:1px solid #e5e7eb; page-break-inside:avoid; }
    thead { display:table-header-group; }
  }
</style>
</head>
<body>

<div class="print-bar">
  <span class="pb-title">AstraMentoring — Account Report</span>
  <button class="pb-btn pb-print" onclick="window.print()">🖨 Print / Save as PDF</button>
</div>

<div class="body-offset">
<div class="page-wrap">

  <div class="report-header">
    <div>
      <div class="report-title">AstraMentoring</div>
      <div class="report-sub">Account Overview Report — Mentors, Mentees &amp; Assignments</div>
    </div>
    <div class="report-meta">
      Generated: $generatedAt<br/>
      Database: AstraMentoring (localdb)
    </div>
  </div>

  $summaryHtml
  $tMentors
  $tMentees
  $tAssignments

</div>
</div>
</body>
</html>
"@

# ── Save and open ─────────────────────────────────────────────
$outPath = Join-Path $PSScriptRoot "account-report.html"
$html | Out-File -FilePath $outPath -Encoding utf8
Write-Host "Report saved: $outPath" -ForegroundColor Green
Write-Host "Opening in browser..." -ForegroundColor Cyan
Start-Process $outPath
