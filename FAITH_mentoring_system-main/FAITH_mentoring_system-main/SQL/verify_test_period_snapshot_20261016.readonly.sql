-- READ-ONLY: confirms the 2027-2028 test snapshot is gone and everything else is unchanged.
SET NOCOUNT ON;
SELECT SchoolYear, Semester, COUNT(*) AS Accounts FROM AccountPeriodHistory GROUP BY SchoolYear, Semester ORDER BY SchoolYear, Semester;
SELECT CASE WHEN OBJECT_ID('dbo.AccountPeriodHistory_Backup_20261016', 'U') IS NULL THEN 'no safety copy'
            ELSE 'safety copy present' END AS SafetyCopy;
SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('SchoolYear', 'Semester');
SELECT (SELECT COUNT(*) FROM Users) AS Users, (SELECT COUNT(*) FROM Sessions) AS Sessions,
       (SELECT COUNT(*) FROM Attendance) AS Attendance, (SELECT COUNT(*) FROM MentorMentee WHERE IsActive = 1) AS ActiveAssignments;
