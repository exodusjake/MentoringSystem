-- Phase 2: every stored proc that computed a read-time "Session #N" ordinal
-- (a correlated COUNT/DENSE_RANK over same-section sessions) now just
-- selects Sessions.SlotName directly instead — the mentor picks the slot at
-- creation time (SessionsController.Post/Put), so there's nothing left to
-- derive. Simpler and no longer silently mis-numbers when sessions across
-- two sections land on the same date.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ── sp_GetMentorSessions (SessionsAdminService.GetMentorSessionsAsync) ──────
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorSessions
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear');
    DECLARE @Semester     NVARCHAR(50) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester');
    -- SessionLimit1stSem/2ndSem are no longer editable (Admin Settings'
    -- "Session Limits" card is removed — the fixed slot list IS the limit
    -- now), so these SystemSettings rows are frozen at 6/5 going forward.
    -- Left as-is rather than ripped out: RS1/RS3 below still return them
    -- and nothing currently reads them from the frontend, but removing the
    -- resultset shape isn't needed for this change.
    DECLARE @SessionLimit INT = CASE WHEN @Semester = '2nd Semester'
        THEN ISNULL((SELECT CAST(SettingValue AS INT) FROM dbo.SystemSettings WHERE SettingKey = 'SessionLimit2ndSem'), 5)
        ELSE ISNULL((SELECT CAST(SettingValue AS INT) FROM dbo.SystemSettings WHERE SettingKey = 'SessionLimit1stSem'), 6)
    END;

    -- RS1: mentor info + session limit + regular session count + signature
    SELECT
        u.UserID   AS MentorID,
        u.FirstName, u.LastName, u.Email, mp.Department, mp.School,
        @SessionLimit AS SessionLimit,
        (
            SELECT COUNT(DISTINCT s2.SessionID)
            FROM   dbo.Sessions s2
            WHERE  s2.MentorID   = u.UserID
              AND  s2.SchoolYear = @SchoolYear
              AND  s2.Semester   = @Semester
              AND  s2.RequestID  IS NULL
              AND  s2.SectionCode IS NOT NULL
              AND  s2.Status    != 'Cancelled'
        ) AS RegularSessionCount,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec.SectionCode, mep.Section) AS val
                FROM   dbo.MentorMentee    mm
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
                FROM   dbo.MentorMentee    mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = mm2.MenteeID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  mep2.Course IS NOT NULL
            ) t
        ) AS Courses,
        mp.SignatureFilePath
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS2: sessions list
    SELECT
        s.SessionID,
        s.SectionCode,
        s.SlotName,
        DENSE_RANK() OVER (ORDER BY s.SessionDate, s.SessionID)        AS DenseRank,
        s.SessionDate,
        s.TimeEnd,
        s.Status                                                      AS SessionStatus,
        CASE WHEN s.RequestID IS NOT NULL THEN s.Notes
             ELSE COALESCE(s.Notes, 'Mentoring Session')
        END                                                            AS Topic,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             ELSE
               CASE WHEN s.SectionCode IS NULL THEN CAST(1 AS BIT)
                    ELSE CAST(0 AS BIT)
               END
        END                                                            AS IsMakeup,
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
                   AND  ISNULL(mep2.IsDropOut, 0) = 0
                   AND  (s.SectionCode IS NULL
                         OR COALESCE(sec2.SectionCode, mep2.Section) = s.SectionCode))
        END                                                            AS TotalAttendees,
        (SELECT COUNT(*)
         FROM   dbo.Attendance a3
         JOIN   dbo.MenteeProfiles mep3 ON mep3.UserID = a3.MenteeID
         WHERE  a3.SessionID = s.SessionID AND a3.IsPresent = 1
           AND  ISNULL(mep3.IsDropOut, 0) = 0)                         AS PresentCount,
        SUM(CASE WHEN a.MentorNotes IS NOT NULL AND a.MentorNotes<>'' THEN 1 ELSE 0 END) AS NotesFilledCount,
        p.FilePath  AS ProofFilePath,
        p.FileType  AS ProofFileType,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec2.SectionCode, mep2.Section) AS val
                FROM   dbo.Attendance      a2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = a2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  a2.SessionID = s.SessionID
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
            ) t
        )                                                              AS Sections,
        s.QRCodeToken,
        s.SchoolYear,
        s.Semester
    FROM   dbo.Sessions        s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN dbo.Attendance      a  ON a.SessionID  = s.SessionID
    LEFT   JOIN (
        SELECT SessionID, FilePath, FileType,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.MentorID = @MentorID
    GROUP  BY s.SessionID, s.MentorID, s.SessionDate, s.TimeEnd, s.Status,
              s.RequestID, sr.Purpose, sr.AvailabilityID, s.Notes, s.SectionCode, s.SlotName,
              p.FilePath, p.FileType, s.QRCodeToken, s.SchoolYear, s.Semester
    ORDER  BY s.SessionDate DESC;

    -- RS3: per-section regular-session counts for the current semester
    SELECT
        sect.SectionCode,
        @SessionLimit AS SessionLimit,
        (
            SELECT COUNT(DISTINCT s3.SessionID)
            FROM   dbo.Sessions s3
            WHERE  s3.MentorID   = @MentorID
              AND  s3.SchoolYear = @SchoolYear
              AND  s3.Semester   = @Semester
              AND  s3.RequestID  IS NULL
              AND  s3.Status    != 'Cancelled'
              AND  s3.SectionCode = sect.SectionCode
        ) AS RegularSessionCount
    FROM (
        SELECT DISTINCT COALESCE(sec.SectionCode, mep.Section) AS SectionCode
        FROM   dbo.MentorMentee    mm
        INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID
        LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
        WHERE  mm.MentorID = @MentorID AND mm.IsActive = 1
          AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
    ) sect
    ORDER BY sect.SectionCode;
END;
GO

-- ── sp_GetMenteeAttendanceHistory (AttendanceLogsService) ───────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetMenteeAttendanceHistory
    @MenteeID INT,
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SectionCode NVARCHAR(100);
    SELECT @SectionCode = COALESCE(sec.SectionCode, mep.Section)
    FROM   dbo.MenteeProfiles mep
    LEFT   JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
    WHERE  mep.UserID = @MenteeID;

    SELECT
        COALESCE(a.AttendanceID, 0)                                  AS AttendanceID,
        q.SlotName,
        q.IsMakeup,
        q.SessionDate,
        q.Topic,
        q.SessionStatus,
        COALESCE(a.IsPresent, 0)                                     AS IsPresent,
        a.ScannedAt,
        a.AbsenceReason,
        a.MentorNotes,
        CASE WHEN a.AttendanceID IS NOT NULL
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END                                                          AS IsRecorded
    FROM (
        SELECT s.SessionID, s.SessionDate, s.SlotName,
               CAST(0 AS BIT) AS IsMakeup,
               CASE
                   WHEN s.SectionCode IS NOT NULL
                       THEN LTRIM(SUBSTRING(s.Notes, CHARINDEX(']',s.Notes)+1, LEN(s.Notes)))
                   ELSE COALESCE(s.Notes, 'Mentoring Session')
               END AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID
                                       AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
        WHERE  s.MentorID = @MentorID AND s.RequestID IS NULL AND s.Status != 'Cancelled'
          AND  (@SectionCode IS NULL
                OR s.SectionCode IS NULL
                OR s.SectionCode = @SectionCode)

        UNION ALL

        SELECT s.SessionID, s.SessionDate, NULL AS SlotName,
               CAST(1 AS BIT) AS IsMakeup,
               'Make-up Session' AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions        s
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  s.MentorID = @MentorID AND s.Status != 'Cancelled'
          AND  sr.MenteeID = @MenteeID AND sr.Status = 'Approved'
    ) q
    LEFT   JOIN dbo.Attendance   a  ON a.SessionID = q.SessionID AND a.MenteeID = @MenteeID
    ORDER  BY q.SessionDate DESC;
END;
GO

-- ── sp_GetSessionProofs (SessionProofsAdminService) ─────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionProofs
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: session proof rows — completed sessions only
    SELECT
        s.SessionID,
        s.SlotName,
        s.SessionDate,
        s.SectionCode,
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
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ── sp_GetLogsheet (SessionsAdminService.GetLogsheetAsync) ──────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetLogsheet
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: mentor info (includes SignatureFilePath for printed logsheets)
    SELECT u.UserID AS MentorID, u.FirstName, u.LastName,
           mp.Department, mp.School, mp.SignatureFilePath
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS2: flat rows (one per mentee per session)
    SELECT
        s.SessionID,
        s.SlotName,
        s.SessionDate,
        COALESCE(ava.StartTime, CONVERT(TIME, s.SessionDate))        AS TimeStart,
        s.TimeEnd,
        COALESCE(sr.Purpose, s.Notes, 'Mentoring Session')            AS Topic,
        s.Status                                                      AS SessionStatus,
        a.MenteeID,
        COALESCE(u.FirstName + ' ' + u.LastName, NULL)               AS MenteeName,
        COALESCE(sec.SectionCode, mep.Section, N'-')                  AS SectionCode,
        a.AttendanceID,
        a.ScannedAt,
        COALESCE(a.IsPresent, 0)                                     AS IsPresent,
        a.Remarks,
        a.MentorNotes,
        a.AbsenceReason,
        CASE
            WHEN s.RequestID IS NOT NULL THEN NULL
            WHEN s.SectionCode IS NOT NULL THEN s.SectionCode
            ELSE (
                SELECT CASE
                    WHEN COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section)) = 1
                    THEN MAX(COALESCE(sec2.SectionCode, mep2.Section))
                    ELSE NULL
                END
                FROM   dbo.MentorMentee    mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  mm2.MentorID = s.MentorID AND mm2.IsActive = 1
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
                  AND  COALESCE(sec2.SectionCode, mep2.Section) <> N'-'
            )
        END                                                           AS Sections,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             WHEN s.SectionCode IS NULL   THEN CAST(1 AS BIT)
             ELSE CAST(0 AS BIT)
        END                                                            AS IsMakeup,
        p.FilePath  AS ProofFilePath,
        p.FileType  AS ProofFileType,
        mep.SignatureFilePath,
        ISNULL(mep.IsDropOut, 0)                                      AS IsDropOut,
        s.SchoolYear,
        s.Semester,
        s.SectionCode AS SessionSectionCode
    FROM   dbo.Sessions          s
    LEFT   JOIN dbo.SessionRequests  sr  ON sr.RequestID      = s.RequestID
    LEFT   JOIN dbo.Availability     ava ON ava.AvailabilityID = sr.AvailabilityID
    LEFT   JOIN dbo.Attendance       a   ON a.SessionID        = s.SessionID
    LEFT   JOIN dbo.Users            u   ON u.UserID           = a.MenteeID
    LEFT   JOIN dbo.MenteeProfiles   mep ON mep.UserID         = a.MenteeID
    LEFT   JOIN dbo.Sections         sec ON sec.SectionID      = mep.SectionID
    LEFT   JOIN (
        SELECT SessionID, FilePath, FileType,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.MentorID = @MentorID
    ORDER  BY s.SessionDate ASC, s.SessionID ASC, u.LastName ASC, u.FirstName ASC;
END;
GO
