IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'MentorPersonalEvents' AND COLUMN_NAME = 'EndDate'
)
BEGIN
    ALTER TABLE MentorPersonalEvents ADD EndDate DATETIME NULL;
    PRINT 'Done: EndDate column added to MentorPersonalEvents.';
END
ELSE
BEGIN
    PRINT 'Skipped: EndDate column already exists.';
END
