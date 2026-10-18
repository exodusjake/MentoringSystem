-- Same root-cause typo as fix_logsheet_sections_like_pattern.sql: the LIKE
-- pattern '[[]%[]]%' does not actually match a literal ']' in this SQL
-- Server instance (verified directly: ']' LIKE '[]]' is false) — it was
-- copy-pasted across several procedures, always evaluating as "no match".
-- Fixes four remaining live procedures using the same already-proven
-- pattern ('[[]%]%') used everywhere else in the system:
--
-- 1) sp_GetSessionMentees — MOST SERIOUS: this determines which mentees
--    belong to a session. Because "NOT (Notes LIKE broken-pattern)" was
--    always TRUE, the fallback branch of its OR always fired, returning
--    EVERY active mentee of the mentor for EVERY session — regardless of
--    section. Confirmed by the same broken pattern surfacing this in
--    TotalAttendees elsewhere. Live impact: any mentee of a mentor with
--    2+ sections saw (and could be listed present/absent for) every
--    session across ALL of that mentor's sections, not just their own —
--    including in their own "Sessions" list (MENTEE/JS/sessions.js reads
--    this same endpoint to decide which sessions to show a mentee).
--
-- 2) sp_GetMentorDetail — TotalMentees per session (RS3) had the identical
--    always-count-everyone bug as sp_GetMentorSessions' TotalAttendees,
--    affecting HEAD's Mentor Monitoring detail page and the Mentee's own
--    progress endpoint (MonitorActivities/{mentorId}).
--
-- 3) sp_GetMenteeAttendanceHistory — the Topic column's bracket-stripping
--    never fired, so a mentee's own history modal showed the raw
--    "[SECTION] topic" text instead of just "topic".
--
-- 4) sp_GetSessionsForMentee — same TotalAttendees-class fallback bug;
--    currently has no live frontend caller, fixed anyway for correctness.

-- ── 1) sp_GetSessionMentees ─────────────────────────────────────────────
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
           NOT (COALESCE(s.Notes,'') LIKE '[[]%]%')
           OR COALESCE(sec.SectionCode, mep.Section) =
               SUBSTRING(s.Notes,2,IIF(CHARINDEX(']',s.Notes)>2,CHARINDEX(']',s.Notes)-2,0))
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

-- ── 2) sp_GetMentorDetail ────────────────────────────────────────────────
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
           AND s.RequestID IS NULL AND s.Notes LIKE '[[]%]%')                            AS CompletedSessions
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
                   AND  (NOT (COALESCE(s.Notes,'') LIKE '[[]%]%')
                         OR COALESCE(sec2.SectionCode, mep2.Section) =
                             SUBSTRING(s.Notes,2,IIF(CHARINDEX(']',s.Notes)>2,CHARINDEX(']',s.Notes)-2,0))))
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

-- ── 3) sp_GetMenteeAttendanceHistory (Topic bracket-stripping only) ─────
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
          AND  Notes     LIKE '[[]%]%'
          AND  (@SectionCode IS NULL
                OR SUBSTRING(Notes, 2, CHARINDEX(']', Notes) - 2) = @SectionCode)
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
                   WHEN COALESCE(s.Notes,'') LIKE '[[]%]%'
                       THEN LTRIM(SUBSTRING(s.Notes, CHARINDEX(']',s.Notes)+1, LEN(s.Notes)))
                   ELSE COALESCE(s.Notes, 'Mentoring Session')
               END AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID
                                       AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
        WHERE  s.MentorID = @MentorID AND s.RequestID IS NULL AND s.Status != 'Cancelled'
          AND  (@SectionCode IS NULL
                OR s.Notes NOT LIKE '[[]%]%'
                OR SUBSTRING(s.Notes, 2, CHARINDEX(']', s.Notes) - 2) = @SectionCode)

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

-- ── 4) sp_GetSessionsForMentee (currently unused by any live frontend) ──
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
      AND  (NOT (COALESCE(sr.Purpose, s.Notes) LIKE '[[]%]%')
           OR  COALESCE(sr.Purpose, s.Notes) LIKE '[[]' + @SectionCode + ']%')
    ORDER  BY s.SessionDate DESC;
END;
GO
