-- Clears ACTIVITY data so a clean baseline can be recorded through the app.
-- Keeps: Users, profiles, MentorMentee assignments, Departments, Sections,
--        SystemSettings, EvaluationLinks (forms), Announcements, AccountPeriodHistory.
-- Removes: sessions, attendance, QR tokens, proofs, course scopes/rosters, availability,
--          session requests, checkpoint logs, notifications, evaluation submissions/ratings,
--          mentor personal events, and the current period's Session Schedule/Deadline events.
-- @Apply = 0 runs everything inside a transaction and rolls back (dry run).
-- Change it to 1 only after the dry run looks right. Take an RDS snapshot first.
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
DECLARE @Apply BIT = 0;
DECLARE @SY NVARCHAR(20), @Sem NVARCHAR(50);
SELECT @SY  = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
SELECT @Sem = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';

DECLARE @Counts TABLE (Step INT, TableName SYSNAME, RowsBefore INT, RowsDeleted INT);
DECLARE @n INT, @b INT;

BEGIN TRANSACTION;

SELECT @b = COUNT(*) FROM dbo.QRTokens;               DELETE FROM dbo.QRTokens;               INSERT @Counts VALUES (1, 'QRTokens', @b, @@ROWCOUNT);
SELECT @b = COUNT(*) FROM dbo.Attendance;             DELETE FROM dbo.Attendance;             INSERT @Counts VALUES (2, 'Attendance', @b, @@ROWCOUNT);
SELECT @b = COUNT(*) FROM dbo.ProofOfSession;         DELETE FROM dbo.ProofOfSession;         INSERT @Counts VALUES (3, 'ProofOfSession', @b, @@ROWCOUNT);
IF OBJECT_ID('dbo.SessionCourseMembers', 'U') IS NOT NULL
BEGIN SELECT @b = COUNT(*) FROM dbo.SessionCourseMembers; DELETE FROM dbo.SessionCourseMembers; INSERT @Counts VALUES (4, 'SessionCourseMembers', @b, @@ROWCOUNT); END
IF OBJECT_ID('dbo.SessionCourseScopes', 'U') IS NOT NULL
BEGIN SELECT @b = COUNT(*) FROM dbo.SessionCourseScopes;  DELETE FROM dbo.SessionCourseScopes;  INSERT @Counts VALUES (5, 'SessionCourseScopes', @b, @@ROWCOUNT); END
SELECT @b = COUNT(*) FROM dbo.Sessions;               DELETE FROM dbo.Sessions;               INSERT @Counts VALUES (6, 'Sessions', @b, @@ROWCOUNT);
SELECT @b = COUNT(*) FROM dbo.SessionRequests;        DELETE FROM dbo.SessionRequests;        INSERT @Counts VALUES (7, 'SessionRequests', @b, @@ROWCOUNT);
SELECT @b = COUNT(*) FROM dbo.Availability;           DELETE FROM dbo.Availability;           INSERT @Counts VALUES (8, 'Availability', @b, @@ROWCOUNT);
SELECT @b = COUNT(*) FROM dbo.CheckpointLogs;         DELETE FROM dbo.CheckpointLogs;         INSERT @Counts VALUES (9, 'CheckpointLogs', @b, @@ROWCOUNT);
IF OBJECT_ID('dbo.CourseCheckpointLogs', 'U') IS NOT NULL
BEGIN SELECT @b = COUNT(*) FROM dbo.CourseCheckpointLogs; DELETE FROM dbo.CourseCheckpointLogs; INSERT @Counts VALUES (10, 'CourseCheckpointLogs', @b, @@ROWCOUNT); END
SELECT @b = COUNT(*) FROM dbo.Notifications;          DELETE FROM dbo.Notifications;          INSERT @Counts VALUES (11, 'Notifications', @b, @@ROWCOUNT);
SELECT @b = COUNT(*) FROM dbo.EvaluationSubmissions;  DELETE FROM dbo.EvaluationSubmissions;  INSERT @Counts VALUES (12, 'EvaluationSubmissions', @b, @@ROWCOUNT);
SELECT @b = COUNT(*) FROM dbo.EvaluationRatings;      DELETE FROM dbo.EvaluationRatings;      INSERT @Counts VALUES (13, 'EvaluationRatings', @b, @@ROWCOUNT);
SELECT @b = COUNT(*) FROM dbo.MentorPersonalEvents;   DELETE FROM dbo.MentorPersonalEvents;   INSERT @Counts VALUES (14, 'MentorPersonalEvents', @b, @@ROWCOUNT);
SELECT @b = COUNT(*) FROM dbo.CalendarEvents WHERE SchoolYear = @SY AND Semester = @Sem AND EventType IN ('Session Schedule', 'Deadline');
DELETE FROM dbo.CalendarEvents WHERE SchoolYear = @SY AND Semester = @Sem AND EventType IN ('Session Schedule', 'Deadline');
INSERT @Counts VALUES (15, 'CalendarEvents (current Session Schedule/Deadline)', @b, @@ROWCOUNT);

SELECT Step, TableName, RowsBefore, RowsDeleted FROM @Counts ORDER BY Step;

-- Kept tables (must be unchanged)
SELECT (SELECT COUNT(*) FROM dbo.Users) AS Users,
       (SELECT COUNT(*) FROM dbo.MenteeProfiles) AS MenteeProfiles,
       (SELECT COUNT(*) FROM dbo.MentorProfiles) AS MentorProfiles,
       (SELECT COUNT(*) FROM dbo.MentorMentee WHERE IsActive = 1) AS ActiveAssignments,
       (SELECT COUNT(*) FROM dbo.Announcements) AS Announcements,
       (SELECT COUNT(*) FROM dbo.EvaluationLinks) AS EvaluationForms;

IF @Apply = 1
BEGIN
    COMMIT TRANSACTION;
    SELECT 'APPLIED: activity data cleared.' AS Result;
END
ELSE
BEGIN
    ROLLBACK TRANSACTION;
    SELECT 'PREVIEW ONLY: everything was rolled back, nothing changed.' AS Result;
END
