-- Attendance full report: the @School filter now follows the MENTEE's school,
-- because a mentor can handle mentees from any school. A mentor is listed for
-- a school when they have an active mentee from it (or, with no mentees, when
-- it is their own school). Only those mentees are listed under that school.
-- Same procedure as 20261009_qr_calendar_attendance.sql otherwise.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
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
    SELECT CASE WHEN @Semester='2nd Semester' THEN 5 ELSE 6 END AS RequiredSessions;

    -- RS2: one row per active mentor (filtered by mentee school if provided)
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
      AND  (@School IS NULL
            OR EXISTS (SELECT 1 FROM dbo.MentorMentee x
                       JOIN dbo.Users xu ON xu.UserID = x.MenteeID AND xu.IsActive = 1
                       JOIN dbo.MenteeProfiles xp ON xp.UserID = x.MenteeID
                       WHERE x.MentorID = u.UserID AND x.IsActive = 1 AND xp.School = @School)
            OR (mp.School = @School
                AND NOT EXISTS (SELECT 1 FROM dbo.MentorMentee y
                                JOIN dbo.Users yu ON yu.UserID = y.MenteeID AND yu.IsActive = 1
                                WHERE y.MentorID = u.UserID AND y.IsActive = 1)))
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
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN (
        -- Per checkpoint, via the shared rules.
        SELECT MentorID, MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended
        FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)
        GROUP  BY MentorID, MenteeID
    ) c ON c.MentorID = mm.MentorID AND c.MenteeID = mm.MenteeID
    WHERE  mm.IsActive = 1
      AND  (@School IS NULL OR mep.School = @School)
    ORDER  BY mm.MentorID, ue.LastName, ue.FirstName;
END;
GO
