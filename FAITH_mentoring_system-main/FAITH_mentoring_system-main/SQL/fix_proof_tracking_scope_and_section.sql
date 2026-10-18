-- sp_GetSessionProofs: two fixes.
--
-- 1) ACCURACY: "Coverage Rate" counted every session ever (Scheduled and
--    Cancelled included) as if it should already have proof. A session
--    that hasn't happened yet, or never will, can never have proof — so
--    counting it as "missing" understated real mentor compliance. Live:
--    20 total (13 Completed + 6 Scheduled + 1 Cancelled), 10 with proof
--    -> 50% shown, vs the true 13 Completed / 10 with proof -> 77%.
--    Now scoped to Completed sessions only, which is the only status this
--    metric is meaningful for.
--
-- 2) Adds SectionCode to the output (using the real column, not text
--    parsing) so the page can show which section a session belongs to
--    directly, instead of leaving it buried in the free-text topic.
--
-- SessionNumber is still computed over all non-cancelled sessions (a CTE,
-- before the Completed-only filter) so numbering stays consistent with
-- every other page in the system — a session's number reflects its true
-- position among its section's sessions, not just among the ones shown
-- here.

CREATE OR ALTER PROCEDURE dbo.sp_GetSessionProofs
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Ranked AS (
        SELECT
            s.SessionID, s.MentorID, s.SessionDate, s.Notes, s.RequestID, s.SectionCode,
            DENSE_RANK() OVER (
                PARTITION BY s.MentorID, s.SchoolYear, s.Semester, s.SectionCode
                ORDER BY s.SessionDate, s.SessionID
            ) AS SessionNumber
        FROM   dbo.Sessions s
        WHERE  s.Status != 'Cancelled'
    )

    -- RS1: session proof rows — completed sessions only
    SELECT
        r.SessionID,
        r.SessionNumber,
        r.SessionDate,
        r.SectionCode,
        COALESCE(sr.Purpose, r.Notes, 'Session')           AS Topic,
        u.UserID                                            AS MentorID,
        u.FirstName                                         AS MentorFirstName,
        u.LastName                                          AS MentorLastName,
        p.ProofID, p.FilePath, p.FileType, p.UploadedAt,
        CASE WHEN p.ProofID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasProof
    FROM   Ranked r
    JOIN   dbo.Sessions             s  ON s.SessionID  = r.SessionID AND s.Status = 'Completed'
    JOIN   dbo.Users                u  ON u.UserID     = r.MentorID
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = r.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath, FileType, UploadedAt,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = r.SessionID AND p.rn = 1
    ORDER  BY r.SessionDate DESC, u.LastName, u.FirstName;

    -- RS2: active mentors for filter dropdown
    SELECT DISTINCT
        u.UserID AS MentorID, u.FirstName, u.LastName
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID = u.UserID AND mm.IsActive = 1
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
