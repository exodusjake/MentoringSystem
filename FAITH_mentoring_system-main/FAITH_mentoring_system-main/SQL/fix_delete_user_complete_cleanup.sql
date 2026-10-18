-- fix_delete_user_complete_cleanup.sql
--
-- sp_DeleteUser's cascade list was written before several tables/columns
-- existed, and never learned about them. Cross-checked every FK in the
-- database that actually points at Users (sys.foreign_keys) against the
-- proc's DELETE list -- three were missing entirely:
--   - AnnouncementComments.PostedByUserID  (any mentee/mentor who ever
--     commented on an announcement)
--   - EvaluationSubmissions.MenteeID       (any mentee who ever marked an
--     evaluation link as submitted)
--   - ProofOfSession.UploadedByUserID      (the existing cleanup only
--     covered proof tied to sessions this user MENTORED -- not proof this
--     user personally uploaded under any other session)
--
-- This is exactly why deleting a real account with real activity (a
-- mentee who'd commented or submitted an evaluation) failed with a raw
-- FK-violation 500, while the earlier disposable test-user delete
-- succeeded -- the test user had none of this activity to expose the gap.
--
-- Also added EvaluationLinks.PostedByUserID (Admin/Head edge case) --
-- confirmed safe to delete directly: EvaluationSubmissions.LinkID and
-- EvaluationAttachments.LinkID both CASCADE from EvaluationLinks already,
-- so removing a link an Admin posted correctly takes its own
-- submissions/attachments with it, with no manual ordering needed.

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

        -- Proof records for sessions this user mentored...
        DELETE p
        FROM   dbo.ProofOfSession p
        INNER  JOIN dbo.Sessions s ON s.SessionID = p.SessionID
        WHERE  s.MentorID = @UserID;
        -- ...and proof this user personally uploaded, under any session.
        DELETE FROM dbo.ProofOfSession WHERE UploadedByUserID = @UserID;

        DELETE FROM dbo.AccountPeriodHistory    WHERE UserID          = @UserID;
        DELETE FROM dbo.AnnouncementComments    WHERE PostedByUserID  = @UserID;
        DELETE FROM dbo.EvaluationSubmissions   WHERE MenteeID        = @UserID;
        DELETE FROM dbo.EvaluationLinks         WHERE PostedByUserID  = @UserID;
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
