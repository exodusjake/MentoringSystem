using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoringAPI.Tests;

// Existing dummy accounts in the local dev database. IDs are looked up by
// email at run time, so the tests keep working when record IDs change.
// The shared password is read from the ASTRA_TEST_PASSWORD environment
// variable so it is never committed.
public static class TestAccounts
{
    public const string MentorEmail      = "miguel.mentor@firstasia.edu.ph";
    public const string OtherMentorEmail = "jasmin.mentor@firstasia.edu.ph";
    public const string MenteeEmail      = "francis.mentee@firstasia.edu.ph"; // assigned to MentorEmail

    public static string Password =>
        Environment.GetEnvironmentVariable("ASTRA_TEST_PASSWORD")
        ?? throw new InvalidOperationException("Set the ASTRA_TEST_PASSWORD environment variable to the test accounts' password.");

    public static int MentorId                => Ids.Value.MentorId;
    public static int OtherMentorId           => Ids.Value.OtherMentorId;
    public static int MenteeId                => Ids.Value.MenteeId;
    public static int MentorOwnedSessionId    => Ids.Value.SessionId;
    public static int MentorOwnedAttendanceId => Ids.Value.AttendanceId;

    private record ResolvedIds(int MentorId, int OtherMentorId, int MenteeId, int SessionId, int AttendanceId);

    private static readonly Lazy<ResolvedIds> Ids = new(Resolve);

    private static ResolvedIds Resolve()
    {
        using var conn = TestDb.Open();
        int UserId(string email) =>
            conn.QuerySingleOrDefault<int?>("SELECT UserID FROM Users WHERE Email = @email", new { email })
            ?? throw new InvalidOperationException($"Test account {email} not found in the local database.");

        var mentorId = UserId(MentorEmail);
        var menteeId = UserId(MenteeEmail);
        var owned = conn.QueryFirstOrDefault<(int AttendanceID, int SessionID)?>(@"
            SELECT TOP 1 a.AttendanceID, a.SessionID
            FROM Attendance a JOIN Sessions s ON s.SessionID = a.SessionID
            WHERE s.MentorID = @mentorId AND a.MenteeID = @menteeId
            ORDER BY a.AttendanceID", new { mentorId, menteeId })
            ?? throw new InvalidOperationException($"{MentorEmail} has no session with an attendance record for {MenteeEmail}.");

        return new ResolvedIds(mentorId, UserId(OtherMentorEmail), menteeId, owned.SessionID, owned.AttendanceID);
    }
}

public static class TestDb
{
    private static readonly Lazy<string> ConnectionString = new(() =>
        new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Development.json", optional: true)
            .Build()
            .GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("DefaultConnection not found in appsettings.json."));

    public static SqlConnection Open()
    {
        var conn = new SqlConnection(ConnectionString.Value);
        conn.Open();
        return conn;
    }
}
