-- READ-ONLY: live table row counts and foreign keys (planning the activity-data reset).
SET NOCOUNT ON;
SELECT t.name AS TableName, SUM(p.rows) AS RowCnt
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
GROUP BY t.name
ORDER BY t.name;

SELECT OBJECT_NAME(fk.parent_object_id) AS ChildTable, OBJECT_NAME(fk.referenced_object_id) AS ParentTable
FROM sys.foreign_keys fk
ORDER BY ParentTable, ChildTable;

SELECT SettingKey, SettingValue FROM dbo.SystemSettings ORDER BY SettingKey;

SELECT EventType, COUNT(*) AS Events FROM dbo.CalendarEvents GROUP BY EventType;
