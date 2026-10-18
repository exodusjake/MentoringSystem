-- Adds Sessions.SubmittedAt to sp_GetMentorSessions and sp_GetSessionsForMentee.

-- sp_GetMentorSessions RS2 (SessionRowDto) -- has a GROUP BY, so SubmittedAt
-- must be added there too.
CREATE OR ALTER PROCEDURE [dbo].[sp_GetMentorSessions]
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
        s.SubmittedAt,
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
              p.FilePath, p.FileType, s.QRCodeToken, s.SubmittedAt, s.SchoolYear, s.Semester
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

-- sp_GetSessionsForMentee RS2 (SessionRowDto) -- no GROUP BY, simple add.
CREATE OR ALTER PROCEDURE [dbo].[sp_GetSessionsForMentee]
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
        s.QRCodeToken,
        s.SubmittedAt
    FROM   dbo.Sessions        s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    WHERE  s.MentorID   = @MentorID
      AND  s.SchoolYear = @SchoolYear
      AND  s.Semester   = @Semester
      AND  (s.SectionCode IS NULL OR s.SectionCode = @SectionCode)
    ORDER  BY s.SessionDate DESC;
END;
GO
