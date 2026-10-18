-- Reviewed supplement: apply after the three course tables. No historical backfill.

CREATE OR ALTER PROCEDURE [dbo].[sp_DeleteUser]
    @UserID INT
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;
    BEGIN TRY
        -- Remove only course children of sessions already targeted by this procedure.
        -- Preserve CourseCheckpointLogs and scopes/members of all surviving sessions.
        DECLARE @DeletedSessions TABLE (SessionID int PRIMARY KEY);
        INSERT @DeletedSessions(SessionID)
        SELECT s.SessionID FROM dbo.Sessions s
        LEFT JOIN dbo.SessionRequests sr ON sr.RequestID=s.RequestID
        WHERE s.MentorID=@UserID OR sr.MenteeID=@UserID;
        DELETE cm FROM dbo.SessionCourseMembers cm
        JOIN @DeletedSessions d ON d.SessionID=cm.SessionID;
        DELETE cs FROM dbo.SessionCourseScopes cs
        JOIN @DeletedSessions d ON d.SessionID=cs.SessionID;

        -- QR tokens for sessions this user ran as mentor
        DELETE qt
        FROM   dbo.QRTokens qt
        INNER  JOIN dbo.Sessions s ON s.SessionID = qt.SessionID
        WHERE  s.MentorID = @UserID;

        -- QR tokens where this user was the mentee
        DELETE FROM dbo.QRTokens WHERE MenteeID = @UserID;

        -- ...and QR tokens for a solo makeup session this mentee's own
        -- request anchors (verified solo by the app-level guard above).
        DELETE qt
        FROM   dbo.QRTokens qt
        INNER  JOIN dbo.Sessions s ON s.SessionID = qt.SessionID
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.MenteeID = @UserID;

        -- Proof records for sessions this user mentored...
        DELETE p
        FROM   dbo.ProofOfSession p
        INNER  JOIN dbo.Sessions s ON s.SessionID = p.SessionID
        WHERE  s.MentorID = @UserID;
        -- ...proof this user personally uploaded, under any session...
        DELETE FROM dbo.ProofOfSession WHERE UploadedByUserID = @UserID;
        -- ...and proof for a solo makeup session this mentee's own request anchors.
        DELETE p
        FROM   dbo.ProofOfSession p
        INNER  JOIN dbo.Sessions s ON s.SessionID = p.SessionID
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.MenteeID = @UserID;

        DELETE FROM dbo.AccountPeriodHistory    WHERE UserID          = @UserID;
        DELETE FROM dbo.AnnouncementComments    WHERE PostedByUserID  = @UserID;
        DELETE FROM dbo.EvaluationSubmissions   WHERE MenteeID        = @UserID;
        DELETE FROM dbo.EvaluationLinks         WHERE PostedByUserID  = @UserID;
        DELETE FROM dbo.MentorMentee    WHERE MentorID        = @UserID OR MenteeID         = @UserID;
        DELETE FROM dbo.Attendance      WHERE MenteeID        = @UserID;

        -- The solo makeup session itself, before its SessionRequests row
        -- (which it references via Sessions.RequestID) is removed below.
        DELETE s
        FROM   dbo.Sessions s
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.MenteeID = @UserID;

        DELETE FROM dbo.SessionRequests WHERE MenteeID        = @UserID;
        DELETE FROM dbo.Sessions        WHERE MentorID        = @UserID;
        DELETE FROM dbo.Availability    WHERE MentorID        = @UserID;
        DELETE FROM dbo.Notifications   WHERE RecipientUserID = @UserID;
        DELETE FROM dbo.Announcements   WHERE PostedByUserID  = @UserID;
        DELETE FROM dbo.MentorProfiles  WHERE UserID          = @UserID;
        DELETE FROM dbo.MenteeProfiles  WHERE UserID          = @UserID;
        DELETE FROM dbo.Users           WHERE UserID          = @UserID;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;

