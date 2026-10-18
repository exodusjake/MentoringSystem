-- add_slot_attendance_to_mentor_overview.sql
--
-- Client confirmed the Evaluation Ratings page's per-checkpoint "Period"
-- columns (Mentoring Assembly, Before Prelims, ...) should show the COUNT
-- OF MENTEE ATTENDEES for that checkpoint, not the checkmark placeholder
-- LoggedSlots was feeding (see ADMIN_/JS/evaluation-ratings.js's original
-- header comment — "a provisional placeholder... swap renderSlotCell()
-- once that's known"). Replaces LoggedSlots (comma-separated slot names)
-- with SlotAttendance (comma-separated "SlotName:Count" pairs), same
-- STRING_AGG-of-a-derived-table shape so the frontend parse is a small
-- swap, not a rewrite.
--
-- AttendeeCount is a DISTINCT count of present, non-dropped-out mentees
-- across every one of the mentor's sessions for that slot -- any section,
-- any round -- consistent with how CompletedSessions/OnTimeCount/
-- CompleteCount now treat a checkpoint as one unit regardless of how many
-- rounds it took (see add_multiround_sessions_and_timeliness_brackets.sql).
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
        (SELECT COUNT(DISTINCT s.SlotName + N'|' + s.SectionCode) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.RequestID IS NULL AND s.SectionCode IS NOT NULL)                         AS CompletedSessions,
        (SELECT COUNT(DISTINCT s4.SlotName + N'|' + s4.SectionCode) FROM dbo.Sessions s4
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
        (SELECT COUNT(DISTINCT s5.SlotName + N'|' + s5.SectionCode) FROM dbo.Sessions s5
         WHERE s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
           AND s5.RequestID IS NULL AND s5.SectionCode IS NOT NULL AND s5.Status <> 'Cancelled'
           AND s5.LogStatus = 'Submitted'
           AND EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID))
                                                                                            AS CompleteCount,
        (
            SELECT STRING_AGG(x.SlotName + N':' + CAST(x.AttendeeCount AS NVARCHAR(10)), ', ')
            FROM (
                SELECT s6.SlotName,
                       COUNT(DISTINCT CASE WHEN a.IsPresent = 1 AND ISNULL(mep6.IsDropOut, 0) = 0
                                           THEN a.MenteeID END)                             AS AttendeeCount
                FROM   dbo.Sessions s6
                LEFT   JOIN dbo.Attendance     a    ON a.SessionID = s6.SessionID
                LEFT   JOIN dbo.MenteeProfiles mep6 ON mep6.UserID = a.MenteeID
                WHERE  s6.MentorID = u.UserID AND s6.SchoolYear = @SchoolYear AND s6.Semester = @Semester
                  AND  s6.RequestID IS NULL AND s6.SectionCode IS NOT NULL AND s6.Status <> 'Cancelled'
                  AND  s6.SlotName IS NOT NULL
                GROUP  BY s6.SlotName
            ) x
        )                                                                                  AS SlotAttendance,
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
