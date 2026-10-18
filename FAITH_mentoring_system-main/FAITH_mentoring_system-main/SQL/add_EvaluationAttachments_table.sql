-- Run this in SSMS against AstraMentoring database
CREATE TABLE EvaluationAttachments (
    AttachmentID  INT IDENTITY(1,1) PRIMARY KEY,
    LinkID        INT NOT NULL,
    FileName      NVARCHAR(255) NOT NULL,
    FilePath      NVARCHAR(500) NOT NULL,
    FileType      NVARCHAR(50)  NOT NULL DEFAULT 'document',
    FileSize      BIGINT        NOT NULL DEFAULT 0,
    UploadedAt    DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_EvalAttach_Link FOREIGN KEY (LinkID)
        REFERENCES EvaluationLinks(LinkID) ON DELETE CASCADE
);
