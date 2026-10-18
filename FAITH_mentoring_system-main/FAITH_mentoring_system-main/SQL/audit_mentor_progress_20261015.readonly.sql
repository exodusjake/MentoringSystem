-- READ-ONLY: why a mentor's completed-checkpoint count differs between pages (Miguel Santos).
SET NOCOUNT ON;
DECLARE @MentorID INT = (SELECT TOP 1 UserID FROM dbo.Users WHERE FirstName = 'Miguel' AND LastName = 'Santos' AND Role = 'Mentor');
DECLARE @SY NVARCHAR(20), @Sem NVARCHAR(50);
SELECT @SY  = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
SELECT @Sem = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

SELECT @MentorID AS MentorID;

-- Sessions with their course scope and attendance
SELECT s.SessionID, s.SlotName, s.SessionDate, s.Status, s.TimeEnd, s.RequestID, s.SectionCode, s.LogStatus,
       (SELECT STRING_AGG(c.School + '/' + c.CourseCode + '/' + c.Origin, ', ') FROM dbo.SessionCourseScopes c WHERE c.SessionID = s.SessionID) AS Scopes,
       (SELECT STRING_AGG(CAST(m.MenteeID AS NVARCHAR(10)) + ':' + m.CourseCode, ', ') FROM dbo.SessionCourseMembers m WHERE m.SessionID = s.SessionID) AS Roster,
       (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.SessionID = s.SessionID AND a.IsPresent = 1 AND a.ScannedAt IS NOT NULL) AS PresentScanned
FROM dbo.Sessions s
WHERE s.MentorID = @MentorID AND s.SchoolYear = @SY AND s.Semester = @Sem
ORDER BY s.SessionDate;

-- Present mentees with their course
SELECT a.SessionID, a.MenteeID, mp.Course, mp.School, a.ScannedAt
FROM dbo.Attendance a
JOIN dbo.Sessions s ON s.SessionID = a.SessionID
JOIN dbo.MenteeProfiles mp ON mp.UserID = a.MenteeID
WHERE s.MentorID = @MentorID AND s.SchoolYear = @SY AND s.Semester = @Sem AND a.IsPresent = 1
ORDER BY a.SessionID, a.MenteeID;

-- Checkpoint report rows
SELECT 'Course' AS Source, SlotName, School, CourseCode AS Code, LogStatus, SubmittedAt, NeedsUpdate
FROM dbo.CourseCheckpointLogs WHERE MentorID = @MentorID AND SchoolYear = @SY AND Semester = @Sem
UNION ALL
SELECT 'Section', SlotName, NULL, SectionCode, LogStatus, SubmittedAt, NeedsUpdate
FROM dbo.CheckpointLogs WHERE MentorID = @MentorID AND SchoolYear = @SY AND Semester = @Sem;
