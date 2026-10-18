IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CalendarEvents' AND COLUMN_NAME = 'IsPublished'
)
BEGIN
    ALTER TABLE CalendarEvents ADD IsPublished BIT NOT NULL DEFAULT 0;
    PRINT 'Done: IsPublished column added to CalendarEvents.';
END
ELSE
BEGIN
    PRINT 'Skipped: IsPublished column already exists.';
END
