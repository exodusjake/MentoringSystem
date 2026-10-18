-- fix_delete_user_solo_makeup_sessions.sql
--
-- A mentee who ever requested (and got approved for) a makeup slot has a
-- SessionRequests row, and the Session created from it points back via
-- Sessions.RequestID. Deleting SessionRequests WHERE MenteeID = @UserID
-- without first dealing with that Session violates FK_Session_Request --
-- exactly what surfaced as a raw 500 for a real mentee (Ian Santos,
-- Patrick Lim) instead of the app's own error handling ever seeing it.
--
-- The app-level guard (ProfileService.GetHardDeleteBlockReasonAsync) now
-- blocks this entirely when the session is shared with another mentee's
-- approved request or attendance ("multiple mentees approved for the same
-- slot" is an intentional feature -- sp_ApproveSessionRequest). This proc
-- only ever runs past that guard for a SOLO makeup session, so it's safe
-- to delete the session (and its own QRTokens/ProofOfSession) alongside
-- the mentee's request.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_DeleteUser
    @UserID INT
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;
    BEGIN TRY
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
