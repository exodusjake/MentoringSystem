-- fix_ontime_count_logstatus_check.sql
--
-- OnTimeCount (feeds Timeliness%) only checked "SubmittedAt IS NOT NULL",
-- while CompleteCount (feeds Completeness%) checked "LogStatus = 'Submitted'".
-- SubmittedAt is stamped once on first Submit and never cleared when a
-- session later goes back to Draft (see SessionsService.UpdateLogStatusAsync's
-- own comment), so a session reverted to Draft would still count as
-- "on time" while correctly no longer counting as "complete" -- the two
-- percentages describing different, inconsistent facts about the same
-- session. Today's UI never exposes a way back to Draft after Submitting
-- (logsheet.js hides/disables those buttons once Submitted), so this was a
-- latent gap rather than an observed bug -- fixing it now so Timeliness and
-- Completeness always agree on what "actually submitted" means, including
-- if an unsubmit path is ever added later.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

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
        (SELECT COUNT(*) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.RequestID IS NULL AND s.SectionCode IS NOT NULL)                         AS CompletedSessions,
        (SELECT COUNT(*) FROM dbo.Sessions s4
         WHERE s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
           AND s4.RequestID IS NULL AND s4.SectionCode IS NOT NULL AND s4.Status <> 'Cancelled'
           AND s4.SubmittedAt IS NOT NULL
           AND s4.LogStatus = 'Submitted'
           AND EXISTS (
               SELECT 1 FROM dbo.CalendarEvents ce
               WHERE ce.EventType = 'Deadline' AND ce.SlotName = s4.SlotName
                 AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                 AND s4.SubmittedAt <= ce.StartDate
           ))                                                                             AS OnTimeCount,
        (SELECT COUNT(*) FROM dbo.Sessions s5
         WHERE s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
           AND s5.RequestID IS NULL AND s5.SectionCode IS NOT NULL AND s5.Status <> 'Cancelled'
           AND s5.LogStatus = 'Submitted'
           AND EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID))
                                                                                            AS CompleteCount,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT s6.SlotName AS val
                FROM   dbo.Sessions s6
                WHERE  s6.MentorID = u.UserID AND s6.SchoolYear = @SchoolYear AND s6.Semester = @Semester
                  AND  s6.RequestID IS NULL AND s6.SectionCode IS NOT NULL AND s6.Status <> 'Cancelled'
                  AND  s6.SlotName IS NOT NULL
            ) t
        )                                                                                  AS LoggedSlots,
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
    WHERE  (u.IsActive = 1 OR @IncludeInactive = 1)
    ORDER  BY u.LastName, u.FirstName;
END;
GO

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

    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions, @SchoolYear AS SchoolYear, @Semester AS Semester;

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
           AND s.RequestID IS NULL AND s.SectionCode IS NOT NULL)                        AS CompletedSessions,
        (SELECT COUNT(*) FROM dbo.Sessions s4
         WHERE s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
           AND s4.RequestID IS NULL AND s4.SectionCode IS NOT NULL AND s4.Status <> 'Cancelled'
           AND s4.SubmittedAt IS NOT NULL
           AND s4.LogStatus = 'Submitted'
           AND EXISTS (
               SELECT 1 FROM dbo.CalendarEvents ce
               WHERE ce.EventType = 'Deadline' AND ce.SlotName = s4.SlotName
                 AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                 AND s4.SubmittedAt <= ce.StartDate
           ))                                                                            AS OnTimeCount,
        (SELECT COUNT(*) FROM dbo.Sessions s5
         WHERE s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
           AND s5.RequestID IS NULL AND s5.SectionCode IS NOT NULL AND s5.Status <> 'Cancelled'
           AND s5.LogStatus = 'Submitted'
           AND EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID))
                                                                                           AS CompleteCount
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  u.UserID = @MentorID AND u.IsActive = 1;

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
    -- (current-period progress figures -- unchanged)
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
           AND (
                (s.RequestID IS NULL AND s.SectionCode = COALESCE(sec.SectionCode, mep.Section))
                OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                           WHERE sr.RequestID = s.RequestID
                             AND sr.MenteeID = u.UserID AND sr.Status = 'Approved')
               )) AS TotalCompleted,
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
