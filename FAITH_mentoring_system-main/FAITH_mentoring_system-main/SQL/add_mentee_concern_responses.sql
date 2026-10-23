-- Adds the response side of "flag a mentee": a concern stays Open (red on the mentor's card, red in the Admin/Head bell)
-- until an Admin or Head Admin responds. The mentor is then notified and sees the response.
-- Run after add_mentee_concerns.sql. Safe to run more than once. Run it BEFORE deploying the matching API build.
--   Status               'Open' until someone responds, then 'Responded'
--   ResponseMessage      what the Admin/Head wrote
--   RespondedByUserID    who responded
--   RespondedAt          when
--   MentorSeenResponseAt when the mentor opened the response (NULL = the mentor has not seen it yet)
-- MenteeConcernReads (per-user read state) is no longer used by the app; it is left in place and can be dropped later.

IF COL_LENGTH('dbo.MenteeConcerns', 'Status') IS NULL
    ALTER TABLE dbo.MenteeConcerns ADD Status NVARCHAR(12) NOT NULL CONSTRAINT DF_MenteeConcerns_Status DEFAULT 'Open';
GO
IF COL_LENGTH('dbo.MenteeConcerns', 'ResponseMessage') IS NULL
    ALTER TABLE dbo.MenteeConcerns ADD ResponseMessage NVARCHAR(1000) NULL;
GO
IF COL_LENGTH('dbo.MenteeConcerns', 'RespondedByUserID') IS NULL
    ALTER TABLE dbo.MenteeConcerns ADD RespondedByUserID INT NULL;
GO
IF COL_LENGTH('dbo.MenteeConcerns', 'RespondedAt') IS NULL
    ALTER TABLE dbo.MenteeConcerns ADD RespondedAt DATETIMEOFFSET NULL;
GO
IF COL_LENGTH('dbo.MenteeConcerns', 'MentorSeenResponseAt') IS NULL
    ALTER TABLE dbo.MenteeConcerns ADD MentorSeenResponseAt DATETIMEOFFSET NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MenteeConcerns_Status')
    ALTER TABLE dbo.MenteeConcerns ADD CONSTRAINT CK_MenteeConcerns_Status CHECK (Status IN ('Open', 'Responded'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MenteeConcerns_RespondedBy')
    ALTER TABLE dbo.MenteeConcerns ADD CONSTRAINT FK_MenteeConcerns_RespondedBy FOREIGN KEY (RespondedByUserID) REFERENCES dbo.Users(UserID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeConcerns_Mentor_Status' AND object_id = OBJECT_ID('dbo.MenteeConcerns'))
    CREATE INDEX IX_MenteeConcerns_Mentor_Status ON dbo.MenteeConcerns (MentorID, Status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeConcerns_Status' AND object_id = OBJECT_ID('dbo.MenteeConcerns'))
    CREATE INDEX IX_MenteeConcerns_Status ON dbo.MenteeConcerns (Status, CreatedAt DESC);
GO

-- Rollback (loses responses): drop the two indexes and the check/foreign-key constraints, then the five columns.
