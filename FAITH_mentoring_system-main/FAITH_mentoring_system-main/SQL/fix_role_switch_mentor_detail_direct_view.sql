
USE AstraMentoring;
GO

-- Same bug class as fix_role_switch_stale_profile_views.sql /
-- fix_role_switch_stale_profile_procs.sql, found in the one remaining
-- spot: sp_GetMentorDetail is reached by ID directly (mentor-detail.html
-- ?id=X), and the listing-page fixes already applied mean a role-switched
-- user won't have a "View Details" link into this page anymore — but an
-- old bookmark or browser-history entry would still open it and show
-- stale mentor data. Also fixes RS4 the same way for a mentee whose own
-- role has since switched away while still under an active assignment.
--
-- Live definition pulled directly from RDS via OBJECT_DEFINITION() to
-- guarantee this matches the actual current body (several SQL/*.sql
-- files touch this procedure with identical commit timestamps, so git
-- history alone can't say which one "won").
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
    WHERE  u.IsActive = 1 AND u.Role = 'Mentee'
    ORDER  BY u.LastName, u.FirstName;
END;
GO

PRINT 'Done. sp_GetMentorDetail now requires the target to still be a current Mentor/Mentee, not just a leftover profile row.';
