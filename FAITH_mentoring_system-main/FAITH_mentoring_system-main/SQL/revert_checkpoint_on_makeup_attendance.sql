-- revert_checkpoint_on_makeup_attendance.sql
--
-- Client-confirmed rule: once a mentee catches up on a missed checkpoint
-- via an Availability-booked (makeup) session, the checkpoint's already-
-- Submitted regular session should revert to Draft -- the mentor must
-- consciously resubmit to lock in the updated attendee list (the merged
-- Logsheet already shows the makeup attendee live, without needing a
-- resubmit -- this is specifically about the formal "submitted" record).
-- Confirmed acceptable that this can affect Timeliness: SubmittedAt only
-- re-stamps on the NEXT real Submit (SessionsService.UpdateLogStatusAsync,
-- unchanged), so resubmitting before the checkpoint's Deadline costs
-- nothing; resubmitting after it correctly counts as late, same bracket
-- rules as every other late submission.
--
-- Two entry points mark a mentee present -- QR scan (sp_ScanQRAttendance)
-- and manual entry (AttendanceService.Add, used by the Logsheet's remarks
-- form for a makeup session with no QR scan) -- both call this shared
-- proc rather than duplicating the match/revert logic.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_RevertCheckpointOnMakeupAttendance
    @MakeupSessionID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MentorID   INT,
            @SlotName   NVARCHAR(50),
            @SchoolYear NVARCHAR(20),
            @Semester   NVARCHAR(50);

    SELECT @MentorID = MentorID, @SlotName = SlotName,
           @SchoolYear = SchoolYear, @Semester = Semester
    FROM   dbo.Sessions
    WHERE  SessionID = @MakeupSessionID AND RequestID IS NOT NULL;

    -- Not a checkpoint-tagged makeup session (no SlotName, or not makeup
    -- at all) -- nothing to revert.
    IF @MentorID IS NULL OR @SlotName IS NULL RETURN;

    UPDATE s
    SET    s.LogStatus = 'Draft'
    FROM   dbo.Sessions s
    WHERE  s.MentorID = @MentorID AND s.SlotName = @SlotName
      AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
      AND  s.RequestID IS NULL AND s.Status <> 'Cancelled'
      AND  s.LogStatus = 'Submitted'
      AND  s.SectionCode IN (
          SELECT COALESCE(sec.SectionCode, mep.Section)
          FROM   dbo.Attendance     a
          INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID = a.MenteeID
          LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
          WHERE  a.SessionID = @MakeupSessionID AND a.IsPresent = 1
      );
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ScanQRAttendance
    @Token NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TokenID   INT,
            @SessionID INT,
            @MenteeID  INT,
            @ExpiresAt DATETIME,
            @IsUsed    BIT;

    SELECT @TokenID   = TokenID,
           @SessionID = SessionID,
           @MenteeID  = MenteeID,
           @ExpiresAt = ExpiresAt,
           @IsUsed    = IsUsed
    FROM   dbo.QRTokens
    WHERE  Token = @Token;

    IF @TokenID IS NULL
    BEGIN
        SELECT CAST(0 AS BIT) AS Success, 'Invalid QR code.' AS Message,
               0 AS MenteeId, 0 AS SessionId, '' AS MenteeName;
        RETURN;
    END;

    IF @IsUsed = 1
    BEGIN
        SELECT CAST(0 AS BIT) AS Success, 'This QR code has already been scanned.' AS Message,
               0 AS MenteeId, 0 AS SessionId, '' AS MenteeName;
        RETURN;
    END;

    IF @ExpiresAt < GETUTCDATE()
    BEGIN
        SELECT CAST(0 AS BIT) AS Success, 'QR code has expired. Ask mentee to refresh.' AS Message,
               0 AS MenteeId, 0 AS SessionId, '' AS MenteeName;
        RETURN;
    END;

    BEGIN TRANSACTION;
    BEGIN TRY
        UPDATE dbo.QRTokens SET IsUsed = 1 WHERE TokenID = @TokenID;

        DECLARE @FirstName  NVARCHAR(100),
                @LastName   NVARCHAR(100);
        SELECT @FirstName = FirstName, @LastName = LastName
        FROM   dbo.Users WHERE UserID = @MenteeID;
        DECLARE @MenteeName NVARCHAR(200) = LTRIM(RTRIM(ISNULL(@FirstName,'') + ' ' + ISNULL(@LastName,'')));

        -- Upsert attendance (UPDATE existing row, INSERT if none)
        IF EXISTS (SELECT 1 FROM dbo.Attendance WHERE SessionID = @SessionID AND MenteeID = @MenteeID)
            UPDATE dbo.Attendance
            SET    IsPresent = 1, ScannedAt = GETUTCDATE()
            WHERE  SessionID = @SessionID AND MenteeID = @MenteeID;
        ELSE
            INSERT INTO dbo.Attendance (SessionID, MenteeID, IsPresent, ScannedAt)
            VALUES (@SessionID, @MenteeID, 1, GETUTCDATE());

        -- Auto-complete session on first QR scan
        UPDATE dbo.Sessions SET Status = 'Completed'
        WHERE  SessionID = @SessionID AND Status = 'Scheduled';

        -- A makeup checkpoint catch-up scan reopens its already-Submitted
        -- regular session back to Draft -- see sp_RevertCheckpointOnMakeup
        -- Attendance's header comment.
        EXEC dbo.sp_RevertCheckpointOnMakeupAttendance @SessionID;

        COMMIT TRANSACTION;
        SELECT CAST(1 AS BIT) AS Success, 'OK' AS Message,
               @MenteeID AS MenteeId, @SessionID AS SessionId, @MenteeName AS MenteeName;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
