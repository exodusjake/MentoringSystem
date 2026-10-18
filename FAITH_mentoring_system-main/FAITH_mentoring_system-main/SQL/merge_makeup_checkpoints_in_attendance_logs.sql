-- merge_makeup_checkpoints_in_attendance_logs.sql
--
-- Attendance Logs treated a mentee's makeup (Availability-booked) session
-- as a totally separate record from the regular session for the same
-- checkpoint -- confirmed live: Aaron Lopez showed "1 Present, 1 Absent,
-- 50%" for a single "After Midterms" checkpoint he'd actually completed
-- (absent in the regular round, present via his makeup catch-up). Same
-- root cause pattern as everywhere else this session: a makeup session's
-- own real checkpoint (Sessions.SlotName, now correctly propagated from
-- its Availability booking) was being ignored.
--
-- Two fixes:
-- 1) sp_GetMentorMenteeAttendance (the section-card % and Present/Absent
--    counts): now counts DISTINCT CHECKPOINTS (SlotName) instead of raw
--    session rows, so a checkpoint attended via either the regular session
--    or a makeup catch-up counts once, as Present.
-- 2) sp_GetMenteeAttendanceHistory (the "View History" modal): the makeup
--    branch hardcoded SlotName=NULL and Topic='Make-up Session' regardless
--    of what checkpoint it was actually for -- now reads the session's own
--    real SlotName/Topic, same as a regular session. Rows stay separate
--    per round (an audit trail of what actually happened, same principle
--    as the Logsheet's "N sessions conducted" badge) -- only the
--    aggregate % in (1) is what treats them as one checkpoint.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

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

    -- RS3: mentee attendance cards (scoped to current semester) — counts
    -- DISTINCT CHECKPOINTS (SlotName), not raw session rows, so a
    -- checkpoint completed via either the regular session or a makeup
    -- catch-up (or both) counts once, as Present.
    SELECT
        ue.UserID                                                     AS MenteeID,
        ue.FirstName AS MenteeFirstName, ue.LastName AS MenteeLastName, ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')                  AS SectionCode,
        mep.Course, mep.YearLevel,
        COUNT(DISTINCT s.SlotName)                                    AS TotalSessions,
        COUNT(DISTINCT CASE WHEN a.IsPresent = 1 THEN s.SlotName END) AS PresentCount
    FROM   dbo.Users ue
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = ue.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN dbo.Sessions       s   ON s.MentorID = @MentorID AND s.Status = 'Completed'
                                      AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                                      AND s.SessionDate >= mm.AssignedDate
                                      AND s.SlotName IS NOT NULL
                                      AND (s.RequestID IS NULL
                                           OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                                                      WHERE sr.RequestID = s.RequestID
                                                        AND sr.MenteeID = ue.UserID AND sr.Status = 'Approved'))
    LEFT   JOIN dbo.Attendance     a   ON a.SessionID = s.SessionID AND a.MenteeID = ue.UserID
    WHERE  ue.IsActive = 1
    GROUP  BY ue.UserID, ue.FirstName, ue.LastName, ue.StudentNumber,
              sec.SectionCode, mep.Section, mep.Course, mep.YearLevel
    ORDER  BY ue.LastName, ue.FirstName;
END;
GO

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

    SELECT
        COALESCE(a.AttendanceID, 0)                                  AS AttendanceID,
        q.SlotName,
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
        SELECT s.SessionID, s.SessionDate, s.SlotName,
               CAST(0 AS BIT) AS IsMakeup,
               CASE
                   WHEN s.SectionCode IS NOT NULL
                       THEN LTRIM(SUBSTRING(s.Notes, CHARINDEX(']',s.Notes)+1, LEN(s.Notes)))
                   ELSE COALESCE(s.Notes, 'Mentoring Session')
               END AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID
                                       AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
        WHERE  s.MentorID = @MentorID AND s.RequestID IS NULL AND s.Status != 'Cancelled'
          AND  (@SectionCode IS NULL
                OR s.SectionCode IS NULL
                OR s.SectionCode = @SectionCode)

        UNION ALL

        -- Makeup session's own real checkpoint (Sessions.SlotName,
        -- propagated from its Availability booking) — was hardcoded to
        -- NULL/'Make-up Session' here regardless of what it was actually
        -- for, same bug already fixed in every other checkpoint-facing
        -- query this session.
        SELECT s.SessionID, s.SessionDate, s.SlotName,
               CAST(1 AS BIT) AS IsMakeup,
               COALESCE(s.SlotName, 'Make-up Session') AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions        s
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  s.MentorID = @MentorID AND s.Status != 'Cancelled'
          AND  sr.MenteeID = @MenteeID AND sr.Status = 'Approved'
    ) q
    LEFT   JOIN dbo.Attendance   a  ON a.SessionID = q.SessionID AND a.MenteeID = @MenteeID
    ORDER  BY q.SessionDate DESC;
END;
GO
