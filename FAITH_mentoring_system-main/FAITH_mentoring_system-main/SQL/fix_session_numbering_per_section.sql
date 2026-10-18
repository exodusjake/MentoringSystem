-- sp_GetMentorSessions: "Session #N" numbering was counted across ALL of a
-- mentor's sections combined instead of per-section, even though the actual
-- 6-session (5 for 2nd sem) quota is enforced per-section (see
-- SessionsController.Post's per-SectionCode COUNT check). A mentor with two
-- sections whose first sessions landed on different dates would see them
-- labeled "Session #1" and "Session #2" instead of "Session #1" for each
-- section — mislabeling progress against that section's own quota.
--
-- Fix: the running-count subquery now also matches the same [SECTION]
-- prefix as the row being numbered, not just the same mentor/year/semester.
-- Everything else in the procedure is unchanged.

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
              AND  s2.Notes      LIKE '[[]%]%'   -- must have [SECTION] prefix
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
              OR s.Notes NOT LIKE '[[]%]%'   -- no section prefix = not a numbered regular session
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
                  AND  s2.Notes      LIKE '[[]%]%'
                  AND  s2.Status     != 'Cancelled'
                  -- Same section only — each section has its own quota, so
                  -- numbering must not blend sessions from other sections in.
                  AND  SUBSTRING(s2.Notes, 2, CHARINDEX(']', s2.Notes) - 2)
                     = SUBSTRING(s.Notes,  2, CHARINDEX(']', s.Notes)  - 2)
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
               CASE WHEN s.Notes NOT LIKE '[[]%]%' THEN CAST(1 AS BIT)
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
                   AND  (NOT (COALESCE(s.Notes,'') LIKE '[[]%[]]%')
                         OR COALESCE(sec2.SectionCode, mep2.Section) =
                             SUBSTRING(s.Notes,2,IIF(CHARINDEX(']',s.Notes)>2,CHARINDEX(']',s.Notes)-2,0))))
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
              s.RequestID, sr.Purpose, sr.AvailabilityID, s.Notes, p.FilePath, p.FileType,
              s.QRCodeToken, s.SchoolYear, s.Semester
    ORDER  BY s.SessionDate DESC;
END;
