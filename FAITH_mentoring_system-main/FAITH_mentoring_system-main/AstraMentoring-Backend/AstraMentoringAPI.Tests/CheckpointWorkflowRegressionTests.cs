using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Text.RegularExpressions;

namespace AstraMentoringAPI.Tests;

public class CheckpointWorkflowRegressionTests
{
    private const string MasterConnection =
        "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";

    [Fact]
    public async Task LaterAssignmentIsExcludedFromHistoricalRosterAndCannotBeMarkedAbsent()
    {
        var (database, connectionString) = await CreateDatabaseAsync();
        try
        {
            using var db = new SqlConnection(connectionString);
            await db.ExecuteAsync("""
                CREATE TABLE Sessions(SessionID int PRIMARY KEY,MentorID int,RequestID int NULL,SectionCode nvarchar(50),SessionDate datetime2);
                CREATE TABLE MentorMentee(MentorID int,MenteeID int,AssignedDate date,IsActive bit);
                CREATE TABLE Users(UserID int PRIMARY KEY,FirstName nvarchar(50),LastName nvarchar(50),StudentNumber nvarchar(50));
                CREATE TABLE MenteeProfiles(UserID int,SectionID int,Section nvarchar(50),Course nvarchar(50),YearLevel nvarchar(20),IsDropOut bit,SignatureFilePath nvarchar(200));
                CREATE TABLE Sections(SectionID int,SectionCode nvarchar(50));
                CREATE TABLE SessionRequests(RequestID int,AvailabilityID int,MenteeID int,Status nvarchar(20));
                CREATE TABLE Attendance(AttendanceID int IDENTITY PRIMARY KEY,SessionID int,MenteeID int,IsPresent bit,ScannedAt datetime2 NULL,AbsenceReason nvarchar(max) NULL,MentorNotes nvarchar(max) NULL,Remarks nvarchar(max) NULL);
                INSERT Sessions VALUES(1,7,NULL,'BSIT-1A','2026-09-10');
                INSERT MentorMentee VALUES(7,101,'2026-09-01',1),(7,102,'2026-09-11',1);
                INSERT Users VALUES(101,'Assigned','Before','101'),(102,'Assigned','Later','102'),(103,'Historical','Present','103'),(104,'Historical','FalseAbsent','104');
                INSERT Sections VALUES(1,'BSIT-1A');
                INSERT MenteeProfiles VALUES
                    (101,1,NULL,'BSIT','1',0,NULL),(102,1,NULL,'BSIT','1',0,NULL),
                    (103,1,NULL,'BSIT','1',0,NULL),(104,1,NULL,'BSIT','1',0,NULL);
                INSERT Attendance(SessionID,MenteeID,IsPresent) VALUES(1,103,1),(1,104,0);
                """);

            var config = Configuration(connectionString);
            var roster = await new SessionsAdminService(config).GetSessionMenteesAsync(1);
            Assert.Equal(new[] { 101, 103 }, roster.Select(m => m.MenteeID).OrderBy(id => id));

            var attendance = new AttendanceService(null!, config);
            await Assert.ThrowsAsync<AttendanceNotEligibleException>(() =>
                attendance.EnsureAbsentAsync(new Attendance { SessionID=1, MenteeID=102 }));
            var finalized = await attendance.EnsureAbsentAsync(
                new Attendance { SessionID=1, MenteeID=101 });
            Assert.False(finalized.IsPresent);
        }
        finally
        {
            await DropDatabaseAsync(database);
        }
    }

    [Fact]
    public async Task PresentCheckpointBlocksBookingButOtherMenteesCanShareAvailability()
    {
        var (database, connectionString) = await CreateDatabaseAsync();
        try
        {
            using var db = new SqlConnection(connectionString);
            var todayPht = DateTime.UtcNow.AddHours(8).Date;
            var availableDate = todayPht.AddDays(3);
            await db.ExecuteAsync("""
                CREATE TABLE SystemSettings(SettingKey nvarchar(50),SettingValue nvarchar(50));
                CREATE TABLE CalendarEvents(IsPublished bit,EventType nvarchar(50),SlotName nvarchar(100),SchoolYear nvarchar(50),Semester nvarchar(50),StartDate date,EndDate date);
                CREATE TABLE MentorMentee(MentorID int,MenteeID int,AssignedDate date,IsActive bit);
                CREATE TABLE Availability(AvailabilityID int PRIMARY KEY,MentorID int,AvailableDate date,StartTime time,SlotName nvarchar(100));
                CREATE TABLE Sessions(SessionID int IDENTITY PRIMARY KEY,MentorID int,RequestID int NULL,Status nvarchar(20),TimeEnd datetime2 NULL,SchoolYear nvarchar(50),Semester nvarchar(50),SessionDate datetime2,SlotName nvarchar(100));
                CREATE TABLE SessionRequests(RequestID int IDENTITY PRIMARY KEY,AvailabilityID int,MenteeID int,Status nvarchar(20),Purpose nvarchar(max));
                CREATE TABLE Attendance(SessionID int,MenteeID int,IsPresent bit);
                INSERT SystemSettings VALUES('SchoolYear','2026-2027'),('Semester','1st Semester');
                INSERT CalendarEvents VALUES(1,'Session Schedule','Before Prelims','2026-2027','1st Semester',@Start,@End);
                INSERT MentorMentee VALUES(7,101,@Assigned,1),(7,102,@Assigned,1),(7,103,@Assigned,1);
                INSERT Availability VALUES(50,7,@Available,'09:00','Before Prelims');
                INSERT Sessions(MentorID,RequestID,Status,SchoolYear,Semester,SessionDate,SlotName)
                    VALUES(7,NULL,'Completed','2026-2027','1st Semester',@Yesterday,'Before Prelims');
                INSERT Attendance VALUES(1,101,1),(1,102,0);
                """, new {
                    Start=todayPht,
                    End=availableDate.AddDays(2),
                    Assigned=todayPht.AddDays(-5),
                    Available=availableDate,
                    Yesterday=todayPht.AddDays(-2)
                });
            await db.ExecuteAsync("""
                CREATE OR ALTER PROCEDURE sp_SubmitSessionRequest
                    @MenteeID int,@AvailabilityID int,@Purpose nvarchar(max)
                AS
                BEGIN
                    SET NOCOUNT ON;
                    INSERT SessionRequests(AvailabilityID,MenteeID,Status,Purpose)
                    VALUES(@AvailabilityID,@MenteeID,'Approved',@Purpose);
                    DECLARE @RequestID int=SCOPE_IDENTITY();
                    INSERT Sessions(MentorID,RequestID,Status,SchoolYear,Semester,SessionDate,SlotName)
                    SELECT a.MentorID,@RequestID,'Scheduled','2026-2027','1st Semester',
                           CAST(a.AvailableDate AS datetime2),a.SlotName
                    FROM Availability a WHERE a.AvailabilityID=@AvailabilityID;
                    SELECT 1 AS Success,N'' AS ErrorMessage;
                END
                """);

            var service = new AvailabilityWorkflowService(Configuration(connectionString));
            var blocked = await service.SubmitRequestAsync(101,50,"duplicate checkpoint");
            Assert.False(blocked.ok);
            Assert.Contains("already completed attendance",blocked.error,StringComparison.OrdinalIgnoreCase);

            var results = await Task.WhenAll(
                service.SubmitRequestAsync(102,50,"missed regular session"),
                service.SubmitRequestAsync(103,50,"missed regular session"));
            Assert.All(results,result=>Assert.True(result.ok,result.error));
            Assert.Equal(2,await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionRequests WHERE AvailabilityID=50"));
            Assert.Equal(2,await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Sessions WHERE RequestID IS NOT NULL"));
        }
        finally
        {
            await DropDatabaseAsync(database);
        }
    }

    [Fact]
    public async Task SuccessfulQrScanDoesNotFinishSessionBeforeSaveEnd()
    {
        var (database, connectionString) = await CreateDatabaseAsync();
        try
        {
            using var db = new SqlConnection(connectionString);
            var todayPht=DateTime.UtcNow.AddHours(8).Date;
            await db.ExecuteAsync("""
                CREATE TABLE Sessions(SessionID int PRIMARY KEY,MentorID int,RequestID int NULL,Status nvarchar(20),TimeEnd datetime2 NULL,SchoolYear nvarchar(50),Semester nvarchar(50),SessionDate datetime2,SlotName nvarchar(100));
                CREATE TABLE QRTokens(Token nvarchar(100),SessionID int,MenteeID int);
                CREATE TABLE MentorMentee(MentorID int,MenteeID int,AssignedDate date,IsActive bit);
                CREATE TABLE CalendarEvents(IsPublished bit,EventType nvarchar(50),SlotName nvarchar(100),SchoolYear nvarchar(50),Semester nvarchar(50),StartDate date,EndDate date);
                CREATE TABLE Attendance(AttendanceID int IDENTITY PRIMARY KEY,SessionID int,MenteeID int,IsPresent bit,ScannedAt datetime2 NULL);
                INSERT Sessions VALUES(1,7,NULL,'Scheduled',NULL,'2026-2027','1st Semester',@Today,'Before Prelims');
                INSERT QRTokens VALUES('valid-token',1,101);
                INSERT MentorMentee VALUES(7,101,@Yesterday,1);
                INSERT CalendarEvents VALUES(1,'Session Schedule','Before Prelims','2026-2027','1st Semester',@Today,@End);
                """,new {
                    Today=todayPht,
                    Yesterday=todayPht.AddDays(-5),
                    End=todayPht.AddDays(2)
                });
            await db.ExecuteAsync("""
                CREATE OR ALTER PROCEDURE sp_ScanQRAttendance @Token nvarchar(100)
                AS
                BEGIN
                    SET NOCOUNT ON;
                    DECLARE @SessionID int,@MenteeID int;
                    SELECT @SessionID=SessionID,@MenteeID=MenteeID FROM QRTokens WHERE Token=@Token;
                    INSERT Attendance(SessionID,MenteeID,IsPresent,ScannedAt)
                    VALUES(@SessionID,@MenteeID,1,SYSUTCDATETIME());
                    UPDATE Sessions SET Status='Completed' WHERE SessionID=@SessionID;
                    SELECT CAST(1 AS bit) AS Success,@MenteeID AS MenteeId,@SessionID AS SessionId,
                           N'Test Mentee' AS MenteeName,N'Saved' AS Message;
                END
                """);

            var result=await new QRAttendanceService(Configuration(connectionString))
                .ScanTokenAsync("valid-token",7,1);

            Assert.True(result.Success);
            Assert.Equal("Scheduled",await db.ExecuteScalarAsync<string>("SELECT Status FROM Sessions WHERE SessionID=1"));
            Assert.Null(await db.ExecuteScalarAsync<DateTime?>("SELECT TimeEnd FROM Sessions WHERE SessionID=1"));
            Assert.Equal(1,await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Attendance WHERE SessionID=1 AND IsPresent=1"));
        }
        finally
        {
            await DropDatabaseAsync(database);
        }
    }

    private static IConfiguration Configuration(string connectionString) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
            ["ConnectionStrings:DefaultConnection"]=connectionString
        }).Build();

    private static async Task<(string Database,string ConnectionString)> CreateDatabaseAsync()
    {
        var database="AstraWorkflowTest_"+Guid.NewGuid().ToString("N");
        using var master=new SqlConnection(MasterConnection);
        await master.ExecuteAsync($"CREATE DATABASE [{database}]");
        var connectionString=new SqlConnectionStringBuilder(MasterConnection) { InitialCatalog=database }.ConnectionString;
        return (database,connectionString);
    }

    private static async Task DropDatabaseAsync(string database)
    {
        SqlConnection.ClearAllPools();
        if (!Regex.IsMatch(database,"^AstraWorkflowTest_[a-f0-9]{32}$"))
            throw new InvalidOperationException("Refusing to drop an unexpected test database name.");
        using var master=new SqlConnection(MasterConnection);
        await master.ExecuteAsync($"ALTER DATABASE [{database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{database}]");
    }
}
