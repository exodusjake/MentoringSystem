using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoringAPI.Tests;

// Attendance Logs: totals, mentee cards and View History must describe the same records.
public class DropOutAttendanceCardTests
{
    private const string DropOutFilter = "AND ISNULL(mp.IsDropOut,0)=0 ";

    [Fact]
    public void CardSqlOnlyDropsTheDropOutFilter()
    {
        Assert.Single(CourseWorkflow.ExpectedAttendanceSql.Split(DropOutFilter)[1..]);
        Assert.DoesNotContain("IsDropOut", CourseWorkflow.ExpectedAttendanceWithDropOutsSql);
        Assert.Equal(CourseWorkflow.ExpectedAttendanceSql.Replace(DropOutFilter, ""), CourseWorkflow.ExpectedAttendanceWithDropOutsSql);
    }

    [Fact]
    public async Task AttendanceLogsCountEveryRecordedCheckpointOnce()
    {
        const string masterConnection = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
        var database = "AstraAttendanceLogs_" + Guid.NewGuid().ToString("N");
        using var master = new SqlConnection(masterConnection);
        await master.ExecuteAsync($"CREATE DATABASE [{database}]");
        try
        {
            var connection = new SqlConnectionStringBuilder(masterConnection) { InitialCatalog = database }.ConnectionString;
            using var db = new SqlConnection(connection);
            // Mentor 1 held MA (mentees 20, 24 present/absent); 20 then moved to mentor 2.
            // Mentor 2 held MA: 20 absent, 21 drop-out present, 22 no scan, 23 deactivated present.
            // Mentee 25 attended MA with mentor 1, then moved to mentor 3 who has held nothing yet.
            // Mentee 26 scanned outside the schedule window: never counts.
            // Mentee 27 joined mentor 2 after the session (not on its roster): not Absent, no session.
            await db.ExecuteAsync("""
                CREATE TABLE Users(UserID int,IsActive bit);
                CREATE TABLE SystemSettings(SettingKey nvarchar(100),SettingValue nvarchar(255));
                CREATE TABLE MentorMentee(MentorID int,MenteeID int,AssignedDate date,IsActive bit);
                CREATE TABLE MenteeProfiles(UserID int,SectionID int,Section nvarchar(100),IsDropOut bit);
                CREATE TABLE Sections(SectionID int,SectionCode nvarchar(100));
                CREATE TABLE Sessions(SessionID int,MentorID int,Status nvarchar(20),SchoolYear nvarchar(20),Semester nvarchar(50),SessionDate datetime,TimeEnd datetime NULL,SlotName nvarchar(50),RequestID int NULL,SectionCode nvarchar(100),Notes nvarchar(max));
                CREATE TABLE Attendance(AttendanceID int IDENTITY,SessionID int,MenteeID int,IsPresent bit,ScannedAt datetime NULL,AbsenceReason nvarchar(255),MentorNotes nvarchar(500));
                CREATE TABLE SessionRequests(RequestID int,MenteeID int,Status nvarchar(20));
                CREATE TABLE SessionCourseScopes(SessionID int,School nvarchar(100),CourseCode nvarchar(100));
                CREATE TABLE SessionCourseMembers(SessionID int,MenteeID int,School nvarchar(100),CourseCode nvarchar(100));
                CREATE TABLE CalendarEvents(EventType nvarchar(50),IsPublished bit,SchoolYear nvarchar(20),Semester nvarchar(50),SlotName nvarchar(50),StartDate datetime,EndDate datetime);
                INSERT Users VALUES(20,1),(21,1),(22,1),(23,0),(24,1),(25,1),(26,1),(27,1);
                INSERT SystemSettings VALUES('SchoolYear','2026-2027'),('Semester','1st Semester');
                INSERT MentorMentee VALUES(1,20,'2026-10-15',0),(2,20,'2026-10-15',1),(2,21,'2026-10-15',1),(2,22,'2026-10-15',1),(2,23,'2026-10-15',1),
                    (1,24,'2026-10-15',1),(1,25,'2026-10-15',0),(3,25,'2026-10-15',1),(2,26,'2026-10-15',1),(2,27,'2026-10-15',1);
                INSERT Sections VALUES(1,'BSIT');
                INSERT MenteeProfiles VALUES(20,1,NULL,0),(21,1,NULL,1),(22,1,NULL,0),(23,1,NULL,0),(24,1,NULL,0),(25,1,NULL,0),(26,1,NULL,0),(27,1,NULL,0);
                INSERT Sessions VALUES
                    (1,1,'Completed','2026-2027','1st Semester','2026-10-15 23:57','2026-10-15 23:59','Mentoring Assembly',NULL,'BSIT','[BSIT] Assembly'),
                    (2,2,'Completed','2026-2027','1st Semester','2026-10-16 00:23','2026-10-16 00:26','Mentoring Assembly',NULL,'BSIT','[BSIT] Assembly');
                INSERT SessionCourseScopes VALUES(1,'School of Technology','BSIT'),(2,'School of Technology','BSIT');
                INSERT SessionCourseMembers VALUES(1,20,'School of Technology','BSIT'),(1,24,'School of Technology','BSIT'),(1,25,'School of Technology','BSIT'),
                    (2,20,'School of Technology','BSIT'),(2,21,'School of Technology','BSIT'),(2,22,'School of Technology','BSIT'),(2,23,'School of Technology','BSIT'),(2,26,'School of Technology','BSIT');
                INSERT Attendance(SessionID,MenteeID,IsPresent,ScannedAt) VALUES
                    (1,20,1,'2026-10-15 15:58'),(1,24,0,NULL),(1,25,1,'2026-10-15 15:59'),
                    (2,20,0,NULL),(2,21,1,'2026-10-15 16:25'),(2,23,1,'2026-10-15 16:25'),(2,26,1,'2026-10-20 03:00');
                INSERT CalendarEvents VALUES('Session Schedule',1,'2026-2027','1st Semester','Mentoring Assembly','2026-10-15','2026-10-17');
                """);
            var args = new { MentorIds = new[] { 1, 2, 3 }, SchoolYear = "2026-2027", Semester = "1st Semester" };

            // The previous rule for comparison: drop-out 21 and moved mentees 20/25 were lost.
            var before = (await db.QueryAsync<(int MentorID, int MenteeID, string SlotName, int Attended)>(CourseWorkflow.ExpectedAttendanceSql, args))
                .Select(r => (r.MentorID, r.MenteeID, r.Attended)).OrderBy(r => r).ToArray();
            Assert.Equal(new[] { (1, 24, 0), (2, 20, 0), (2, 22, 0), (2, 23, 1), (2, 26, 0) }, before);

            var rows = (await db.QueryAsync<(int MentorID, int MenteeID, string SlotName, int Attended)>(CourseWorkflow.MenteeCheckpointAttendanceSql, args))
                .Select(r => (r.MentorID, r.MenteeID, r.Attended)).OrderBy(r => r).ToArray();
            Assert.Equal(new[] { (1, 24, 0), (2, 20, 1), (2, 21, 1), (2, 22, 0), (2, 26, 0), (3, 25, 1) }, rows);

            var service = new AttendanceLogsService(new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = connection }).Build());

            // View History for the moved mentee shows the checkpoint once, as Present (previous mentor's session).
            var history = await service.GetMenteeHistoryAsync(20, 2);
            var row = Assert.Single(history);
            Assert.Equal(new DateTime(2026, 10, 15, 23, 57, 0), row.SessionDate);
            Assert.True(row.IsPresent);

            // A mentee who stayed sees only their own mentor's sessions.
            var stayed = await service.GetMenteeHistoryAsync(22, 2);
            Assert.Equal(new DateTime(2026, 10, 16, 0, 23, 0), Assert.Single(stayed).SessionDate);

            // Mentee cards: counts from the same rows, and the drop-out flag set only for the drop-out.
            var cards = new List<AttendanceMenteeCardDto> { new() { MenteeID = 20 }, new() { MenteeID = 21 }, new() { MenteeID = 22 } };
            var apply = typeof(AttendanceLogsService).GetMethod("ApplyCourseAttendanceAsync", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
            await (Task)apply.Invoke(null, new object[] { db, 2, cards })!;
            Assert.Equal(new[] { (20, 1, 1, false), (21, 1, 1, true), (22, 1, 0, false) },
                cards.Select(c => (c.MenteeID, c.TotalSessions, c.PresentCount, c.IsDropOut)).ToArray());

            // Overview: totals equal the card rows, and the per-section breakdown adds up to them.
            await db.ExecuteAsync("""
                CREATE PROCEDURE sp_GetAttendanceOverview AS
                SELECT m.MentorID, N'M' AS FirstName, N'X' AS LastName, CAST(NULL AS nvarchar(50)) AS Department, CAST(NULL AS nvarchar(100)) AS School,
                       m.TotalSessions, 0 AS TotalAttendees, 0 AS PresentCount, CAST(NULL AS datetime) AS LastSessionDate,
                       N'BSIT' AS Sections, N'BSIT' AS Courses
                FROM (VALUES (1, 1), (2, 1), (3, 0)) m(MentorID, TotalSessions);
                """);
            var overview = (await service.GetOverviewAsync()).Mentors.OrderBy(m => m.MentorID).ToArray();
            Assert.Equal(new[] { (1, 1, 0), (2, 4, 2), (3, 1, 1) }, overview.Select(m => (m.MentorID, m.TotalAttendees, m.PresentCount)).ToArray());
            foreach (var m in overview)
            {
                Assert.Equal(m.TotalAttendees, m.SectionStats.Sum(x => x.Records));
                Assert.Equal(m.PresentCount, m.SectionStats.Sum(x => x.Present));
                Assert.Equal(m.TotalSessions, m.SectionStats.Sum(x => x.Sessions));
            }
            Assert.Equal(("BSIT", 4, 2, 1), overview[1].SectionStats.Select(x => (x.SectionCode, x.Records, x.Present, x.Sessions)).Single());

            // A mentee added after the session has no session in their history.
            Assert.Empty(await service.GetMenteeHistoryAsync(27, 2));

            // Mentor 3 has held nothing; the moved mentee's own checkpoint still shows.
            Assert.Equal(new DateTime(2026, 10, 15, 23, 57, 0), Assert.Single(await service.GetMenteeHistoryAsync(25, 3)).SessionDate);
        }
        finally
        {
            SqlConnection.ClearAllPools();
            await master.ExecuteAsync($"ALTER DATABASE [{database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{database}]");
        }
    }
}
