-- ============================================================
-- Phase 1 of the FAITH mentor-ranking rubric work: structured
-- "Slot Name" on Calendar Events (Session Window / Submission
-- Deadline), so the system knows WHICH named mentoring checkpoint
-- (Before Prelims, After Midterms, ...) an event is for, instead
-- of relying on free-typed Title text. See project plan
-- "PHASE 1 of 3: Structured Session Slots in Calendar Events".
-- ============================================================
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

ALTER TABLE dbo.CalendarEvents ADD
    SlotName   NVARCHAR(50)  NULL,   -- e.g. "Before Prelims" — only set when
                                      -- EventType IN ('Session Window','Submission Deadline')
    SchoolYear NVARCHAR(20)  NULL,
    Semester   NVARCHAR(50)  NULL;
GO

-- Backfill existing rows with the currently-active period — best available
-- guess for pre-existing data, since nothing in the schema before this
-- recorded which semester an event belonged to.
UPDATE dbo.CalendarEvents
SET SchoolYear = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear'),
    Semester   = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester')
WHERE SchoolYear IS NULL;
GO

-- One event per (slot, type, period) — stops Admin from accidentally
-- creating two "Before Prelims" Session Windows in the same semester.
CREATE UNIQUE INDEX UQ_CalendarEvents_Slot
    ON dbo.CalendarEvents (SlotName, EventType, SchoolYear, Semester)
    WHERE SlotName IS NOT NULL;
GO

PRINT 'Done. CalendarEvents now has SlotName/SchoolYear/Semester.';
GO
