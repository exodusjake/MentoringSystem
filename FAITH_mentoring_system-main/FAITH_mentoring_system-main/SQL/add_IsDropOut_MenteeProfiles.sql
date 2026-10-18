-- Add IsDropOut flag to MenteeProfiles
-- Allows admins (and eventually mentors) to mark a mentee as having dropped out of the program.
-- Default 0 = active; 1 = dropped out.
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'MenteeProfiles' AND COLUMN_NAME = 'IsDropOut'
)
BEGIN
    ALTER TABLE MenteeProfiles ADD IsDropOut BIT NOT NULL DEFAULT 0;
    PRINT 'Done: IsDropOut column added to MenteeProfiles.';
END
ELSE
BEGIN
    PRINT 'Skipped: IsDropOut column already exists.';
END
