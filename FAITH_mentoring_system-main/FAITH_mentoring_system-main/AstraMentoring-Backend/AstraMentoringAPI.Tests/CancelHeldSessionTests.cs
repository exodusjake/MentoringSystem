using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoringAPI.Tests;

// A session that was held (Completed, or with a scanned attendee) keeps its attendance:
// it can't be cancelled, the same as it can't be deleted.
public class CancelHeldSessionTests
{
    [Fact]
    public async Task OnlySessionsNotYetHeldCanBeCancelled()
    {
        const string masterConnection = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
        var database = "AstraCancelHeld_" + Guid.NewGuid().ToString("N");
        using var master = new SqlConnection(masterConnection);
        await master.ExecuteAsync($"CREATE DATABASE [{database}]");
        try
        {
            var connection = new SqlConnectionStringBuilder(masterConnection) { InitialCatalog = database }.ConnectionString;
            using var db = new SqlConnection(connection);
            await db.ExecuteAsync("""
                CREATE TABLE Sessions(SessionID int,MentorID int,SessionDate datetime,Status nvarchar(20),CancelledAt datetime2 NULL,Notes nvarchar(max),SectionCode nvarchar(100),SlotName nvarchar(50));
                CREATE TABLE SessionCourseScopes(SessionID int,School nvarchar(100),CourseCode nvarchar(100),Origin nvarchar(16));
                CREATE TABLE Attendance(SessionID int,MenteeID int,IsPresent bit,ScannedAt datetime NULL);
                INSERT Sessions VALUES(1,7,'2026-10-15 23:57','Completed',NULL,NULL,'BSIT','Mentoring Assembly'),
                    (2,7,'2026-10-16 09:00','Scheduled',NULL,NULL,'BSIT','Mentoring Assembly'),
                    (3,7,'2026-10-17 09:00','Scheduled',NULL,NULL,'BSIT','Mentoring Assembly');
                INSERT Attendance VALUES(2,20,1,'2026-10-16 01:05'),(3,21,0,NULL);
                """);
            var service = new SessionsService(null!, new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = connection }).Build());
            Session Cancel(int id) => new() { SessionID = id, MentorID = 7, SessionDate = new DateTime(2026, 10, 18), Status = "Cancelled", SectionCode = "BSIT", SlotName = "Mentoring Assembly" };

            Assert.False(await service.Update(Cancel(1)));
            Assert.False(await service.Update(Cancel(2)));
            Assert.True(await service.Update(Cancel(3)));

            var status = (await db.QueryAsync<(int SessionID, string Status)>("SELECT SessionID,Status FROM Sessions ORDER BY SessionID")).ToArray();
            Assert.Equal(new[] { (1, "Completed"), (2, "Scheduled"), (3, "Cancelled") }, status);
        }
        finally
        {
            SqlConnection.ClearAllPools();
            await master.ExecuteAsync($"ALTER DATABASE [{database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{database}]");
        }
    }
}
