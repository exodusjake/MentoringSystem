-- Clears the stored school of every mentor whose department has no school (e.g. SAS),
-- so they read as "School Department" everywhere. Only MentorProfiles.School changes.
-- Run fix_mentor_school_no_school_department_20261018.readonly.sql first.
-- @Apply = 0 previews inside a transaction and rolls back; set @Apply = 1 to save.
-- Rollback: SQL/fix_mentor_school_no_school_department_20261018.rollback.sql
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
DECLARE @Apply BIT = 0;
DECLARE @Fixed INT;

BEGIN TRANSACTION;

IF OBJECT_ID('dbo.MentorProfiles_SchoolFix_Backup_20261018', 'U') IS NULL
    SELECT mp.UserID, mp.School, mp.DepartmentID, SYSUTCDATETIME() AS BackedUpAt
    INTO dbo.MentorProfiles_SchoolFix_Backup_20261018
    FROM dbo.MentorProfiles mp
    JOIN dbo.Departments d ON d.DepartmentID = mp.DepartmentID
    WHERE NULLIF(LTRIM(RTRIM(d.School)), '') IS NULL
      AND mp.School IS NOT NULL;

UPDATE mp SET School = NULL
FROM dbo.MentorProfiles mp
JOIN dbo.Departments d ON d.DepartmentID = mp.DepartmentID
WHERE NULLIF(LTRIM(RTRIM(d.School)), '') IS NULL
  AND mp.School IS NOT NULL;
SET @Fixed = @@ROWCOUNT;

SELECT @Fixed AS RowsFixed,
       (SELECT COUNT(*) FROM dbo.MentorProfiles_SchoolFix_Backup_20261018) AS RowsInBackup,
       (SELECT COUNT(*) FROM dbo.MentorProfiles mp JOIN dbo.Departments d ON d.DepartmentID = mp.DepartmentID
         WHERE NULLIF(LTRIM(RTRIM(d.School)), '') IS NULL AND mp.School IS NOT NULL) AS RowsLeft;

IF @Apply = 1
BEGIN
    COMMIT TRANSACTION;
    PRINT 'APPLIED: school cleared for mentors in no-school departments; backup in dbo.MentorProfiles_SchoolFix_Backup_20261018.';
END
ELSE
BEGIN
    ROLLBACK TRANSACTION;
    PRINT 'PREVIEW ONLY: nothing was saved. Set @Apply = 1 to apply.';
END
