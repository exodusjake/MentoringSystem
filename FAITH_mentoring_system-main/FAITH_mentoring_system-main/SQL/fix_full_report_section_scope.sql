-- sp_GetAttendanceFullReport (Attendance Logs' full report / print export):
-- RS3's per-mentee TotalSessions joined on EVERY completed session of the
-- mentor, with no check that the session actually belonged to that
-- mentee's own section — the same cross-section leak already found and
-- fixed in sp_GetSessionMentees, sp_GetMentorSessions, sp_GetMentorDetail,
-- sp_GetMenteeAttendanceHistory, sp_GetLogsheet and sp_GetSessionsForMentee.
--
-- Proven live (in a rolled-back transaction, no data changed): with mentor
-- 111's two sessions (one per section) marked Completed, EVERY one of his
-- mentees — regardless of section — showed TotalSessions = 2 instead of
-- the 1 that actually belonged to their own section. That inflated
-- denominator would understate every such mentee's real attendance rate
-- on the printed/exported report the moment any multi-section mentor
-- completes a session.
--
-- Fix: the regular-session branch of the join now also requires the
-- session's [SECTION] prefix to match the mentee's own section (a
-- bracket-less session is left alone, same fallback used everywhere else).
-- Make-up sessions are unaffected — they were already scoped correctly via
-- the SessionRequests EXISTS check.

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
                                           -- Regular session: must be THIS mentee's own section
                                           -- (a bracket-less session has no section to check).
                                           AND (s.Notes NOT LIKE '[[]%]%'
                                                OR SUBSTRING(s.Notes, 2, CHARINDEX(']', s.Notes) - 2)
                                                 = COALESCE(sec.SectionCode, mep.Section)))
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
