-- ============================================================
-- backfill_mentorprofiles_department_text.sql
--
-- Root cause: MentorProfiles carries the Department name in TWO
-- places -- DepartmentID (the real FK) and Department (a plain text
-- copy). Every read path in the system (sp_GetAttendanceOverview and
-- ~20 other stored procedures, plus User Management's own rendering)
-- reads the TEXT column directly rather than resolving it via
-- DepartmentID -> Departments.DepartmentName. ProfileService's
-- update path (PUT /Users/{id}, used by the Edit User modal) already
-- resolves and saves both together -- but AuthService.Register (used
-- by BOTH the Add User form and CSV Import, for every brand-new
-- account) only ever saved DepartmentID, never the text column. Fixed
-- at the source in AuthService.cs (RegisterMentorAsync/
-- RegisterMenteeAsync now resolve the name at registration time,
-- same as the update path) -- this migration is the one-time backfill
-- for every Mentor created before that fix, so the correction takes
-- effect without needing to re-save each one by hand via Edit User.
--
-- Scoped to MentorProfiles only -- MenteeProfiles legitimately leaves
-- DepartmentID/Department NULL by design (a Mentee is described by
-- Course, not Department; confirmed no real Mentee row has a
-- DepartmentID set at all).
-- ============================================================

SET NOCOUNT ON;

UPDATE mp
SET mp.Department = d.DepartmentName
FROM dbo.MentorProfiles mp
JOIN dbo.Departments    d ON d.DepartmentID = mp.DepartmentID
WHERE mp.DepartmentID IS NOT NULL
  AND (mp.Department IS NULL OR mp.Department <> d.DepartmentName);

DECLARE @Rows INT = @@ROWCOUNT;
PRINT 'Rows updated: ' + CAST(@Rows AS NVARCHAR(10));
