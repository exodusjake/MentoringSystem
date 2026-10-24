-- Mentor-reported concerns about a mentee ("flag a mentee"). A mentor sends one from My Mentees; every Admin and
-- Head Admin sees it in the bell at the top right of their portal.
--   MenteeConcerns      one row per concern the mentor submitted
--   MenteeConcernReads  which Admin/Head user has opened which concern (no row = unread for that user)
-- Safe to run more than once. Run it on the database BEFORE deploying the matching API build.

IF OBJECT_ID('dbo.MenteeConcerns', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MenteeConcerns (
        ConcernID  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MenteeConcerns PRIMARY KEY,
        MentorID   INT NOT NULL,
        MenteeID   INT NOT NULL,
        Category   NVARCHAR(40)  NOT NULL,
        Message    NVARCHAR(1000) NOT NULL,
        CreatedAt  DATETIMEOFFSET NOT NULL CONSTRAINT DF_MenteeConcerns_CreatedAt DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT FK_MenteeConcerns_Mentor FOREIGN KEY (MentorID) REFERENCES dbo.Users(UserID),
        CONSTRAINT FK_MenteeConcerns_Mentee FOREIGN KEY (MenteeID) REFERENCES dbo.Users(UserID)
    );
    CREATE INDEX IX_MenteeConcerns_CreatedAt ON dbo.MenteeConcerns (CreatedAt DESC);
    CREATE INDEX IX_MenteeConcerns_Mentee ON dbo.MenteeConcerns (MenteeID);
END
GO

IF OBJECT_ID('dbo.MenteeConcernReads', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MenteeConcernReads (
        ConcernID INT NOT NULL,
        UserID    INT NOT NULL,
        ReadAt    DATETIMEOFFSET NOT NULL CONSTRAINT DF_MenteeConcernReads_ReadAt DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT PK_MenteeConcernReads PRIMARY KEY (ConcernID, UserID),
        CONSTRAINT FK_MenteeConcernReads_Concern FOREIGN KEY (ConcernID) REFERENCES dbo.MenteeConcerns(ConcernID) ON DELETE CASCADE,
        CONSTRAINT FK_MenteeConcernReads_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID)
    );
END
GO

-- Rollback (only if nothing has been reported yet):
--   DROP TABLE dbo.MenteeConcernReads; DROP TABLE dbo.MenteeConcerns;
