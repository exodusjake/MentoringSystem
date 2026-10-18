-- Completed activities use SubmittedAt instead of CreatedAt; CreatedAt stays
-- the fallback for Scheduled/Cancelled or an un-submitted Completed session.

CREATE OR ALTER PROCEDURE [dbo].[sp_GetRecentActivities]
    @Top INT = 10
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@Top)
        s.SessionID                                                       AS SessionID,
        u.FirstName + ' ' + u.LastName                                    AS MentorName,
        s.SessionDate,
        s.Status,
        s.SlotName,
        CASE WHEN pos.ProofID IS NOT NULL THEN 'Proof Uploaded'
             ELSE s.Status END                                            AS ActivityType,
        CASE WHEN pos.ProofID IS NOT NULL THEN pos.UploadedAt
             WHEN s.Status = 'Completed' THEN ISNULL(s.SubmittedAt, s.CreatedAt)
             ELSE s.CreatedAt END                                         AS ActivityDate,
        ISNULL(att.AttendeeCount, 0)                                      AS MenteeCount
    FROM   dbo.Sessions s
    INNER  JOIN dbo.Users u ON u.UserID = s.MentorID
    LEFT   JOIN dbo.ProofOfSession pos ON pos.SessionID = s.SessionID
    OUTER  APPLY (
        SELECT COUNT(*) AS AttendeeCount
        FROM   dbo.Attendance a
        WHERE  a.SessionID = s.SessionID AND a.IsPresent = 1
    ) att
    ORDER BY (CASE WHEN pos.ProofID IS NOT NULL THEN pos.UploadedAt
                   WHEN s.Status = 'Completed' THEN ISNULL(s.SubmittedAt, s.CreatedAt)
                   ELSE s.CreatedAt END) DESC;
END;
GO
