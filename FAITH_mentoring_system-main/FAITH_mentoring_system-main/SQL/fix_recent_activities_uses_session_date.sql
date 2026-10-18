-- ============================================================
-- fix_recent_activities_uses_session_date.sql
--
-- Recent Activities (Admin Dashboard) showed "scheduled a session"
-- entries with FUTURE dates (e.g. Sept 15/16 while today is Sept 8) --
-- sp_GetRecentActivities' ActivityDate column was
-- ISNULL(pos.UploadedAt, s.SessionDate): correct for a session that has
-- an uploaded proof (UploadedAt is a real "this happened" timestamp),
-- but for every other row it fell back to SessionDate -- the session's
-- own SCHEDULED date/time, which for a session booked ahead of time is
-- still in the future. "Proof uploaded" entries never hit that
-- fallback, which is why only they showed correct past dates.
--
-- Sessions had no creation timestamp at all to fall back to correctly.
-- Adding one here: CreatedAt, DEFAULT GETDATE() so every future INSERT
-- populates it automatically, no application code changes needed.
-- Existing rows are backfilled below: a session already in the past
-- keeps SessionDate as its best-available approximation of when it was
-- logged; a session still scheduled for the future (exactly the broken
-- case reported) is backfilled to right now, since all we know for
-- certain about it is that it already existed as of today.
-- ============================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

ALTER TABLE dbo.Sessions
  ADD CreatedAt DATETIME NOT NULL CONSTRAINT DF_Sessions_CreatedAt DEFAULT (GETDATE());
GO

UPDATE dbo.Sessions
SET CreatedAt = CASE WHEN SessionDate > GETDATE() THEN GETDATE() ELSE SessionDate END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetRecentActivities
    @Top INT = 10
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@Top)
        s.SessionID                                                       AS SessionID,
        u.FirstName + ' ' + u.LastName                                    AS MentorName,
        s.SessionDate,
        s.Status,
        CASE WHEN pos.ProofID IS NOT NULL THEN 'Proof Uploaded'
             ELSE s.Status END                                            AS ActivityType,
        -- Was ISNULL(pos.UploadedAt, s.SessionDate) — the session's own
        -- scheduled date/time, not when the activity itself was logged.
        -- Now falls back to CreatedAt (the session row's own creation
        -- timestamp) instead.
        ISNULL(pos.UploadedAt, s.CreatedAt)                               AS ActivityDate,
        ISNULL(att.AttendeeCount, 0)                                      AS MenteeCount
    FROM   dbo.Sessions s
    INNER  JOIN dbo.Users u ON u.UserID = s.MentorID
    LEFT   JOIN dbo.ProofOfSession pos ON pos.SessionID = s.SessionID
    OUTER  APPLY (
        SELECT COUNT(*) AS AttendeeCount
        FROM   dbo.Attendance a
        WHERE  a.SessionID = s.SessionID AND a.IsPresent = 1
    ) att
    ORDER BY ISNULL(pos.UploadedAt, s.CreatedAt) DESC;
END;
GO
