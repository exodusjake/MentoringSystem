-- auto_approve_session_requests.sql
--
-- The Availability page used to require the mentor to Approve/Decline every
-- mentee request before a session got created. Per the mentor's own
-- request, this gate is gone: submitting a request now books the slot
-- immediately (Status = 'Approved' from the start) -- the mentor's
-- Availability page becomes a read-only "who's attending" view instead of
-- a moderation queue.
--
-- The create-or-reuse-session logic below is copied verbatim from
-- sp_ApproveSessionRequest, which already supports multiple mentees
-- attending the same slot together ("no auto-decline of others") -- that
-- part needed no new logic, just moving it earlier in the flow.

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

    -- A request is never left "Pending" anymore -- it's approved the
    -- instant it's submitted -- so this guard is really "you already
    -- booked this slot" now (Pending kept in the check only in case any
    -- legacy row from before this change is still sitting there).
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
            @EndTime       TIME;
    SELECT
        @MentorID      = MentorID,
        @AvailableDate = AvailableDate,
        @StartTime     = StartTime,
        @EndTime       = EndTime
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
            DECLARE @TimeEnd     DATETIME = CAST(@AvailableDate AS DATETIME) + CAST(@EndTime   AS DATETIME);

            INSERT INTO dbo.Sessions
                (MentorID, SessionDate, TimeEnd, Status, RequestID, Notes, QRCodeToken, SchoolYear, Semester)
            VALUES
                (@MentorID, @SessionDate, @TimeEnd, 'Scheduled', @RequestID, NULL,
                 CONVERT(NVARCHAR(36), NEWID()), @SchoolYear, @Semester);
        END;

        COMMIT TRANSACTION;
        SELECT 1 AS Success, '' AS ErrorMessage;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
