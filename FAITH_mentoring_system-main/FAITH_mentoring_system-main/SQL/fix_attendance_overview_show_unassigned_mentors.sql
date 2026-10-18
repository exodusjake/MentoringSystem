-- ============================================================
-- fix_attendance_overview_show_unassigned_mentors.sql
--
-- sp_GetAttendanceOverview (the Attendance Logs landing page) required
-- EXISTS(MentorMentee WHERE IsActive=1) before a Mentor would even
-- appear in the list -- meant to hide "nothing to show attendance
-- for," but the real effect: a freshly-imported/created Mentor with
-- no mentee assigned to them YET disappears completely from the page,
-- including from the per-school mentor counts on the landing cards.
-- Every other page in the system (User Management, Sessions, Monitor
-- Activities) lists a Mentor regardless of whether they have a
-- mentee assigned -- this page was the one inconsistent exception,
-- and it read as "the data didn't import" rather than "no mentee
-- assigned yet."
--
-- Fix: drop that EXISTS gate. A Mentor with zero active mentees now
-- still shows up, with TotalSessions/TotalAttendees/PresentCount all
-- 0 (already ISNULL-guarded) and Sections/Courses NULL (STRING_AGG
-- over an empty set) -- the detail drill-down already renders that
-- correctly ("No mentees assigned to this mentor."), so no frontend
-- change is needed.
-- ============================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

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
        ISNULL(ms.TotalSessions,  0) AS TotalSessions,
        ISNULL(ms.TotalAttendees, 0) AS TotalAttendees,
        ISNULL(ms.PresentCount,   0) AS PresentCount,
        ms.LastSessionDate,
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
        SELECT
            s.MentorID,
            COUNT(DISTINCT s.SessionID)                              AS TotalSessions,
            COUNT(*)                                                  AS TotalAttendees,
            SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)        AS PresentCount,
            MAX(s.SessionDate)                                        AS LastSessionDate
        FROM   dbo.Sessions      s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID AND mm.IsActive = 1
        LEFT   JOIN dbo.Attendance   a  ON a.SessionID = s.SessionID AND a.MenteeID = mm.MenteeID
        WHERE  s.Status = 'Completed' AND s.SessionDate >= mm.AssignedDate
          AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
          AND  (s.RequestID IS NULL
                OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                           WHERE sr.RequestID = s.RequestID AND sr.MenteeID = mm.MenteeID AND sr.Status = 'Approved'))
        GROUP  BY s.MentorID
    ) ms ON ms.MentorID = u.UserID
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
GO
