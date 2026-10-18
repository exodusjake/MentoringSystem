-- ============================================================
-- Follow-up to SQL/add_calendar_event_slots.sql: "Event Type"
-- (Orientation/Session Window/Exam Period/Submission Deadline/
-- Evaluation) is replaced by exactly two activity kinds —
-- "Session Schedule" (one of the fixed MentoringSlots, with a
-- Session Window AND a Submission Deadline captured together in
-- one row) and "Evaluation" (unchanged). See project plan
-- "PHASE 1 (revised): Session Schedule replaces Event Type in
-- Calendar Events".
-- ============================================================
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

ALTER TABLE dbo.CalendarEvents ADD DeadlineDate DATETIME NULL;
GO

-- The 5 existing rows are confirmed placeholder/seed content ("Mentoring
-- Program Orientation", "Mentor Training and Development", "Mentee
-- Development Workshop", "Mentoring Program Evaluation", "Evaluation
-- Deadline") tagged with EventType values that no longer exist as
-- categories — removed rather than left as orphaned legacy rows.
DELETE FROM dbo.CalendarEvents WHERE EventID IN (16, 17, 18, 19, 20);
GO

PRINT 'Done. CalendarEvents now has DeadlineDate; placeholder rows removed.';
GO
