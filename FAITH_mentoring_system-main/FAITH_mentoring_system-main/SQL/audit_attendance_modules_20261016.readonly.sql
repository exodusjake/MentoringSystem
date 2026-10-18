-- READ-ONLY: every database module that reads attendance, and the full live text of the shared rule.
SET NOCOUNT ON;

-- Modules that read the Attendance table or the shared function
SELECT o.name, o.type_desc,
       CASE WHEN m.definition LIKE '%fn_MenteeCheckpointAttendance%' THEN 1 ELSE 0 END AS UsesSharedFn,
       CASE WHEN m.definition LIKE '%Attendance a%' OR m.definition LIKE '%dbo.Attendance%' OR m.definition LIKE '%JOIN Attendance%' THEN 1 ELSE 0 END AS ReadsAttendance
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE m.definition LIKE '%Attendance%'
ORDER BY o.name;

-- Full text of the shared function, in 200-character pieces (line breaks shown as ~~)
SELECT t.n AS Piece,
       REPLACE(REPLACE(SUBSTRING(d.def, (t.n - 1) * 200 + 1, 200), CHAR(13), ''), CHAR(10), '~~') AS Txt
FROM (SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.fn_MenteeCheckpointAttendance')) AS def) d
CROSS JOIN (SELECT TOP (300) ROW_NUMBER() OVER (ORDER BY object_id) AS n FROM sys.all_objects) t
WHERE (t.n - 1) * 200 < LEN(d.def)
ORDER BY t.n;

-- MentorMentee columns on live (assignment history support)
SELECT c.name, ty.name AS type_name FROM sys.columns c JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.MentorMentee') ORDER BY c.column_id;
