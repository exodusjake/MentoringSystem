-- Expose SessionID from sp_GetRecentActivities so the frontend has a
-- stable per-activity key to track "viewed" state against (each row is
-- one session's current activity, so SessionID uniquely identifies it).
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
        ISNULL(pos.UploadedAt, s.SessionDate)                            AS ActivityDate,
        ISNULL(att.AttendeeCount, 0)                                      AS MenteeCount
    FROM   dbo.Sessions s
    INNER  JOIN dbo.Users u ON u.UserID = s.MentorID
    LEFT   JOIN dbo.ProofOfSession pos ON pos.SessionID = s.SessionID
    OUTER  APPLY (
        SELECT COUNT(*) AS AttendeeCount
        FROM   dbo.Attendance a
        WHERE  a.SessionID = s.SessionID AND a.IsPresent = 1
    ) att
    ORDER BY ISNULL(pos.UploadedAt, s.SessionDate) DESC;
END;
