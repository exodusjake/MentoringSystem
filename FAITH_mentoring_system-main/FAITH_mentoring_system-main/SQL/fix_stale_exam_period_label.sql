-- One-off cleanup: an "Exam Period" row created before that activity type
-- was renamed to "Period" was left with the old EventType string, which no
-- longer matches any TYPE_CONFIG key in the frontend (wrong badge text,
-- falls back to the default blue color instead of Period's orange).
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

UPDATE dbo.CalendarEvents SET EventType = 'Period' WHERE EventType = 'Exam Period';
GO

PRINT 'Done.';
GO
