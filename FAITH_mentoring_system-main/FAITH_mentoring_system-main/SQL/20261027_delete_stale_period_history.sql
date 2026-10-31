-- 20261027_delete_stale_period_history.sql
--
-- Removes the leftover AccountPeriodHistory rows tagged 2025-2026. They were created by test changes to the school
-- year setting; the real current school year is 2026-2027 and there is no genuine earlier period to show in the
-- School Year filters. Only rows with SchoolYear = '2025-2026' are removed. Nothing else is touched.
--
-- Nothing is lost: the rows are first copied to dbo.AccountPeriodHistory_Archive_20261027, and the delete only
-- commits if the copy is complete and every other row is still in place. Otherwise it rolls back.
-- To bring the rows back later:  INSERT INTO dbo.AccountPeriodHistory (UserID, SchoolYear, Semester, RecordedAt, WasAssigned, WasDropOut)
--                                SELECT UserID, SchoolYear, Semester, RecordedAt, WasAssigned, WasDropOut FROM dbo.AccountPeriodHistory_Archive_20261027;

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '--- BEFORE ---';
SELECT SchoolYear, Semester, COUNT(*) AS Rws FROM dbo.AccountPeriodHistory GROUP BY SchoolYear, Semester ORDER BY 1, 2;

DECLARE @Total INT = (SELECT COUNT(*) FROM dbo.AccountPeriodHistory);
DECLARE @Old   INT = (SELECT COUNT(*) FROM dbo.AccountPeriodHistory WHERE SchoolYear = N'2025-2026');
DECLARE @Keep  INT = @Total - @Old;

BEGIN TRANSACTION;

-- 1) Keep a copy of every row that will be removed.
IF OBJECT_ID('dbo.AccountPeriodHistory_Archive_20261027') IS NOT NULL
    THROW 51000, 'Archive table already exists; stop and check it before running this again.', 1;
SELECT * INTO dbo.AccountPeriodHistory_Archive_20261027
FROM dbo.AccountPeriodHistory WHERE SchoolYear = N'2025-2026';
DECLARE @Archived INT = @@ROWCOUNT;

-- 2) Remove them from the live table.
DELETE FROM dbo.AccountPeriodHistory WHERE SchoolYear = N'2025-2026';
DECLARE @Deleted INT = @@ROWCOUNT;

PRINT '--- AFTER ---';
SELECT SchoolYear, Semester, COUNT(*) AS Rws FROM dbo.AccountPeriodHistory GROUP BY SchoolYear, Semester ORDER BY 1, 2;
SELECT @Old AS RowsToRemove, @Archived AS RowsArchived, @Deleted AS RowsDeleted,
       @Keep AS RowsExpectedToRemain, (SELECT COUNT(*) FROM dbo.AccountPeriodHistory) AS RowsRemaining;

IF @Archived = @Old AND @Deleted = @Old
   AND (SELECT COUNT(*) FROM dbo.AccountPeriodHistory) = @Keep
   AND (SELECT COUNT(*) FROM dbo.AccountPeriodHistory_Archive_20261027) = @Old
   AND NOT EXISTS (SELECT 1 FROM dbo.AccountPeriodHistory WHERE SchoolYear = N'2025-2026')
BEGIN COMMIT TRANSACTION; PRINT 'RESULT: COMMITTED'; END
ELSE BEGIN ROLLBACK TRANSACTION; PRINT 'RESULT: ROLLED BACK - a check failed, nothing was changed'; END
