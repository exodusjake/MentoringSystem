-- READ-ONLY follow-up (2026-10-15): why present mentees are missing from fn_MenteeCheckpointAttendance.
SET NOCOUNT ON;
DECLARE @SY NVARCHAR(20), @Sem NVARCHAR(50);
SELECT @SY  = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
SELECT @Sem = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

-- A. Every present attendance this period, with the checks the function applies
SELECT s.MentorID, s.SessionID, s.SlotName, CAST(s.SessionDate AS date) AS SessionDate, s.Status,
       CASE WHEN s.RequestID IS NULL THEN 'Regular' ELSE 'Makeup' END AS Kind,
       s.SectionCode AS SessSection, a.MenteeID,
       mp.Course, ISNULL(mp.Section, 'NULL') AS MenteeSection, ISNULL(sec.SectionCode, 'NULL') AS SectionsTable,
       CAST(mm.AssignedDate AS date) AS AssignedDate, mm.IsActive AS AssignActive,
       CASE WHEN mm.AssignedDate IS NULL THEN 'no-assign'
            WHEN s.SessionDate < mm.AssignedDate THEN 'before-assign'
            WHEN s.RequestID IS NULL AND s.SectionCode IS NOT NULL
                 AND s.SectionCode <> ISNULL(COALESCE(sec.SectionCode, mp.Section), '') THEN 'section-mismatch'
            ELSE 'ok' END AS FunctionCheck
FROM dbo.Attendance a
JOIN dbo.Sessions s ON s.SessionID = a.SessionID
LEFT JOIN dbo.MenteeProfiles mp ON mp.UserID = a.MenteeID
LEFT JOIN dbo.Sections sec ON sec.SectionID = mp.SectionID
LEFT JOIN dbo.MentorMentee mm ON mm.MenteeID = a.MenteeID AND mm.MentorID = s.MentorID AND mm.IsActive = 1
WHERE a.IsPresent = 1 AND s.SchoolYear = @SY AND s.Semester = @Sem
ORDER BY s.MentorID, s.SessionDate, a.MenteeID;

-- B. All published calendar events this period
SELECT EventType, SlotName, CAST(StartDate AS date) AS StartDate, CAST(EndDate AS date) AS EndDate, IsPublished
FROM dbo.CalendarEvents
WHERE SchoolYear = @SY AND Semester = @Sem
ORDER BY StartDate;
