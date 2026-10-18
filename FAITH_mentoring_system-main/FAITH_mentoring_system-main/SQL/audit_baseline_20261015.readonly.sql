-- READ-ONLY: confirms the clean baseline after the 2026-10-15 reset.
SET NOCOUNT ON;
DECLARE @SY NVARCHAR(20), @Sem NVARCHAR(50);
SELECT @SY  = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
SELECT @Sem = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

SELECT EventType, SlotName, CAST(StartDate AS date) AS StartDate, CAST(EndDate AS date) AS EndDate, IsPublished
FROM dbo.CalendarEvents
WHERE SchoolYear = @SY AND Semester = @Sem
ORDER BY StartDate, EventType;

SELECT (SELECT COUNT(*) FROM dbo.Sessions) AS Sessions,
       (SELECT COUNT(*) FROM dbo.Attendance) AS Attendance,
       (SELECT COUNT(*) FROM dbo.ProofOfSession) AS Proofs,
       (SELECT COUNT(*) FROM dbo.Availability) AS Availability,
       (SELECT COUNT(*) FROM dbo.SessionRequests) AS Requests,
       (SELECT COUNT(*) FROM dbo.CheckpointLogs) AS CheckpointLogs,
       (SELECT COUNT(*) FROM dbo.CourseCheckpointLogs) AS CourseLogs;

SELECT (SELECT COUNT(*) FROM dbo.Users u JOIN dbo.MentorProfiles p ON p.UserID = u.UserID WHERE u.IsActive = 1 AND u.Role = 'Mentor') AS ActiveMentors,
       (SELECT COUNT(*) FROM dbo.Users u JOIN dbo.MenteeProfiles p ON p.UserID = u.UserID WHERE u.IsActive = 1 AND u.Role = 'Mentee') AS ActiveMentees,
       (SELECT COUNT(*) FROM dbo.Users u JOIN dbo.MenteeProfiles p ON p.UserID = u.UserID WHERE u.IsActive = 1 AND u.Role = 'Mentee' AND p.IsDropOut = 1) AS DroppedOut,
       (SELECT COUNT(DISTINCT mm.MenteeID) FROM dbo.MentorMentee mm JOIN dbo.Users u ON u.UserID = mm.MenteeID JOIN dbo.MenteeProfiles p ON p.UserID = u.UserID
         WHERE mm.IsActive = 1 AND u.IsActive = 1 AND p.IsDropOut = 0) AS AssignedNonDropout;
