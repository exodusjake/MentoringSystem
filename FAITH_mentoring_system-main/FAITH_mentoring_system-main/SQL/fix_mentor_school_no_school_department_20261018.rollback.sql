-- Restores the school values cleared by fix_mentor_school_no_school_department_20261018.APPLY.sql.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.MentorProfiles_SchoolFix_Backup_20261018', 'U') IS NULL
BEGIN
    RAISERROR('Backup table not found. Nothing was changed.', 16, 1);
    RETURN;
END

BEGIN TRANSACTION;
UPDATE mp SET School = b.School
FROM dbo.MentorProfiles mp
JOIN dbo.MentorProfiles_SchoolFix_Backup_20261018 b ON b.UserID = mp.UserID;
SELECT @@ROWCOUNT AS RowsRestored;
COMMIT TRANSACTION;
