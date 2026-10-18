using Dapper;
using Microsoft.Data.SqlClient;
using System.Text.RegularExpressions;

namespace AstraMentoringAPI.Tests;

public class CheckpointAttendanceCountingTests
{
    [Fact]
    public async Task CheckpointsMergeMakeupsAndExcludeOtherCoursesPeriodsAndUnfinishedSessions()
    {
        const string masterConnection = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
        var database = "AstraCheckpointTest_" + Guid.NewGuid().ToString("N");
        using var master = new SqlConnection(masterConnection);
        await master.ExecuteAsync($"CREATE DATABASE [{database}]");
        try
        {
            using var db = new SqlConnection(new SqlConnectionStringBuilder(masterConnection) { InitialCatalog = database }.ConnectionString);
            await db.ExecuteAsync("""
                CREATE TABLE MentorMentee(MentorID int,MenteeID int,AssignedDate date,IsActive bit);
                CREATE TABLE MenteeProfiles(UserID int,SectionID int,Section nvarchar(100));
                CREATE TABLE Sections(SectionID int,SectionCode nvarchar(100));
                CREATE TABLE Sessions(SessionID int,MentorID int,Status nvarchar(20),SchoolYear nvarchar(20),Semester nvarchar(50),SessionDate datetime2,SlotName nvarchar(100),RequestID int NULL,SectionCode nvarchar(100));
                CREATE TABLE Attendance(SessionID int,MenteeID int,IsPresent bit);
                CREATE TABLE SessionRequests(RequestID int,MenteeID int,Status nvarchar(20));
                INSERT MentorMentee VALUES(1,10,'2026-08-01',1),(1,11,'2026-08-01',1),(1,12,'2026-08-01',1),(2,10,'2026-08-01',0);
                INSERT Sections VALUES(1,'BSIT'),(2,'BSEMC');
                INSERT MenteeProfiles VALUES(10,1,NULL),(11,2,NULL),(12,1,NULL);
                INSERT Sessions VALUES
                (1,1,'Completed','2026-2027','1st Semester','2026-09-01','Before Prelims',NULL,'BSIT'),
                (2,1,'Completed','2026-2027','1st Semester','2026-09-02','Before Prelims',5,'BSIT'),
                (3,1,'Completed','2026-2027','1st Semester','2026-09-03','After Prelims',NULL,'BSIT'),
                (4,1,'Completed','2026-2027','1st Semester','2026-09-03','Before Midterms',NULL,'BSEMC'),
                (5,1,'Scheduled','2026-2027','1st Semester','2026-09-04','After Midterms',NULL,'BSIT'),
                (6,1,'Cancelled','2026-2027','1st Semester','2026-09-04','Before Finals',NULL,'BSIT'),
                (7,1,'Completed','2025-2026','1st Semester','2026-09-04','Assembly',NULL,'BSIT'),
                (8,1,'Completed','2026-2027','2nd Semester','2026-09-04','Assembly',NULL,'BSIT'),
                (9,1,'Completed','2026-2027','1st Semester','2026-07-01','Assembly',NULL,'BSIT'),
                (10,2,'Completed','2026-2027','1st Semester','2026-09-04','Assembly',NULL,'BSIT');
                INSERT SessionRequests VALUES(5,10,'Approved');
                INSERT Attendance VALUES(1,10,0),(2,10,1),(2,12,1),(4,11,1),(5,10,1),(6,10,1),(7,10,1),(8,10,1),(9,10,1),(10,10,1);
                """);
            var root = new DirectoryInfo(AppContext.BaseDirectory);
            while (root != null && !File.Exists(Path.Combine(root.FullName,"SQL","fix_attendance_counting_rules.sql"))) root = root.Parent;
            Assert.NotNull(root);
            var sql = await File.ReadAllTextAsync(Path.Combine(root!.FullName,"SQL","fix_attendance_counting_rules.sql"));
            var batch = Regex.Split(sql,@"^\s*GO\s*$",RegexOptions.Multiline|RegexOptions.IgnoreCase).Single(s=>s.Contains("CREATE OR ALTER FUNCTION dbo.fn_MenteeCheckpointAttendance"));
            await db.ExecuteAsync(batch);
            var rows = (await db.QueryAsync<(int MenteeID,int Expected,int Attended)>("SELECT MenteeID,COUNT(*) AS Expected,SUM(Attended) AS Attended FROM dbo.fn_MenteeCheckpointAttendance('2026-2027','1st Semester') GROUP BY MenteeID ORDER BY MenteeID")).ToList();
            Assert.Equal(new[] { (10,2,1), (11,1,1), (12,2,1) }, rows);
            // Repeated attendance within the same checkpoint never adds credit.
            await db.ExecuteAsync("INSERT Attendance VALUES(1,10,1)");
            Assert.Equal(1,await db.ExecuteScalarAsync<int>("SELECT SUM(Attended) FROM dbo.fn_MenteeCheckpointAttendance('2026-2027','1st Semester') WHERE MenteeID=10"));
        }
        finally
        {
            SqlConnection.ClearAllPools();
            if (!Regex.IsMatch(database,"^AstraCheckpointTest_[a-f0-9]{32}$")) throw new InvalidOperationException();
            await master.ExecuteAsync($"ALTER DATABASE [{database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{database}]");
        }
    }
}
