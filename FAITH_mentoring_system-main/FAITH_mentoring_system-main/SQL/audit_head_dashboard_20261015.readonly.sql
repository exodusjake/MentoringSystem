-- READ-ONLY: raw numbers behind the Head/Admin dashboard (2026-10-15).
SET NOCOUNT ON;
DECLARE @SY NVARCHAR(20), @Sem NVARCHAR(50);
SELECT @SY  = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
SELECT @Sem = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

-- 1. Every session this period, with attendance and proof
SELECT s.SessionID, u.FirstName + ' ' + u.LastName AS Mentor, s.SlotName, s.SessionDate, s.Status,
       CASE WHEN s.RequestID IS NULL THEN 'Regular' ELSE 'Makeup' END AS Kind,
       (SELECT STRING_AGG(c.CourseCode + '/' + c.Origin, ',') FROM dbo.SessionCourseScopes c WHERE c.SessionID = s.SessionID) AS Scope,
       (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.SessionID = s.SessionID AND a.IsPresent = 1 AND a.ScannedAt IS NOT NULL) AS Present,
       CASE WHEN EXISTS (SELECT 1 FROM dbo.ProofOfSession p WHERE p.SessionID = s.SessionID) THEN 1 ELSE 0 END AS HasProof
FROM dbo.Sessions s JOIN dbo.Users u ON u.UserID = s.MentorID
WHERE s.SchoolYear = @SY AND s.Semester = @Sem
ORDER BY s.SessionDate;

-- 2. Per-mentee checkpoint attendance (source of the Attended / tier numbers)
SELECT f.MentorID, f.MenteeID, mu.FirstName + ' ' + mu.LastName AS Mentee, mp.Course,
       COUNT(*) AS CompletedCheckpoints, SUM(f.Attended) AS Attended
FROM dbo.fn_MenteeCheckpointAttendance(@SY, @Sem) f
JOIN dbo.Users mu ON mu.UserID = f.MenteeID
JOIN dbo.MenteeProfiles mp ON mp.UserID = f.MenteeID
GROUP BY f.MentorID, f.MenteeID, mu.FirstName, mu.LastName, mp.Course
ORDER BY f.MentorID, Mentee;

-- 3. Present mentees per session (who scanned)
SELECT a.SessionID, mu.FirstName + ' ' + mu.LastName AS Mentee, mp.Course, a.ScannedAt
FROM dbo.Attendance a
JOIN dbo.Sessions s ON s.SessionID = a.SessionID
JOIN dbo.Users mu ON mu.UserID = a.MenteeID
JOIN dbo.MenteeProfiles mp ON mp.UserID = a.MenteeID
WHERE s.SchoolYear = @SY AND s.Semester = @Sem AND a.IsPresent = 1
ORDER BY a.SessionID, Mentee;

-- 4. Proof uploads
SELECT p.SessionID, p.UploadedAt FROM dbo.ProofOfSession p
JOIN dbo.Sessions s ON s.SessionID = p.SessionID
WHERE s.SchoolYear = @SY AND s.Semester = @Sem ORDER BY p.UploadedAt;

-- 5. Checkpoint reports
SELECT 'Course' AS Source, MentorID, SlotName, CourseCode AS Code, LogStatus, SubmittedAt, NeedsUpdate
FROM dbo.CourseCheckpointLogs WHERE SchoolYear = @SY AND Semester = @Sem
UNION ALL
SELECT 'Section', MentorID, SlotName, SectionCode, LogStatus, SubmittedAt, NeedsUpdate
FROM dbo.CheckpointLogs WHERE SchoolYear = @SY AND Semester = @Sem;
