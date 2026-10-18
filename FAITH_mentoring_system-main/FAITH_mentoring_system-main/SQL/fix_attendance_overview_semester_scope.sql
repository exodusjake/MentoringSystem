-- ============================================================
-- fix_attendance_overview_semester_scope.sql
--
-- sp_GetAttendanceOverview (the Attendance Logs landing page) counted
-- sessions across EVERY school year and semester ever recorded, while
-- its two sibling procedures — sp_GetMentorMenteeAttendance (a mentor's
-- detail/drill-down page) and sp_GetAttendanceFullReport (the print/
-- export report) — both correctly scope to the CURRENT semester only.
-- Invisible today because every session in this database happens to
-- fall in the current semester, but the moment a new semester starts,
-- the overview's numbers would silently include stale prior-semester
-- data that the drill-down and the report both correctly exclude —
-- the same mentor would show different totals depending which page
-- you're looking at.
--
-- Also drops RS1 (a separate, unfiltered global summary result set)
-- — confirmed unused by every consumer (ADMIN_ and HEAD both ignore it
-- and recompute the same totals from RS2 client-side), and it had the
-- identical scoping gap, so keeping it around was a second copy of the
-- same latent bug for no benefit. AttendanceLogsService now computes
-- those summary numbers in C# from the (now correctly scoped) mentor
-- list instead, so the API's response shape is unchanged.
--
-- Also fixes a corrupted fallback literal in sp_GetMentorMenteeAttendance
-- (COALESCE(..., N'<mojibake>') for a mentee with no section at all) —
-- replaced with the plain "-" already used for the same case in
-- sp_GetAttendanceFullReport.
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.sp_GetAttendanceOverview
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear NVARCHAR(20), @Semester NVARCHAR(50);
    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

    -- One row per mentor, scoped to the current semester — matching
    -- sp_GetMentorMenteeAttendance and sp_GetAttendanceFullReport.
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.Department, mp.School,
        ISNULL(ms.TotalSessions,  0) AS TotalSessions,
        ISNULL(ms.TotalAttendees, 0) AS TotalAttendees,
        ISNULL(ms.PresentCount,   0) AS PresentCount,
        ms.LastSessionDate,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec2.SectionCode, mep2.Section) AS val
                FROM   dbo.MentorMentee mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
            ) t
        ) AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep3.Course AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID = mm3.MenteeID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  mep3.Course IS NOT NULL
            ) t
        ) AS Courses
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT   JOIN (
        SELECT
            s.MentorID,
            COUNT(DISTINCT s.SessionID)                              AS TotalSessions,
            COUNT(*)                                                  AS TotalAttendees,
            SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)        AS PresentCount,
            MAX(s.SessionDate)                                        AS LastSessionDate
        FROM   dbo.Sessions      s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID AND mm.IsActive = 1
        LEFT   JOIN dbo.Attendance   a  ON a.SessionID = s.SessionID AND a.MenteeID = mm.MenteeID
        WHERE  s.Status = 'Completed' AND s.SessionDate >= mm.AssignedDate
          AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
          AND  (s.RequestID IS NULL
                OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                           WHERE sr.RequestID = s.RequestID AND sr.MenteeID = mm.MenteeID AND sr.Status = 'Approved'))
        GROUP  BY s.MentorID
    ) ms ON ms.MentorID = u.UserID
    WHERE  u.IsActive = 1
      AND  EXISTS (SELECT 1 FROM dbo.MentorMentee mm WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)
    ORDER  BY u.LastName, u.FirstName;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetMentorMenteeAttendance
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20),
            @Semester     NVARCHAR(50),
            @SessionLimit INT = 6;
    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';
    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = '2nd Semester'
                             THEN 'SessionLimit2ndSem' ELSE 'SessionLimit1stSem' END;

    -- RS1: session limit for current semester
    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: mentor info with sections/courses
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.Department, mp.School,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec.SectionCode, mep.Section) AS val
                FROM   dbo.MentorMentee mm
                INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID
                LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
                WHERE  mm.MentorID = u.UserID AND mm.IsActive = 1
                  AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
            ) t
        ) AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep2.Course AS val
                FROM   dbo.MentorMentee mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = mm2.MenteeID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  mep2.Course IS NOT NULL
            ) t
        ) AS Courses
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS3: mentee attendance cards (scoped to current semester)
    SELECT
        ue.UserID                                                     AS MenteeID,
        ue.FirstName AS MenteeFirstName, ue.LastName AS MenteeLastName, ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')                  AS SectionCode,
        mep.Course, mep.YearLevel,
        COUNT(DISTINCT s.SessionID)                                   AS TotalSessions,
        SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)            AS PresentCount
    FROM   dbo.Users ue
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = ue.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN dbo.Sessions       s   ON s.MentorID = @MentorID AND s.Status = 'Completed'
                                      AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                                      AND s.SessionDate >= mm.AssignedDate
                                      AND (s.RequestID IS NULL
                                           OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                                                      WHERE sr.RequestID = s.RequestID
                                                        AND sr.MenteeID = ue.UserID AND sr.Status = 'Approved'))
    LEFT   JOIN dbo.Attendance     a   ON a.SessionID = s.SessionID AND a.MenteeID = ue.UserID
    WHERE  ue.IsActive = 1
    GROUP  BY ue.UserID, ue.FirstName, ue.LastName, ue.StudentNumber,
              sec.SectionCode, mep.Section, mep.Course, mep.YearLevel
    ORDER  BY ue.LastName, ue.FirstName;
END;
GO

PRINT 'Done. sp_GetAttendanceOverview now scoped to the current semester (matching detail/report); dropped its unused global-summary result set; fixed a corrupted fallback character in sp_GetMentorMenteeAttendance.';
