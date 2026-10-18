-- Fix: multi-section mentor support
-- Each mentor now has an "effective required sessions" = SessionLimit × SectionCount.
-- sp_GetUserStats RS2: adds SectionCount so C# can compute per-mentor thresholds.
-- sp_GetMentorOverview RS2: fixes SectionCount to use COALESCE(SectionCode, Section).
-- sp_GetMentorDetail RS2: adds SectionCount so the service can scale RequiredSessions.

-- ============================================================
-- sp_GetUserStats (full rewrite to add SectionCount to RS2)
-- ============================================================
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
         WHERE u.IsActive = 1)                                                             AS TotalMentors,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.IsActive = 1)                                                             AS TotalMentees,
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
          AND  Notes      LIKE '[[]%]%'
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
    WHERE  u.IsActive = 1;

    -- RS3: mentee attendance status distribution
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
        LEFT   JOIN dbo.Sessions        s  ON s.MentorID   = mm.MentorID
                                          AND s.Status     = 'Completed'
                                          AND s.SessionDate >= mm.AssignedDate
                                          AND (s.RequestID IS NULL
                                               OR EXISTS (
                                                   SELECT 1 FROM dbo.SessionRequests sr
                                                   WHERE  sr.RequestID = s.RequestID
                                                     AND  sr.MenteeID  = u.UserID
                                                     AND  sr.Status    = 'Approved'))
        LEFT   JOIN dbo.Attendance     a  ON a.SessionID = s.SessionID AND a.MenteeID = u.UserID
        WHERE  u.IsActive = 1
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

-- ============================================================
-- sp_GetMentorOverview — fix SectionCount, keep CompletedSessions regular-only
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorOverview
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

    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    SELECT
        u.UserID        AS MentorID,
        u.FirstName, u.LastName, u.Email, u.ContactNumber,
        mp.School, d.DepartmentName,
        (SELECT COUNT(*) FROM dbo.MentorMentee mm
         WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                                AS MenteeCount,
        -- SectionCount: distinct sections from active assignments
        (SELECT COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section))
         FROM   dbo.MentorMentee    mm2
         INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
         LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
         WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
           AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL)                     AS SectionCount,
        -- CompletedSessions: regular sessions only (has [SECTION] prefix, no RequestID)
        (SELECT COUNT(*) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.RequestID IS NULL AND s.Notes LIKE '[[]%]%')                             AS CompletedSessions,
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
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ============================================================
-- sp_GetMentorDetail — add SectionCount to RS2
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorDetail
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

    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName,
        u.Email, u.ContactNumber, mp.School, d.DepartmentName,
        (SELECT COUNT(*) FROM dbo.MentorMentee mm
         WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                               AS MenteeCount,
        -- SectionCount: distinct sections from active assignments
        (SELECT COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section))
         FROM   dbo.MentorMentee    mm2
         INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
         LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
         WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
           AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL)                    AS SectionCount,
        -- CompletedSessions: regular sessions only
        (SELECT COUNT(*) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.RequestID IS NULL AND s.Notes LIKE '[[]%]%')                            AS CompletedSessions
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  u.UserID = @MentorID AND u.IsActive = 1;

    -- RS3: sessions list (unchanged)
    SELECT
        s.SessionID,
        COALESCE(sr.Purpose, s.Notes, 'Session')                    AS Topic,
        s.Status, s.SessionDate, s.Notes,
        (SELECT COUNT(*) FROM dbo.Attendance a
         WHERE a.SessionID = s.SessionID AND a.IsPresent = 1)       AS PresentCount,
        CASE
            WHEN s.RequestID IS NOT NULL THEN
                (SELECT COUNT(DISTINCT sr2.MenteeID) FROM dbo.SessionRequests sr2
                 WHERE sr2.AvailabilityID = sr.AvailabilityID AND sr2.Status = 'Approved')
            ELSE
                (SELECT COUNT(*)
                 FROM   dbo.MentorMentee    mm2
                 INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                 LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                 WHERE  mm2.MentorID = s.MentorID AND mm2.IsActive = 1
                   AND  (NOT (COALESCE(s.Notes,'') LIKE '[[]%[]]%')
                         OR COALESCE(sec2.SectionCode, mep2.Section) =
                             SUBSTRING(s.Notes,2,IIF(CHARINDEX(']',s.Notes)>2,CHARINDEX(']',s.Notes)-2,0))))
        END                                                          AS TotalMentees,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.ProofOfSession p
                          WHERE p.SessionID = s.SessionID)
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END                                                          AS HasProof
    FROM   dbo.Sessions s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    WHERE  s.MentorID = @MentorID
      AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
    ORDER  BY s.SessionDate DESC;

    -- RS4: mentees with attendance stats (unchanged)
    SELECT
        u.UserID          AS MenteeID,
        u.FirstName, u.LastName, u.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'—')                AS SectionCode,
        (SELECT COUNT(*) FROM dbo.Attendance a
         JOIN dbo.Sessions sess ON sess.SessionID = a.SessionID
         WHERE a.MenteeID = u.UserID AND a.IsPresent = 1
           AND sess.MentorID = @MentorID AND sess.Status = 'Completed'
           AND sess.SchoolYear = @SchoolYear AND sess.Semester = @Semester
           AND sess.SessionDate >= mm.AssignedDate)                  AS SessionsAttended,
        (SELECT COUNT(DISTINCT s.SessionID)
         FROM dbo.Sessions s
         WHERE s.MentorID = @MentorID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.SessionDate >= mm.AssignedDate
           AND (s.RequestID IS NULL
                OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                           WHERE sr.RequestID = s.RequestID
                             AND sr.MenteeID = u.UserID AND sr.Status = 'Approved'))) AS TotalCompleted,
        (SELECT MAX(sess.SessionDate) FROM dbo.Attendance a
         JOIN dbo.Sessions sess ON sess.SessionID = a.SessionID
         WHERE a.MenteeID = u.UserID AND sess.MentorID = @MentorID
           AND a.IsPresent = 1
           AND sess.SchoolYear = @SchoolYear AND sess.Semester = @Semester)      AS LastAttended
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = u.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = u.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
GO

PRINT 'Done. Multi-section support: SectionCount added to RS2 of all three SPs.';
