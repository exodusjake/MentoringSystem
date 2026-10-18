-- sp_GetMenteeAttendanceHistory: the "regular sessions" branch joined only
-- on MentorID + an active MentorMentee row for this mentee — it never
-- checked whether the SESSION ITSELF belonged to the mentee's own section.
-- For a mentor handling more than one section, every mentee saw every
-- OTHER section's sessions too, as phantom "Not Recorded" rows once those
-- sessions reached a status the frontend doesn't filter out (Completed).
-- Confirmed live: mentee 152 (BS CPE 1B, under mentor 111) was returned a
-- row for mentor 111's separate BS MULTIMEDIA 1A session.
--
-- The ranking (SessionNumber) had the same gap — DENSE_RANK() over every
-- one of the mentor's sessions regardless of section, and never reset per
-- semester like the rest of the system's numbering does.
--
-- Fix: resolve the mentee's own section up front and scope both the
-- returned rows and the numbering to sessions whose [SECTION] prefix
-- matches it (bracket-less sessions are left alone — same as before, no
-- regression for single-section mentors); numbering now also resets per
-- school year + semester.

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
                   WHEN COALESCE(s.Notes,'') LIKE '[[]%[]]%'
                       THEN LTRIM(SUBSTRING(s.Notes, CHARINDEX(']',s.Notes)+1, LEN(s.Notes)))
                   ELSE COALESCE(s.Notes, 'Mentoring Session')
               END AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID
                                       AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
        WHERE  s.MentorID = @MentorID AND s.RequestID IS NULL AND s.Status != 'Cancelled'
          -- A bracket-less session has no section to check (kept, as before);
          -- a bracketed one must name THIS mentee's own section.
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
