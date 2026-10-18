-- READ-ONLY: which past periods the School Year filter offers, and what data each has.
SET NOCOUNT ON;

-- Current period
SELECT SettingKey, SettingValue, UpdatedAt FROM SystemSettings WHERE SettingKey IN ('SchoolYear', 'Semester');

-- Period snapshots (taken when School Year / Semester is changed in System Settings)
SELECT SchoolYear, Semester, COUNT(*) AS Accounts, MIN(RecordedAt) AS FirstRecorded, MAX(RecordedAt) AS LastRecorded
FROM AccountPeriodHistory GROUP BY SchoolYear, Semester ORDER BY MIN(RecordedAt);

-- Sessions per period (what a past-period view can show)
SELECT SchoolYear, Semester, Status, COUNT(*) AS Sessions
FROM Sessions GROUP BY SchoolYear, Semester, Status ORDER BY SchoolYear, Semester, Status;

-- Calendar events per period
SELECT SchoolYear, Semester, COUNT(*) AS Events FROM CalendarEvents GROUP BY SchoolYear, Semester ORDER BY SchoolYear, Semester;
