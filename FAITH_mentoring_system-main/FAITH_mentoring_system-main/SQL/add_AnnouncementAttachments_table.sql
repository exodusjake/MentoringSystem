-- AnnouncementAttachments table
CREATE TABLE AnnouncementAttachments (
    AttachmentID   INT IDENTITY(1,1) PRIMARY KEY,
    AnnouncementID INT           NOT NULL,
    FileName       NVARCHAR(255) NOT NULL,
    FilePath       NVARCHAR(500) NOT NULL,
    FileType       NVARCHAR(50)  NOT NULL DEFAULT 'document',
    FileSize       BIGINT        NOT NULL DEFAULT 0,
    UploadedAt     DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_AnnAttach_Announcement
        FOREIGN KEY (AnnouncementID) REFERENCES Announcements(AnnouncementID)
        ON DELETE CASCADE
);
