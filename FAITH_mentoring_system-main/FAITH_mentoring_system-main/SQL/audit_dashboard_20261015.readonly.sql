-- READ-ONLY dashboard accuracy check (2026-10-15). SELECT statements only.
SET NOCOUNT ON;
DECLARE @SY NVARCHAR(20), @Sem NVARCHAR(50);
SELECT @SY  = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
SELECT @Sem = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

-- 1. Period and whether the live attendance function knows about course scopes
SELECT @SY AS SchoolYear, @Sem AS Semester,
       CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.fn_MenteeCheckpointAttendance')) LIKE '%SessionCourse%'
            THEN 'course-aware' ELSE 'section-only' END AS AttendanceFunction;

-- 2. Active mentors: active mentees and their courses
SELECT u.UserID AS MentorID, u.FirstName + ' ' + u.LastName AS Mentor,
       COUNT(mm.MenteeID) AS ActiveMentees,
       COUNT(DISTINCT ISNULL(mp.Course, '(none)')) AS CourseCount,
       STRING_AGG(CAST(ISNULL(mp.Course, '(none)') + '/' + ISNULL(mp.Section, '-') AS NVARCHAR(MAX)), ', ') AS MenteeCourseSection
FROM dbo.Users u
JOIN dbo.MentorProfiles mpr ON mpr.UserID = u.UserID
LEFT JOIN dbo.MentorMentee mm ON mm.MentorID = u.UserID AND mm.IsActive = 1
LEFT JOIN dbo.MenteeProfiles mp ON mp.UserID = mm.MenteeID AND mp.IsDropOut = 0
WHERE u.IsActive = 1 AND u.Role = 'Mentor'
GROUP BY u.UserID, u.FirstName, u.LastName
ORDER BY u.UserID;

-- 3. Current-period sessions per mentor (status, course scope, attendance, proof)
SELECT s.MentorID, s.SessionID, s.SlotName, CAST(s.SessionDate AS date) AS SessionDate, s.Status,
       CASE WHEN s.RequestID IS NULL THEN 'Regular' ELSE 'Makeup' END AS Kind,
       s.SectionCode,
       (SELECT STRING_AGG(c.CourseCode, ',') FROM dbo.SessionCourseScopes c WHERE c.SessionID = s.SessionID) AS ScopeCourses,
       (SELECT COUNT(*) FROM dbo.SessionCourseMembers m WHERE m.SessionID = s.SessionID) AS RosterSize,
       (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.SessionID = s.SessionID AND a.IsPresent = 1) AS Present,
       CASE WHEN EXISTS (SELECT 1 FROM dbo.ProofOfSession p WHERE p.SessionID = s.SessionID) THEN 1 ELSE 0 END AS HasProof
FROM dbo.Sessions s
WHERE s.SchoolYear = @SY AND s.Semester = @Sem
ORDER BY s.MentorID, s.SessionDate;

-- 4. Mentees counted as ABSENT at a checkpoint whose only regular sessions were scoped to another course
SELECT f.MentorID, f.MenteeID, mp.Course AS MenteeCourse, f.CheckpointKey, f.Attended
FROM dbo.fn_MenteeCheckpointAttendance(@SY, @Sem) f
JOIN dbo.MenteeProfiles mp ON mp.UserID = f.MenteeID
WHERE f.Attended = 0
  AND EXISTS (SELECT 1 FROM dbo.Sessions s JOIN dbo.SessionCourseScopes c ON c.SessionID = s.SessionID
              WHERE s.MentorID = f.MentorID AND s.SlotName = f.CheckpointKey AND s.Status = 'Completed'
                AND s.SchoolYear = @SY AND s.Semester = @Sem AND s.RequestID IS NULL)
  AND NOT EXISTS (SELECT 1 FROM dbo.Sessions s JOIN dbo.SessionCourseScopes c ON c.SessionID = s.SessionID
                  WHERE s.MentorID = f.MentorID AND s.SlotName = f.CheckpointKey AND s.Status = 'Completed'
                    AND s.SchoolYear = @SY AND s.Semester = @Sem AND s.RequestID IS NULL
                    AND c.CourseCode = mp.Course);

-- 5. Mentee tier inputs (same source as the dashboard)
SELECT f.MentorID, f.MenteeID, COUNT(*) AS CompletedCheckpoints, SUM(f.Attended) AS Attended
FROM dbo.fn_MenteeCheckpointAttendance(@SY, @Sem) f
GROUP BY f.MentorID, f.MenteeID
ORDER BY f.MentorID, f.MenteeID;

-- 6. Published deadlines this period
SELECT SlotName, CAST(StartDate AS date) AS DeadlineDate, IsPublished
FROM dbo.CalendarEvents
WHERE SchoolYear = @SY AND Semester = @Sem AND EventType = 'Deadline'
ORDER BY StartDate;

-- 7. Checkpoint reports (legacy section logs + new course logs)
SELECT 'Section' AS Source, MentorID, SlotName, LogStatus, SubmittedAt
FROM dbo.CheckpointLogs WHERE SchoolYear = @SY AND Semester = @Sem
UNION ALL
SELECT 'Course', MentorID, SlotName, LogStatus, SubmittedAt
FROM dbo.CourseCheckpointLogs WHERE SchoolYear = @SY AND Semester = @Sem
ORDER BY MentorID, SlotName;
