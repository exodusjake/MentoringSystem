-- ============================================================
-- AstraMentoring — FULL SCHEMA SNAPSHOT (auto-generated)
-- Generated 2026-09-28 from LocalDB via sys.tables/sys.columns/
-- sys.foreign_keys/sys.indexes and OBJECT_DEFINITION() for every
-- view and procedure. Excludes SQL Server's own "Database Diagrams"
-- feature artifacts (sysdiagrams table, sp_*diagram* procedures) —
-- those aren't part of this application.
--
-- Purpose: disaster-recovery baseline. Run this on an EMPTY database
-- to recreate every table, constraint, index, view, and stored
-- procedure as they currently exist. This is a SNAPSHOT, not a
-- migration — SQL/*.sql's 100+ incremental scripts remain the actual
-- change history; this file is not meant to replace or supersede them.
--
-- Caveat: generated from LocalDB, not cross-checked against live RDS
-- (AWS was offline at generation time). LocalDB was fully caught up
-- to the latest known migrations as of this session, but treat this
-- as "best known state," not a guaranteed-live-identical export.
--
-- Order matters: tables, then foreign keys, then indexes, then
-- views, then procedures — run top to bottom, don't reorder.
--
-- NOT AUTOMATIC — this does not update itself. Every SQL/*.sql script
-- run after 2026-09-28 makes this file stale by that much. Regenerate
-- it periodically (after a batch of DB changes, or before relying on
-- it for a rebuild) rather than assuming it's current.
-- Last regenerated: 2026-09-28
-- ============================================================

IF OBJECT_ID('dbo.AccountPeriodHistory') IS NULL
CREATE TABLE dbo.[AccountPeriodHistory] (
    [HistoryID] INT IDENTITY(1,1) NOT NULL,
    [UserID] INT NOT NULL,
    [SchoolYear] NVARCHAR(20) NOT NULL,
    [Semester] NVARCHAR(50) NOT NULL,
    [RecordedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [WasAssigned] BIT NULL,
    [WasDropOut] BIT NULL,
    CONSTRAINT [PK__AccountP__4D7B4ADD5D3718E8] PRIMARY KEY ([HistoryID])
);
GO

IF OBJECT_ID('dbo.AnnouncementAttachments') IS NULL
CREATE TABLE dbo.[AnnouncementAttachments] (
    [AttachmentID] INT IDENTITY(1,1) NOT NULL,
    [AnnouncementID] INT NOT NULL,
    [FileName] NVARCHAR(255) NOT NULL,
    [FilePath] NVARCHAR(500) NOT NULL,
    [FileType] NVARCHAR(50) NOT NULL DEFAULT ('document'),
    [FileSize] BIGINT NOT NULL DEFAULT ((0)),
    [UploadedAt] DATETIME NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK__Announce__442C64DE59633C17] PRIMARY KEY ([AttachmentID])
);
GO

IF OBJECT_ID('dbo.AnnouncementComments') IS NULL
CREATE TABLE dbo.[AnnouncementComments] (
    [CommentID] INT IDENTITY(1,1) NOT NULL,
    [AnnouncementID] INT NOT NULL,
    [PostedByUserID] INT NOT NULL,
    [Content] NVARCHAR(MAX) NOT NULL,
    [PostedAt] DATETIME NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK__Announce__C3B4DFAA4088C770] PRIMARY KEY ([CommentID])
);
GO

IF OBJECT_ID('dbo.Announcements') IS NULL
CREATE TABLE dbo.[Announcements] (
    [AnnouncementID] INT IDENTITY(1,1) NOT NULL,
    [PostedByUserID] INT NOT NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Content] NVARCHAR(MAX) NOT NULL,
    [TargetAudience] NVARCHAR(20) NOT NULL,
    [PostedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [IsActive] BIT NOT NULL DEFAULT ((1)),
    [IsPinned] BIT NOT NULL DEFAULT ((0)),
    CONSTRAINT [PK__Announce__9DE445549299E7DC] PRIMARY KEY ([AnnouncementID])
);
GO

IF OBJECT_ID('dbo.Attendance') IS NULL
CREATE TABLE dbo.[Attendance] (
    [AttendanceID] INT IDENTITY(1,1) NOT NULL,
    [SessionID] INT NOT NULL,
    [MenteeID] INT NOT NULL,
    [ScannedAt] DATETIME NULL,
    [IsPresent] BIT NOT NULL DEFAULT ((0)),
    [AbsenceReason] NVARCHAR(255) NULL,
    [MentorNotes] NVARCHAR(500) NULL,
    [Remarks] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK__Attendan__8B69263CEF67CE92] PRIMARY KEY ([AttendanceID])
);
GO

IF OBJECT_ID('dbo.Availability') IS NULL
CREATE TABLE dbo.[Availability] (
    [AvailabilityID] INT IDENTITY(1,1) NOT NULL,
    [MentorID] INT NOT NULL,
    [AvailableDate] DATE NOT NULL,
    [StartTime] TIME(7) NOT NULL,
    [EndTime] TIME(7) NULL,
    [IsBooked] BIT NOT NULL DEFAULT ((0)),
    [SlotName] NVARCHAR(50) NULL,
    CONSTRAINT [PK__Availabi__DA3979914B9854AE] PRIMARY KEY ([AvailabilityID])
);
GO

IF OBJECT_ID('dbo.CalendarEvents') IS NULL
CREATE TABLE dbo.[CalendarEvents] (
    [EventID] INT IDENTITY(1,1) NOT NULL,
    [Title] NVARCHAR(200) NOT NULL,
    [StartDate] DATETIME NOT NULL,
    [EndDate] DATETIME NOT NULL,
    [EventType] NVARCHAR(50) NOT NULL DEFAULT ('Session Window'),
    [Description] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [Venue] NVARCHAR(500) NULL,
    [IsPublished] BIT NOT NULL DEFAULT ((0)),
    [SlotName] NVARCHAR(50) NULL,
    [SchoolYear] NVARCHAR(20) NULL,
    [Semester] NVARCHAR(50) NULL,
    [DeadlineDate] DATETIME NULL,
    CONSTRAINT [PK__Calendar__7944C870A4149F55] PRIMARY KEY ([EventID])
);
GO

IF OBJECT_ID('dbo.CheckpointLogs') IS NULL
CREATE TABLE dbo.[CheckpointLogs] (
    [MentorID] INT NOT NULL,
    [SchoolYear] NVARCHAR(20) NOT NULL,
    [Semester] NVARCHAR(50) NOT NULL,
    [SlotName] NVARCHAR(50) NOT NULL,
    [SectionCode] NVARCHAR(100) NOT NULL,
    [LogStatus] NVARCHAR(20) NOT NULL,
    [SubmittedAt] DATETIME2(7) NULL,
    [NeedsUpdate] BIT NOT NULL DEFAULT ((0)),
    CONSTRAINT [PK__Checkpoi__1C42C5AC747F0176] PRIMARY KEY ([MentorID], [SchoolYear], [Semester], [SlotName], [SectionCode])
);
GO

IF OBJECT_ID('dbo.Departments') IS NULL
CREATE TABLE dbo.[Departments] (
    [DepartmentID] INT IDENTITY(1,1) NOT NULL,
    [DepartmentName] NVARCHAR(100) NOT NULL,
    [IsActive] BIT NULL DEFAULT ((1)),
    [School] NVARCHAR(100) NULL,
    CONSTRAINT [PK__Departme__B2079BCD070BBE92] PRIMARY KEY ([DepartmentID])
);
GO

IF OBJECT_ID('dbo.EvaluationAttachments') IS NULL
CREATE TABLE dbo.[EvaluationAttachments] (
    [AttachmentID] INT IDENTITY(1,1) NOT NULL,
    [LinkID] INT NOT NULL,
    [FileName] NVARCHAR(255) NOT NULL,
    [FilePath] NVARCHAR(500) NOT NULL,
    [FileType] NVARCHAR(50) NOT NULL DEFAULT ('document'),
    [FileSize] BIGINT NOT NULL DEFAULT ((0)),
    [UploadedAt] DATETIME NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK__Evaluati__442C64DEBF106EA2] PRIMARY KEY ([AttachmentID])
);
GO

IF OBJECT_ID('dbo.EvaluationLinks') IS NULL
CREATE TABLE dbo.[EvaluationLinks] (
    [LinkID] INT IDENTITY(1,1) NOT NULL,
    [PostedByUserID] INT NOT NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [GoogleFormURL] NVARCHAR(500) NOT NULL,
    [TargetRole] NVARCHAR(20) NOT NULL,
    [Deadline] DATETIME NULL,
    [PostedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [IsActive] BIT NOT NULL DEFAULT ((1)),
    [IsPinned] BIT NOT NULL DEFAULT ((0)),
    CONSTRAINT [PK__Evaluati__2D1221552E1414FF] PRIMARY KEY ([LinkID])
);
GO

IF OBJECT_ID('dbo.EvaluationRatings') IS NULL
CREATE TABLE dbo.[EvaluationRatings] (
    [RatingID] INT IDENTITY(1,1) NOT NULL,
    [MentorID] INT NOT NULL,
    [SchoolYear] NVARCHAR(20) NOT NULL,
    [Semester] NVARCHAR(50) NOT NULL,
    [RatingPct] DECIMAL(5,2) NOT NULL,
    [UpdatedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [UpdatedByAdminID] INT NULL,
    CONSTRAINT [PK__Evaluati__FCCDF85C7CCACC68] PRIMARY KEY ([RatingID])
);
GO

IF OBJECT_ID('dbo.EvaluationSubmissions') IS NULL
CREATE TABLE dbo.[EvaluationSubmissions] (
    [SubmissionID] INT IDENTITY(1,1) NOT NULL,
    [LinkID] INT NOT NULL,
    [MenteeID] INT NOT NULL,
    [SubmittedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [ProofFilePath] NVARCHAR(255) NULL,
    CONSTRAINT [PK__Evaluati__449EE1058428622D] PRIMARY KEY ([SubmissionID])
);
GO

IF OBJECT_ID('dbo.MenteeProfiles') IS NULL
CREATE TABLE dbo.[MenteeProfiles] (
    [MenteeProfileID] INT IDENTITY(1,1) NOT NULL,
    [UserID] INT NOT NULL,
    [Course] NVARCHAR(150) NULL,
    [YearLevel] NVARCHAR(20) NULL,
    [Section] NVARCHAR(50) NULL,
    [Department] NVARCHAR(100) NULL,
    [School] NVARCHAR(100) NULL,
    [DepartmentID] INT NULL,
    [SectionID] INT NULL,
    [IsDropOut] BIT NOT NULL DEFAULT ((0)),
    [SignatureFilePath] NVARCHAR(500) NULL,
    CONSTRAINT [PK__MenteePr__20C779F2C4FD8A04] PRIMARY KEY ([MenteeProfileID])
);
GO

IF OBJECT_ID('dbo.MentorMentee') IS NULL
CREATE TABLE dbo.[MentorMentee] (
    [AssignmentID] INT IDENTITY(1,1) NOT NULL,
    [MentorID] INT NOT NULL,
    [MenteeID] INT NOT NULL,
    [AssignedDate] DATE NOT NULL DEFAULT (getdate()),
    [IsActive] BIT NOT NULL DEFAULT ((1)),
    CONSTRAINT [PK__MentorMe__32499E574FAAD391] PRIMARY KEY ([AssignmentID])
);
GO

IF OBJECT_ID('dbo.MentorPersonalEvents') IS NULL
CREATE TABLE dbo.[MentorPersonalEvents] (
    [EventID] INT IDENTITY(1,1) NOT NULL,
    [MentorID] INT NOT NULL,
    [Title] NVARCHAR(200) NOT NULL,
    [EventDate] DATETIME NOT NULL,
    [Notes] NVARCHAR(MAX) NULL,
    [Category] NVARCHAR(50) NOT NULL DEFAULT ('Reminder'),
    [CreatedAt] DATETIME NULL DEFAULT (getdate()),
    [EndDate] DATETIME NULL,
    CONSTRAINT [PK__MentorPe__7944C870C0F5C336] PRIMARY KEY ([EventID])
);
GO

IF OBJECT_ID('dbo.MentorProfiles') IS NULL
CREATE TABLE dbo.[MentorProfiles] (
    [MentorProfileID] INT IDENTITY(1,1) NOT NULL,
    [UserID] INT NOT NULL,
    [Department] NVARCHAR(150) NULL,
    [Bio] NVARCHAR(MAX) NULL,
    [Expertise] NVARCHAR(255) NULL,
    [School] NVARCHAR(100) NULL,
    [DepartmentID] INT NULL,
    [SignatureFilePath] NVARCHAR(500) NULL,
    CONSTRAINT [PK__MentorPr__EFD689EA3C5576CC] PRIMARY KEY ([MentorProfileID])
);
GO

IF OBJECT_ID('dbo.Notifications') IS NULL
CREATE TABLE dbo.[Notifications] (
    [NotificationID] INT IDENTITY(1,1) NOT NULL,
    [RecipientUserID] INT NOT NULL,
    [Type] NVARCHAR(50) NOT NULL,
    [Message] NVARCHAR(500) NOT NULL,
    [ReferenceID] INT NULL,
    [IsRead] BIT NOT NULL DEFAULT ((0)),
    [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK__Notifica__20CF2E326CBD15E2] PRIMARY KEY ([NotificationID])
);
GO

IF OBJECT_ID('dbo.ProofOfSession') IS NULL
CREATE TABLE dbo.[ProofOfSession] (
    [ProofID] INT IDENTITY(1,1) NOT NULL,
    [SessionID] INT NOT NULL,
    [UploadedByUserID] INT NOT NULL,
    [FilePath] NVARCHAR(500) NOT NULL,
    [FileType] NVARCHAR(20) NOT NULL,
    [UploadedAt] DATETIME NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK__ProofOfS__E33C702C714FFA05] PRIMARY KEY ([ProofID])
);
GO

IF OBJECT_ID('dbo.QRTokens') IS NULL
CREATE TABLE dbo.[QRTokens] (
    [TokenID] INT IDENTITY(1,1) NOT NULL,
    [Token] NVARCHAR(64) NOT NULL,
    [SessionID] INT NOT NULL,
    [MenteeID] INT NOT NULL,
    [ExpiresAt] DATETIME2(7) NOT NULL,
    [IsUsed] BIT NOT NULL DEFAULT ((0)),
    CONSTRAINT [PK__QRTokens__658FEE8A12632E6E] PRIMARY KEY ([TokenID])
);
GO

IF OBJECT_ID('dbo.Sections') IS NULL
CREATE TABLE dbo.[Sections] (
    [SectionID] INT IDENTITY(1,1) NOT NULL,
    [SectionCode] NVARCHAR(20) NOT NULL,
    [Course] NVARCHAR(50) NOT NULL,
    [YearLevel] NVARCHAR(20) NOT NULL,
    [SectionLetter] NVARCHAR(5) NOT NULL,
    [School] NVARCHAR(100) NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT ((1)),
    [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK__Sections__80EF0892CA111365] PRIMARY KEY ([SectionID])
);
GO

IF OBJECT_ID('dbo.SessionRequests') IS NULL
CREATE TABLE dbo.[SessionRequests] (
    [RequestID] INT IDENTITY(1,1) NOT NULL,
    [MenteeID] INT NOT NULL,
    [AvailabilityID] INT NOT NULL,
    [Purpose] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT ('Pending'),
    [RequestedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [RespondedAt] DATETIME NULL,
    CONSTRAINT [PK__SessionR__33A8519A4B515B18] PRIMARY KEY ([RequestID])
);
GO

IF OBJECT_ID('dbo.Sessions') IS NULL
CREATE TABLE dbo.[Sessions] (
    [SessionID] INT IDENTITY(1,1) NOT NULL,
    [RequestID] INT NULL,
    [MentorID] INT NOT NULL,
    [QRCodeToken] NVARCHAR(255) NOT NULL DEFAULT (newid()),
    [SessionDate] DATETIME NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT ('Scheduled'),
    [Notes] NVARCHAR(MAX) NULL,
    [TimeEnd] DATETIME NULL,
    [LogStatus] NVARCHAR(20) NULL,
    [SchoolYear] NVARCHAR(20) NOT NULL,
    [Semester] NVARCHAR(50) NOT NULL,
    [SectionCode] NVARCHAR(100) NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [SlotName] NVARCHAR(50) NULL,
    [SubmittedAt] DATETIME NULL,
    CONSTRAINT [PK__Sessions__C9F492705A6D4F8D] PRIMARY KEY ([SessionID])
);
GO

IF OBJECT_ID('dbo.SystemSettings') IS NULL
CREATE TABLE dbo.[SystemSettings] (
    [SettingID] INT IDENTITY(1,1) NOT NULL,
    [SettingKey] NVARCHAR(100) NOT NULL,
    [SettingValue] NVARCHAR(255) NOT NULL,
    [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
    CONSTRAINT [PK__SystemSe__54372AFD6A6879F2] PRIMARY KEY ([SettingID])
);
GO

IF OBJECT_ID('dbo.Users') IS NULL
CREATE TABLE dbo.[Users] (
    [UserID] INT IDENTITY(1,1) NOT NULL,
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [PasswordHash] NVARCHAR(255) NOT NULL,
    [ProfilePicture] NVARCHAR(500) NULL,
    [ContactNumber] NVARCHAR(20) NULL,
    [Role] NVARCHAR(20) NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT ((1)),
    [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [UpdatedAt] DATETIME NOT NULL DEFAULT (getdate()),
    [StudentNumber] NVARCHAR(50) NULL,
    [SchoolYear] NVARCHAR(20) NULL,
    [Semester] NVARCHAR(30) NULL,
    [Gender] NVARCHAR(10) NULL,
    [HasLoggedIn] BIT NOT NULL DEFAULT ((0)),
    [SignatureFilePath] NVARCHAR(500) NULL,
    CONSTRAINT [PK__Users__1788CCAC685A5BAC] PRIMARY KEY ([UserID])
);
GO

-- ── FOREIGN KEYS ──────────────────────────────────────────────
IF OBJECT_ID('FK_AccountPeriodHistory_Users') IS NULL
ALTER TABLE dbo.[AccountPeriodHistory] ADD CONSTRAINT [FK_AccountPeriodHistory_Users]
    FOREIGN KEY ([UserID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_AnnAttach_Announcement') IS NULL
ALTER TABLE dbo.[AnnouncementAttachments] ADD CONSTRAINT [FK_AnnAttach_Announcement]
    FOREIGN KEY ([AnnouncementID]) REFERENCES dbo.[Announcements] ([AnnouncementID]);
GO

IF OBJECT_ID('FK__Announcem__Annou__0880433F') IS NULL
ALTER TABLE dbo.[AnnouncementComments] ADD CONSTRAINT [FK__Announcem__Annou__0880433F]
    FOREIGN KEY ([AnnouncementID]) REFERENCES dbo.[Announcements] ([AnnouncementID]);
GO

IF OBJECT_ID('FK__Announcem__Poste__09746778') IS NULL
ALTER TABLE dbo.[AnnouncementComments] ADD CONSTRAINT [FK__Announcem__Poste__09746778]
    FOREIGN KEY ([PostedByUserID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_Announcement_User') IS NULL
ALTER TABLE dbo.[Announcements] ADD CONSTRAINT [FK_Announcement_User]
    FOREIGN KEY ([PostedByUserID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_Attendance_Mentee') IS NULL
ALTER TABLE dbo.[Attendance] ADD CONSTRAINT [FK_Attendance_Mentee]
    FOREIGN KEY ([MenteeID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_Attendance_Session') IS NULL
ALTER TABLE dbo.[Attendance] ADD CONSTRAINT [FK_Attendance_Session]
    FOREIGN KEY ([SessionID]) REFERENCES dbo.[Sessions] ([SessionID]);
GO

IF OBJECT_ID('FK_Availability_Mentor') IS NULL
ALTER TABLE dbo.[Availability] ADD CONSTRAINT [FK_Availability_Mentor]
    FOREIGN KEY ([MentorID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_EvalAttach_Link') IS NULL
ALTER TABLE dbo.[EvaluationAttachments] ADD CONSTRAINT [FK_EvalAttach_Link]
    FOREIGN KEY ([LinkID]) REFERENCES dbo.[EvaluationLinks] ([LinkID]);
GO

IF OBJECT_ID('FK_EvalLink_User') IS NULL
ALTER TABLE dbo.[EvaluationLinks] ADD CONSTRAINT [FK_EvalLink_User]
    FOREIGN KEY ([PostedByUserID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK__Evaluatio__Mento__39AD8A7F') IS NULL
ALTER TABLE dbo.[EvaluationRatings] ADD CONSTRAINT [FK__Evaluatio__Mento__39AD8A7F]
    FOREIGN KEY ([MentorID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK__Evaluatio__Updat__3C89F72A') IS NULL
ALTER TABLE dbo.[EvaluationRatings] ADD CONSTRAINT [FK__Evaluatio__Updat__3C89F72A]
    FOREIGN KEY ([UpdatedByAdminID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_EvalSub_Link') IS NULL
ALTER TABLE dbo.[EvaluationSubmissions] ADD CONSTRAINT [FK_EvalSub_Link]
    FOREIGN KEY ([LinkID]) REFERENCES dbo.[EvaluationLinks] ([LinkID]);
GO

IF OBJECT_ID('FK_EvalSub_Mentee') IS NULL
ALTER TABLE dbo.[EvaluationSubmissions] ADD CONSTRAINT [FK_EvalSub_Mentee]
    FOREIGN KEY ([MenteeID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK__MenteePro__Secti__57DD0BE4') IS NULL
ALTER TABLE dbo.[MenteeProfiles] ADD CONSTRAINT [FK__MenteePro__Secti__57DD0BE4]
    FOREIGN KEY ([SectionID]) REFERENCES dbo.[Sections] ([SectionID]);
GO

IF OBJECT_ID('FK_MenteeProfile_User') IS NULL
ALTER TABLE dbo.[MenteeProfiles] ADD CONSTRAINT [FK_MenteeProfile_User]
    FOREIGN KEY ([UserID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_MenteeProfiles_Dept') IS NULL
ALTER TABLE dbo.[MenteeProfiles] ADD CONSTRAINT [FK_MenteeProfiles_Dept]
    FOREIGN KEY ([DepartmentID]) REFERENCES dbo.[Departments] ([DepartmentID]);
GO

IF OBJECT_ID('FK_Assignment_Mentee') IS NULL
ALTER TABLE dbo.[MentorMentee] ADD CONSTRAINT [FK_Assignment_Mentee]
    FOREIGN KEY ([MenteeID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_Assignment_Mentor') IS NULL
ALTER TABLE dbo.[MentorMentee] ADD CONSTRAINT [FK_Assignment_Mentor]
    FOREIGN KEY ([MentorID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_MentorProfile_User') IS NULL
ALTER TABLE dbo.[MentorProfiles] ADD CONSTRAINT [FK_MentorProfile_User]
    FOREIGN KEY ([UserID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_MentorProfiles_Dept') IS NULL
ALTER TABLE dbo.[MentorProfiles] ADD CONSTRAINT [FK_MentorProfiles_Dept]
    FOREIGN KEY ([DepartmentID]) REFERENCES dbo.[Departments] ([DepartmentID]);
GO

IF OBJECT_ID('FK_Notification_User') IS NULL
ALTER TABLE dbo.[Notifications] ADD CONSTRAINT [FK_Notification_User]
    FOREIGN KEY ([RecipientUserID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_Proof_Session') IS NULL
ALTER TABLE dbo.[ProofOfSession] ADD CONSTRAINT [FK_Proof_Session]
    FOREIGN KEY ([SessionID]) REFERENCES dbo.[Sessions] ([SessionID]);
GO

IF OBJECT_ID('FK_Proof_User') IS NULL
ALTER TABLE dbo.[ProofOfSession] ADD CONSTRAINT [FK_Proof_User]
    FOREIGN KEY ([UploadedByUserID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_QRTokens_Mentee') IS NULL
ALTER TABLE dbo.[QRTokens] ADD CONSTRAINT [FK_QRTokens_Mentee]
    FOREIGN KEY ([MenteeID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_QRTokens_Session') IS NULL
ALTER TABLE dbo.[QRTokens] ADD CONSTRAINT [FK_QRTokens_Session]
    FOREIGN KEY ([SessionID]) REFERENCES dbo.[Sessions] ([SessionID]);
GO

IF OBJECT_ID('FK_Request_Availability') IS NULL
ALTER TABLE dbo.[SessionRequests] ADD CONSTRAINT [FK_Request_Availability]
    FOREIGN KEY ([AvailabilityID]) REFERENCES dbo.[Availability] ([AvailabilityID]);
GO

IF OBJECT_ID('FK_Request_Mentee') IS NULL
ALTER TABLE dbo.[SessionRequests] ADD CONSTRAINT [FK_Request_Mentee]
    FOREIGN KEY ([MenteeID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_Session_Mentor') IS NULL
ALTER TABLE dbo.[Sessions] ADD CONSTRAINT [FK_Session_Mentor]
    FOREIGN KEY ([MentorID]) REFERENCES dbo.[Users] ([UserID]);
GO

IF OBJECT_ID('FK_Session_Request') IS NULL
ALTER TABLE dbo.[Sessions] ADD CONSTRAINT [FK_Session_Request]
    FOREIGN KEY ([RequestID]) REFERENCES dbo.[SessionRequests] ([RequestID]);
GO


-- ── INDEXES ───────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_AccountPeriodHistory')
CREATE UNIQUE INDEX [UQ_AccountPeriodHistory] ON dbo.[AccountPeriodHistory] ([UserID], [SchoolYear], [Semester]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AnnouncementComments_AnnouncementID')
CREATE INDEX [IX_AnnouncementComments_AnnouncementID] ON dbo.[AnnouncementComments] ([PostedAt], [AnnouncementID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Announcements_IsPinned_PostedAt')
CREATE INDEX [IX_Announcements_IsPinned_PostedAt] ON dbo.[Announcements] ([IsPinned], [PostedAt]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Announcements_PostedBy')
CREATE INDEX [IX_Announcements_PostedBy] ON dbo.[Announcements] ([PostedByUserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Announcements_PostedByUserID')
CREATE INDEX [IX_Announcements_PostedByUserID] ON dbo.[Announcements] ([PostedByUserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attendance_IsPresent')
CREATE INDEX [IX_Attendance_IsPresent] ON dbo.[Attendance] ([IsPresent]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attendance_MenteeID')
CREATE INDEX [IX_Attendance_MenteeID] ON dbo.[Attendance] ([MenteeID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attendance_Session')
CREATE INDEX [IX_Attendance_Session] ON dbo.[Attendance] ([SessionID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attendance_SessionID')
CREATE INDEX [IX_Attendance_SessionID] ON dbo.[Attendance] ([SessionID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attendance_SessionID_IsPresent')
CREATE INDEX [IX_Attendance_SessionID_IsPresent] ON dbo.[Attendance] ([MenteeID], [SessionID], [IsPresent]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Attendance')
CREATE UNIQUE INDEX [UQ_Attendance] ON dbo.[Attendance] ([SessionID], [MenteeID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Availability_AvailableDate')
CREATE INDEX [IX_Availability_AvailableDate] ON dbo.[Availability] ([AvailableDate]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Availability_Mentor')
CREATE INDEX [IX_Availability_Mentor] ON dbo.[Availability] ([MentorID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Availability_MentorID')
CREATE INDEX [IX_Availability_MentorID] ON dbo.[Availability] ([MentorID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Availability_MentorID_AvailableDate')
CREATE INDEX [IX_Availability_MentorID_AvailableDate] ON dbo.[Availability] ([AvailabilityID], [MentorID], [AvailableDate]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CalendarEvents_IsPublished')
CREATE INDEX [IX_CalendarEvents_IsPublished] ON dbo.[CalendarEvents] ([IsPublished]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_CalendarEvents_Slot')
CREATE UNIQUE INDEX [UQ_CalendarEvents_Slot] ON dbo.[CalendarEvents] ([SlotName], [EventType], [SchoolYear], [Semester]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_EvaluationRatings_Mentor_Period')
CREATE UNIQUE INDEX [UQ_EvaluationRatings_Mentor_Period] ON dbo.[EvaluationRatings] ([MentorID], [SchoolYear], [Semester]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_EvalSub_LinkMentee')
CREATE UNIQUE INDEX [UQ_EvalSub_LinkMentee] ON dbo.[EvaluationSubmissions] ([LinkID], [MenteeID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeProfiles_IsDropOut')
CREATE INDEX [IX_MenteeProfiles_IsDropOut] ON dbo.[MenteeProfiles] ([IsDropOut]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeProfiles_School')
CREATE INDEX [IX_MenteeProfiles_School] ON dbo.[MenteeProfiles] ([School]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeProfiles_School_UserID')
CREATE INDEX [IX_MenteeProfiles_School_UserID] ON dbo.[MenteeProfiles] ([School], [UserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeProfiles_SectionID')
CREATE INDEX [IX_MenteeProfiles_SectionID] ON dbo.[MenteeProfiles] ([SectionID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeProfiles_UserID')
CREATE INDEX [IX_MenteeProfiles_UserID] ON dbo.[MenteeProfiles] ([UserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ__MenteePr__1788CCAD4A12CF5F')
CREATE UNIQUE INDEX [UQ__MenteePr__1788CCAD4A12CF5F] ON dbo.[MenteeProfiles] ([UserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_IsActive')
CREATE INDEX [IX_MentorMentee_IsActive] ON dbo.[MentorMentee] ([MentorID], [MenteeID], [AssignedDate], [AssignmentID], [IsActive]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_Mentee')
CREATE INDEX [IX_MentorMentee_Mentee] ON dbo.[MentorMentee] ([MenteeID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_MenteeID')
CREATE INDEX [IX_MentorMentee_MenteeID] ON dbo.[MentorMentee] ([MenteeID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_MenteeID_IsActive')
CREATE INDEX [IX_MentorMentee_MenteeID_IsActive] ON dbo.[MentorMentee] ([MenteeID], [IsActive]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_Mentor')
CREATE INDEX [IX_MentorMentee_Mentor] ON dbo.[MentorMentee] ([MentorID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_MentorID')
CREATE INDEX [IX_MentorMentee_MentorID] ON dbo.[MentorMentee] ([MenteeID], [IsActive], [AssignedDate], [MentorID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_MentorID_IsActive')
CREATE INDEX [IX_MentorMentee_MentorID_IsActive] ON dbo.[MentorMentee] ([MenteeID], [AssignedDate], [MentorID], [IsActive]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_MentorMentee_Active')
CREATE UNIQUE INDEX [UQ_MentorMentee_Active] ON dbo.[MentorMentee] ([MentorID], [MenteeID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorProfiles_DepartmentID')
CREATE INDEX [IX_MentorProfiles_DepartmentID] ON dbo.[MentorProfiles] ([DepartmentID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorProfiles_DeptID_UserID')
CREATE INDEX [IX_MentorProfiles_DeptID_UserID] ON dbo.[MentorProfiles] ([DepartmentID], [UserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorProfiles_UserID')
CREATE INDEX [IX_MentorProfiles_UserID] ON dbo.[MentorProfiles] ([UserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ__MentorPr__1788CCAD059470F5')
CREATE UNIQUE INDEX [UQ__MentorPr__1788CCAD059470F5] ON dbo.[MentorProfiles] ([UserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notifications_IsRead')
CREATE INDEX [IX_Notifications_IsRead] ON dbo.[Notifications] ([IsRead]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notifications_Recipient')
CREATE INDEX [IX_Notifications_Recipient] ON dbo.[Notifications] ([RecipientUserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notifications_RecipientUserID')
CREATE INDEX [IX_Notifications_RecipientUserID] ON dbo.[Notifications] ([RecipientUserID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notifications_RecipientUserID_IsRead')
CREATE INDEX [IX_Notifications_RecipientUserID_IsRead] ON dbo.[Notifications] ([CreatedAt], [RecipientUserID], [IsRead]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProofOfSession_SessionID')
CREATE INDEX [IX_ProofOfSession_SessionID] ON dbo.[ProofOfSession] ([SessionID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QRTokens_ExpiresAt')
CREATE INDEX [IX_QRTokens_ExpiresAt] ON dbo.[QRTokens] ([ExpiresAt]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QRTokens_IsUsed')
CREATE INDEX [IX_QRTokens_IsUsed] ON dbo.[QRTokens] ([IsUsed]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QRTokens_MenteeID')
CREATE INDEX [IX_QRTokens_MenteeID] ON dbo.[QRTokens] ([MenteeID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QRTokens_SessionID')
CREATE INDEX [IX_QRTokens_SessionID] ON dbo.[QRTokens] ([SessionID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_QRTokens_Token')
CREATE UNIQUE INDEX [UQ_QRTokens_Token] ON dbo.[QRTokens] ([Token]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sections_IsActive')
CREATE INDEX [IX_Sections_IsActive] ON dbo.[Sections] ([IsActive]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sections_School')
CREATE INDEX [IX_Sections_School] ON dbo.[Sections] ([School]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sections_School_IsActive')
CREATE INDEX [IX_Sections_School_IsActive] ON dbo.[Sections] ([SectionID], [SectionCode], [Course], [YearLevel], [School], [IsActive]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionRequests_AvailabilityID')
CREATE INDEX [IX_SessionRequests_AvailabilityID] ON dbo.[SessionRequests] ([AvailabilityID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionRequests_MenteeID')
CREATE INDEX [IX_SessionRequests_MenteeID] ON dbo.[SessionRequests] ([MenteeID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionRequests_MenteeID_AvailabilityID_Status')
CREATE INDEX [IX_SessionRequests_MenteeID_AvailabilityID_Status] ON dbo.[SessionRequests] ([MenteeID], [AvailabilityID], [Status]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionRequests_Status')
CREATE INDEX [IX_SessionRequests_Status] ON dbo.[SessionRequests] ([Status]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_Mentor')
CREATE INDEX [IX_Sessions_Mentor] ON dbo.[Sessions] ([MentorID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_MentorID')
CREATE INDEX [IX_Sessions_MentorID] ON dbo.[Sessions] ([MentorID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_MentorID_Status')
CREATE INDEX [IX_Sessions_MentorID_Status] ON dbo.[Sessions] ([SessionID], [SessionDate], [MentorID], [Status]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_SessionDate')
CREATE INDEX [IX_Sessions_SessionDate] ON dbo.[Sessions] ([SessionDate]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_Status')
CREATE INDEX [IX_Sessions_Status] ON dbo.[Sessions] ([Status]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_Status_MentorID')
CREATE INDEX [IX_Sessions_Status_MentorID] ON dbo.[Sessions] ([Status], [MentorID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_Status_SessionDate')
CREATE INDEX [IX_Sessions_Status_SessionDate] ON dbo.[Sessions] ([SessionID], [MentorID], [Status], [SessionDate]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ__Sessions__06DDDBF415C7CDC7')
CREATE UNIQUE INDEX [UQ__Sessions__06DDDBF415C7CDC7] ON dbo.[Sessions] ([QRCodeToken]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ__SystemSe__01E719AD06AA202F')
CREATE UNIQUE INDEX [UQ__SystemSe__01E719AD06AA202F] ON dbo.[SystemSettings] ([SettingKey]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_Email')
CREATE INDEX [IX_Users_Email] ON dbo.[Users] ([Email]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_IsActive')
CREATE INDEX [IX_Users_IsActive] ON dbo.[Users] ([IsActive]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_IsActive_Role')
CREATE INDEX [IX_Users_IsActive_Role] ON dbo.[Users] ([FirstName], [LastName], [Email], [StudentNumber], [CreatedAt], [IsActive], [Role]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_Role')
CREATE INDEX [IX_Users_Role] ON dbo.[Users] ([Role]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_Role_IsActive')
CREATE INDEX [IX_Users_Role_IsActive] ON dbo.[Users] ([Role], [IsActive]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ__Users__A9D10534A077532D')
CREATE UNIQUE INDEX [UQ__Users__A9D10534A077532D] ON dbo.[Users] ([Email]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Users_Email')
CREATE UNIQUE INDEX [UQ_Users_Email] ON dbo.[Users] ([Email]);
GO


-- ── VIEWS ─────────────────────────────────────────────────────

-- ============================================================
-- Additional view: vw_AnnouncementCommentsWithUser
-- ============================================================
CREATE   VIEW dbo.vw_AnnouncementCommentsWithUser AS
SELECT
    c.CommentID,
    c.AnnouncementID,
    c.PostedByUserID,
    c.Content,
    c.PostedAt,
    u.FirstName,
    u.LastName
FROM dbo.AnnouncementComments c
JOIN dbo.Users u ON u.UserID = c.PostedByUserID;

GO

-- vw_AnnouncementsWithPoster: adds PosterRole so the frontend can tell a
-- Head Admin's post apart from a true Admin's post instead of lumping both
-- under one generic "Admin" badge (their real Users.Role was never
-- selected here, even though the join already had it available).

CREATE   VIEW dbo.vw_AnnouncementsWithPoster AS
SELECT
    a.AnnouncementID,
    a.PostedByUserID,
    a.Title,
    a.Content,
    a.TargetAudience,
    a.PostedAt,
    a.IsActive,
    a.IsPinned,
    u.FirstName AS PosterFirstName,
    u.LastName  AS PosterLastName,
    u.Role      AS PosterRole
FROM dbo.Announcements a
JOIN dbo.Users u ON u.UserID = a.PostedByUserID;

GO


-- ============================================================
-- vw_AssignmentDetails
-- Mentor-mentee assignment join with both party names and profile info.
-- Used by ProfileService.GetAssignmentsAsync()
-- ============================================================
CREATE   VIEW dbo.vw_AssignmentDetails AS
SELECT
    mm.AssignmentID,
    mm.MenteeID                                        AS MenteeUserID,
    mm.MentorID                                        AS MentorUserID,
    mu.FirstName  + ' ' + mu.LastName                 AS MenteeName,
    mtu.FirstName + ' ' + mtu.LastName                AS MentorName,
    me.Course,
    me.YearLevel,
    me.School                                          AS MenteeSchool,
    COALESCE(d.DepartmentName, mp.Department)          AS DepartmentName,
    mp.School                                          AS MentorSchool,
    mm.AssignedDate,
    mm.IsActive
FROM dbo.MentorMentee mm
INNER JOIN dbo.Users            mu  ON mu.UserID       = mm.MenteeID
INNER JOIN dbo.Users            mtu ON mtu.UserID      = mm.MentorID
LEFT  JOIN dbo.MenteeProfiles   me  ON me.UserID       = mm.MenteeID
LEFT  JOIN dbo.MentorProfiles   mp  ON mp.UserID       = mm.MentorID
LEFT  JOIN dbo.Departments      d   ON d.DepartmentID  = mp.DepartmentID;

GO


-- Switching a user's role (e.g. Mentor -> Mentee) intentionally leaves their
-- old MentorProfiles/MenteeProfiles row in place so their history isn't
-- lost. These views need Users.Role checked directly, or a role-switched
-- user keeps showing up under their old role everywhere Users/mentors-with-
-- dept or Users/mentees-with-dept is used (the "Available Mentors" import
-- reference list, every "Assign Mentor" dropdown, etc.).

-- ── vw_MenteeDetails ─────────────────────────────────────────
CREATE   VIEW dbo.vw_MenteeDetails AS
SELECT
    u.UserID,
    u.FirstName,
    u.LastName,
    u.Email,
    u.StudentNumber,
    u.IsActive,
    mp.School,
    mp.Department,
    mp.DepartmentID,
    mp.Course,
    mp.YearLevel,
    mp.Section,
    mp.SectionID,
    mp.IsDropOut,
    mp.SignatureFilePath,
    COALESCE(s.SectionCode, mp.Section) AS SectionCode
FROM dbo.Users u
INNER JOIN dbo.MenteeProfiles mp ON mp.UserID   = u.UserID
LEFT  JOIN dbo.Sections        s  ON s.SectionID = mp.SectionID
WHERE u.Role = 'Mentee';

GO


-- ── vw_MentorDetails ─────────────────────────────────────────
CREATE   VIEW dbo.vw_MentorDetails AS
SELECT
    u.UserID,
    u.FirstName,
    u.LastName,
    u.Email,
    u.ContactNumber,
    u.IsActive,
    mp.School,
    mp.Department,
    mp.DepartmentID,
    mp.Bio,
    mp.Expertise,
    mp.SignatureFilePath,
    COALESCE(d.DepartmentName, mp.Department) AS DepartmentName
FROM dbo.Users u
INNER JOIN dbo.MentorProfiles mp ON mp.UserID      = u.UserID
LEFT  JOIN dbo.Departments     d  ON d.DepartmentID = mp.DepartmentID
WHERE u.Role = 'Mentor';

GO


-- ── STORED PROCEDURES ────────────────────────────────────────



CREATE   PROCEDURE dbo.sp_ApproveSessionRequest
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

    DECLARE @SchoolYear NVARCHAR(20) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear');
    DECLARE @Semester   NVARCHAR(50) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester');

    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @SessionDate DATETIME = CAST(@AvailableDate AS DATETIME) + CAST(@StartTime AS DATETIME);
        DECLARE @TimeEnd     DATETIME = CAST(@AvailableDate AS DATETIME) + CAST(@EndTime   AS DATETIME);

        DECLARE @ExistingSessionID INT;
        SELECT @ExistingSessionID = s.SessionID
        FROM   dbo.Sessions        s
        INNER  JOIN dbo.SessionRequests sr2 ON sr2.RequestID = s.RequestID
        WHERE  sr2.AvailabilityID = @AvailabilityID;

        IF @ExistingSessionID IS NULL
        BEGIN
            INSERT INTO dbo.Sessions
                (MentorID, SessionDate, TimeEnd, Status, RequestID, Notes, QRCodeToken, SchoolYear, Semester)
            VALUES
                (@MentorID, @SessionDate, @TimeEnd, 'Scheduled', @RequestID, NULL,
                 CONVERT(NVARCHAR(36), NEWID()), @SchoolYear, @Semester);
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
-- sp_AssignMentor
-- Atomically deactivates any existing assignment for the mentee,
-- then inserts the new mentor�mentee pair as active.
-- ============================================================
CREATE   PROCEDURE dbo.sp_AssignMentor
    @MenteeID INT,
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;
    BEGIN TRY
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
-- sp_DeleteAvailabilitySlot
-- Atomically cascade-deletes a slot and all linked data:
-- QRTokens ? Attendance ? ProofOfSession ? Sessions ? SessionRequests ? Availability
-- Returns: (Success INT, ErrorMessage NVARCHAR)
-- ============================================================
CREATE   PROCEDURE dbo.sp_DeleteAvailabilitySlot
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


CREATE   PROCEDURE dbo.sp_DeleteUser
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

        -- ...and QR tokens for a solo makeup session this mentee's own
        -- request anchors (verified solo by the app-level guard above).
        DELETE qt
        FROM   dbo.QRTokens qt
        INNER  JOIN dbo.Sessions s ON s.SessionID = qt.SessionID
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.MenteeID = @UserID;

        -- Proof records for sessions this user mentored...
        DELETE p
        FROM   dbo.ProofOfSession p
        INNER  JOIN dbo.Sessions s ON s.SessionID = p.SessionID
        WHERE  s.MentorID = @UserID;
        -- ...proof this user personally uploaded, under any session...
        DELETE FROM dbo.ProofOfSession WHERE UploadedByUserID = @UserID;
        -- ...and proof for a solo makeup session this mentee's own request anchors.
        DELETE p
        FROM   dbo.ProofOfSession p
        INNER  JOIN dbo.Sessions s ON s.SessionID = p.SessionID
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.MenteeID = @UserID;

        DELETE FROM dbo.AccountPeriodHistory    WHERE UserID          = @UserID;
        DELETE FROM dbo.AnnouncementComments    WHERE PostedByUserID  = @UserID;
        DELETE FROM dbo.EvaluationSubmissions   WHERE MenteeID        = @UserID;
        DELETE FROM dbo.EvaluationLinks         WHERE PostedByUserID  = @UserID;
        DELETE FROM dbo.MentorMentee    WHERE MentorID        = @UserID OR MenteeID         = @UserID;
        DELETE FROM dbo.Attendance      WHERE MenteeID        = @UserID;

        -- The solo makeup session itself, before its SessionRequests row
        -- (which it references via Sessions.RequestID) is removed below.
        DELETE s
        FROM   dbo.Sessions s
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  sr.MenteeID = @UserID;

        DELETE FROM dbo.SessionRequests WHERE MenteeID        = @UserID;
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
-- sp_GenerateQRToken
-- Purges expired tokens then inserts a new one; returns the token + expiry.
-- ============================================================
CREATE   PROCEDURE dbo.sp_GenerateQRToken
    @SessionID INT,
    @MenteeID  INT,
    @Token     NVARCHAR(100),
    @ExpiresAt DATETIME
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.QRTokens WHERE ExpiresAt < GETUTCDATE();
    INSERT INTO dbo.QRTokens (Token, SessionID, MenteeID, ExpiresAt, IsUsed)
    VALUES (@Token, @SessionID, @MenteeID, @ExpiresAt, 0);
    SELECT @Token AS Token, @ExpiresAt AS ExpiresAt;
END;

GO


-- ── 7) sp_GetAttendanceFullReport ────────────────────────────────────────
CREATE   PROCEDURE dbo.sp_GetAttendanceFullReport
    @School NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20),
            @Semester     NVARCHAR(50),
            @SessionLimit INT = 6;
    SELECT @SchoolYear   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    SELECT @Semester     = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';
    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = '2nd Semester'
                             THEN 'SessionLimit2ndSem' ELSE 'SessionLimit1stSem' END;

    -- RS1: session limit for current semester
    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: one row per active mentor (filtered by school if provided)
    SELECT
        u.UserID    AS MentorID,
        u.FirstName, u.LastName,
        mp.Department, mp.School,
        COUNT(DISTINCT s.SessionID) AS TotalSessions
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT   JOIN dbo.Sessions       s  ON s.MentorID   = u.UserID
                                     AND s.Status      = 'Completed'
                                     AND s.SchoolYear  = @SchoolYear
                                     AND s.Semester    = @Semester
                                     AND s.RequestID  IS NULL
    WHERE  u.Role = 'mentor' AND u.IsActive = 1
      AND  (@School IS NULL OR mp.School = @School)
    GROUP  BY u.UserID, u.FirstName, u.LastName, mp.Department, mp.School
    ORDER  BY u.LastName, u.FirstName;

    -- RS3: one row per mentee, for all mentors in RS2
    SELECT
        mm.MentorID,
        ue.UserID                                           AS MenteeID,
        ue.FirstName AS MenteeFirstName,
        ue.LastName  AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')       AS SectionCode,
        mep.Course,
        mep.YearLevel,
        COUNT(DISTINCT s.SessionID)                         AS TotalSessions,
        SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)  AS PresentCount
    FROM   dbo.MentorMentee mm
    INNER  JOIN dbo.Users          um  ON um.UserID   = mm.MentorID AND um.Role = 'mentor' AND um.IsActive = 1
    INNER  JOIN dbo.Users          ue  ON ue.UserID   = mm.MenteeID AND ue.IsActive = 1
    LEFT   JOIN dbo.MentorProfiles mp2 ON mp2.UserID  = mm.MentorID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN dbo.Sessions       s   ON s.MentorID    = mm.MentorID
                                      AND s.Status       = 'Completed'
                                      AND s.SchoolYear   = @SchoolYear
                                      AND s.Semester     = @Semester
                                      AND s.SessionDate >= mm.AssignedDate
                                      AND (
                                          (s.RequestID IS NULL
                                           AND (s.SectionCode IS NULL
                                                OR s.SectionCode = COALESCE(sec.SectionCode, mep.Section)))
                                          OR
                                          (s.RequestID IS NOT NULL
                                           AND EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                                                       WHERE  sr.RequestID = s.RequestID
                                                         AND  sr.MenteeID  = ue.UserID
                                                         AND  sr.Status    = 'Approved'))
                                      )
    LEFT   JOIN dbo.Attendance     a   ON a.SessionID = s.SessionID AND a.MenteeID = ue.UserID
    WHERE  mm.IsActive = 1
      AND  (@School IS NULL OR mp2.School = @School)
    GROUP  BY mm.MentorID, ue.UserID, ue.FirstName, ue.LastName, ue.StudentNumber,
              sec.SectionCode, mep.Section, mep.Course, mep.YearLevel
    ORDER  BY mm.MentorID, ue.LastName, ue.FirstName;
END;

GO


-- ── sp_GetAttendanceOverview (Attendance Logs/Summary school overview) ─
CREATE   PROCEDURE dbo.sp_GetAttendanceOverview
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear NVARCHAR(20), @Semester NVARCHAR(50);
    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

    -- One row per mentor, scoped to the current semester -- matching
    -- sp_GetMentorMenteeAttendance and sp_GetAttendanceFullReport.
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.Department, mp.School,
        ISNULL(ms.TotalSessions,  0) AS TotalSessions,
        ISNULL(ms.TotalAttendees, 0) AS TotalAttendees,
        ISNULL(ms.PresentCount,   0) AS PresentCount,
        ms.LastSessionDate,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec2.SectionCode, mep2.Section) AS val
                FROM   dbo.MentorMentee mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
            ) t
        ) AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep3.Course AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID = mm3.MenteeID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  mep3.Course IS NOT NULL
            ) t
        ) AS Courses
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT   JOIN (
        SELECT
            s.MentorID,
            COUNT(DISTINCT s.SessionID)                              AS TotalSessions,
            COUNT(*)                                                  AS TotalAttendees,
            SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)        AS PresentCount,
            MAX(s.SessionDate)                                        AS LastSessionDate
        FROM   dbo.Sessions      s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID AND mm.IsActive = 1
        LEFT   JOIN dbo.Attendance   a  ON a.SessionID = s.SessionID AND a.MenteeID = mm.MenteeID
        WHERE  s.Status = 'Completed' AND s.SessionDate >= mm.AssignedDate
          AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
          AND  (s.RequestID IS NULL
                OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                           WHERE sr.RequestID = s.RequestID AND sr.MenteeID = mm.MenteeID AND sr.Status = 'Approved'))
        GROUP  BY s.MentorID
    ) ms ON ms.MentorID = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentor'
    ORDER  BY u.LastName, u.FirstName;
END;

GO


-- ── sp_GetLogsheet (SessionsAdminService.GetLogsheetAsync) ──────────────────
CREATE   PROCEDURE dbo.sp_GetLogsheet
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: mentor info (includes SignatureFilePath for printed logsheets)
    SELECT u.UserID AS MentorID, u.FirstName, u.LastName,
           mp.Department, mp.School, mp.SignatureFilePath
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS2: flat rows (one per mentee per session)
    SELECT
        s.SessionID,
        s.SlotName,
        s.SessionDate,
        COALESCE(ava.StartTime, CONVERT(TIME, s.SessionDate))        AS TimeStart,
        s.TimeEnd,
        COALESCE(sr.Purpose, s.Notes, 'Mentoring Session')            AS Topic,
        s.Status                                                      AS SessionStatus,
        a.MenteeID,
        COALESCE(u.FirstName + ' ' + u.LastName, NULL)               AS MenteeName,
        COALESCE(sec.SectionCode, mep.Section, N'-')                  AS SectionCode,
        a.AttendanceID,
        a.ScannedAt,
        COALESCE(a.IsPresent, 0)                                     AS IsPresent,
        a.Remarks,
        a.MentorNotes,
        a.AbsenceReason,
        CASE
            WHEN s.RequestID IS NOT NULL THEN NULL
            WHEN s.SectionCode IS NOT NULL THEN s.SectionCode
            ELSE (
                SELECT CASE
                    WHEN COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section)) = 1
                    THEN MAX(COALESCE(sec2.SectionCode, mep2.Section))
                    ELSE NULL
                END
                FROM   dbo.MentorMentee    mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  mm2.MentorID = s.MentorID AND mm2.IsActive = 1
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
                  AND  COALESCE(sec2.SectionCode, mep2.Section) <> N'-'
            )
        END                                                           AS Sections,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             WHEN s.SectionCode IS NULL   THEN CAST(1 AS BIT)
             ELSE CAST(0 AS BIT)
        END                                                            AS IsMakeup,
        p.FilePath  AS ProofFilePath,
        p.FileType  AS ProofFileType,
        mep.SignatureFilePath,
        ISNULL(mep.IsDropOut, 0)                                      AS IsDropOut,
        s.SchoolYear,
        s.Semester,
        s.SectionCode AS SessionSectionCode
    FROM   dbo.Sessions          s
    LEFT   JOIN dbo.SessionRequests  sr  ON sr.RequestID      = s.RequestID
    LEFT   JOIN dbo.Availability     ava ON ava.AvailabilityID = sr.AvailabilityID
    LEFT   JOIN dbo.Attendance       a   ON a.SessionID        = s.SessionID
    LEFT   JOIN dbo.Users            u   ON u.UserID           = a.MenteeID
    LEFT   JOIN dbo.MenteeProfiles   mep ON mep.UserID         = a.MenteeID
    LEFT   JOIN dbo.Sections         sec ON sec.SectionID      = mep.SectionID
    LEFT   JOIN (
        SELECT SessionID, FilePath, FileType,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.MentorID = @MentorID
    ORDER  BY s.SessionDate ASC, s.SessionID ASC, u.LastName ASC, u.FirstName ASC;
END;

GO


-- ============================================================
-- sp_GetMakeupSessionRequesters
-- All approved requesters for a makeup session's availability slot.
-- ============================================================
CREATE   PROCEDURE dbo.sp_GetMakeupSessionRequesters
    @SessionID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        NULL                                             AS AttendanceID,
        ue.UserID                                        AS MenteeID,
        ue.FirstName                                     AS MenteeFirstName,
        ue.LastName                                      AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'�')   AS SectionCode,
        mep.Course, mep.YearLevel,
        NULL AS IsPresent, NULL AS ScannedAt, NULL AS AbsenceReason, NULL AS MentorNotes, NULL AS Remarks
    FROM   dbo.Sessions        s
    JOIN   dbo.SessionRequests sr_main ON sr_main.RequestID     = s.RequestID
    JOIN   dbo.SessionRequests sr_all  ON sr_all.AvailabilityID = sr_main.AvailabilityID
                                      AND sr_all.Status         = 'Approved'
    JOIN   dbo.Users           ue  ON ue.UserID    = sr_all.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = sr_all.MenteeID
    LEFT   JOIN dbo.Sections   sec ON sec.SectionID  = mep.SectionID
    WHERE  s.SessionID = @SessionID
    ORDER  BY ue.LastName, ue.FirstName;
END;

GO


CREATE   PROCEDURE dbo.sp_GetMenteeAttendanceHistory
    @MenteeID INT,
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SectionCode NVARCHAR(100);
    SELECT @SectionCode = COALESCE(sec.SectionCode, mep.Section)
    FROM   dbo.MenteeProfiles mep
    LEFT   JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
    WHERE  mep.UserID = @MenteeID;

    ;WITH q AS (
        SELECT s.SessionID, s.SessionDate, s.SlotName,
               CAST(0 AS BIT) AS IsMakeup,
               CASE
                   WHEN s.SectionCode IS NOT NULL
                       THEN LTRIM(SUBSTRING(s.Notes, CHARINDEX(']',s.Notes)+1, LEN(s.Notes)))
                   ELSE COALESCE(s.Notes, 'Mentoring Session')
               END AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID
                                       AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
        WHERE  s.MentorID = @MentorID AND s.RequestID IS NULL AND s.Status != 'Cancelled'
          AND  (@SectionCode IS NULL
                OR s.SectionCode IS NULL
                OR s.SectionCode = @SectionCode)

        UNION ALL

        SELECT s.SessionID, s.SessionDate, s.SlotName,
               CAST(1 AS BIT) AS IsMakeup,
               COALESCE(s.SlotName, 'Make-up Session') AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions        s
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  s.MentorID = @MentorID AND s.Status != 'Cancelled'
          AND  sr.MenteeID = @MenteeID AND sr.Status = 'Approved'
    ),
    joined AS (
        SELECT
            q.SessionID, q.SessionDate, q.SlotName, q.IsMakeup, q.Topic, q.SessionStatus,
            a.AttendanceID,
            COALESCE(a.IsPresent, 0) AS IsPresent,
            a.ScannedAt, a.AbsenceReason, a.MentorNotes,
            CASE WHEN a.AttendanceID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS IsRecorded
        FROM   q
        LEFT   JOIN dbo.Attendance a ON a.SessionID = q.SessionID AND a.MenteeID = @MenteeID
    ),
    ranked AS (
        -- Rows sharing a real SlotName merge into one — the round the
        -- mentee was actually present in wins (and among present rounds,
        -- the most recent one); a SlotName-less makeup row is its own
        -- group (COALESCE to its own SessionID) so it never merges.
        SELECT *,
               ROW_NUMBER() OVER (
                   PARTITION BY COALESCE(SlotName, CAST(SessionID AS NVARCHAR(20)))
                   ORDER BY IsPresent DESC, SessionDate DESC
               ) AS rn
        FROM   joined
    )
    SELECT
        COALESCE(AttendanceID, 0) AS AttendanceID,
        SlotName, IsMakeup, SessionDate, Topic, SessionStatus,
        IsPresent, ScannedAt, AbsenceReason, MentorNotes, IsRecorded
    FROM   ranked
    WHERE  rn = 1
    ORDER  BY SessionDate DESC;
END;

GO


-- Same class of bug as fix_role_switch_stale_profile_views.sql, found in 5
-- more places after auditing every procedure/view that lists "current
-- mentors" or "current mentees": each of these joins to MentorProfiles/
-- MenteeProfiles (which intentionally survives a role switch, to keep
-- history) without also checking Users.Role, so a user switched away from
-- Mentor/Mentee keeps showing up in these lists. Confirmed NOT an issue in
-- sp_GetAttendanceFullReport, sp_GetRecentActivities, sp_GetMakeupSession-
-- Requesters (already correct, or scoped to a specific historical session/
-- ID rather than a "browse current mentors" list) — left untouched.

-- ── sp_GetMentorCards (Admin Sessions "Mentor Monitoring" overview) ────
CREATE   PROCEDURE dbo.sp_GetMentorCards
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        u.UserID                                                        AS MentorID,
        u.FirstName,
        u.LastName,
        mp.Department,
        mp.School,
        COUNT(DISTINCT s.SessionID)                                     AS TotalSessions,
        COUNT(DISTINCT CASE WHEN s.Status = 'Completed'
                            THEN s.SessionID END)                       AS CompletedSessions,
        (
            SELECT COUNT(DISTINCT a2.SessionID)
            FROM   dbo.Attendance a2
            INNER  JOIN dbo.Sessions s2 ON s2.SessionID = a2.SessionID
            WHERE  s2.MentorID = u.UserID
              AND  a2.MentorNotes IS NOT NULL AND a2.MentorNotes <> ''
        )                                                               AS SessionsWithNotes,
        MAX(s.SessionDate)                                              AS LastSessionDate,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec2.SectionCode, mep2.Section) AS val
                FROM   dbo.MentorMentee mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
            ) t
        )                                                               AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep3.Course AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID = mm3.MenteeID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  mep3.Course IS NOT NULL
            ) t
        )                                                               AS Courses
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID = u.UserID AND mm.IsActive = 1
    LEFT   JOIN dbo.Sessions        s  ON s.MentorID  = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentor'
    GROUP  BY u.UserID, u.FirstName, u.LastName, mp.Department, mp.School
    ORDER  BY u.LastName, u.FirstName;
END;

GO


-- Same bug class as fix_role_switch_stale_profile_views.sql /
-- fix_role_switch_stale_profile_procs.sql, found in the one remaining
-- spot: sp_GetMentorDetail is reached by ID directly (mentor-detail.html
-- ?id=X), and the listing-page fixes already applied mean a role-switched
-- user won't have a "View Details" link into this page anymore — but an
-- old bookmark or browser-history entry would still open it and show
-- stale mentor data. Also fixes RS4 the same way for a mentee whose own
-- role has since switched away while still under an active assignment.
--
-- Live definition pulled directly from RDS via OBJECT_DEFINITION() to
-- guarantee this matches the actual current body (several SQL/*.sql
-- files touch this procedure with identical commit timestamps, so git
-- history alone can't say which one "won").
CREATE   PROCEDURE dbo.sp_GetMentorDetail
    @MentorID INT
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

    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions, @SchoolYear AS SchoolYear, @Semester AS Semester,
           (SELECT COUNT(*) FROM dbo.CalendarEvents ce
            WHERE ce.EventType = 'Deadline' AND ce.SchoolYear = @SchoolYear AND ce.Semester = @Semester
              AND ce.StartDate <= GETDATE())                                              AS DueCheckpointCount;

    -- RS2: mentor overview (with SectionCount + Sections)
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName,
        u.Email, u.ContactNumber, mp.School, d.DepartmentName,
        (SELECT COUNT(*) FROM dbo.MentorMentee mm
         WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                               AS MenteeCount,
        (SELECT COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section))
         FROM   dbo.MentorMentee    mm2
         INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
         LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
         WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
           AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL)                    AS SectionCount,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec3.SectionCode, mep3.Section) AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID    = mm3.MenteeID
                LEFT   JOIN dbo.Sections       sec3 ON sec3.SectionID = mep3.SectionID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  COALESCE(sec3.SectionCode, mep3.Section) IS NOT NULL
            ) t
        )                                                                                 AS Sections,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s.SlotName + N'|' + s.SectionCode AS pair
                FROM   dbo.Sessions s
                WHERE  s.MentorID = u.UserID AND s.Status = 'Completed'
                  AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                  AND  s.RequestID IS NULL AND s.SectionCode IS NOT NULL
                UNION ALL
                SELECT s.SlotName + N'|' + COALESCE(secM.SectionCode, mepM.Section) AS pair
                FROM   dbo.Sessions s
                INNER  JOIN dbo.Attendance     aM   ON aM.SessionID = s.SessionID AND aM.IsPresent = 1
                INNER  JOIN dbo.MenteeProfiles mepM ON mepM.UserID  = aM.MenteeID
                INNER  JOIN dbo.MentorMentee   mmM  ON mmM.MenteeID = aM.MenteeID AND mmM.MentorID = s.MentorID AND mmM.IsActive = 1
                LEFT   JOIN dbo.Sections       secM ON secM.SectionID = mepM.SectionID
                WHERE  s.MentorID = u.UserID AND s.Status = 'Completed'
                  AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                  AND  s.RequestID IS NOT NULL AND s.SlotName IS NOT NULL
                  AND  COALESCE(secM.SectionCode, mepM.Section) IS NOT NULL
            ) t
        )                                                                                AS CompletedSessions,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s4.SlotName + N'|' + s4.SectionCode AS pair
                FROM   dbo.Sessions s4
                WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
                  AND  s4.RequestID IS NULL AND s4.SectionCode IS NOT NULL AND s4.Status <> 'Cancelled'
                  AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = 'Submitted'
                  AND  EXISTS (
                      SELECT 1 FROM dbo.CalendarEvents ce
                      WHERE ce.EventType = 'Deadline' AND ce.SlotName = s4.SlotName
                        AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                        AND s4.SubmittedAt <= ce.StartDate
                  )
                UNION ALL
                SELECT s4.SlotName + N'|' + COALESCE(sec4M.SectionCode, mep4M.Section) AS pair
                FROM   dbo.Sessions s4
                INNER  JOIN dbo.Attendance     a4M   ON a4M.SessionID = s4.SessionID AND a4M.IsPresent = 1
                INNER  JOIN dbo.MenteeProfiles mep4M ON mep4M.UserID  = a4M.MenteeID
                INNER  JOIN dbo.MentorMentee   mm4M  ON mm4M.MenteeID = a4M.MenteeID AND mm4M.MentorID = s4.MentorID AND mm4M.IsActive = 1
                LEFT   JOIN dbo.Sections       sec4M ON sec4M.SectionID = mep4M.SectionID
                WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
                  AND  s4.RequestID IS NOT NULL AND s4.SlotName IS NOT NULL AND s4.Status <> 'Cancelled'
                  AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = 'Submitted'
                  AND  COALESCE(sec4M.SectionCode, mep4M.Section) IS NOT NULL
                  AND  EXISTS (
                      SELECT 1 FROM dbo.CalendarEvents ce
                      WHERE ce.EventType = 'Deadline' AND ce.SlotName = s4.SlotName
                        AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                        AND s4.SubmittedAt <= ce.StartDate
                  )
            ) t
        )                                                                                AS OnTimeCount,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s5.SlotName + N'|' + s5.SectionCode AS pair
                FROM   dbo.Sessions s5
                WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
                  AND  s5.RequestID IS NULL AND s5.SectionCode IS NOT NULL AND s5.Status <> 'Cancelled'
                  AND  s5.LogStatus = 'Submitted'
                  AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)
                UNION ALL
                SELECT s5.SlotName + N'|' + COALESCE(sec5M.SectionCode, mep5M.Section) AS pair
                FROM   dbo.Sessions s5
                INNER  JOIN dbo.Attendance     a5M   ON a5M.SessionID = s5.SessionID AND a5M.IsPresent = 1
                INNER  JOIN dbo.MenteeProfiles mep5M ON mep5M.UserID  = a5M.MenteeID
                INNER  JOIN dbo.MentorMentee   mm5M  ON mm5M.MenteeID = a5M.MenteeID AND mm5M.MentorID = s5.MentorID AND mm5M.IsActive = 1
                LEFT   JOIN dbo.Sections       sec5M ON sec5M.SectionID = mep5M.SectionID
                WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
                  AND  s5.RequestID IS NOT NULL AND s5.SlotName IS NOT NULL AND s5.Status <> 'Cancelled'
                  AND  s5.LogStatus = 'Submitted'
                  AND  COALESCE(sec5M.SectionCode, mep5M.Section) IS NOT NULL
                  AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)
            ) t
        )                                                                                AS CompleteCount
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  u.UserID = @MentorID AND u.IsActive = 1 AND u.Role = 'Mentor';

    -- RS3: sessions list (includes ProofFilePath) -- FULL history, no
    -- period filter (see fix_mentor_detail_session_history.sql). Also
    -- returns SlotName/LogStatus/SubmittedAt so the frontend can show the
    -- same on-time/complete signal per row as the aggregate above.
    SELECT
        s.SessionID,
        COALESCE(sr.Purpose, s.Notes, 'Session')                    AS Topic,
        s.Status, s.SessionDate, s.Notes,
        s.SchoolYear, s.Semester,
        s.SlotName, s.LogStatus, s.SubmittedAt,
        (SELECT COUNT(*)
         FROM   dbo.Attendance a
         JOIN   dbo.MenteeProfiles mep4 ON mep4.UserID = a.MenteeID
         WHERE  a.SessionID = s.SessionID AND a.IsPresent = 1
           AND  ISNULL(mep4.IsDropOut, 0) = 0)                       AS PresentCount,
        CASE
            WHEN s.RequestID IS NOT NULL THEN
                (SELECT COUNT(DISTINCT sr2.MenteeID) FROM dbo.SessionRequests sr2
                 WHERE sr2.AvailabilityID = sr.AvailabilityID AND sr2.Status = 'Approved')
            ELSE
                (SELECT COUNT(*)
                 FROM   dbo.MentorMentee    mm2
                 INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                 LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                 WHERE  mm2.MentorID = s.MentorID AND mm2.IsActive = 1
                   AND  ISNULL(mep2.IsDropOut, 0) = 0
                   AND  (s.SectionCode IS NULL
                         OR COALESCE(sec2.SectionCode, mep2.Section) = s.SectionCode))
        END                                                          AS TotalMentees,
        CASE WHEN p.ProofID IS NOT NULL
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END                                                          AS HasProof,
        p.FilePath                                                   AS ProofFilePath
    FROM   dbo.Sessions s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.MentorID = @MentorID
    ORDER  BY s.SessionDate DESC;

    -- RS4: mentees with attendance stats + IsDropOut + SignatureFilePath
    -- (current-period progress figures -- unchanged), plus Email + Course +
    -- YearLevel for the mentee card (contact number deliberately left out
    -- -- see add_email_course_to_mentor_detail_mentees.sql, the fix this
    -- migration restores after scope_timeliness_to_due_checkpoints.sql
    -- accidentally reverted it).
    SELECT
        u.UserID          AS MenteeID,
        u.FirstName, u.LastName, u.StudentNumber, u.Email,
        mep.Course, mep.YearLevel,
        COALESCE(sec.SectionCode, mep.Section, N'-')                AS SectionCode,
        ISNULL(mep.IsDropOut, 0)                                    AS IsDropOut,
        mep.SignatureFilePath,
        (SELECT COUNT(*) FROM dbo.Attendance a
         JOIN dbo.Sessions sess ON sess.SessionID = a.SessionID
         WHERE a.MenteeID = u.UserID AND a.IsPresent = 1
           AND sess.MentorID = @MentorID AND sess.Status = 'Completed'
           AND sess.SchoolYear = @SchoolYear AND sess.Semester = @Semester
           AND sess.SessionDate >= mm.AssignedDate)                  AS SessionsAttended,
        (SELECT COUNT(DISTINCT s.SessionID)
         FROM dbo.Sessions s
         WHERE s.MentorID = @MentorID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.SessionDate >= mm.AssignedDate
           AND (
                (s.RequestID IS NULL AND s.SectionCode = COALESCE(sec.SectionCode, mep.Section))
                OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                           WHERE sr.RequestID = s.RequestID
                             AND sr.MenteeID = u.UserID AND sr.Status = 'Approved')
               )) AS TotalCompleted,
        (SELECT MAX(sess.SessionDate) FROM dbo.Attendance a
         JOIN dbo.Sessions sess ON sess.SessionID = a.SessionID
         WHERE a.MenteeID = u.UserID AND sess.MentorID = @MentorID
           AND a.IsPresent = 1
           AND sess.SchoolYear = @SchoolYear AND sess.Semester = @Semester)      AS LastAttended
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = u.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = u.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentee'
    ORDER  BY u.LastName, u.FirstName;
END;

GO


CREATE   PROCEDURE dbo.sp_GetMentorMenteeAttendance
    @MentorID INT
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

    -- RS1: session limit for current semester
    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: mentor info with sections/courses
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName, u.Email, mp.Department, mp.School,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec.SectionCode, mep.Section) AS val
                FROM   dbo.MentorMentee mm
                INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID
                LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
                WHERE  mm.MentorID = u.UserID AND mm.IsActive = 1
                  AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
            ) t
        ) AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep2.Course AS val
                FROM   dbo.MentorMentee mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = mm2.MenteeID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  mep2.Course IS NOT NULL
            ) t
        ) AS Courses
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS3: mentee attendance cards (scoped to current semester) — counts
    -- DISTINCT CHECKPOINTS (SlotName), not raw session rows, so a
    -- checkpoint completed via either the regular session or a makeup
    -- catch-up (or both) counts once, as Present.
    SELECT
        ue.UserID                                                     AS MenteeID,
        ue.FirstName AS MenteeFirstName, ue.LastName AS MenteeLastName, ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')                  AS SectionCode,
        mep.Course, mep.YearLevel,
        COUNT(DISTINCT s.SlotName)                                    AS TotalSessions,
        COUNT(DISTINCT CASE WHEN a.IsPresent = 1 THEN s.SlotName END) AS PresentCount
    FROM   dbo.Users ue
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = ue.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN dbo.Sessions       s   ON s.MentorID = @MentorID AND s.Status = 'Completed'
                                      AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                                      AND s.SessionDate >= mm.AssignedDate
                                      AND s.SlotName IS NOT NULL
                                      AND (s.RequestID IS NULL
                                           OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                                                      WHERE sr.RequestID = s.RequestID
                                                        AND sr.MenteeID = ue.UserID AND sr.Status = 'Approved'))
    LEFT   JOIN dbo.Attendance     a   ON a.SessionID = s.SessionID AND a.MenteeID = ue.UserID
    WHERE  ue.IsActive = 1
    GROUP  BY ue.UserID, ue.FirstName, ue.LastName, ue.StudentNumber,
              sec.SectionCode, mep.Section, mep.Course, mep.YearLevel
    ORDER  BY ue.LastName, ue.FirstName;
END;

GO


-- ── sp_GetMentorOverview (Head/Admin MonitorActivities — mentor
--    performance list, dashboards, School Breakdown, ranking charts) ───
CREATE   PROCEDURE dbo.sp_GetMentorOverview
    @IncludeInactive BIT           = 0,
    @SchoolYear      NVARCHAR(20)  = NULL,
    @Semester        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SessionLimit INT = 6;

    IF @SchoolYear IS NULL
        SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    IF @Semester IS NULL
        SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = '2nd Semester'
                             THEN 'SessionLimit2ndSem' ELSE 'SessionLimit1stSem' END;

    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions, @SchoolYear AS SchoolYear, @Semester AS Semester;

    SELECT
        u.UserID        AS MentorID,
        u.FirstName, u.LastName, u.Email, u.ContactNumber,
        mp.School, d.DepartmentName,
        mp.SignatureFilePath,
        u.IsActive                                                                       AS IsActive,
        (SELECT COUNT(*) FROM dbo.MentorMentee mm
         WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                                AS MenteeCount,
        (SELECT COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section))
         FROM   dbo.MentorMentee    mm2
         INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
         LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
         WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
           AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL)                     AS SectionCount,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec3.SectionCode, mep3.Section) AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID    = mm3.MenteeID
                LEFT   JOIN dbo.Sections       sec3 ON sec3.SectionID = mep3.SectionID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  COALESCE(sec3.SectionCode, mep3.Section) IS NOT NULL
            ) t
        )                                                                                  AS Sections,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s.SlotName + N'|' + s.SectionCode AS pair
                FROM   dbo.Sessions s
                WHERE  s.MentorID = u.UserID AND s.Status = 'Completed'
                  AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                  AND  s.RequestID IS NULL AND s.SectionCode IS NOT NULL
                UNION ALL
                SELECT s.SlotName + N'|' + COALESCE(secM.SectionCode, mepM.Section) AS pair
                FROM   dbo.Sessions s
                INNER  JOIN dbo.Attendance     aM   ON aM.SessionID = s.SessionID AND aM.IsPresent = 1
                INNER  JOIN dbo.MenteeProfiles mepM ON mepM.UserID  = aM.MenteeID
                INNER  JOIN dbo.MentorMentee   mmM  ON mmM.MenteeID = aM.MenteeID AND mmM.MentorID = s.MentorID AND mmM.IsActive = 1
                LEFT   JOIN dbo.Sections       secM ON secM.SectionID = mepM.SectionID
                WHERE  s.MentorID = u.UserID AND s.Status = 'Completed'
                  AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                  AND  s.RequestID IS NOT NULL AND s.SlotName IS NOT NULL
                  AND  COALESCE(secM.SectionCode, mepM.Section) IS NOT NULL
            ) t
        )                                                                                 AS CompletedSessions,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s4.SlotName + N'|' + s4.SectionCode AS pair
                FROM   dbo.Sessions s4
                WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
                  AND  s4.RequestID IS NULL AND s4.SectionCode IS NOT NULL AND s4.Status <> 'Cancelled'
                  AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = 'Submitted'
                  AND  EXISTS (
                      SELECT 1 FROM dbo.CalendarEvents ce
                      WHERE ce.EventType = 'Deadline' AND ce.SlotName = s4.SlotName
                        AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                        AND s4.SubmittedAt <= ce.StartDate
                  )
                UNION ALL
                SELECT s4.SlotName + N'|' + COALESCE(sec4M.SectionCode, mep4M.Section) AS pair
                FROM   dbo.Sessions s4
                INNER  JOIN dbo.Attendance     a4M   ON a4M.SessionID = s4.SessionID AND a4M.IsPresent = 1
                INNER  JOIN dbo.MenteeProfiles mep4M ON mep4M.UserID  = a4M.MenteeID
                INNER  JOIN dbo.MentorMentee   mm4M  ON mm4M.MenteeID = a4M.MenteeID AND mm4M.MentorID = s4.MentorID AND mm4M.IsActive = 1
                LEFT   JOIN dbo.Sections       sec4M ON sec4M.SectionID = mep4M.SectionID
                WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
                  AND  s4.RequestID IS NOT NULL AND s4.SlotName IS NOT NULL AND s4.Status <> 'Cancelled'
                  AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = 'Submitted'
                  AND  COALESCE(sec4M.SectionCode, mep4M.Section) IS NOT NULL
                  AND  EXISTS (
                      SELECT 1 FROM dbo.CalendarEvents ce
                      WHERE ce.EventType = 'Deadline' AND ce.SlotName = s4.SlotName
                        AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                        AND s4.SubmittedAt <= ce.StartDate
                  )
            ) t
        )                                                                                 AS OnTimeCount,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s5.SlotName + N'|' + s5.SectionCode AS pair
                FROM   dbo.Sessions s5
                WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
                  AND  s5.RequestID IS NULL AND s5.SectionCode IS NOT NULL AND s5.Status <> 'Cancelled'
                  AND  s5.LogStatus = 'Submitted'
                  AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)
                UNION ALL
                SELECT s5.SlotName + N'|' + COALESCE(sec5M.SectionCode, mep5M.Section) AS pair
                FROM   dbo.Sessions s5
                INNER  JOIN dbo.Attendance     a5M   ON a5M.SessionID = s5.SessionID AND a5M.IsPresent = 1
                INNER  JOIN dbo.MenteeProfiles mep5M ON mep5M.UserID  = a5M.MenteeID
                INNER  JOIN dbo.MentorMentee   mm5M  ON mm5M.MenteeID = a5M.MenteeID AND mm5M.MentorID = s5.MentorID AND mm5M.IsActive = 1
                LEFT   JOIN dbo.Sections       sec5M ON sec5M.SectionID = mep5M.SectionID
                WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
                  AND  s5.RequestID IS NOT NULL AND s5.SlotName IS NOT NULL AND s5.Status <> 'Cancelled'
                  AND  s5.LogStatus = 'Submitted'
                  AND  COALESCE(sec5M.SectionCode, mep5M.Section) IS NOT NULL
                  AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)
            ) t
        )                                                                                 AS CompleteCount,
        (
            SELECT STRING_AGG(x.SlotName + N':' + CAST(x.AttendeeCount AS NVARCHAR(10)), ', ')
            FROM (
                SELECT s6.SlotName,
                       COUNT(DISTINCT CASE WHEN a.IsPresent = 1 AND ISNULL(mep6.IsDropOut, 0) = 0
                                           THEN a.MenteeID END)                             AS AttendeeCount
                FROM   dbo.Sessions s6
                LEFT   JOIN dbo.Attendance     a    ON a.SessionID = s6.SessionID
                LEFT   JOIN dbo.MenteeProfiles mep6 ON mep6.UserID = a.MenteeID
                WHERE  s6.MentorID = u.UserID AND s6.SchoolYear = @SchoolYear AND s6.Semester = @Semester
                  AND  s6.Status <> 'Cancelled' AND s6.SlotName IS NOT NULL
                  AND  (s6.SectionCode IS NOT NULL OR s6.RequestID IS NOT NULL)
                GROUP  BY s6.SlotName
            ) x
        )                                                                                  AS SlotAttendance,
        (SELECT MAX(s.SessionDate) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)                     AS LastSessionDate,
        (SELECT MIN(s.SessionDate) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Scheduled'
           AND s.SessionDate >= CAST(GETDATE() AS DATE)
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)                     AS NextSessionDate
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  (u.IsActive = 1 OR @IncludeInactive = 1) AND u.Role = 'Mentor'
    ORDER  BY u.LastName, u.FirstName;
END;

GO


-- ============================================================
-- sp_GetMentorSectionView
-- Full mentor ? section ? mentee assignment view (admin).
-- ============================================================
CREATE   PROCEDURE dbo.sp_GetMentorSectionView
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        u1.UserID    AS MentorID,
        u1.FirstName AS MentorFirstName,
        u1.LastName  AS MentorLastName,
        mp.School    AS MentorSchool,
        d.DepartmentName,
        u2.UserID    AS MenteeID,
        u2.FirstName AS MenteeFirstName,
        u2.LastName  AS MenteeLastName,
        u2.StudentNumber,
        me.Course, me.YearLevel, me.Section, me.SectionID,
        s.SectionCode
    FROM   dbo.Users u1
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID    = u1.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID  = u1.UserID AND mm.IsActive = 1
    INNER  JOIN dbo.Users          u2 ON u2.UserID    = mm.MenteeID AND u2.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles me ON me.UserID    = u2.UserID
    LEFT   JOIN dbo.Sections       s  ON s.SectionID  = me.SectionID
    WHERE  u1.IsActive = 1
      AND  mp.School IS NOT NULL AND mp.School != ''
    ORDER  BY u1.LastName, u1.FirstName, s.SectionCode, u2.LastName;
END;

GO

-- Adds Sessions.SubmittedAt to sp_GetMentorSessions and sp_GetSessionsForMentee.

-- sp_GetMentorSessions RS2 (SessionRowDto) -- has a GROUP BY, so SubmittedAt
-- must be added there too.
CREATE   PROCEDURE [dbo].[sp_GetMentorSessions]
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear');
    DECLARE @Semester     NVARCHAR(50) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester');
    DECLARE @SessionLimit INT = CASE WHEN @Semester = '2nd Semester'
        THEN ISNULL((SELECT CAST(SettingValue AS INT) FROM dbo.SystemSettings WHERE SettingKey = 'SessionLimit2ndSem'), 5)
        ELSE ISNULL((SELECT CAST(SettingValue AS INT) FROM dbo.SystemSettings WHERE SettingKey = 'SessionLimit1stSem'), 6)
    END;

    -- RS1: mentor info + session limit + regular session count + signature
    SELECT
        u.UserID   AS MentorID,
        u.FirstName, u.LastName, u.Email, mp.Department, mp.School,
        @SessionLimit AS SessionLimit,
        (
            SELECT COUNT(DISTINCT s2.SessionID)
            FROM   dbo.Sessions s2
            WHERE  s2.MentorID   = u.UserID
              AND  s2.SchoolYear = @SchoolYear
              AND  s2.Semester   = @Semester
              AND  s2.RequestID  IS NULL
              AND  s2.SectionCode IS NOT NULL
              AND  s2.Status    != 'Cancelled'
        ) AS RegularSessionCount,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec.SectionCode, mep.Section) AS val
                FROM   dbo.MentorMentee    mm
                INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID
                LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
                WHERE  mm.MentorID = u.UserID AND mm.IsActive = 1
                  AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
            ) t
        ) AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep2.Course AS val
                FROM   dbo.MentorMentee    mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = mm2.MenteeID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  mep2.Course IS NOT NULL
            ) t
        ) AS Courses,
        mp.SignatureFilePath
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS2: sessions list
    SELECT
        s.SessionID,
        s.SectionCode,
        s.SlotName,
        DENSE_RANK() OVER (ORDER BY s.SessionDate, s.SessionID)        AS DenseRank,
        s.SessionDate,
        s.TimeEnd,
        s.Status                                                      AS SessionStatus,
        CASE WHEN s.RequestID IS NOT NULL THEN s.Notes
             ELSE COALESCE(s.Notes, 'Mentoring Session')
        END                                                            AS Topic,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             ELSE
               CASE WHEN s.SectionCode IS NULL THEN CAST(1 AS BIT)
                    ELSE CAST(0 AS BIT)
               END
        END                                                            AS IsMakeup,
        CASE
            WHEN s.RequestID IS NOT NULL THEN
                (SELECT COUNT(DISTINCT sr2.MenteeID) FROM dbo.SessionRequests sr2
                 WHERE sr2.AvailabilityID = sr.AvailabilityID AND sr2.Status = 'Approved')
            ELSE
                (SELECT COUNT(*)
                 FROM   dbo.MentorMentee    mm2
                 INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                 LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                 WHERE  mm2.MentorID = s.MentorID AND mm2.IsActive = 1
                   AND  ISNULL(mep2.IsDropOut, 0) = 0
                   AND  (s.SectionCode IS NULL
                         OR COALESCE(sec2.SectionCode, mep2.Section) = s.SectionCode))
        END                                                            AS TotalAttendees,
        (SELECT COUNT(*)
         FROM   dbo.Attendance a3
         JOIN   dbo.MenteeProfiles mep3 ON mep3.UserID = a3.MenteeID
         WHERE  a3.SessionID = s.SessionID AND a3.IsPresent = 1
           AND  ISNULL(mep3.IsDropOut, 0) = 0)                         AS PresentCount,
        SUM(CASE WHEN a.MentorNotes IS NOT NULL AND a.MentorNotes<>'' THEN 1 ELSE 0 END) AS NotesFilledCount,
        p.FilePath  AS ProofFilePath,
        p.FileType  AS ProofFileType,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec2.SectionCode, mep2.Section) AS val
                FROM   dbo.Attendance      a2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = a2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  a2.SessionID = s.SessionID
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
            ) t
        )                                                              AS Sections,
        s.QRCodeToken,
        s.SubmittedAt,
        s.SchoolYear,
        s.Semester
    FROM   dbo.Sessions        s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN dbo.Attendance      a  ON a.SessionID  = s.SessionID
    LEFT   JOIN (
        SELECT SessionID, FilePath, FileType,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.MentorID = @MentorID
    GROUP  BY s.SessionID, s.MentorID, s.SessionDate, s.TimeEnd, s.Status,
              s.RequestID, sr.Purpose, sr.AvailabilityID, s.Notes, s.SectionCode, s.SlotName,
              p.FilePath, p.FileType, s.QRCodeToken, s.SubmittedAt, s.SchoolYear, s.Semester
    ORDER  BY s.SessionDate DESC;

    -- RS3: per-section regular-session counts for the current semester
    SELECT
        sect.SectionCode,
        @SessionLimit AS SessionLimit,
        (
            SELECT COUNT(DISTINCT s3.SessionID)
            FROM   dbo.Sessions s3
            WHERE  s3.MentorID   = @MentorID
              AND  s3.SchoolYear = @SchoolYear
              AND  s3.Semester   = @Semester
              AND  s3.RequestID  IS NULL
              AND  s3.Status    != 'Cancelled'
              AND  s3.SectionCode = sect.SectionCode
        ) AS RegularSessionCount
    FROM (
        SELECT DISTINCT COALESCE(sec.SectionCode, mep.Section) AS SectionCode
        FROM   dbo.MentorMentee    mm
        INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID
        LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
        WHERE  mm.MentorID = @MentorID AND mm.IsActive = 1
          AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
    ) sect
    ORDER BY sect.SectionCode;
END;

GO


CREATE   PROCEDURE dbo.sp_GetMentorSlots
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear NVARCHAR(20) = (SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'SchoolYear');
    DECLARE @Semester   NVARCHAR(50) = (SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'Semester');

    SELECT
        a.AvailabilityID, a.AvailableDate, a.StartTime, a.EndTime, a.SlotName,
        CASE
            WHEN EXISTS (SELECT 1 FROM dbo.SessionRequests sr2
                         WHERE sr2.AvailabilityID = a.AvailabilityID AND sr2.Status = 'Pending')
            THEN 'Pending' ELSE 'Open'
        END AS SlotStatus,
        CASE
            WHEN a.SlotName IS NULL THEN CAST(0 AS BIT)  -- legacy slot, predates checkpoints
            WHEN NOT EXISTS (
                SELECT 1 FROM dbo.CalendarEvents ce
                WHERE ce.EventType = 'Session Schedule' AND ce.SlotName = a.SlotName
                  AND ce.SchoolYear = @SchoolYear AND ce.Semester = @Semester
            ) THEN CAST(1 AS BIT)  -- Admin hasn't scheduled this checkpoint -- can't prove on-time
            WHEN EXISTS (
                SELECT 1 FROM dbo.CalendarEvents ce
                WHERE ce.EventType = 'Session Schedule' AND ce.SlotName = a.SlotName
                  AND ce.SchoolYear = @SchoolYear AND ce.Semester = @Semester
                  AND a.AvailableDate > ce.EndDate
            ) THEN CAST(1 AS BIT)
            ELSE CAST(0 AS BIT)
        END AS IsLate,
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
CREATE   PROCEDURE dbo.sp_GetOpenSlotsForMentee
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

-- Completed activities use SubmittedAt instead of CreatedAt; CreatedAt stays
-- the fallback for Scheduled/Cancelled or an un-submitted Completed session.

CREATE   PROCEDURE [dbo].[sp_GetRecentActivities]
    @Top INT = 10
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@Top)
        s.SessionID                                                       AS SessionID,
        u.FirstName + ' ' + u.LastName                                    AS MentorName,
        s.SessionDate,
        s.Status,
        s.SlotName,
        CASE WHEN pos.ProofID IS NOT NULL THEN 'Proof Uploaded'
             ELSE s.Status END                                            AS ActivityType,
        CASE WHEN pos.ProofID IS NOT NULL THEN pos.UploadedAt
             WHEN s.Status = 'Completed' THEN ISNULL(s.SubmittedAt, s.CreatedAt)
             ELSE s.CreatedAt END                                         AS ActivityDate,
        ISNULL(att.AttendeeCount, 0)                                      AS MenteeCount
    FROM   dbo.Sessions s
    INNER  JOIN dbo.Users u ON u.UserID = s.MentorID
    LEFT   JOIN dbo.ProofOfSession pos ON pos.SessionID = s.SessionID
    OUTER  APPLY (
        SELECT COUNT(*) AS AttendeeCount
        FROM   dbo.Attendance a
        WHERE  a.SessionID = s.SessionID AND a.IsPresent = 1
    ) att
    ORDER BY (CASE WHEN pos.ProofID IS NOT NULL THEN pos.UploadedAt
                   WHEN s.Status = 'Completed' THEN ISNULL(s.SubmittedAt, s.CreatedAt)
                   ELSE s.CreatedAt END) DESC;
END;

GO

-- add_slotname_to_request_history.sql
--
-- A mentee's "Request History" card (Schedule Session page) showed date,
-- time, and status for a past slot request, but never which checkpoint it
-- was for ("After Midterms" etc.) — Availability.SlotName was simply never
-- selected here, even though the posting/booking flow has carried it since
-- add_slotname_to_availability.sql. Same class of gap as everywhere else
-- this session that showed a make-up session without its checkpoint name.
CREATE   PROCEDURE dbo.sp_GetRequestHistoryForMentee
    @MenteeID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        sr.RequestID, sr.Status, sr.Purpose, sr.RequestedAt, sr.RespondedAt,
        u.FirstName + ' ' + u.LastName AS MentorName,
        a.AvailableDate, a.StartTime, a.EndTime, a.SlotName
    FROM   dbo.SessionRequests sr
    INNER  JOIN dbo.Availability a ON a.AvailabilityID = sr.AvailabilityID
    INNER  JOIN dbo.Users u        ON u.UserID         = a.MentorID
    WHERE  sr.MenteeID = @MenteeID
    ORDER  BY sr.RequestedAt DESC;
END;

GO

-- fix_dropout_excluded_from_attendance.sql
--
-- A dropped-out mentee (MenteeProfiles.IsDropOut = 1) still counted as an
-- "expected" attendee for their former mentor's sessions, and still showed
-- up to be scanned/checked off in the QR attendance flow -- their
-- MentorMentee assignment row stays IsActive = 1 (that flag tracks the
-- pairing itself, not program participation), so every mentee-counting
-- query that only checked IsActive = 1 kept including them.
--
-- Three places affected, all fixed here or in the matching frontend edit:
--   1. sp_GetSessionMentees -- the roster behind both the QR scanner's
--      "does this session already have attendance rows" check and the
--      Logsheet's mentee list.
--   2. sp_GetMentorSessions -- TotalAttendees ("N expected" pill on
--      session cards).
--   3. sessions.js's own fresh-roster path (used only when a session has
--      no Attendance rows yet at all, so sp_GetSessionMentees returns
--      nothing to react to) -- fixed separately in sessions.js.
--
-- A dropped-out mentee who already HAS an attendance record for a given
-- session (they attended before dropping out) keeps showing there --
-- this only stops them from being freshly offered for NEW attendance.

CREATE   PROCEDURE dbo.sp_GetSessionMentees
    @SessionID INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.AttendanceID,
        ue.UserID                                        AS MenteeID,
        ue.FirstName                                     AS MenteeFirstName,
        ue.LastName                                      AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')   AS SectionCode,
        mep.Course, mep.YearLevel,
        a.IsPresent, a.ScannedAt, a.AbsenceReason, a.MentorNotes, a.Remarks,
        ISNULL(mep.IsDropOut, 0)                         AS IsDropOut
    FROM   dbo.Sessions        s
    JOIN   dbo.MentorMentee    mm  ON mm.MentorID  = s.MentorID AND mm.IsActive = 1
    JOIN   dbo.Users           ue  ON ue.UserID    = mm.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = mm.MenteeID
    LEFT   JOIN dbo.Sections   sec ON sec.SectionID  = mep.SectionID
    LEFT   JOIN dbo.Attendance a   ON a.SessionID    = s.SessionID AND a.MenteeID = mm.MenteeID
    WHERE  s.SessionID = @SessionID
      AND  s.RequestID IS NULL
      AND  (
           s.SectionCode IS NULL
           OR COALESCE(sec.SectionCode, mep.Section) = s.SectionCode
      )
      -- Dropped-out mentee: only keep them if they already have an
      -- attendance record for this session (preserves history); never
      -- freshly offer them up to be scanned/checked going forward.
      AND  (a.AttendanceID IS NOT NULL OR ISNULL(mep.IsDropOut, 0) = 0)

    UNION ALL

    SELECT
        a.AttendanceID,
        ue.UserID                                        AS MenteeID,
        ue.FirstName                                     AS MenteeFirstName,
        ue.LastName                                      AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')   AS SectionCode,
        mep.Course, mep.YearLevel,
        a.IsPresent, a.ScannedAt, a.AbsenceReason, a.MentorNotes, a.Remarks,
        ISNULL(mep.IsDropOut, 0)                         AS IsDropOut
    FROM   dbo.Attendance      a
    JOIN   dbo.Sessions        s   ON s.SessionID  = a.SessionID AND s.SessionID = @SessionID
    JOIN   dbo.SessionRequests sr  ON sr.RequestID = s.RequestID
    JOIN   dbo.Users           ue  ON ue.UserID    = a.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = a.MenteeID
    LEFT   JOIN dbo.Sections   sec ON sec.SectionID  = mep.SectionID
    WHERE  a.MenteeID = sr.MenteeID
       OR  EXISTS (
           SELECT 1 FROM dbo.SessionRequests sr2
           WHERE  sr2.AvailabilityID = sr.AvailabilityID
             AND  sr2.MenteeID = a.MenteeID AND sr2.Status = 'Approved'
       )

    ORDER BY MenteeLastName, MenteeFirstName;
END;

GO


-- ── sp_GetSessionProofs (Admin Session Proofs list + mentor filter) ────
CREATE   PROCEDURE dbo.sp_GetSessionProofs
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: session proof rows — completed sessions only
    SELECT
        s.SessionID,
        s.SlotName,
        s.SessionDate,
        COALESCE(
            s.SectionCode,
            (
                SELECT CASE
                    WHEN COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section)) = 1
                    THEN MAX(COALESCE(sec2.SectionCode, mep2.Section))
                    ELSE NULL
                END
                FROM   dbo.Attendance      a2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = a2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  a2.SessionID = s.SessionID AND a2.IsPresent = 1
            )
        )                                                    AS SectionCode,
        COALESCE(sr.Purpose, s.Notes, 'Session')            AS Topic,
        u.UserID                                            AS MentorID,
        u.FirstName                                         AS MentorFirstName,
        u.LastName                                          AS MentorLastName,
        mp.School                                           AS MentorSchool,
        mp.Department                                       AS MentorDepartment,
        p.ProofID, p.FilePath, p.FileType, p.UploadedAt,
        CASE WHEN p.ProofID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasProof
    FROM   dbo.Sessions             s
    JOIN   dbo.Users                u  ON u.UserID     = s.MentorID
    LEFT   JOIN dbo.MentorProfiles  mp ON mp.UserID    = u.UserID
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath, FileType, UploadedAt,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.Status = 'Completed'
    ORDER  BY s.SessionDate DESC, u.LastName, u.FirstName;

    -- RS2: active mentors for filter dropdown
    SELECT DISTINCT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.School, mp.Department
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentor'
    ORDER  BY u.LastName, u.FirstName;
END;

GO


-- sp_GetSessionsForMentee RS2 (SessionRowDto) -- no GROUP BY, simple add.
CREATE   PROCEDURE [dbo].[sp_GetSessionsForMentee]
    @MentorID INT,
    @MenteeID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear NVARCHAR(20) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear');
    DECLARE @Semester   NVARCHAR(50) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester');

    DECLARE @SectionCode NVARCHAR(100);
    SELECT @SectionCode = COALESCE(sec.SectionCode, mep.Section)
    FROM   dbo.MenteeProfiles mep
    LEFT   JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
    WHERE  mep.UserID = @MenteeID;

    -- RS1: mentor info
    SELECT u.UserID AS MentorID, u.FirstName, u.LastName,
           mp.Department, mp.School, NULL AS Sections, NULL AS Courses
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS2: sessions scoped to current semester with correct numbering
    SELECT
        s.SessionID,
        CASE
            WHEN s.RequestID IS NOT NULL OR s.Status = 'Cancelled' THEN NULL
            ELSE (SELECT COUNT(*)
                  FROM dbo.Sessions s2
                  WHERE s2.MentorID   = s.MentorID
                    AND s2.SchoolYear = s.SchoolYear
                    AND s2.Semester   = s.Semester
                    AND s2.RequestID IS NULL
                    AND s2.Status    != 'Cancelled'
                    AND (s2.SessionDate < s.SessionDate
                         OR (s2.SessionDate = s.SessionDate AND s2.SessionID <= s.SessionID)))
        END AS SessionNumber,
        s.SessionDate,
        s.TimeEnd,
        s.Status                                                     AS SessionStatus,
        CASE WHEN s.RequestID IS NOT NULL THEN s.Notes
             ELSE COALESCE(s.Notes, 'Mentoring Session')
        END                                                          AS Topic,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             ELSE CAST(0 AS BIT)
        END                                                          AS IsMakeup,
        0 AS TotalAttendees, 0 AS PresentCount, 0 AS NotesFilledCount,
        NULL AS ProofFilePath, NULL AS ProofFileType, NULL AS Sections,
        s.QRCodeToken,
        s.SubmittedAt
    FROM   dbo.Sessions        s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    WHERE  s.MentorID   = @MentorID
      AND  s.SchoolYear = @SchoolYear
      AND  s.Semester   = @Semester
      AND  (s.SectionCode IS NULL OR s.SectionCode = @SectionCode)
    ORDER  BY s.SessionDate DESC;
END;

GO


-- ── sp_GetUserStats (dashboard TotalMentors/TotalMentees/session +
--    section counts/mentee status-tier distribution) ────────────────────
CREATE   PROCEDURE dbo.sp_GetUserStats
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
         WHERE u.IsActive = 1 AND u.Role = 'Mentor')                                        AS TotalMentors,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.IsActive = 1 AND u.Role = 'Mentee')                                        AS TotalMentees,
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

    -- RS2: per-mentor regular completed session counts + section count (current semester)
    SELECT u.UserID AS MentorID,
           ISNULL(sc.SessionCount, 0)  AS SessionCount,
           ISNULL(sn.SectionCount, 1)  AS SectionCount
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT   JOIN (
        SELECT MentorID, COUNT(*) AS SessionCount
        FROM   dbo.Sessions
        WHERE  Status     = 'Completed'
          AND  SchoolYear = @SchoolYear
          AND  Semester   = @Semester
          AND  RequestID  IS NULL
          AND  SectionCode IS NOT NULL
        GROUP  BY MentorID
    ) sc ON sc.MentorID = u.UserID
    LEFT   JOIN (
        SELECT mm.MentorID,
               COUNT(DISTINCT COALESCE(sec.SectionCode, mep.Section)) AS SectionCount
        FROM   dbo.MentorMentee    mm
        INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID
        LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
        WHERE  mm.IsActive = 1
          AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
        GROUP  BY mm.MentorID
    ) sn ON sn.MentorID = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = 'Mentor';

    -- RS3: mentee attendance status distribution — per mentee, only count
    -- sessions from THEIR OWN section (regular) or theirs specifically
    -- (approved makeup requests); previously counted every completed
    -- session of the mentor regardless of section, skewing the tier for
    -- any mentee whose mentor also handles another section.
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
        LEFT   JOIN dbo.Sections       msec ON msec.SectionID = mp.SectionID
        LEFT   JOIN dbo.Sessions        s  ON s.MentorID   = mm.MentorID
                                          AND s.Status     = 'Completed'
                                          AND s.SessionDate >= mm.AssignedDate
                                          AND (
                                              (s.RequestID IS NULL
                                               AND (s.SectionCode IS NULL
                                                    OR s.SectionCode = COALESCE(msec.SectionCode, mp.Section)))
                                              OR
                                              (s.RequestID IS NOT NULL
                                               AND EXISTS (
                                                   SELECT 1 FROM dbo.SessionRequests sr
                                                   WHERE  sr.RequestID = s.RequestID
                                                     AND  sr.MenteeID  = u.UserID
                                                     AND  sr.Status    = 'Approved'))
                                          )
        LEFT   JOIN dbo.Attendance     a  ON a.SessionID = s.SessionID AND a.MenteeID = u.UserID
        WHERE  u.IsActive = 1 AND u.Role = 'Mentee'
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







CREATE   PROCEDURE dbo.sp_RevertCheckpointOnMakeupAttendance
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


CREATE   PROCEDURE dbo.sp_ScanQRAttendance
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


-- ============================================================
-- sp_SendNotification
-- Set-based INSERT replaces C# loops � one round-trip regardless of user count.
-- Mode is determined by which optional param is non-NULL:
--   @MentorID   ? mentees assigned to that mentor
--   @Role       ? all active users with that role
--   neither     ? all active users
-- ============================================================
CREATE   PROCEDURE dbo.sp_SendNotification
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


-- New bookings also ignore legacy availability end times.
CREATE   PROCEDURE dbo.sp_SubmitSessionRequest
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




