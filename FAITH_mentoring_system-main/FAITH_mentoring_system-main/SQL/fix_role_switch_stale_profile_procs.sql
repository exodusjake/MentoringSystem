
USE AstraMentoring;
GO

-- Same class of bug as fix_role_switch_stale_profile_views.sql, found in 5
-- more places after auditing every procedure/view that lists "current
-- mentors" or "current mentees": each of these joins to MentorProfiles/
-- MenteeProfiles (which intentionally survives a role switch, to keep
-- history) without also checking Users.Role, so a user switched away from
-- Mentor/Mentee keeps showing up in these lists. Confirmed NOT an issue in
-- sp_GetAttendanceFullReport, sp_GetRecentActivities, sp_GetMakeupSession-
-- Requesters (already correct, or scoped to a specific historical session/
-- ID rather than a "browse current mentors" list) — left untouched.

-- ── sp_GetMentorCards (Admin Sessions "Mentor Monitoring" overview) ────
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorCards
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        u.UserID                                                        AS MentorID,
        u.FirstName,
        u.LastName,
        mp.Department,
        mp.School,
        COUNT(DISTINCT s.SessionID)                                     AS TotalSessions,
        COUNT(DISTINCT CASE WHEN s.Status = 'Completed'
                            THEN s.SessionID END)                       AS CompletedSessions,
        (
            SELECT COUNT(DISTINCT a2.SessionID)
            FROM   dbo.Attendance a2
            INNER  JOIN dbo.Sessions s2 ON s2.SessionID = a2.SessionID
            WHERE  s2.MentorID = u.UserID
              AND  a2.MentorNotes IS NOT NULL AND a2.MentorNotes <> ''
        )                                                               AS SessionsWithNotes,
        MAX(s.SessionDate)                                              AS LastSessionDate,
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
        )                                                               AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep3.Course AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID = mm3.MenteeID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  mep3.Course IS NOT NULL
            ) t
        )                                                               AS Courses
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID = u.UserID AND mm.IsActive = 1
    LEFT   JOIN dbo.Sessions        s  ON s.MentorID  = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentor'
    GROUP  BY u.UserID, u.FirstName, u.LastName, mp.Department, mp.School
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ── sp_GetMentorOverview (Head/Admin MonitorActivities — mentor
--    performance list, dashboards, School Breakdown, ranking charts) ───
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorOverview
    @IncludeInactive BIT           = 0,
    @SchoolYear      NVARCHAR(20)  = NULL,
    @Semester        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SessionLimit INT = 6;

    IF @SchoolYear IS NULL
        SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    IF @Semester IS NULL
        SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = '2nd Semester'
                             THEN 'SessionLimit2ndSem' ELSE 'SessionLimit1stSem' END;

    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions, @SchoolYear AS SchoolYear, @Semester AS Semester;

    SELECT
        u.UserID        AS MentorID,
        u.FirstName, u.LastName, u.Email, u.ContactNumber,
        mp.School, d.DepartmentName,
        mp.SignatureFilePath,
        u.IsActive                                                                       AS IsActive,
        (SELECT COUNT(*) FROM dbo.MentorMentee mm
         WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                                AS MenteeCount,
        (SELECT COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section))
         FROM   dbo.MentorMentee    mm2
         INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
         LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
         WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
           AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL)                     AS SectionCount,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec3.SectionCode, mep3.Section) AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID    = mm3.MenteeID
                LEFT   JOIN dbo.Sections       sec3 ON sec3.SectionID = mep3.SectionID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  COALESCE(sec3.SectionCode, mep3.Section) IS NOT NULL
            ) t
        )                                                                                  AS Sections,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s.SlotName + N'|' + s.SectionCode AS pair
                FROM   dbo.Sessions s
                WHERE  s.MentorID = u.UserID AND s.Status = 'Completed'
                  AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                  AND  s.RequestID IS NULL AND s.SectionCode IS NOT NULL
                UNION ALL
                SELECT s.SlotName + N'|' + COALESCE(secM.SectionCode, mepM.Section) AS pair
                FROM   dbo.Sessions s
                INNER  JOIN dbo.Attendance     aM   ON aM.SessionID = s.SessionID AND aM.IsPresent = 1
                INNER  JOIN dbo.MenteeProfiles mepM ON mepM.UserID  = aM.MenteeID
                INNER  JOIN dbo.MentorMentee   mmM  ON mmM.MenteeID = aM.MenteeID AND mmM.MentorID = s.MentorID AND mmM.IsActive = 1
                LEFT   JOIN dbo.Sections       secM ON secM.SectionID = mepM.SectionID
                WHERE  s.MentorID = u.UserID AND s.Status = 'Completed'
                  AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                  AND  s.RequestID IS NOT NULL AND s.SlotName IS NOT NULL
                  AND  COALESCE(secM.SectionCode, mepM.Section) IS NOT NULL
            ) t
        )                                                                                 AS CompletedSessions,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s4.SlotName + N'|' + s4.SectionCode AS pair
                FROM   dbo.Sessions s4
                WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
                  AND  s4.RequestID IS NULL AND s4.SectionCode IS NOT NULL AND s4.Status <> 'Cancelled'
                  AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = 'Submitted'
                  AND  EXISTS (
                      SELECT 1 FROM dbo.CalendarEvents ce
                      WHERE ce.EventType = 'Deadline' AND ce.SlotName = s4.SlotName
                        AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                        AND s4.SubmittedAt <= ce.StartDate
                  )
                UNION ALL
                SELECT s4.SlotName + N'|' + COALESCE(sec4M.SectionCode, mep4M.Section) AS pair
                FROM   dbo.Sessions s4
                INNER  JOIN dbo.Attendance     a4M   ON a4M.SessionID = s4.SessionID AND a4M.IsPresent = 1
                INNER  JOIN dbo.MenteeProfiles mep4M ON mep4M.UserID  = a4M.MenteeID
                INNER  JOIN dbo.MentorMentee   mm4M  ON mm4M.MenteeID = a4M.MenteeID AND mm4M.MentorID = s4.MentorID AND mm4M.IsActive = 1
                LEFT   JOIN dbo.Sections       sec4M ON sec4M.SectionID = mep4M.SectionID
                WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
                  AND  s4.RequestID IS NOT NULL AND s4.SlotName IS NOT NULL AND s4.Status <> 'Cancelled'
                  AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = 'Submitted'
                  AND  COALESCE(sec4M.SectionCode, mep4M.Section) IS NOT NULL
                  AND  EXISTS (
                      SELECT 1 FROM dbo.CalendarEvents ce
                      WHERE ce.EventType = 'Deadline' AND ce.SlotName = s4.SlotName
                        AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                        AND s4.SubmittedAt <= ce.StartDate
                  )
            ) t
        )                                                                                 AS OnTimeCount,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s5.SlotName + N'|' + s5.SectionCode AS pair
                FROM   dbo.Sessions s5
                WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
                  AND  s5.RequestID IS NULL AND s5.SectionCode IS NOT NULL AND s5.Status <> 'Cancelled'
                  AND  s5.LogStatus = 'Submitted'
                  AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)
                UNION ALL
                SELECT s5.SlotName + N'|' + COALESCE(sec5M.SectionCode, mep5M.Section) AS pair
                FROM   dbo.Sessions s5
                INNER  JOIN dbo.Attendance     a5M   ON a5M.SessionID = s5.SessionID AND a5M.IsPresent = 1
                INNER  JOIN dbo.MenteeProfiles mep5M ON mep5M.UserID  = a5M.MenteeID
                INNER  JOIN dbo.MentorMentee   mm5M  ON mm5M.MenteeID = a5M.MenteeID AND mm5M.MentorID = s5.MentorID AND mm5M.IsActive = 1
                LEFT   JOIN dbo.Sections       sec5M ON sec5M.SectionID = mep5M.SectionID
                WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
                  AND  s5.RequestID IS NOT NULL AND s5.SlotName IS NOT NULL AND s5.Status <> 'Cancelled'
                  AND  s5.LogStatus = 'Submitted'
                  AND  COALESCE(sec5M.SectionCode, mep5M.Section) IS NOT NULL
                  AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)
            ) t
        )                                                                                 AS CompleteCount,
        (
            SELECT STRING_AGG(x.SlotName + N':' + CAST(x.AttendeeCount AS NVARCHAR(10)), ', ')
            FROM (
                SELECT s6.SlotName,
                       COUNT(DISTINCT CASE WHEN a.IsPresent = 1 AND ISNULL(mep6.IsDropOut, 0) = 0
                                           THEN a.MenteeID END)                             AS AttendeeCount
                FROM   dbo.Sessions s6
                LEFT   JOIN dbo.Attendance     a    ON a.SessionID = s6.SessionID
                LEFT   JOIN dbo.MenteeProfiles mep6 ON mep6.UserID = a.MenteeID
                WHERE  s6.MentorID = u.UserID AND s6.SchoolYear = @SchoolYear AND s6.Semester = @Semester
                  AND  s6.Status <> 'Cancelled' AND s6.SlotName IS NOT NULL
                  AND  (s6.SectionCode IS NOT NULL OR s6.RequestID IS NOT NULL)
                GROUP  BY s6.SlotName
            ) x
        )                                                                                  AS SlotAttendance,
        (SELECT MAX(s.SessionDate) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)                     AS LastSessionDate,
        (SELECT MIN(s.SessionDate) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Scheduled'
           AND s.SessionDate >= CAST(GETDATE() AS DATE)
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)                     AS NextSessionDate
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  (u.IsActive = 1 OR @IncludeInactive = 1) AND u.Role = 'Mentor'
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ── sp_GetAttendanceOverview (Attendance Logs/Summary school overview) ─
CREATE OR ALTER PROCEDURE dbo.sp_GetAttendanceOverview
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear NVARCHAR(20), @Semester NVARCHAR(50);
    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

    -- One row per mentor, scoped to the current semester -- matching
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
    WHERE  u.IsActive = 1 AND u.Role = 'Mentor'
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ── sp_GetSessionProofs (Admin Session Proofs list + mentor filter) ────
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionProofs
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: session proof rows — completed sessions only
    SELECT
        s.SessionID,
        s.SlotName,
        s.SessionDate,
        COALESCE(
            s.SectionCode,
            (
                SELECT CASE
                    WHEN COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section)) = 1
                    THEN MAX(COALESCE(sec2.SectionCode, mep2.Section))
                    ELSE NULL
                END
                FROM   dbo.Attendance      a2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = a2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  a2.SessionID = s.SessionID AND a2.IsPresent = 1
            )
        )                                                    AS SectionCode,
        COALESCE(sr.Purpose, s.Notes, 'Session')            AS Topic,
        u.UserID                                            AS MentorID,
        u.FirstName                                         AS MentorFirstName,
        u.LastName                                          AS MentorLastName,
        mp.School                                           AS MentorSchool,
        mp.Department                                       AS MentorDepartment,
        p.ProofID, p.FilePath, p.FileType, p.UploadedAt,
        CASE WHEN p.ProofID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasProof
    FROM   dbo.Sessions             s
    JOIN   dbo.Users                u  ON u.UserID     = s.MentorID
    LEFT   JOIN dbo.MentorProfiles  mp ON mp.UserID    = u.UserID
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath, FileType, UploadedAt,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.Status = 'Completed'
    ORDER  BY s.SessionDate DESC, u.LastName, u.FirstName;

    -- RS2: active mentors for filter dropdown
    SELECT DISTINCT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.School, mp.Department
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentor'
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ── sp_GetUserStats (dashboard TotalMentors/TotalMentees/session +
--    section counts/mentee status-tier distribution) ────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetUserStats
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

    -- RS1: scalar counts
    SELECT
        (SELECT COUNT(*) FROM dbo.Users WHERE IsActive = 1)                                AS TotalUsers,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
         WHERE u.IsActive = 1 AND u.Role = 'Mentor')                                        AS TotalMentors,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.IsActive = 1 AND u.Role = 'Mentee')                                        AS TotalMentees,
        (SELECT COUNT(DISTINCT mm.MenteeID) FROM dbo.MentorMentee mm
         WHERE mm.IsActive = 1)                                                            AS Assigned,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.Role = 'Mentee' AND u.IsActive = 1
           AND me.IsDropOut = 0
           AND me.School IS NOT NULL AND me.School != ''
           AND NOT EXISTS (
               SELECT 1 FROM dbo.MentorMentee mm
               WHERE mm.MenteeID = u.UserID AND mm.IsActive = 1))                         AS Unassigned,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.Role = 'Mentee' AND u.IsActive = 1 AND me.IsDropOut = 1)                AS DroppedOut,
        (SELECT COUNT(DISTINCT a.MenteeID) FROM dbo.Attendance a
         INNER JOIN dbo.MentorMentee mm ON mm.MenteeID = a.MenteeID AND mm.IsActive = 1
         WHERE a.IsPresent = 1)                                                            AS ActiveMentees,
        (SELECT COUNT(*) FROM dbo.Sessions s
         LEFT JOIN dbo.ProofOfSession pos ON pos.SessionID = s.SessionID
         WHERE s.Status = 'Completed' AND pos.ProofID IS NULL)                            AS SessionsWithoutProof,
        ISNULL(@SessionLimit, 6)                                                           AS RequiredSessions;

    -- RS2: per-mentor regular completed session counts + section count (current semester)
    SELECT u.UserID AS MentorID,
           ISNULL(sc.SessionCount, 0)  AS SessionCount,
           ISNULL(sn.SectionCount, 1)  AS SectionCount
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT   JOIN (
        SELECT MentorID, COUNT(*) AS SessionCount
        FROM   dbo.Sessions
        WHERE  Status     = 'Completed'
          AND  SchoolYear = @SchoolYear
          AND  Semester   = @Semester
          AND  RequestID  IS NULL
          AND  SectionCode IS NOT NULL
        GROUP  BY MentorID
    ) sc ON sc.MentorID = u.UserID
    LEFT   JOIN (
        SELECT mm.MentorID,
               COUNT(DISTINCT COALESCE(sec.SectionCode, mep.Section)) AS SectionCount
        FROM   dbo.MentorMentee    mm
        INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID
        LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
        WHERE  mm.IsActive = 1
          AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
        GROUP  BY mm.MentorID
    ) sn ON sn.MentorID = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentor';

    -- RS3: mentee attendance status distribution — per mentee, only count
    -- sessions from THEIR OWN section (regular) or theirs specifically
    -- (approved makeup requests); previously counted every completed
    -- session of the mentor regardless of section, skewing the tier for
    -- any mentee whose mentor also handles another section.
    SELECT
        CASE
            WHEN totalSessions = 0                                            THEN 'NoSessions'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.80         THEN 'Excellent'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.60         THEN 'OnTrack'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.40         THEN 'Behind'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.20         THEN 'AtRisk'
            ELSE                                                                   'Critical'
        END AS StatusTier,
        COUNT(*) AS MenteeCount
    FROM (
        SELECT
            u.UserID,
            COUNT(DISTINCT s.SessionID)                             AS totalSessions,
            SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)       AS presentCount
        FROM   dbo.Users u
        INNER  JOIN dbo.MenteeProfiles mp ON mp.UserID   = u.UserID AND mp.IsDropOut = 0
        INNER  JOIN dbo.MentorMentee   mm ON mm.MenteeID = u.UserID AND mm.IsActive  = 1
        LEFT   JOIN dbo.Sections       msec ON msec.SectionID = mp.SectionID
        LEFT   JOIN dbo.Sessions        s  ON s.MentorID   = mm.MentorID
                                          AND s.Status     = 'Completed'
                                          AND s.SessionDate >= mm.AssignedDate
                                          AND (
                                              (s.RequestID IS NULL
                                               AND (s.SectionCode IS NULL
                                                    OR s.SectionCode = COALESCE(msec.SectionCode, mp.Section)))
                                              OR
                                              (s.RequestID IS NOT NULL
                                               AND EXISTS (
                                                   SELECT 1 FROM dbo.SessionRequests sr
                                                   WHERE  sr.RequestID = s.RequestID
                                                     AND  sr.MenteeID  = u.UserID
                                                     AND  sr.Status    = 'Approved'))
                                          )
        LEFT   JOIN dbo.Attendance     a  ON a.SessionID = s.SessionID AND a.MenteeID = u.UserID
        WHERE  u.IsActive = 1 AND u.Role = 'Mentee'
        GROUP  BY u.UserID
    ) ms
    GROUP BY
        CASE
            WHEN totalSessions = 0                                            THEN 'NoSessions'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.80         THEN 'Excellent'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.60         THEN 'OnTrack'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.40         THEN 'Behind'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.20         THEN 'AtRisk'
            ELSE                                                                   'Critical'
        END;
END;
GO

PRINT 'Done. sp_GetMentorCards, sp_GetMentorOverview, sp_GetAttendanceOverview, sp_GetSessionProofs, sp_GetUserStats now all require the current Role, not just a leftover profile row.';
