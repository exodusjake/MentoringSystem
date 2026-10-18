-- fix_dropout_excluded_from_attendance.sql
--
-- A dropped-out mentee (MenteeProfiles.IsDropOut = 1) still counted as an
-- "expected" attendee for their former mentor's sessions, and still showed
-- up to be scanned/checked off in the QR attendance flow -- their
-- MentorMentee assignment row stays IsActive = 1 (that flag tracks the
-- pairing itself, not program participation), so every mentee-counting
-- query that only checked IsActive = 1 kept including them.
--
-- Three places affected, all fixed here or in the matching frontend edit:
--   1. sp_GetSessionMentees -- the roster behind both the QR scanner's
--      "does this session already have attendance rows" check and the
--      Logsheet's mentee list.
--   2. sp_GetMentorSessions -- TotalAttendees ("N expected" pill on
--      session cards).
--   3. sessions.js's own fresh-roster path (used only when a session has
--      no Attendance rows yet at all, so sp_GetSessionMentees returns
--      nothing to react to) -- fixed separately in sessions.js.
--
-- A dropped-out mentee who already HAS an attendance record for a given
-- session (they attended before dropping out) keeps showing there --
-- this only stops them from being freshly offered for NEW attendance.

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
        a.IsPresent, a.ScannedAt, a.AbsenceReason, a.MentorNotes, a.Remarks,
        ISNULL(mep.IsDropOut, 0)                         AS IsDropOut
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
      -- Dropped-out mentee: only keep them if they already have an
      -- attendance record for this session (preserves history); never
      -- freshly offer them up to be scanned/checked going forward.
      AND  (a.AttendanceID IS NOT NULL OR ISNULL(mep.IsDropOut, 0) = 0)

    UNION ALL

    SELECT
        a.AttendanceID,
        ue.UserID                                        AS MenteeID,
        ue.FirstName                                     AS MenteeFirstName,
        ue.LastName                                      AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')   AS SectionCode,
        mep.Course, mep.YearLevel,
        a.IsPresent, a.ScannedAt, a.AbsenceReason, a.MentorNotes, a.Remarks,
        ISNULL(mep.IsDropOut, 0)                         AS IsDropOut
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

-- sp_GetMentorSessions: exposes the session's real SectionCode directly in
-- RS2 (the sessions list). The frontend had no reliable, always-present
-- source for "what section is this session" -- Sections (this proc) is
-- derived from Attendance rows, so it's NULL until someone actually takes
-- attendance, meaning it's empty for every upcoming/not-yet-happened
-- session. Both Mentor Dashboard and Mentor Sessions fell back to
-- regex-parsing a "[SECTION]" prefix out of the free-text Topic/Notes to
-- cover that gap -- fragile, and wrong the moment a session's notes don't
-- happen to start with a bracket. SectionCode is on the Sessions row from
-- the moment it's created, present or not regardless of attendance state,
-- so it's the one source both pages should actually be reading.
--
-- (This version additionally excludes dropped-out mentees from
-- TotalAttendees -- see fix_dropout_excluded_from_attendance.sql above.)

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
        s.SectionCode,
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
        END                          AS SessionNumber,
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
        -- Matches TotalAttendees' exclusion: a dropped-out mentee's
        -- historical "Present" record stays in the detailed roster/
        -- Logsheet, but is left out of this headline count -- otherwise,
        -- for a session they attended before dropping out, PresentCount
        -- could exceed the now-smaller TotalAttendees (e.g. "4 / 3
        -- present"), a ratio that never made sense on its own.
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

-- sp_GetLogsheet: adds IsDropOut per mentee row -- a dropped-out mentee's
-- historical attendance/remarks stay in the Logsheet (their session is
-- part of the record), but the mentor-facing UI needs this flag to mark
-- them instead of silently looking like an ordinary, still-active mentee.

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
        -- Matches sp_GetMentorSessions' formula exactly: makeup if it came
        -- from a session request, OR has no real section of its own.
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
        -- The session's OWN real section (or NULL for makeup/no-section) --
        -- distinct from the per-mentee SectionCode column above, and the
        -- only thing SessionNumber's eligibility should be based on.
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
