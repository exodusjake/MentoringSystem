-- ============================================================
-- fix_mentormentee_unique_constraint.sql
--
-- UQ_MentorMentee enforces a unique (MentorID, MenteeID) pair across
-- EVERY row in the table, active or not. MentorMentee is soft-deleted
-- (IsActive = 0 on reassignment/removal, never a real DELETE), so once
-- a mentee has ever been assigned to a given mentor, that exact pair
-- can never be inserted again — reassigning them BACK to that same
-- mentor later throws a 500 (UNIQUE KEY constraint violation), whether
-- done via the Assignments tab's Reassign action or via CSV re-import.
--
-- Fix: replace the constraint with a filtered unique index that only
-- enforces uniqueness among currently-ACTIVE assignments, matching how
-- every other soft-delete pattern in this schema already behaves.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_MentorMentee' AND parent_object_id = OBJECT_ID('dbo.MentorMentee'))
BEGIN
    ALTER TABLE dbo.MentorMentee DROP CONSTRAINT UQ_MentorMentee;
END
GO

-- Filtered indexes require QUOTED_IDENTIFIER ON for the session creating
-- them, which sqlcmd doesn't set by default.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_MentorMentee_Active' AND object_id = OBJECT_ID('dbo.MentorMentee'))
BEGIN
    CREATE UNIQUE INDEX UQ_MentorMentee_Active
        ON dbo.MentorMentee (MentorID, MenteeID)
        WHERE IsActive = 1;
END
GO

PRINT 'Done. UQ_MentorMentee replaced with a filtered unique index scoped to active assignments only.';
