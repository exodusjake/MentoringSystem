-- ============================================================
-- ASTRA MENTORING SYSTEM — Stored Procedures Migration
-- Run against: AstraMentoring database
-- Safe to re-run: CREATE OR ALTER updates existing procedures
-- No data or logic is modified — same behaviour as previous inline SQL
-- ============================================================
USE AstraMentoring;
GO

PRINT 'Creating / updating stored procedures...';
GO

-- ============================================================
-- sp_ApproveSessionRequest
-- Atomically: verifies the pending request belongs to this mentor,
-- creates a Session (reusing existing one for the slot if any),
-- and marks the request as Approved.
-- Returns: (Success INT, ErrorMessage NVARCHAR)
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_ApproveSessionRequest
    @RequestID INT,
    @MentorID  INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MenteeID       INT,
            @AvailabilityID INT,
            @AvailableDate  DATE,
            @StartTime      TIME,
            @EndTime        TIME;

    SELECT
        @MenteeID       = sr.MenteeID,
        @AvailabilityID = sr.AvailabilityID,
        @AvailableDate  = a.AvailableDate,
        @StartTime      = a.StartTime,
        @EndTime        = a.EndTime
    FROM dbo.SessionRequests sr
    INNER JOIN dbo.Availability a ON a.AvailabilityID = sr.AvailabilityID
    WHERE sr.RequestID = @RequestID
      AND a.MentorID   = @MentorID
      AND sr.Status    = 'Pending';

    IF @MenteeID IS NULL
    BEGIN
        SELECT 0 AS Success, 'Request not found or already actioned.' AS ErrorMessage;
        RETURN;
    END;

    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @SessionDate DATETIME = CAST(@AvailableDate AS DATETIME) + CAST(@StartTime AS DATETIME);
        DECLARE @TimeEnd     DATETIME = CAST(@AvailableDate AS DATETIME) + CAST(@EndTime   AS DATETIME);

        -- Reuse an existing session for this slot (created by a previous approval)
        DECLARE @ExistingSessionID INT;
        SELECT @ExistingSessionID = s.SessionID
        FROM   dbo.Sessions        s
        INNER  JOIN dbo.SessionRequests sr2 ON sr2.RequestID = s.RequestID
        WHERE  sr2.AvailabilityID = @AvailabilityID;

        IF @ExistingSessionID IS NULL
        BEGIN
            INSERT INTO dbo.Sessions (MentorID, SessionDate, TimeEnd, Status, RequestID, Notes, QRCodeToken)
            VALUES (@MentorID, @SessionDate, @TimeEnd, 'Scheduled', @RequestID, NULL,
                    CONVERT(NVARCHAR(36), NEWID()));
        END;

        UPDATE dbo.SessionRequests
        SET    Status = 'Approved', RespondedAt = GETDATE()
        WHERE  RequestID = @RequestID;

        COMMIT TRANSACTION;
        SELECT 1 AS Success, '' AS ErrorMessage;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- ============================================================
-- sp_DeleteAvailabilitySlot
-- Atomically cascade-deletes a slot and all linked data:
-- QRTokens → Attendance → ProofOfSession → Sessions → SessionRequests → Availability
-- Returns: (Success INT, ErrorMessage NVARCHAR)
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_DeleteAvailabilitySlot
    @AvailabilityID INT,
    @MentorID       INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.Availability
        WHERE  AvailabilityID = @AvailabilityID AND MentorID = @MentorID
    )
    BEGIN
        SELECT 0 AS Success, 'Slot not found.' AS ErrorMessage;
        RETURN;
    END;

    BEGIN TRANSACTION;
    BEGIN TRY
        -- Delete QR tokens for sessions tied to this slot
        DELETE qt
        FROM   dbo.QRTokens qt
        INNER  JOIN dbo.Sessions s         ON s.SessionID  = qt.SessionID
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.AvailabilityID = @AvailabilityID;

        -- Delete attendance records for those sessions
        DELETE a
        FROM   dbo.Attendance a
        INNER  JOIN dbo.Sessions s         ON s.SessionID  = a.SessionID
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.AvailabilityID = @AvailabilityID;

        -- Delete proof records for those sessions
        DELETE p
        FROM   dbo.ProofOfSession p
        INNER  JOIN dbo.Sessions s         ON s.SessionID  = p.SessionID
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.AvailabilityID = @AvailabilityID;

        -- Delete sessions linked to this slot
        DELETE s
        FROM   dbo.Sessions s
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.AvailabilityID = @AvailabilityID;

        -- Delete session requests
        DELETE FROM dbo.SessionRequests WHERE AvailabilityID = @AvailabilityID;

        -- Delete the slot itself
        DELETE FROM dbo.Availability WHERE AvailabilityID = @AvailabilityID;

        COMMIT TRANSACTION;
        SELECT 1 AS Success, '' AS ErrorMessage;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- ============================================================
-- sp_ScanQRAttendance
-- Validates a QR token, marks it used, upserts IsPresent=1,
-- and auto-completes the session — all in one round-trip.
-- Returns: (Success BIT, Message NVARCHAR, MenteeId INT, SessionId INT, MenteeName NVARCHAR)
-- ============================================================
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

-- ============================================================
-- sp_AssignMentor
-- Atomically deactivates any existing assignment for the mentee,
-- then inserts the new mentor–mentee pair as active. Re-saving the
-- mentee's CURRENT mentor is a no-op, so the original AssignedDate
-- (which attendance counts are measured from) is kept.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_AssignMentor
    @MenteeID INT,
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;
    BEGIN TRY
        IF EXISTS (SELECT 1 FROM dbo.MentorMentee WITH (UPDLOCK, HOLDLOCK)
                   WHERE MenteeID = @MenteeID AND MentorID = @MentorID AND IsActive = 1)
        BEGIN
            COMMIT TRANSACTION;
            RETURN;
        END;

        UPDATE dbo.MentorMentee SET IsActive = 0 WHERE MenteeID = @MenteeID;

        INSERT INTO dbo.MentorMentee (MentorID, MenteeID, AssignedDate, IsActive)
        VALUES (@MentorID, @MenteeID, GETDATE(), 1);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- ============================================================
-- sp_DeleteUser
-- Cascade-deletes a user and all related data across every table,
-- wrapped in a single transaction.
-- ============================================================
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
GO

-- ============================================================
-- sp_GetUserStats
-- Returns all admin dashboard stats in 3 result sets (one round-trip).
--   RS1: single row — all scalar counts
--   RS2: per-mentor completed session counts for current semester
--   RS3: mentee attendance status distribution
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetUserStats
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20),
            @Semester     NVARCHAR(50),
            @SessionLimit INT = 6;
    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';
    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = '2nd Semester'
                             THEN 'SessionLimit2ndSem' ELSE 'SessionLimit1stSem' END;

    -- RS1: scalar counts
    SELECT
        (SELECT COUNT(*) FROM dbo.Users WHERE IsActive = 1)                                AS TotalUsers,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
         WHERE u.IsActive = 1)                                                             AS TotalMentors,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.IsActive = 1)                                                             AS TotalMentees,
        (SELECT COUNT(DISTINCT mm.MenteeID) FROM dbo.MentorMentee mm
         WHERE mm.IsActive = 1)                                                            AS Assigned,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.Role = 'Mentee' AND u.IsActive = 1
           AND me.IsDropOut = 0
           AND me.School IS NOT NULL AND me.School != ''
           AND NOT EXISTS (
               SELECT 1 FROM dbo.MentorMentee mm
               WHERE mm.MenteeID = u.UserID AND mm.IsActive = 1))                         AS Unassigned,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.Role = 'Mentee' AND u.IsActive = 1 AND me.IsDropOut = 1)                AS DroppedOut,
        (SELECT COUNT(DISTINCT a.MenteeID) FROM dbo.Attendance a
         INNER JOIN dbo.MentorMentee mm ON mm.MenteeID = a.MenteeID AND mm.IsActive = 1
         WHERE a.IsPresent = 1)                                                            AS ActiveMentees,
        (SELECT COUNT(*) FROM dbo.Sessions s
         LEFT JOIN dbo.ProofOfSession pos ON pos.SessionID = s.SessionID
         WHERE s.Status = 'Completed' AND pos.ProofID IS NULL)                            AS SessionsWithoutProof,
        ISNULL(@SessionLimit, 6)                                                           AS RequiredSessions;

    -- RS2: per-mentor completed session counts for current semester
    SELECT u.UserID AS MentorID,
           ISNULL(sc.SessionCount, 0) AS SessionCount
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT   JOIN (
        SELECT MentorID, COUNT(*) AS SessionCount
        FROM   dbo.Sessions
        WHERE  Status = 'Completed'
          AND  SchoolYear = @SchoolYear AND Semester = @Semester
        GROUP  BY MentorID
    ) sc ON sc.MentorID = u.UserID
    WHERE  u.IsActive = 1;

    -- RS3: mentee attendance status distribution (assigned, non-dropped-out mentees only)
    SELECT
        CASE
            WHEN totalSessions = 0                                            THEN 'NoSessions'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.80         THEN 'Excellent'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.60         THEN 'OnTrack'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.40         THEN 'Behind'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.20         THEN 'AtRisk'
            ELSE                                                                   'Critical'
        END AS StatusTier,
        COUNT(*) AS MenteeCount
    FROM (
        SELECT
            u.UserID,
            COUNT(DISTINCT s.SessionID)                             AS totalSessions,
            SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)       AS presentCount
        FROM   dbo.Users u
        INNER  JOIN dbo.MenteeProfiles mp ON mp.UserID   = u.UserID AND mp.IsDropOut = 0
        INNER  JOIN dbo.MentorMentee   mm ON mm.MenteeID = u.UserID AND mm.IsActive  = 1
        LEFT   JOIN dbo.Sessions        s  ON s.MentorID   = mm.MentorID
                                          AND s.Status     = 'Completed'
                                          AND s.SessionDate >= mm.AssignedDate
                                          AND (s.RequestID IS NULL
                                               OR EXISTS (
                                                   SELECT 1 FROM dbo.SessionRequests sr
                                                   WHERE  sr.RequestID = s.RequestID
                                                     AND  sr.MenteeID  = u.UserID
                                                     AND  sr.Status    = 'Approved'))
        LEFT   JOIN dbo.Attendance     a  ON a.SessionID = s.SessionID AND a.MenteeID = u.UserID
        WHERE  u.IsActive = 1
        GROUP  BY u.UserID
    ) ms
    GROUP BY
        CASE
            WHEN totalSessions = 0                                            THEN 'NoSessions'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.80         THEN 'Excellent'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.60         THEN 'OnTrack'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.40         THEN 'Behind'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.20         THEN 'AtRisk'
            ELSE                                                                   'Critical'
        END;
END;
GO

-- ============================================================
-- sp_SendNotification
-- Set-based INSERT replaces C# loops — one round-trip regardless of user count.
-- Mode is determined by which optional param is non-NULL:
--   @MentorID   → mentees assigned to that mentor
--   @Role       → all active users with that role
--   neither     → all active users
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_SendNotification
    @Type        NVARCHAR(100),
    @Message     NVARCHAR(MAX),
    @ReferenceID INT          = NULL,
    @Role        NVARCHAR(50) = NULL,
    @MentorID    INT          = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Now DATETIME = GETDATE();

    IF @MentorID IS NOT NULL
    BEGIN
        INSERT INTO dbo.Notifications (RecipientUserID, Type, Message, ReferenceID, IsRead, CreatedAt)
        SELECT mm.MenteeID, @Type, @Message, @ReferenceID, 0, @Now
        FROM   dbo.MentorMentee mm
        WHERE  mm.MentorID = @MentorID AND mm.IsActive = 1;
    END
    ELSE IF @Role IS NOT NULL
    BEGIN
        INSERT INTO dbo.Notifications (RecipientUserID, Type, Message, ReferenceID, IsRead, CreatedAt)
        SELECT u.UserID, @Type, @Message, @ReferenceID, 0, @Now
        FROM   dbo.Users u
        WHERE  u.Role = @Role AND u.IsActive = 1;
    END
    ELSE
    BEGIN
        INSERT INTO dbo.Notifications (RecipientUserID, Type, Message, ReferenceID, IsRead, CreatedAt)
        SELECT u.UserID, @Type, @Message, @ReferenceID, 0, @Now
        FROM   dbo.Users u
        WHERE  u.IsActive = 1;
    END;
END;
GO

-- ============================================================
PRINT 'Done. All stored procedures created / updated.';
GO
