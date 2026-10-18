SET XACT_ABORT ON;
IF OBJECT_ID('dbo.CheckpointLogs') IS NULL
CREATE TABLE dbo.CheckpointLogs (
 MentorID int NOT NULL,
 SchoolYear nvarchar(20) NOT NULL,
 Semester nvarchar(50) NOT NULL,
 SlotName nvarchar(50) NOT NULL,
 SectionCode nvarchar(100) NOT NULL,
 LogStatus nvarchar(20) NOT NULL,
 SubmittedAt datetime2 NULL,
 NeedsUpdate bit NOT NULL DEFAULT 0,
 PRIMARY KEY (MentorID, SchoolYear, Semester, SlotName, SectionCode)
);
-- Remove only identifiable planned end times from sessions never finished.
-- Completed session history is retained.
UPDATE s SET TimeEnd=NULL
FROM Sessions s JOIN SessionRequests sr ON sr.RequestID=s.RequestID
JOIN Availability a ON a.AvailabilityID=sr.AvailabilityID
WHERE s.Status='Scheduled' AND a.EndTime IS NOT NULL
  AND s.TimeEnd=CAST(a.AvailableDate AS datetime)+CAST(a.EndTime AS datetime);
GO
CREATE OR ALTER PROCEDURE dbo.sp_RevertCheckpointOnMakeupAttendance
 @MakeupSessionID int,
 @MenteeID int = NULL
AS
BEGIN
 SET NOCOUNT ON;
 SELECT DISTINCT s.MentorID,s.SchoolYear,s.Semester,s.SlotName,
   COALESCE(sec.SectionCode,mp.Section) AS SectionCode
 INTO #Changed
 FROM dbo.Attendance i
 JOIN dbo.Sessions s ON s.SessionID=i.SessionID
 JOIN dbo.MenteeProfiles mp ON mp.UserID=i.MenteeID
 LEFT JOIN dbo.Sections sec ON sec.SectionID=mp.SectionID
 WHERE i.IsPresent=1 AND i.ScannedAt IS NOT NULL
   AND i.SessionID=@MakeupSessionID
   AND (@MenteeID IS NULL OR i.MenteeID=@MenteeID)
   AND s.SlotName IS NOT NULL AND s.Status<>'Cancelled';
 UPDATE c SET LogStatus='Draft',NeedsUpdate=1
 FROM dbo.CheckpointLogs c JOIN #Changed x ON c.MentorID=x.MentorID
 AND c.SchoolYear=x.SchoolYear AND c.Semester=x.Semester
 AND c.SlotName=x.SlotName AND c.SectionCode=x.SectionCode
 WHERE c.SubmittedAt IS NOT NULL;
 UPDATE s SET LogStatus='Draft'
 FROM dbo.Sessions s JOIN #Changed x ON s.MentorID=x.MentorID
 AND s.SchoolYear=x.SchoolYear AND s.Semester=x.Semester
 AND s.SlotName=x.SlotName AND s.SectionCode=x.SectionCode
 WHERE s.LogStatus='Submitted' AND s.Status<>'Cancelled';
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
        -- Serialize scanning with Save End. A finished session cannot receive later attendance.
        DECLARE @Closed bit;
        SELECT @Closed=CASE WHEN Status='Cancelled' OR (Status='Completed' AND TimeEnd IS NOT NULL)
            THEN 1 ELSE 0 END
        FROM dbo.Sessions WITH (UPDLOCK,HOLDLOCK) WHERE SessionID=@SessionID;
        IF @Closed=1
        BEGIN
            COMMIT TRANSACTION;
            SELECT CAST(0 AS BIT) AS Success, 'This session has ended.' AS Message,
                   0 AS MenteeId, 0 AS SessionId, '' AS MenteeName;
            RETURN;
        END;
        UPDATE dbo.QRTokens SET IsUsed = 1 WHERE TokenID = @TokenID;

        DECLARE @FirstName  NVARCHAR(100),
                @LastName   NVARCHAR(100);
        SELECT @FirstName = FirstName, @LastName = LastName
        FROM   dbo.Users WHERE UserID = @MenteeID;
        DECLARE @MenteeName NVARCHAR(200) = LTRIM(RTRIM(ISNULL(@FirstName,'') + ' ' + ISNULL(@LastName,'')));

        DECLARE @WasPresent bit = CASE WHEN EXISTS (
            SELECT 1 FROM dbo.Attendance WITH (UPDLOCK,HOLDLOCK)
            WHERE SessionID=@SessionID AND MenteeID=@MenteeID AND IsPresent=1 AND ScannedAt IS NOT NULL
        ) THEN 1 ELSE 0 END;

        -- Preserve the original successful scan when a refreshed token is scanned.
        IF EXISTS (SELECT 1 FROM dbo.Attendance WHERE SessionID = @SessionID AND MenteeID = @MenteeID)
            UPDATE dbo.Attendance
            SET    IsPresent = 1, ScannedAt = COALESCE(ScannedAt, GETUTCDATE())
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
        IF @WasPresent=0
            EXEC dbo.sp_RevertCheckpointOnMakeupAttendance @SessionID, @MenteeID;

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
