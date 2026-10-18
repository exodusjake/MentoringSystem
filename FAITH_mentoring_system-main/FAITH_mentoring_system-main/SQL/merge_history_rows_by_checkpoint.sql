-- merge_history_rows_by_checkpoint.sql
--
-- Attendance Logs' "View History" modal still listed a checkpoint's
-- regular round and its makeup catch-up as two separate rows — confirmed
-- live: Aaron Lopez's history showed "Make-up: After Midterms — Present"
-- right next to "After Midterms — Absent" for what is, per the client's
-- own rule, one completed checkpoint. Showing both reads as contradictory
-- even though the summary % already correctly treats him as Present
-- (see merge_makeup_checkpoints_in_attendance_logs.sql).
--
-- Now collapses to ONE row per checkpoint (grouped by SlotName): Present
-- wins over Absent if the mentee was present in ANY round, and among
-- present rounds the most recent date shows. A makeup session with no
-- SlotName (posted before that feature, or without picking a checkpoint)
-- still can't be grouped with anything and is left as its own row, same
-- as everywhere else this rule applies.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
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

    ;WITH q AS (
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

        SELECT s.SessionID, s.SessionDate, s.SlotName,
               CAST(1 AS BIT) AS IsMakeup,
               COALESCE(s.SlotName, 'Make-up Session') AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions        s
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  s.MentorID = @MentorID AND s.Status != 'Cancelled'
          AND  sr.MenteeID = @MenteeID AND sr.Status = 'Approved'
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
