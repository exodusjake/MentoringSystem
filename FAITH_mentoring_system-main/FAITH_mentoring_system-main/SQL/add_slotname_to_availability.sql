-- add_slotname_to_availability.sql
--
-- Availability previously had no relationship to the semester's mentoring
-- checkpoints (Before Prelims, Before Midterms, ...) at all -- a mentor
-- could post a slot for any arbitrary date. This ties a posted slot to one
-- checkpoint, validated server-side (AvailabilityWorkflowService.AddSlotAsync)
-- against that checkpoint's actual Session Schedule window on the calendar
-- (CalendarEvents where EventType='Session Schedule').
--
-- It also fixes a real, previously-invisible gap: a Session auto-created
-- from a booked Availability slot got SlotName = NULL (Availability never
-- had one to pass along), making every such session invisible to Phase 3's
-- Timeliness scoring (which matches Sessions.SlotName against a
-- CalendarEvents Deadline row -- NULL never matches). sp_SubmitSessionRequest
-- below now propagates it.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

ALTER TABLE dbo.Availability ADD SlotName NVARCHAR(50) NULL;
GO

-- ============================================================
-- sp_GetMentorSlots — now also returns SlotName
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorSlots
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        a.AvailabilityID, a.AvailableDate, a.StartTime, a.EndTime, a.SlotName,
        CASE
            WHEN EXISTS (SELECT 1 FROM dbo.SessionRequests sr2
                         WHERE sr2.AvailabilityID = a.AvailabilityID AND sr2.Status = 'Pending')
            THEN 'Pending' ELSE 'Open'
        END AS SlotStatus,
        sr.RequestID, sr.Status AS RequestStatus, sr.Purpose, sr.RequestedAt,
        u.FirstName + ' ' + u.LastName AS MenteeName,
        u.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section) AS SectionCode,
        (
            SELECT STRING_AGG(ua.FirstName + ' ' + ua.LastName, ', ')
            FROM   dbo.SessionRequests sra
            INNER  JOIN dbo.Users ua ON ua.UserID = sra.MenteeID
            WHERE  sra.AvailabilityID = a.AvailabilityID AND sra.Status = 'Approved'
        ) AS ApprovedMentees
    FROM   dbo.Availability a
    LEFT   JOIN dbo.SessionRequests sr
           ON sr.AvailabilityID = a.AvailabilityID AND sr.Status IN ('Pending','Approved','Declined')
    LEFT   JOIN dbo.Users u           ON u.UserID    = sr.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = sr.MenteeID
    LEFT   JOIN dbo.Sections sec      ON sec.SectionID = mep.SectionID
    WHERE  a.MentorID = @MentorID
    ORDER  BY a.AvailableDate ASC, a.StartTime ASC;
END;
GO

-- ============================================================
-- sp_GetOpenSlotsForMentee — now also returns SlotName
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetOpenSlotsForMentee
    @MenteeID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        a.AvailabilityID, a.MentorID,
        u.FirstName + ' ' + u.LastName AS MentorName,
        a.AvailableDate, a.StartTime, a.EndTime, a.SlotName,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                          WHERE sr.AvailabilityID = a.AvailabilityID
                            AND sr.MenteeID = @MenteeID AND sr.Status = 'Pending')
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END AS AlreadyRequested,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                          WHERE sr.AvailabilityID = a.AvailabilityID
                            AND sr.MenteeID = @MenteeID AND sr.Status = 'Approved')
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END AS AlreadyApproved
    FROM   dbo.Availability a
    INNER  JOIN dbo.MentorMentee mm
           ON mm.MentorID = a.MentorID AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
    INNER  JOIN dbo.Users u ON u.UserID = a.MentorID
    WHERE  a.AvailableDate >= CAST(GETDATE() AS DATE)
    ORDER  BY a.AvailableDate ASC, a.StartTime ASC;
END;
GO

-- ============================================================
-- sp_SubmitSessionRequest — now propagates Availability.SlotName onto the
-- Session it creates/reuses. Same auto-approve logic as
-- auto_approve_session_requests.sql, unchanged except for that one field.
-- ============================================================
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
            DECLARE @TimeEnd     DATETIME = CAST(@AvailableDate AS DATETIME) + CAST(@EndTime   AS DATETIME);

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
