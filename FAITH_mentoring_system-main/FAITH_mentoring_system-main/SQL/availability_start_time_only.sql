-- Availability stores a scheduled start only. Session.TimeEnd is recorded on finish.
-- Existing slots and completed sessions retain their historical values.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
ALTER TABLE dbo.Availability ALTER COLUMN EndTime time NULL;
COMMIT TRANSACTION;

GO

-- New bookings also ignore legacy availability end times.
CREATE OR ALTER PROCEDURE dbo.sp_SubmitSessionRequest
    @MenteeID       INT,
    @AvailabilityID INT,
    @Purpose        NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Availability WHERE AvailabilityID = @AvailabilityID)
    BEGIN
        SELECT 0 AS Success, 'Slot not found.' AS ErrorMessage;
        RETURN;
    END;

    IF EXISTS (
        SELECT 1 FROM dbo.SessionRequests
        WHERE AvailabilityID = @AvailabilityID AND MenteeID = @MenteeID AND Status IN ('Pending', 'Approved')
    )
    BEGIN
        SELECT 0 AS Success, 'You have already booked this slot.' AS ErrorMessage;
        RETURN;
    END;

    DECLARE @MentorID      INT,
            @AvailableDate DATE,
            @StartTime     TIME,
            @EndTime       TIME,
            @SlotName      NVARCHAR(50);
    SELECT
        @MentorID      = MentorID,
        @AvailableDate = AvailableDate,
        @StartTime     = StartTime,
        @EndTime       = EndTime,
        @SlotName      = SlotName
    FROM dbo.Availability
    WHERE AvailabilityID = @AvailabilityID;

    DECLARE @SchoolYear NVARCHAR(20) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear');
    DECLARE @Semester   NVARCHAR(50) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester');

    BEGIN TRANSACTION;
    BEGIN TRY
        INSERT INTO dbo.SessionRequests (MenteeID, AvailabilityID, Purpose, Status, RequestedAt, RespondedAt)
        VALUES (@MenteeID, @AvailabilityID, @Purpose, 'Approved', GETDATE(), GETDATE());

        DECLARE @RequestID INT = SCOPE_IDENTITY();

        -- Same slot, already booked by an earlier mentee? Reuse that
        -- session instead of creating a second one -- everyone who books
        -- this slot attends together.
        DECLARE @ExistingSessionID INT;
        SELECT @ExistingSessionID = s.SessionID
        FROM   dbo.Sessions        s
        INNER  JOIN dbo.SessionRequests sr2 ON sr2.RequestID = s.RequestID
        WHERE  sr2.AvailabilityID = @AvailabilityID;

        IF @ExistingSessionID IS NULL
        BEGIN
            DECLARE @SessionDate DATETIME = CAST(@AvailableDate AS DATETIME) + CAST(@StartTime AS DATETIME);
            DECLARE @TimeEnd DATETIME = NULL;

            INSERT INTO dbo.Sessions
                (MentorID, SessionDate, TimeEnd, Status, RequestID, Notes, QRCodeToken, SchoolYear, Semester, SlotName)
            VALUES
                (@MentorID, @SessionDate, @TimeEnd, 'Scheduled', @RequestID, NULL,
                 CONVERT(NVARCHAR(36), NEWID()), @SchoolYear, @Semester, @SlotName);
        END;

        COMMIT TRANSACTION;
        SELECT 1 AS Success, '' AS ErrorMessage;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
