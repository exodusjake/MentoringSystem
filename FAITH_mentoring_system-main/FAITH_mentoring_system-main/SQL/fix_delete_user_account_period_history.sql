-- fix_delete_user_account_period_history.sql
--
-- sp_DeleteUser is a genuine cascade hard-delete across every related
-- table, wrapped in one transaction. It predates AccountPeriodHistory
-- (added this session) and never learned about it -- so deleting anyone
-- who has ever been snapshotted (i.e. anyone active during a School
-- Year/Semester change) now fails with an FK violation, rolls back, and
-- (due to a pre-existing frontend quirk that treats the resulting 500 as
-- success) silently does nothing instead of surfacing an error.
--
-- The UI no longer exposes true hard-delete at all going forward (Delete
-- now routes to Drop Out / Deactivate, both reversible and history-safe)
-- -- but sp_DeleteUser itself stays available for backend/support use, so
-- it still needs to actually work.

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

        -- Proof records for sessions this user mentored
        DELETE p
        FROM   dbo.ProofOfSession p
        INNER  JOIN dbo.Sessions s ON s.SessionID = p.SessionID
        WHERE  s.MentorID = @UserID;

        DELETE FROM dbo.AccountPeriodHistory WHERE UserID          = @UserID;
        DELETE FROM dbo.MentorMentee    WHERE MentorID        = @UserID OR MenteeID         = @UserID;
        DELETE FROM dbo.SessionRequests WHERE MenteeID        = @UserID;
        DELETE FROM dbo.Attendance      WHERE MenteeID        = @UserID;
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
