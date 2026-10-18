-- sp_GetSessionProofs: the "#N" session number shown per row on the Proof
-- Tracking page was DENSE_RANK'd by MentorID alone — neither section- nor
-- semester-scoped, the same gap already fixed in sp_GetMentorSessions,
-- sp_GetMenteeAttendanceHistory, and sp_GetLogsheet. A two-section mentor's
-- sessions would interleave into one shared numbering, and the count never
-- reset across a semester boundary.
--
-- Fix: partition by section (parsed from the same [SECTION] Notes prefix
-- used everywhere else — bracket-less/makeup sessions fall into one shared
-- NULL partition per mentor+semester, same as before) and by school year +
-- semester.

CREATE OR ALTER PROCEDURE dbo.sp_GetSessionProofs
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: session proof rows
    SELECT
        s.SessionID,
        DENSE_RANK() OVER (
            PARTITION BY s.MentorID, s.SchoolYear, s.Semester,
                         CASE WHEN s.Notes LIKE '[[]%]%'
                              THEN SUBSTRING(s.Notes, 2, CHARINDEX(']', s.Notes) - 2)
                              ELSE NULL END
            ORDER BY s.SessionDate, s.SessionID
        )                                                    AS SessionNumber,
        s.SessionDate,
        s.Status                                            AS SessionStatus,
        COALESCE(sr.Purpose, s.Notes, 'Session')           AS Topic,
        u.UserID                                            AS MentorID,
        u.FirstName                                         AS MentorFirstName,
        u.LastName                                          AS MentorLastName,
        p.ProofID, p.FilePath, p.FileType, p.UploadedAt,
        CASE WHEN p.ProofID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasProof
    FROM   dbo.Sessions s
    JOIN   dbo.Users u              ON u.UserID    = s.MentorID
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath, FileType, UploadedAt,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    ORDER  BY s.SessionDate DESC, u.LastName, u.FirstName;

    -- RS2: active mentors for filter dropdown
    SELECT DISTINCT
        u.UserID AS MentorID, u.FirstName, u.LastName
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID = u.UserID AND mm.IsActive = 1
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
