-- ============================================================
-- fix_attendance_counting_rules.sql
--
-- One set of rules for "which sessions count for a mentee", shared by every
-- page that summarizes attendance (the logsheet already follows them):
--   * a regular session counts only for mentees of THAT session's section
--     (or every mentee of the mentor if the session has no section);
--   * a make-up counts for the mentee who booked it (approved request) AND
--     for any mentee whose QR code was scanned present at it;
--   * only sessions on/after the mentee's start with their CURRENT mentor —
--     the FIRST time they were assigned to that mentor (a switch away and
--     back no longer hides their earlier attendance);
--   * attendance is per checkpoint (SlotName): a regular session and a
--     make-up for the same checkpoint count once.
--
-- dbo.fn_MenteeCheckpointAttendance holds those rules; these read from it:
--   sp_GetMentorMenteeAttendance  Attendance Logs / Summary (per mentee)
--   sp_GetAttendanceOverview      Attendance Logs / Summary (mentor cards, totals)
--   sp_GetAttendanceFullReport    Attendance Logs / Summary (CSV / print)
--   sp_GetMentorDetail (RS4)      Mentor Monitoring, mentee dashboard, My Activities
--   sp_GetUserStats (RS3)         dashboard mentee engagement tiers
-- sp_GetMenteeAttendanceHistory (View History) applies the same rules per row.
-- sp_AssignMentor now keeps the first start date when a mentee returns to a
-- mentor they had before.
--
-- Part 3 repairs existing start dates for such returns; it only PREVIEWS
-- unless @Apply is set to 1.
--
-- Needs QUOTED_IDENTIFIER ON (SSMS default; sqlcmd needs -I).
-- ============================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ── Part 1: the shared rules ──
CREATE OR ALTER FUNCTION dbo.fn_MenteeCheckpointAttendance
(
    @SchoolYear NVARCHAR(20),
    @Semester   NVARCHAR(50)
)
RETURNS TABLE
AS
RETURN
    -- One row per (current mentor, mentee, checkpoint) the mentee was expected
    -- at this period; Attended = 1 when scanned present at any session of it.
    SELECT mm.MentorID,
           mm.MenteeID,
           COALESCE(s.SlotName, N'#' + CAST(s.SessionID AS NVARCHAR(20))) AS CheckpointKey,
           MAX(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)                AS Attended
    FROM   dbo.MentorMentee   mm
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID   = mm.MenteeID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    INNER  JOIN dbo.Sessions       s   ON s.MentorID    = mm.MentorID
                                      AND s.Status      = 'Completed'
                                      AND s.SchoolYear  = @SchoolYear
                                      AND s.Semester    = @Semester
                                      AND s.SessionDate >= mm.AssignedDate
    LEFT   JOIN dbo.Attendance     a   ON a.SessionID   = s.SessionID AND a.MenteeID = mm.MenteeID
    WHERE  mm.IsActive = 1
      AND  (
             (s.RequestID IS NULL
              AND (s.SectionCode IS NULL OR s.SectionCode = COALESCE(sec.SectionCode, mep.Section)))
             OR
             (s.RequestID IS NOT NULL
              AND (a.IsPresent = 1
                   OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                              WHERE  sr.RequestID = s.RequestID
                                AND  sr.MenteeID  = mm.MenteeID
                                AND  sr.Status    = 'Approved')))
           )
    GROUP  BY mm.MentorID, mm.MenteeID,
              COALESCE(s.SlotName, N'#' + CAST(s.SessionID AS NVARCHAR(20)));
GO

-- ── Part 2: assignments keep the first start date with a returning mentor ──
CREATE OR ALTER PROCEDURE dbo.sp_AssignMentor
    @MenteeID INT,
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;
    BEGIN TRY
        IF EXISTS (SELECT 1 FROM dbo.MentorMentee WITH (UPDLOCK, HOLDLOCK)
                   WHERE MenteeID = @MenteeID AND MentorID = @MentorID AND IsActive = 1)
        BEGIN
            COMMIT TRANSACTION;
            RETURN;
        END;

        -- Returning to a mentor they had before: keep the original start date,
        -- so attendance already recorded with that mentor still counts.
        DECLARE @FirstAssigned DATE =
            (SELECT MIN(AssignedDate) FROM dbo.MentorMentee
             WHERE  MenteeID = @MenteeID AND MentorID = @MentorID);

        UPDATE dbo.MentorMentee SET IsActive = 0 WHERE MenteeID = @MenteeID;

        INSERT INTO dbo.MentorMentee (MentorID, MenteeID, AssignedDate, IsActive)
        VALUES (@MentorID, @MenteeID, COALESCE(@FirstAssigned, CAST(GETDATE() AS DATE)), 1);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- ── sp_GetMentorMenteeAttendance ──
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
        u.UserID AS MentorID, u.FirstName, u.LastName, u.Email, mp.Department, mp.School,
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

    -- RS3: mentee attendance cards (current semester), per checkpoint, using
    -- the shared rules in dbo.fn_MenteeCheckpointAttendance.
    SELECT
        ue.UserID                                                     AS MenteeID,
        ue.FirstName AS MenteeFirstName, ue.LastName AS MenteeLastName, ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')                  AS SectionCode,
        mep.Course, mep.YearLevel,
        ISNULL(c.Expected, 0)                                         AS TotalSessions,
        ISNULL(c.Attended, 0)                                         AS PresentCount
    FROM   dbo.Users ue
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = ue.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN (
        SELECT MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended
        FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)
        WHERE  MentorID = @MentorID
        GROUP  BY MenteeID
    ) c ON c.MenteeID = ue.UserID
    WHERE  ue.IsActive = 1
    ORDER  BY ue.LastName, ue.FirstName;
END;

GO

-- ── sp_GetAttendanceOverview ──
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
        ISNULL(ss.TotalSessions,  0) AS TotalSessions,
        ISNULL(ma.TotalAttendees, 0) AS TotalAttendees,
        ISNULL(ma.PresentCount,   0) AS PresentCount,
        ss.LastSessionDate,
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
        -- Sessions this mentor completed this semester.
        SELECT s.MentorID,
               COUNT(*)           AS TotalSessions,
               MAX(s.SessionDate) AS LastSessionDate
        FROM   dbo.Sessions s
        WHERE  s.Status = 'Completed' AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
        GROUP  BY s.MentorID
    ) ss ON ss.MentorID = u.UserID
    LEFT   JOIN (
        -- Checkpoint attendance of the mentor's active mentees (same rows the
        -- per-mentee view lists), via the shared rules.
        SELECT c.MentorID,
               COUNT(*)        AS TotalAttendees,
               SUM(c.Attended) AS PresentCount
        FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester) c
        INNER  JOIN dbo.Users ue ON ue.UserID = c.MenteeID AND ue.IsActive = 1
        GROUP  BY c.MentorID
    ) ma ON ma.MentorID = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentor'
    ORDER  BY u.LastName, u.FirstName;
END;

GO

-- ── sp_GetAttendanceFullReport ──
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
        ISNULL(c.Expected, 0)                               AS TotalSessions,
        ISNULL(c.Attended, 0)                               AS PresentCount
    FROM   dbo.MentorMentee mm
    INNER  JOIN dbo.Users          um  ON um.UserID   = mm.MentorID AND um.Role = 'mentor' AND um.IsActive = 1
    INNER  JOIN dbo.Users          ue  ON ue.UserID   = mm.MenteeID AND ue.IsActive = 1
    LEFT   JOIN dbo.MentorProfiles mp2 ON mp2.UserID  = mm.MentorID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN (
        -- Per checkpoint, via the shared rules.
        SELECT MentorID, MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended
        FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)
        GROUP  BY MentorID, MenteeID
    ) c ON c.MentorID = mm.MentorID AND c.MenteeID = mm.MenteeID
    WHERE  mm.IsActive = 1
      AND  (@School IS NULL OR mp2.School = @School)
    ORDER  BY mm.MentorID, ue.LastName, ue.FirstName;
END;

GO

-- ── sp_GetMentorDetail ──
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

    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions, @SchoolYear AS SchoolYear, @Semester AS Semester,
           (SELECT COUNT(*) FROM dbo.CalendarEvents ce
            WHERE ce.EventType = 'Deadline' AND ce.SchoolYear = @SchoolYear AND ce.Semester = @Semester
              AND ce.StartDate <= GETDATE())                                              AS DueCheckpointCount;

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
        )                                                                                AS CompletedSessions,
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
        )                                                                                AS OnTimeCount,
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
        )                                                                                AS CompleteCount
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  u.UserID = @MentorID AND u.IsActive = 1 AND u.Role = 'Mentor';

    -- RS3: sessions list (includes ProofFilePath) -- FULL history, no
    -- period filter (see fix_mentor_detail_session_history.sql). Also
    -- returns SlotName/LogStatus/SubmittedAt so the frontend can show the
    -- same on-time/complete signal per row as the aggregate above.
    SELECT
        s.SessionID,
        COALESCE(sr.Purpose, s.Notes, 'Session')                    AS Topic,
        s.Status, s.SessionDate, s.Notes,
        s.SchoolYear, s.Semester,
        s.SlotName, s.LogStatus, s.SubmittedAt,
        (SELECT COUNT(*)
         FROM   dbo.Attendance a
         JOIN   dbo.MenteeProfiles mep4 ON mep4.UserID = a.MenteeID
         WHERE  a.SessionID = s.SessionID AND a.IsPresent = 1
           AND  ISNULL(mep4.IsDropOut, 0) = 0)                       AS PresentCount,
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
    ORDER  BY s.SessionDate DESC;

    -- RS4: mentees with attendance stats + IsDropOut + SignatureFilePath
    -- (current-period progress figures -- unchanged), plus Email + Course +
    -- YearLevel for the mentee card (contact number deliberately left out
    -- -- see add_email_course_to_mentor_detail_mentees.sql, the fix this
    -- migration restores after scope_timeliness_to_due_checkpoints.sql
    -- accidentally reverted it).
    SELECT
        u.UserID          AS MenteeID,
        u.FirstName, u.LastName, u.StudentNumber, u.Email,
        mep.Course, mep.YearLevel,
        COALESCE(sec.SectionCode, mep.Section, N'-')                AS SectionCode,
        ISNULL(mep.IsDropOut, 0)                                    AS IsDropOut,
        mep.SignatureFilePath,
        -- Per checkpoint, via the shared rules (dbo.fn_MenteeCheckpointAttendance).
        ISNULL(c.Attended, 0)                                        AS SessionsAttended,
        ISNULL(c.Expected, 0)                                        AS TotalCompleted,
        (SELECT MAX(sess.SessionDate) FROM dbo.Attendance a
         JOIN dbo.Sessions sess ON sess.SessionID = a.SessionID
         WHERE a.MenteeID = u.UserID AND sess.MentorID = @MentorID
           AND a.IsPresent = 1
           AND sess.SchoolYear = @SchoolYear AND sess.Semester = @Semester)      AS LastAttended
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = u.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = u.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN (
        SELECT MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended
        FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)
        WHERE  MentorID = @MentorID
        GROUP  BY MenteeID
    ) c ON c.MenteeID = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentee'
    ORDER  BY u.LastName, u.FirstName;
END;

GO

-- ── sp_GetUserStats ──
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
        -- Current semester, per checkpoint, via the shared rules.
        SELECT
            u.UserID,
            COUNT(c.CheckpointKey)     AS totalSessions,
            ISNULL(SUM(c.Attended), 0) AS presentCount
        FROM   dbo.Users u
        INNER  JOIN dbo.MenteeProfiles mp ON mp.UserID   = u.UserID AND mp.IsDropOut = 0
        INNER  JOIN dbo.MentorMentee   mm ON mm.MenteeID = u.UserID AND mm.IsActive  = 1
        LEFT   JOIN dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester) c
               ON c.MentorID = mm.MentorID AND c.MenteeID = u.UserID
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

-- ── sp_GetMenteeAttendanceHistory ──
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

    ;WITH q AS (
        SELECT s.SessionID, s.SessionDate, s.SlotName,
               CAST(0 AS BIT) AS IsMakeup,
               CASE
                   WHEN s.SectionCode IS NOT NULL
                       THEN LTRIM(SUBSTRING(s.Notes, CHARINDEX(']',s.Notes)+1, LEN(s.Notes)))
                   ELSE COALESCE(s.Notes, 'Mentoring Session')
               END AS Topic,
               s.Status AS SessionStatus
        -- Same rules as dbo.fn_MenteeCheckpointAttendance: own section's
        -- sessions since the mentee's start with this mentor.
        FROM   dbo.Sessions s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID
                                       AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
        WHERE  s.MentorID = @MentorID AND s.RequestID IS NULL AND s.Status != 'Cancelled'
          AND  s.SessionDate >= mm.AssignedDate
          AND  (s.SectionCode IS NULL OR s.SectionCode = @SectionCode)

        UNION ALL

        -- Make-ups the mentee booked, or was scanned present at.
        SELECT s.SessionID, s.SessionDate, s.SlotName,
               CAST(1 AS BIT) AS IsMakeup,
               COALESCE(s.SlotName, 'Make-up Session') AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID
                                       AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
        WHERE  s.MentorID = @MentorID AND s.RequestID IS NOT NULL AND s.Status != 'Cancelled'
          AND  s.SessionDate >= mm.AssignedDate
          AND  (EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                        WHERE sr.RequestID = s.RequestID AND sr.MenteeID = @MenteeID AND sr.Status = 'Approved')
                OR EXISTS (SELECT 1 FROM dbo.Attendance ap
                           WHERE ap.SessionID = s.SessionID AND ap.MenteeID = @MenteeID AND ap.IsPresent = 1))
    ),
    joined AS (
        SELECT
            q.SessionID, q.SessionDate, q.SlotName, q.IsMakeup, q.Topic, q.SessionStatus,
            a.AttendanceID,
            COALESCE(a.IsPresent, 0) AS IsPresent,
            a.ScannedAt, a.AbsenceReason, a.MentorNotes,
            CASE WHEN a.AttendanceID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS IsRecorded
        FROM   q
        LEFT   JOIN dbo.Attendance a ON a.SessionID = q.SessionID AND a.MenteeID = @MenteeID
    ),
    ranked AS (
        -- Rows sharing a real SlotName merge into one — the round the
        -- mentee was actually present in wins (and among present rounds,
        -- the most recent one); a SlotName-less makeup row is its own
        -- group (COALESCE to its own SessionID) so it never merges.
        SELECT *,
               ROW_NUMBER() OVER (
                   PARTITION BY COALESCE(SlotName, CAST(SessionID AS NVARCHAR(20)))
                   ORDER BY IsPresent DESC, SessionDate DESC
               ) AS rn
        FROM   joined
    )
    SELECT
        COALESCE(AttendanceID, 0) AS AttendanceID,
        SlotName, IsMakeup, SessionDate, Topic, SessionStatus,
        IsPresent, ScannedAt, AbsenceReason, MentorNotes, IsRecorded
    FROM   ranked
    WHERE  rn = 1
    ORDER  BY SessionDate DESC;
END;

GO

-- ── Part 3: restore start dates for mentees who returned to an earlier mentor ──
-- 0 = preview only (lists what would change). 1 = apply the change.
DECLARE @Apply BIT = 0;

IF OBJECT_ID('tempdb..#Restore') IS NOT NULL DROP TABLE #Restore;

SELECT cur.AssignmentID, cur.MenteeID, cur.MentorID,
       cur.AssignedDate AS CurrentAssignedDate,
       firstRow.FirstAssigned AS RestoredAssignedDate
INTO   #Restore
FROM   dbo.MentorMentee cur
CROSS  APPLY (SELECT MIN(prev.AssignedDate) AS FirstAssigned
              FROM   dbo.MentorMentee prev
              WHERE  prev.MenteeID = cur.MenteeID AND prev.MentorID = cur.MentorID) firstRow
WHERE  cur.IsActive = 1 AND firstRow.FirstAssigned < cur.AssignedDate;

SELECT x.AssignmentID,
       mentee.FirstName + ' ' + mentee.LastName AS Mentee,
       mentor.FirstName + ' ' + mentor.LastName AS Mentor,
       x.CurrentAssignedDate, x.RestoredAssignedDate
FROM   #Restore x
JOIN   dbo.Users mentee ON mentee.UserID = x.MenteeID
JOIN   dbo.Users mentor ON mentor.UserID = x.MentorID
ORDER  BY Mentor, Mentee;

-- Full assignment history of those mentees, for review.
SELECT h.MenteeID, mentee.FirstName + ' ' + mentee.LastName AS Mentee, h.AssignmentID,
       mentor.FirstName + ' ' + mentor.LastName AS Mentor, h.AssignedDate, h.IsActive
FROM   dbo.MentorMentee h
JOIN   dbo.Users mentee ON mentee.UserID = h.MenteeID
JOIN   dbo.Users mentor ON mentor.UserID = h.MentorID
WHERE  h.MenteeID IN (SELECT MenteeID FROM #Restore)
ORDER  BY h.MenteeID, h.AssignmentID;

IF @Apply = 1
BEGIN
    BEGIN TRANSACTION;
    UPDATE mm SET mm.AssignedDate = x.RestoredAssignedDate
    FROM   dbo.MentorMentee mm
    JOIN   #Restore x ON x.AssignmentID = mm.AssignmentID;
    SELECT @@ROWCOUNT AS RowsUpdated;
    COMMIT TRANSACTION;
END
ELSE
    SELECT 'Preview only - no assignment dates changed. Set @Apply = 1 to restore these dates.' AS Note;

DROP TABLE #Restore;
GO
