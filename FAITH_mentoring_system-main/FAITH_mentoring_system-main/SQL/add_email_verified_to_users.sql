-- Email verification on first login. NULL = the user has not yet confirmed
-- their email with the emailed code; the first successful verification sets
-- this, and later logins skip the code. Accounts that already exist are
-- treated as verified so current users aren't suddenly asked for a code.
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'EmailVerifiedAt'
)
BEGIN
    ALTER TABLE Users ADD EmailVerifiedAt DATETIME2 NULL;
END
GO

UPDATE Users SET EmailVerifiedAt = GETDATE() WHERE EmailVerifiedAt IS NULL AND CreatedAt < GETDATE();
GO
