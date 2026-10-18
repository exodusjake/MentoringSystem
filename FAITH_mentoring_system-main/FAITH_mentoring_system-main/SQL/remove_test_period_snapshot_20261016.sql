-- Removes the leftover test period snapshot "1st Semester, SY 2027-2028"
-- (recorded 2026-09-06 while School Year was switched for testing, then switched back).
-- It has no sessions or calendar events; it only shows up as a fake past semester
-- in the School Year filter. Nothing else is touched.
--
-- Step 1: run as is (@Apply = 0). It shows the rows and rolls back; nothing is saved.
-- Step 2: change @Apply to 1 and run again. The rows are copied to
--         dbo.AccountPeriodHistory_Backup_20261016 first, then removed.
-- Rollback: SQL/remove_test_period_snapshot_20261016.rollback.sql
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
DECLARE @Apply BIT = 0;

DECLARE @SchoolYear NVARCHAR(20) = N'2027-2028', @Semester NVARCHAR(50) = N'1st Semester';
DECLARE @Expected INT = 2, @Found INT, @Removed INT;

-- Never remove the current period.
IF EXISTS (SELECT 1 FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear' AND SettingValue = @SchoolYear)
BEGIN
    RAISERROR('2027-2028 is the current School Year in System Settings. Nothing was changed.', 16, 1);
    RETURN;
END

SELECT h.HistoryID, h.UserID, u.FirstName + ' ' + u.LastName AS Account, u.Role,
       h.SchoolYear, h.Semester, h.RecordedAt, h.WasAssigned, h.WasDropOut
FROM dbo.AccountPeriodHistory h LEFT JOIN dbo.Users u ON u.UserID = h.UserID
WHERE h.SchoolYear = @SchoolYear AND h.Semester = @Semester;

SELECT @Found = COUNT(*) FROM dbo.AccountPeriodHistory WHERE SchoolYear = @SchoolYear AND Semester = @Semester;
IF @Found <> @Expected
BEGIN
    RAISERROR('Expected %d rows but found %d. Nothing was changed.', 16, 1, @Expected, @Found);
    RETURN;
END

BEGIN TRANSACTION;

IF OBJECT_ID('dbo.AccountPeriodHistory_Backup_20261016', 'U') IS NULL
    SELECT * INTO dbo.AccountPeriodHistory_Backup_20261016
    FROM dbo.AccountPeriodHistory WHERE SchoolYear = @SchoolYear AND Semester = @Semester;

DELETE FROM dbo.AccountPeriodHistory WHERE SchoolYear = @SchoolYear AND Semester = @Semester;
SET @Removed = @@ROWCOUNT;

SELECT @Removed AS RowsRemoved,
       (SELECT COUNT(*) FROM dbo.AccountPeriodHistory_Backup_20261016) AS RowsInBackup,
       (SELECT COUNT(*) FROM dbo.AccountPeriodHistory WHERE SchoolYear = @SchoolYear AND Semester = @Semester) AS RowsLeft;

IF @Apply = 1
BEGIN
    COMMIT TRANSACTION;
    PRINT 'APPLIED: test snapshot removed; backup kept in dbo.AccountPeriodHistory_Backup_20261016.';
END
ELSE
BEGIN
    ROLLBACK TRANSACTION;
    PRINT 'PREVIEW ONLY: nothing was saved. Set @Apply = 1 to apply.';
END
