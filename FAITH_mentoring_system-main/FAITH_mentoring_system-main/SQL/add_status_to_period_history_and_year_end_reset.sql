-- add_status_to_period_history_and_year_end_reset.sql
--
-- Two additions, both only firing from SettingsService.UpdateAsync when
-- SchoolYear/Semester actually changes:
--
-- 1. AccountPeriodHistory gains WasAssigned/WasDropOut -- captured at the
--    exact moment of the snapshot (before anything below changes), so a
--    mentee viewed through a PAST School Year filter shows the status
--    they actually had THEN ("Assigned"), not whatever their status is
--    NOW ("Unassigned" once #2 below runs, or "Drop Out" if they later
--    left the program). Mentor/Admin/Head rows leave both NULL -- this
--    distinction only exists for Mentees.
--
-- 2. A genuine new School Year (not just a Semester change within the
--    same year -- mentoring is a one-year commitment, so a Semester
--    switch alone must NOT touch anyone's assignment) deactivates every
--    currently-active MentorMentee row. This is the exact same UPDATE
--    already used for reassignment (sp_AssignMentor) -- not a delete, not
--    a new flag. Every mentee becomes "Unassigned" (an existing status,
--    already distinct from "Drop Out") until next year's assignments are
--    made. Real Drop Out records are completely untouched.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.AccountPeriodHistory') AND name = 'WasAssigned'
)
BEGIN
    ALTER TABLE dbo.AccountPeriodHistory ADD WasAssigned BIT NULL;
END

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.AccountPeriodHistory') AND name = 'WasDropOut'
)
BEGIN
    ALTER TABLE dbo.AccountPeriodHistory ADD WasDropOut BIT NULL;
END
