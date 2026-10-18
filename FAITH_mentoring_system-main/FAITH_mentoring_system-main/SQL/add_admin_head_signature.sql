-- Admin and Head have no dedicated profile table (unlike Mentor/Mentee's
-- MentorProfiles/MenteeProfiles) — their signature lives directly on Users.
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'SignatureFilePath'
)
    ALTER TABLE Users ADD SignatureFilePath NVARCHAR(500) NULL;
GO
