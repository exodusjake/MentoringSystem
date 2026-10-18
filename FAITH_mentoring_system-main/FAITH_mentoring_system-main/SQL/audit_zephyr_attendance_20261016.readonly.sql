-- READ-ONLY: why Zephyr's (311) mentees show 0/6 attended in Attendance Logs.
SET NOCOUNT ON;

SELECT SettingKey, SettingValue FROM dbo.SystemSettings WHERE SettingKey IN ('SchoolYear', 'Semester');

-- Sessions
SELECT s.SessionID, s.SlotName, s.SessionDate, s.TimeEnd, s.Status, s.SectionCode,
       s.RequestID, s.SchoolYear, s.Semester, s.LogStatus
FROM dbo.Sessions s WHERE s.MentorID = 311 ORDER BY s.SessionDate;

-- Attendance rows on those sessions
SELECT a.SessionID, a.MenteeID, a.IsPresent, a.ScannedAt, DATEADD(HOUR, 8, a.ScannedAt) AS ScannedAtPH
FROM dbo.Attendance a JOIN dbo.Sessions s ON s.SessionID = a.SessionID
WHERE s.MentorID = 311 ORDER BY a.SessionID, a.MenteeID;

-- Mentees: assignment date and course/section
SELECT mm.MenteeID, u.FirstName + ' ' + u.LastName AS Mentee, mm.AssignedDate, mm.IsActive,
       mep.Course, mep.Section, mep.SectionID, sec.SectionCode, mep.IsDropOut
FROM dbo.MentorMentee mm JOIN dbo.Users u ON u.UserID = mm.MenteeID
LEFT JOIN dbo.MenteeProfiles mep ON mep.UserID = mm.MenteeID
LEFT JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
WHERE mm.MentorID = 311;

-- Calendar session schedules
SELECT e.EventID, e.EventType, e.SlotName, e.StartDate, e.EndDate, e.IsPublished, e.SchoolYear, e.Semester
FROM dbo.CalendarEvents e
WHERE e.EventType IN ('Session Schedule', 'Deadline') ORDER BY e.StartDate;

-- What the shared function returns for Zephyr
SELECT f.* FROM dbo.fn_MenteeCheckpointAttendance(
  (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear'),
  (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester')) f
WHERE f.MentorID = 311;

-- Same for every mentor, to see if this is Zephyr-only
SELECT f.MentorID, COUNT(*) AS Checkpoints, SUM(f.Attended) AS Attended
FROM dbo.fn_MenteeCheckpointAttendance(
  (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear'),
  (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester')) f
GROUP BY f.MentorID;

-- All completed sessions this period, any mentor
SELECT s.SessionID, s.MentorID, s.SlotName, s.SessionDate, s.TimeEnd, s.Status, s.SectionCode, s.RequestID,
       (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.SessionID = s.SessionID AND a.IsPresent = 1) AS Present
FROM dbo.Sessions s WHERE s.Status = 'Completed' ORDER BY s.SessionDate;

-- Live function text
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.fn_MenteeCheckpointAttendance')) AS FnText;
