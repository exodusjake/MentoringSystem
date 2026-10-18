-- Migrates every stored procedure that used to parse the "[SECTION]"
-- prefix out of Sessions.Notes to instead read the new Sessions.SectionCode
-- column directly (see add_sectioncode_column_to_sessions.sql). No other
-- logic changes — every WHERE/JOIN/CASE that used to test
-- "Notes LIKE '[[]%]%'" or extract via SUBSTRING/CHARINDEX now just tests
-- or compares SectionCode. Notes itself is untouched (still used for the
-- display topic text).

-- ── 1) sp_GetMentorSessions ─────────────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorSessions
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear');
    DECLARE @Semester     NVARCHAR(50) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester');
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
        CASE
            WHEN s.RequestID IS NOT NULL
              OR s.Status = 'Cancelled'
              OR s.SectionCode IS NULL
            THEN NULL
            ELSE (
                SELECT COUNT(*)
                FROM   dbo.Sessions s2
                WHERE  s2.MentorID   = s.MentorID
                  AND  s2.SessionDate <= s.SessionDate
                  AND  (s2.SessionDate < s.SessionDate OR s2.SessionID <= s.SessionID)
                  AND  s2.SchoolYear  = s.SchoolYear
                  AND  s2.Semester    = s.Semester
                  AND  s2.RequestID  IS NULL
                  AND  s2.SectionCode = s.SectionCode
                  AND  s2.Status     != 'Cancelled'
            )
        END                                                           AS SessionNumber,
        DENSE_RANK() OVER (ORDER BY s.SessionDate, s.SessionID)      AS DenseRank,
        s.SessionDate,
        s.TimeEnd,
        s.Status                                                      AS SessionStatus,
        CASE WHEN s.RequestID IS NOT NULL THEN s.Notes
             ELSE COALESCE(s.Notes, 'Mentoring Session')
        END                                                           AS Topic,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             ELSE
               CASE WHEN s.SectionCode IS NULL THEN CAST(1 AS BIT)
                    ELSE CAST(0 AS BIT)
               END
        END                                                           AS IsMakeup,
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
                   AND  (s.SectionCode IS NULL
                         OR COALESCE(sec2.SectionCode, mep2.Section) = s.SectionCode))
        END                                                           AS TotalAttendees,
        SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)            AS PresentCount,
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
        )                                                             AS Sections,
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
              s.RequestID, sr.Purpose, sr.AvailabilityID, s.Notes, s.SectionCode,
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

-- ── 2) sp_GetSessionMentees ──────────────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionMentees
    @SessionID INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.AttendanceID,
        ue.UserID                                        AS MenteeID,
        ue.FirstName                                     AS MenteeFirstName,
        ue.LastName                                      AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')   AS SectionCode,
        mep.Course, mep.YearLevel,
        a.IsPresent, a.ScannedAt, a.AbsenceReason, a.MentorNotes, a.Remarks
    FROM   dbo.Sessions        s
    JOIN   dbo.MentorMentee    mm  ON mm.MentorID  = s.MentorID AND mm.IsActive = 1
    JOIN   dbo.Users           ue  ON ue.UserID    = mm.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = mm.MenteeID
    LEFT   JOIN dbo.Sections   sec ON sec.SectionID  = mep.SectionID
    LEFT   JOIN dbo.Attendance a   ON a.SessionID    = s.SessionID AND a.MenteeID = mm.MenteeID
    WHERE  s.SessionID = @SessionID
      AND  s.RequestID IS NULL
      AND  (
           s.SectionCode IS NULL
           OR COALESCE(sec.SectionCode, mep.Section) = s.SectionCode
      )

    UNION ALL

    SELECT
        a.AttendanceID,
        ue.UserID                                        AS MenteeID,
        ue.FirstName                                     AS MenteeFirstName,
        ue.LastName                                      AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')   AS SectionCode,
        mep.Course, mep.YearLevel,
        a.IsPresent, a.ScannedAt, a.AbsenceReason, a.MentorNotes, a.Remarks
    FROM   dbo.Attendance      a
    JOIN   dbo.Sessions        s   ON s.SessionID  = a.SessionID AND s.SessionID = @SessionID
    JOIN   dbo.SessionRequests sr  ON sr.RequestID = s.RequestID
    JOIN   dbo.Users           ue  ON ue.UserID    = a.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = a.MenteeID
    LEFT   JOIN dbo.Sections   sec ON sec.SectionID  = mep.SectionID
    WHERE  a.MenteeID = sr.MenteeID
       OR  EXISTS (
           SELECT 1 FROM dbo.SessionRequests sr2
           WHERE  sr2.AvailabilityID = sr.AvailabilityID
             AND  sr2.MenteeID = a.MenteeID AND sr2.Status = 'Approved'
       )

    ORDER BY MenteeLastName, MenteeFirstName;
END;
GO

-- ── 3) sp_GetMentorDetail ────────────────────────────────────────────────
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

    -- RS1: required sessions for threshold
    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: mentor overview (with SectionCount + Sections)
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName,
        u.Email, u.ContactNumber, mp.School, d.DepartmentName,
        (SELECT COUNT(*) FROM dbo.MentorMentee mm
         WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                               AS MenteeCount,
        (SELECT COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section))
         FROM   dbo.MentorMentee    mm2
         INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
         LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
         WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
           AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL)                    AS SectionCount,
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
        )                                                                                 AS Sections,
        (SELECT COUNT(*) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.RequestID IS NULL AND s.SectionCode IS NOT NULL)                        AS CompletedSessions
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  u.UserID = @MentorID AND u.IsActive = 1;

    -- RS3: sessions list (includes ProofFilePath)
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
                   AND  (s.SectionCode IS NULL
                         OR COALESCE(sec2.SectionCode, mep2.Section) = s.SectionCode))
        END                                                          AS TotalMentees,
        CASE WHEN p.ProofID IS NOT NULL
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END                                                          AS HasProof,
        p.FilePath                                                   AS ProofFilePath
    FROM   dbo.Sessions s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.MentorID = @MentorID
      AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
    ORDER  BY s.SessionDate DESC;

    -- RS4: mentees with attendance stats + IsDropOut + SignatureFilePath
    SELECT
        u.UserID          AS MenteeID,
        u.FirstName, u.LastName, u.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')                AS SectionCode,
        ISNULL(mep.IsDropOut, 0)                                    AS IsDropOut,
        mep.SignatureFilePath,
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

-- ── 4) sp_GetMenteeAttendanceHistory ─────────────────────────────────────
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

    WITH RegularRanks AS (
        SELECT SessionID,
               DENSE_RANK() OVER (PARTITION BY SchoolYear, Semester ORDER BY SessionDate, SessionID) AS Rank
        FROM   dbo.Sessions
        WHERE  MentorID  = @MentorID
          AND  RequestID IS NULL
          AND  SectionCode IS NOT NULL
          AND  (@SectionCode IS NULL OR SectionCode = @SectionCode)
    )
    SELECT
        COALESCE(a.AttendanceID, 0)                                  AS AttendanceID,
        COALESCE(rr.Rank, 0)                                         AS SessionNumber,
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
        SELECT s.SessionID, s.SessionDate,
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
          -- A bracket-less session has no section to check (kept, as before);
          -- a bracketed one must name THIS mentee's own section.
          AND  (@SectionCode IS NULL
                OR s.SectionCode IS NULL
                OR s.SectionCode = @SectionCode)

        UNION ALL

        SELECT s.SessionID, s.SessionDate,
               CAST(1 AS BIT) AS IsMakeup,
               'Make-up Session' AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions        s
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  s.MentorID = @MentorID AND s.Status != 'Cancelled'
          AND  sr.MenteeID = @MenteeID AND sr.Status = 'Approved'
    ) q
    LEFT   JOIN RegularRanks rr ON rr.SessionID = q.SessionID
    LEFT   JOIN dbo.Attendance   a  ON a.SessionID = q.SessionID AND a.MenteeID = @MenteeID
    ORDER  BY q.SessionDate DESC;
END;
GO

-- ── 5) sp_GetSessionsForMentee ───────────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionsForMentee
    @MentorID INT,
    @MenteeID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear NVARCHAR(20) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear');
    DECLARE @Semester   NVARCHAR(50) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester');

    DECLARE @SectionCode NVARCHAR(100);
    SELECT @SectionCode = COALESCE(sec.SectionCode, mep.Section)
    FROM   dbo.MenteeProfiles mep
    LEFT   JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
    WHERE  mep.UserID = @MenteeID;

    -- RS1: mentor info
    SELECT u.UserID AS MentorID, u.FirstName, u.LastName,
           mp.Department, mp.School, NULL AS Sections, NULL AS Courses
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS2: sessions scoped to current semester with correct numbering
    SELECT
        s.SessionID,
        CASE
            WHEN s.RequestID IS NOT NULL OR s.Status = 'Cancelled' THEN NULL
            ELSE (SELECT COUNT(*)
                  FROM dbo.Sessions s2
                  WHERE s2.MentorID   = s.MentorID
                    AND s2.SchoolYear = s.SchoolYear
                    AND s2.Semester   = s.Semester
                    AND s2.RequestID IS NULL
                    AND s2.Status    != 'Cancelled'
                    AND (s2.SessionDate < s.SessionDate
                         OR (s2.SessionDate = s.SessionDate AND s2.SessionID <= s.SessionID)))
        END AS SessionNumber,
        s.SessionDate,
        s.TimeEnd,
        s.Status                                                     AS SessionStatus,
        CASE WHEN s.RequestID IS NOT NULL THEN s.Notes
             ELSE COALESCE(s.Notes, 'Mentoring Session')
        END                                                          AS Topic,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             ELSE CAST(0 AS BIT)
        END                                                          AS IsMakeup,
        0 AS TotalAttendees, 0 AS PresentCount, 0 AS NotesFilledCount,
        NULL AS ProofFilePath, NULL AS ProofFileType, NULL AS Sections,
        s.QRCodeToken
    FROM   dbo.Sessions        s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    WHERE  s.MentorID   = @MentorID
      AND  s.SchoolYear = @SchoolYear
      AND  s.Semester   = @Semester
      AND  (s.SectionCode IS NULL OR s.SectionCode = @SectionCode)
    ORDER  BY s.SessionDate DESC;
END;
GO

-- ── 6) sp_GetLogsheet ─────────────────────────────────────────────────────
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
        s.SessionDate,
        COALESCE(ava.StartTime, CONVERT(TIME, s.SessionDate))        AS TimeStart,
        s.TimeEnd,
        COALESCE(sr.Purpose, s.Notes, 'Mentoring Session')           AS Topic,
        s.Status                                                      AS SessionStatus,
        a.MenteeID,
        COALESCE(u.FirstName + ' ' + u.LastName, NULL)               AS MenteeName,
        COALESCE(sec.SectionCode, mep.Section, N'-')                 AS SectionCode,
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
             ELSE CAST(0 AS BIT)
        END                                                           AS IsMakeup,
        p.FilePath  AS ProofFilePath,
        p.FileType  AS ProofFileType,
        mep.SignatureFilePath,
        s.SchoolYear,
        s.Semester
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

-- ── 7) sp_GetAttendanceFullReport ────────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetAttendanceFullReport
    @School NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20),
            @Semester     NVARCHAR(50),
            @SessionLimit INT = 6;
    SELECT @SchoolYear   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    SELECT @Semester     = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';
    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = '2nd Semester'
                             THEN 'SessionLimit2ndSem' ELSE 'SessionLimit1stSem' END;

    -- RS1: session limit for current semester
    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: one row per active mentor (filtered by school if provided)
    SELECT
        u.UserID    AS MentorID,
        u.FirstName, u.LastName,
        mp.Department, mp.School,
        COUNT(DISTINCT s.SessionID) AS TotalSessions
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT   JOIN dbo.Sessions       s  ON s.MentorID   = u.UserID
                                     AND s.Status      = 'Completed'
                                     AND s.SchoolYear  = @SchoolYear
                                     AND s.Semester    = @Semester
                                     AND s.RequestID  IS NULL
    WHERE  u.Role = 'mentor' AND u.IsActive = 1
      AND  (@School IS NULL OR mp.School = @School)
    GROUP  BY u.UserID, u.FirstName, u.LastName, mp.Department, mp.School
    ORDER  BY u.LastName, u.FirstName;

    -- RS3: one row per mentee, for all mentors in RS2
    SELECT
        mm.MentorID,
        ue.UserID                                           AS MenteeID,
        ue.FirstName AS MenteeFirstName,
        ue.LastName  AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')       AS SectionCode,
        mep.Course,
        mep.YearLevel,
        COUNT(DISTINCT s.SessionID)                         AS TotalSessions,
        SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)  AS PresentCount
    FROM   dbo.MentorMentee mm
    INNER  JOIN dbo.Users          um  ON um.UserID   = mm.MentorID AND um.Role = 'mentor' AND um.IsActive = 1
    INNER  JOIN dbo.Users          ue  ON ue.UserID   = mm.MenteeID AND ue.IsActive = 1
    LEFT   JOIN dbo.MentorProfiles mp2 ON mp2.UserID  = mm.MentorID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN dbo.Sessions       s   ON s.MentorID    = mm.MentorID
                                      AND s.Status       = 'Completed'
                                      AND s.SchoolYear   = @SchoolYear
                                      AND s.Semester     = @Semester
                                      AND s.SessionDate >= mm.AssignedDate
                                      AND (
                                          (s.RequestID IS NULL
                                           AND (s.SectionCode IS NULL
                                                OR s.SectionCode = COALESCE(sec.SectionCode, mep.Section)))
                                          OR
                                          (s.RequestID IS NOT NULL
                                           AND EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                                                       WHERE  sr.RequestID = s.RequestID
                                                         AND  sr.MenteeID  = ue.UserID
                                                         AND  sr.Status    = 'Approved'))
                                      )
    LEFT   JOIN dbo.Attendance     a   ON a.SessionID = s.SessionID AND a.MenteeID = ue.UserID
    WHERE  mm.IsActive = 1
      AND  (@School IS NULL OR mp2.School = @School)
    GROUP  BY mm.MentorID, ue.UserID, ue.FirstName, ue.LastName, ue.StudentNumber,
              sec.SectionCode, mep.Section, mep.Course, mep.YearLevel
    ORDER  BY mm.MentorID, ue.LastName, ue.FirstName;
END;
GO

-- ── 8) sp_GetMentorOverview ──────────────────────────────────────────────
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
        mp.SignatureFilePath,
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
        (SELECT COUNT(*) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.RequestID IS NULL AND s.SectionCode IS NOT NULL)                         AS CompletedSessions,
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

-- ── 9) sp_GetUserStats ───────────────────────────────────────────────────
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
    WHERE  u.IsActive = 1;

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

-- ── 10) sp_GetSessionProofs ──────────────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionProofs
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: session proof rows
    SELECT
        s.SessionID,
        DENSE_RANK() OVER (
            PARTITION BY s.MentorID, s.SchoolYear, s.Semester, s.SectionCode
            ORDER BY s.SessionDate, s.SessionID
        )                                                    AS SessionNumber,
        s.SessionDate,
        s.Status                                            AS SessionStatus,
        COALESCE(sr.Purpose, s.Notes, 'Session')           AS Topic,
        u.UserID                                            AS MentorID,
        u.FirstName                                         AS MentorFirstName,
        u.LastName                                          AS MentorLastName,
        p.ProofID, p.FilePath, p.FileType, p.UploadedAt,
        CASE WHEN p.ProofID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasProof
    FROM   dbo.Sessions s
    JOIN   dbo.Users u              ON u.UserID    = s.MentorID
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath, FileType, UploadedAt,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    ORDER  BY s.SessionDate DESC, u.LastName, u.FirstName;

    -- RS2: active mentors for filter dropdown
    SELECT DISTINCT
        u.UserID AS MentorID, u.FirstName, u.LastName
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID = u.UserID AND mm.IsActive = 1
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
GO
