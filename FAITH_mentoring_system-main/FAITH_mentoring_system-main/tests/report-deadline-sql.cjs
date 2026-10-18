// Generates read-only SQL checks from the production grading expressions.
// Run the output with sqlcmd against master; no application tables are touched.
const fs = require('node:fs');
const source = fs.readFileSync('AstraMentoring-Backend/AstraMentoring-Backend/Services/MonitorActivitiesService.cs','utf8');
const onTime = source.match(/AND (TODATETIMEOFFSET[^\n]+)\) THEN 1 ELSE 0 END AS OnTime/)[1];
const due = source.match(/e\.IsPublished=1 AND (DATEADD[^\r\n]+)/)[1].replace('SYSUTCDATETIME()', 'v.UtcNow');
console.log(`
SET NOCOUNT ON;
DECLARE @Failures int;
WITH TestCases AS (
    SELECT * FROM (VALUES
      ('2026-09-22T23:59:59',1),
      ('2026-09-23T00:00:00',1),
      ('2026-09-23T16:00:00',1),
      ('2026-09-23T23:59:59',1),
      ('2026-09-24T00:00:00',0),
      ('2026-09-24T07:00:00',0),
      (NULL,0)
    ) t(PhilippineSubmission,Expected)
)
SELECT @Failures=COUNT(*) FROM TestCases t
CROSS APPLY (SELECT CAST('2026-09-23' AS datetime2) StartDate) e
CROSS APPLY (SELECT CAST(SWITCHOFFSET(
    TODATETIMEOFFSET(CAST(t.PhilippineSubmission AS datetime2),'+08:00'),
    DATEPART(TZOFFSET,SYSDATETIMEOFFSET())) AS datetime2) SubmittedAt) c
WHERE CASE WHEN ${onTime} THEN 1 ELSE 0 END <> t.Expected;
IF @Failures<>0 THROW 51000, 'Submission deadline boundary failed',1;

SELECT @Failures=COUNT(*) FROM (VALUES
    (CAST('2026-09-23T00:00:00' AS datetime2),0),
    (CAST('2026-09-23T15:59:59' AS datetime2),0),
    (CAST('2026-09-23T16:00:00' AS datetime2),1),
    (CAST('2026-09-24T00:00:00' AS datetime2),1)
) v(UtcNow,Expected)
CROSS APPLY (SELECT CAST('2026-09-23' AS datetime2) StartDate) e
WHERE CASE WHEN ${due} THEN 1 ELSE 0 END <> v.Expected;
IF @Failures<>0 THROW 51000, 'Deadline expiry boundary failed',1;
PRINT '11 deadline boundary checks passed (no application records changed).';
`);
