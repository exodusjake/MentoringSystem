-- Run inside a transaction; all fixture rows are rolled back to this savepoint.
SAVE TRANSACTION LogsheetFixtures;
DECLARE @Mentor int, @Mentee int, @Section nvarchar(100), @Slot nvarchar(50)='Mentoring Assembly';
SELECT TOP (1) @Mentor=mm.MentorID,@Mentee=mm.MenteeID,@Section=COALESCE(sec.SectionCode,mp.Section)
FROM MentorMentee mm JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID
LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
WHERE mm.IsActive=1 AND COALESCE(sec.SectionCode,mp.Section) IS NOT NULL;
IF @Mentor IS NULL THROW 51000,'No assigned mentor/mentee fixture available.',1;
DECLARE @Availability int,@Makeup int,@Regular int;
INSERT Availability(MentorID,AvailableDate,StartTime,EndTime,IsBooked,SlotName)
VALUES(@Mentor,CAST(GETDATE() AS date),'08:00',NULL,0,@Slot);
SET @Availability=SCOPE_IDENTITY();
EXEC sp_SubmitSessionRequest @Mentee,@Availability,'Transactional logsheet test';
SELECT @Makeup=s.SessionID FROM Sessions s JOIN SessionRequests sr ON sr.RequestID=s.RequestID
WHERE sr.AvailabilityID=@Availability;
IF @Makeup IS NULL OR EXISTS(SELECT 1 FROM Sessions WHERE SessionID=@Makeup AND TimeEnd IS NOT NULL)
 THROW 51000,'Booking must create a session with no actual end time.',1;
UPDATE Sessions SET SchoolYear='test-logsheet',Semester='test' WHERE SessionID=@Makeup;
INSERT Sessions(MentorID,SessionDate,Status,SectionCode,SchoolYear,Semester,SlotName,LogStatus,SubmittedAt,QRCodeToken)
VALUES(@Mentor,GETDATE(),'Completed',@Section,'test-logsheet','test',@Slot,'Submitted',GETDATE(),CONVERT(nvarchar(36),NEWID()));
SET @Regular=SCOPE_IDENTITY();
INSERT CheckpointLogs(MentorID,SchoolYear,Semester,SlotName,SectionCode,LogStatus,SubmittedAt)
VALUES(@Mentor,'test-logsheet','test',@Slot,@Section,'Submitted',GETDATE()),
(@Mentor,'test-logsheet','test',@Slot,'unrelated-test-section','Submitted',GETDATE());
DECLARE @Token nvarchar(100)=CONVERT(nvarchar(36),NEWID()),@Expires datetime=DATEADD(MINUTE,5,GETUTCDATE());
EXEC sp_GenerateQRToken @Makeup,@Mentee,@Token,@Expires;
EXEC sp_ScanQRAttendance @Token;
IF NOT EXISTS(SELECT 1 FROM Attendance WHERE SessionID=@Makeup AND MenteeID=@Mentee AND IsPresent=1
 AND ABS(DATEDIFF(SECOND,ScannedAt,GETUTCDATE()))<10)
 THROW 51000,'QR scan did not record UTC attendance.',1;
IF NOT EXISTS(SELECT 1 FROM CheckpointLogs WHERE MentorID=@Mentor AND SchoolYear='test-logsheet'
 AND SectionCode=@Section AND LogStatus='Draft' AND NeedsUpdate=1)
 THROW 51000,'Make-up attendance must reopen the submitted checkpoint.',1;
IF EXISTS(SELECT 1 FROM CheckpointLogs WHERE MentorID=@Mentor AND SchoolYear='test-logsheet'
 AND SectionCode='unrelated-test-section' AND LogStatus<>'Submitted')
 THROW 51000,'Unrelated section was changed.',1;
IF NOT EXISTS(SELECT 1 FROM Sessions WHERE SessionID=@Regular AND LogStatus='Draft')
 THROW 51000,'Legacy regular logsheet did not reopen.',1;
DECLARE @FirstScan datetime=(SELECT ScannedAt FROM Attendance WHERE SessionID=@Makeup AND MenteeID=@Mentee);
SET @Token=CONVERT(nvarchar(36),NEWID());
EXEC sp_GenerateQRToken @Makeup,@Mentee,@Token,@Expires;
EXEC sp_ScanQRAttendance @Token;
IF EXISTS(SELECT 1 FROM Attendance WHERE SessionID=@Makeup AND MenteeID=@Mentee AND ScannedAt<>@FirstScan)
 THROW 51000,'Repeat QR scan changed the original attendance time.',1;
UPDATE Sessions SET TimeEnd=DATEADD(HOUR,8,SYSUTCDATETIME()),Status='Completed' WHERE SessionID=@Makeup;
IF NOT EXISTS(SELECT 1 FROM Sessions WHERE SessionID=@Makeup AND ABS(DATEDIFF(SECOND,TimeEnd,DATEADD(HOUR,8,SYSUTCDATETIME())))<10)
 THROW 51000,'Actual end time is not Philippine wall time.',1;
SET @Token=CONVERT(nvarchar(36),NEWID());
EXEC sp_GenerateQRToken @Makeup,@Mentee,@Token,@Expires;
DECLARE @ClosedScan TABLE(Success bit,Message nvarchar(500),MenteeId int,SessionId int,MenteeName nvarchar(200));
INSERT @ClosedScan EXEC sp_ScanQRAttendance @Token;
IF EXISTS(SELECT 1 FROM @ClosedScan WHERE Success=1)
 THROW 51000,'A session accepted attendance after Save End.',1;
UPDATE CheckpointLogs SET LogStatus='Submitted',NeedsUpdate=0,SubmittedAt=GETDATE()
WHERE MentorID=@Mentor AND SchoolYear='test-logsheet' AND SectionCode=@Section;
IF EXISTS(SELECT 1 FROM CheckpointLogs WHERE MentorID=@Mentor AND SchoolYear='test-logsheet' AND SectionCode=@Section AND NeedsUpdate=1)
 THROW 51000,'Resubmission did not clear update state.',1;
ROLLBACK TRANSACTION LogsheetFixtures;
PRINT 'PASS: booking, QR UTC timestamp, original scan preservation, checkpoint reopening, section isolation, actual end and resubmission. Fixtures rolled back.';
