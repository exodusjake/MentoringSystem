-- 20261027_fix_school_year_typo.sql
--
-- The current school year was typed as 2025-2026 by mistake; it is 2026-2027. This relabels EVERY school year value
-- from 2025-2026 to 2026-2027 so the system carries on as the same period (no new school year, no history snapshot,
-- no mentor-mentee pairings ended, because it does not go through the System Settings page).
--
-- What it changes:
--   * SystemSettings: the SchoolYear setting.
--   * Every table with a column named SchoolYear (found automatically, e.g. Sessions, CalendarEvents, ...).
--   * AccountPeriodHistory rows are relabeled too, except where the user already has a row for 2026-2027 with the
--     same semester (the table allows one row per user, school year and semester); those are listed and left alone.
-- The Semester is NOT touched.
--
-- HOW TO RUN (sqlcmd or SSMS, connected to the AstraMentoring database):
--   1. Take a backup first (database backup or RDS snapshot).
--   2. Run this whole file. It starts a transaction and leaves it OPEN, then prints the counts.
--   3. Check the counts. Then type   COMMIT TRANSACTION;   to keep the change, or   ROLLBACK TRANSACTION;   to undo it.
--      (While it is open the tables are locked, so decide soon.)

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Old NVARCHAR(20) = N'2025-2026', @New NVARCHAR(20) = N'2026-2027';

PRINT '--- BEFORE ---';
SELECT SettingKey, SettingValue FROM dbo.SystemSettings WHERE SettingKey IN ('SchoolYear','Semester');

IF OBJECT_ID('tempdb..#Report') IS NOT NULL DROP TABLE #Report;
CREATE TABLE #Report (TableName SYSNAME, RowsWithOld INT, RowsChanged INT, Note NVARCHAR(200) NULL);

BEGIN TRANSACTION;

-- 1) The setting itself.
UPDATE dbo.SystemSettings SET SettingValue = @New, UpdatedAt = GETDATE()
WHERE SettingKey = 'SchoolYear' AND SettingValue = @Old;
INSERT #Report VALUES ('SystemSettings (SchoolYear)', @@ROWCOUNT, @@ROWCOUNT, NULL);

-- 2) Every table that has a SchoolYear column.
DECLARE @t SYSNAME, @sql NVARCHAR(MAX), @before INT, @after INT;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR
    SELECT QUOTENAME(s.name) + '.' + QUOTENAME(t.name)
    FROM sys.columns col
    JOIN sys.tables  t ON t.object_id = col.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE col.name = 'SchoolYear' AND t.name <> 'AccountPeriodHistory';
OPEN c; FETCH NEXT FROM c INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'SELECT @n = COUNT(*) FROM ' + @t + N' WHERE SchoolYear = @o';
    EXEC sp_executesql @sql, N'@o NVARCHAR(20), @n INT OUTPUT', @o = @Old, @n = @before OUTPUT;
    SET @sql = N'UPDATE ' + @t + N' SET SchoolYear = @nw WHERE SchoolYear = @o';
    EXEC sp_executesql @sql, N'@o NVARCHAR(20), @nw NVARCHAR(20)', @o = @Old, @nw = @New;
    INSERT #Report VALUES (@t, @before, @@ROWCOUNT, NULL);
    FETCH NEXT FROM c INTO @t;
END
CLOSE c; DEALLOCATE c;

-- 3) Period history: relabel unless it would duplicate an existing 2026-2027 row for the same user and semester.
IF OBJECT_ID('dbo.AccountPeriodHistory') IS NOT NULL
BEGIN
    DECLARE @h_old INT = (SELECT COUNT(*) FROM dbo.AccountPeriodHistory WHERE SchoolYear = @Old);
    UPDATE h SET h.SchoolYear = @New
    FROM dbo.AccountPeriodHistory h
    WHERE h.SchoolYear = @Old
      AND NOT EXISTS (SELECT 1 FROM dbo.AccountPeriodHistory x
                      WHERE x.UserID = h.UserID AND x.Semester = h.Semester AND x.SchoolYear = @New);
    DECLARE @h_done INT = @@ROWCOUNT;
    INSERT #Report VALUES ('AccountPeriodHistory', @h_old, @h_done,
        CASE WHEN @h_old > @h_done THEN CONCAT(@h_old - @h_done, ' row(s) left as 2025-2026: a 2026-2027 row already exists for that user and semester') END);
END

PRINT '--- AFTER (inside the open transaction) ---';
SELECT SettingKey, SettingValue FROM dbo.SystemSettings WHERE SettingKey IN ('SchoolYear','Semester');
SELECT TableName, RowsWithOld AS [Rows that said 2025-2026], RowsChanged AS [Rows changed], Note FROM #Report ORDER BY TableName;
SELECT 'Active mentor pairings (should be unchanged)' AS [Check], COUNT(*) AS [Count] FROM dbo.MentorMentee WHERE IsActive = 1;

PRINT '>>> The transaction is still OPEN. Type COMMIT TRANSACTION; to keep it, or ROLLBACK TRANSACTION; to undo it.';
