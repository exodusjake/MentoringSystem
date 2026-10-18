-- LOCAL REVIEW/TEST ONLY. No existing profile/session/log rows are converted.
-- Explicit course scope prevents interpreting legacy SectionCode as CourseCode.
-- Production execution requires separate approval and live-definition verification.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.SessionCourseScopes','U') IS NULL
CREATE TABLE dbo.SessionCourseScopes(
    SessionID int NOT NULL,
    School nvarchar(100) NOT NULL,
    CourseCode nvarchar(100) NOT NULL,
    Origin nvarchar(16) NOT NULL,
    CONSTRAINT PK_SessionCourseScopes PRIMARY KEY(SessionID,School,CourseCode),
    CONSTRAINT FK_SessionCourseScopes_Sessions FOREIGN KEY(SessionID) REFERENCES dbo.Sessions(SessionID),
    CONSTRAINT CK_SessionCourseScopes_Origin CHECK(Origin IN ('Regular','Makeup'))
);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.SessionCourseScopes') AND name='UX_SessionCourseScopes_Regular')
CREATE UNIQUE INDEX UX_SessionCourseScopes_Regular ON dbo.SessionCourseScopes(SessionID) WHERE Origin='Regular';
IF OBJECT_ID('dbo.CourseCheckpointLogs','U') IS NULL
CREATE TABLE dbo.CourseCheckpointLogs(
    MentorID int NOT NULL, SchoolYear nvarchar(20) NOT NULL, Semester nvarchar(50) NOT NULL,
    SlotName nvarchar(50) NOT NULL, School nvarchar(100) NOT NULL, CourseCode nvarchar(100) NOT NULL,
    LogStatus nvarchar(20) NOT NULL, SubmittedAt datetime2 NULL, NeedsUpdate bit NOT NULL DEFAULT 0,
    CONSTRAINT PK_CourseCheckpointLogs PRIMARY KEY(MentorID,SchoolYear,Semester,SlotName,School,CourseCode)
);
IF OBJECT_ID('dbo.SessionCourseMembers','U') IS NULL
CREATE TABLE dbo.SessionCourseMembers(
    SessionID int NOT NULL,MenteeID int NOT NULL,School nvarchar(100) NOT NULL,CourseCode nvarchar(100) NOT NULL,
    CONSTRAINT PK_SessionCourseMembers PRIMARY KEY(SessionID,MenteeID),
    CONSTRAINT FK_SessionCourseMembers_Sessions FOREIGN KEY(SessionID) REFERENCES dbo.Sessions(SessionID),
    CONSTRAINT FK_SessionCourseMembers_Scope FOREIGN KEY(SessionID,School,CourseCode) REFERENCES dbo.SessionCourseScopes(SessionID,School,CourseCode)
);
COMMIT;
-- Rollback: revert application first; retain these tables if any new records exist.
-- Never DROP populated scope/log tables or merge them into historical CheckpointLogs.
