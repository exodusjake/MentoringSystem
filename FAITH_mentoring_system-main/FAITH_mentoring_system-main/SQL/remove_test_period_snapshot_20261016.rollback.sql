-- Restores the rows removed by remove_test_period_snapshot_20261016.sql from its backup table.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.AccountPeriodHistory_Backup_20261016', 'U') IS NULL
BEGIN
    RAISERROR('Backup table not found. Nothing was changed.', 16, 1);
    RETURN;
END

BEGIN TRANSACTION;
SET IDENTITY_INSERT dbo.AccountPeriodHistory ON;
INSERT INTO dbo.AccountPeriodHistory (HistoryID, UserID, SchoolYear, Semester, RecordedAt, WasAssigned, WasDropOut)
SELECT b.HistoryID, b.UserID, b.SchoolYear, b.Semester, b.RecordedAt, b.WasAssigned, b.WasDropOut
FROM dbo.AccountPeriodHistory_Backup_20261016 b
WHERE NOT EXISTS (SELECT 1 FROM dbo.AccountPeriodHistory h WHERE h.HistoryID = b.HistoryID);
SELECT @@ROWCOUNT AS RowsRestored;
SET IDENTITY_INSERT dbo.AccountPeriodHistory OFF;
COMMIT TRANSACTION;
