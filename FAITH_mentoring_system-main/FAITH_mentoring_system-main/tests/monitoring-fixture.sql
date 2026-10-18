-- Execute within a transaction and roll it back after the metric assertions.
DECLARE @Mentor int,@Mentee int,@Section nvarchar(100);
SELECT TOP (1) @Mentor=mm.MentorID,@Mentee=mm.MenteeID,@Section=COALESCE(sec.SectionCode,mp.Section)
FROM MentorMentee mm JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID
LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
WHERE mm.IsActive=1 AND COALESCE(sec.SectionCode,mp.Section) IS NOT NULL;
INSERT Sessions(MentorID,SessionDate,Status,SectionCode,SchoolYear,Semester,SlotName,TimeEnd,QRCodeToken)
VALUES(@Mentor,GETDATE(),'Completed',NULL,'test-monitoring','test','Mentoring Assembly',GETDATE(),CONVERT(nvarchar(36),NEWID()));
DECLARE @Session int=SCOPE_IDENTITY();
UPDATE MentorProfiles SET SignatureFilePath='/isolated-fixture-signature.png' WHERE UserID=@Mentor;
INSERT ProofOfSession(SessionID,UploadedByUserID,FilePath,FileType,UploadedAt)
VALUES(@Session,@Mentor,'/isolated-fixture-proof.png','image',GETDATE());
INSERT Attendance(SessionID,MenteeID,IsPresent,ScannedAt) VALUES(@Session,@Mentee,1,GETUTCDATE());
INSERT CheckpointLogs(MentorID,SchoolYear,Semester,SlotName,SectionCode,LogStatus,SubmittedAt)
VALUES(@Mentor,'test-monitoring','test','Mentoring Assembly',@Section,'Submitted',DATEADD(DAY,-2,GETDATE()));
INSERT CalendarEvents(Title,StartDate,EndDate,EventType,CreatedAt,IsPublished,SlotName,SchoolYear,Semester)
VALUES('Transactional test',DATEADD(DAY,-1,GETDATE()),DATEADD(DAY,-1,GETDATE()),'Deadline',GETDATE(),1,'Mentoring Assembly','test-monitoring','test');
INSERT CalendarEvents(Title,StartDate,EndDate,EventType,CreatedAt,IsPublished,SlotName,SchoolYear,Semester)
VALUES('Test conduct window',DATEADD(DAY,-1,GETDATE()),DATEADD(DAY,1,GETDATE()),'Session Schedule',GETDATE(),1,'Mentoring Assembly','test-monitoring','test');
SELECT @Mentor AS MentorID,@Section AS SectionCode;
