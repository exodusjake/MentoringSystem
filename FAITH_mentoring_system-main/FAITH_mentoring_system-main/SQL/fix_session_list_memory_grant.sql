-- Limit the session-list sort/aggregate memory grant. No result columns or filters change.
-- Prevent RESOURCE_SEMAPHORE waits on small-memory SQL Server instances.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @sql nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_GetMentorSessions'));
IF @sql IS NULL THROW 51000, 'Session procedure was not found.', 1;
IF CHARINDEX('MAX_GRANT_PERCENT', @sql) = 0
BEGIN
    IF CHARINDEX('ORDER  BY s.SessionDate DESC;', @sql) = 0
        THROW 51000, 'Unexpected session procedure definition; review before applying.', 1;
    SET @sql = REPLACE(@sql, 'ORDER  BY s.SessionDate DESC;', 'ORDER BY s.SessionDate DESC OPTION (MAX_GRANT_PERCENT = 1);');
    SET @sql = REPLACE(@sql, 'CREATE   PROCEDURE', 'ALTER PROCEDURE');
    SET @sql = REPLACE(@sql, 'CREATE OR ALTER PROCEDURE', 'ALTER PROCEDURE');
    SET @sql = REPLACE(@sql, 'CREATE PROCEDURE', 'ALTER PROCEDURE');
    EXEC sys.sp_executesql @sql;
END;
COMMIT;
