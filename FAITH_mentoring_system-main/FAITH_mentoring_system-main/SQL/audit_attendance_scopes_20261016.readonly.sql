-- READ-ONLY: course-scope attendance path vs shared function, for Zephyr (311) and Miguel (224).
SET NOCOUNT ON;

-- Course scopes and members on their sessions
SELECT c.SessionID, s.MentorID, c.School, c.CourseCode FROM dbo.SessionCourseScopes c
JOIN dbo.Sessions s ON s.SessionID = c.SessionID WHERE s.MentorID IN (224, 311);
SELECT m.SessionID, s.MentorID, m.MenteeID FROM dbo.SessionCourseMembers m
JOIN dbo.Sessions s ON s.SessionID = m.SessionID WHERE s.MentorID IN (224, 311) ORDER BY m.SessionID, m.MenteeID;

-- Miguel's session: who was marked present and how
SELECT a.SessionID, a.MenteeID, u.FirstName + ' ' + u.LastName AS Mentee, a.IsPresent, a.ScannedAt,
       DATEADD(HOUR, 8, a.ScannedAt) AS ScannedAtPH, mep.IsDropOut, mep.Course, sec.SectionCode,
       mm.MentorID AS CurrentMentor, mm.AssignedDate
FROM dbo.Attendance a JOIN dbo.Users u ON u.UserID = a.MenteeID
LEFT JOIN dbo.MenteeProfiles mep ON mep.UserID = a.MenteeID
LEFT JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
LEFT JOIN dbo.MentorMentee mm ON mm.MenteeID = a.MenteeID AND mm.IsActive = 1
WHERE a.SessionID = 1176 ORDER BY a.MenteeID;

-- Miguel's current mentees
SELECT mm.MenteeID, u.FirstName + ' ' + u.LastName AS Mentee, mm.AssignedDate, mep.Course, sec.SectionCode, mep.IsDropOut
FROM dbo.MentorMentee mm JOIN dbo.Users u ON u.UserID = mm.MenteeID
LEFT JOIN dbo.MenteeProfiles mep ON mep.UserID = mm.MenteeID
LEFT JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
WHERE mm.MentorID = 224 AND mm.IsActive = 1;

-- Course-scope path (same SQL as CourseWorkflow.ExpectedAttendanceSql), for both mentors
SELECT s.MentorID, mm.MenteeID, s.SlotName,
    MAX(CASE WHEN a.IsPresent=1 AND a.ScannedAt IS NOT NULL AND scanWindow.Events>0 THEN 1 ELSE 0 END) Attended
FROM Sessions s JOIN MentorMentee mm ON mm.MentorID=s.MentorID AND mm.IsActive=1 AND mm.AssignedDate<=s.SessionDate
JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
LEFT JOIN Attendance a ON a.SessionID=s.SessionID AND a.MenteeID=mm.MenteeID
OUTER APPLY(SELECT COUNT(*) Events FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
  AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
  AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)) scanWindow
WHERE s.MentorID IN (224, 311) AND s.SchoolYear='2026-2027' AND s.Semester='1st Semester' AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
  AND ISNULL(mp.IsDropOut,0)=0 AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
  AND (EXISTS(SELECT 1 FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID AND cm.MenteeID=mm.MenteeID)
     OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) AND
       ((s.RequestID IS NULL AND (s.SectionCode IS NULL OR s.SectionCode=COALESCE(sec.SectionCode,mp.Section)))
        OR (s.RequestID IS NOT NULL AND (a.IsPresent=1 OR EXISTS(SELECT 1 FROM SessionRequests sr WHERE sr.RequestID=s.RequestID AND sr.MenteeID=mm.MenteeID AND sr.Status='Approved'))))))
  AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
    AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
GROUP BY s.MentorID,mm.MenteeID,s.SlotName;

-- Shared function, Miguel
SELECT f.* FROM dbo.fn_MenteeCheckpointAttendance('2026-2027', '1st Semester') f WHERE f.MentorID = 224;

-- Other mentees marked Drop Out who have attendance this period
SELECT u.UserID, u.FirstName + ' ' + u.LastName AS Mentee, COUNT(*) AS PresentScans
FROM dbo.Attendance a JOIN dbo.Users u ON u.UserID = a.MenteeID
JOIN dbo.MenteeProfiles mep ON mep.UserID = a.MenteeID
JOIN dbo.Sessions s ON s.SessionID = a.SessionID
WHERE mep.IsDropOut = 1 AND a.IsPresent = 1 AND s.SchoolYear = '2026-2027' AND s.Semester = '1st Semester'
GROUP BY u.UserID, u.FirstName, u.LastName;
