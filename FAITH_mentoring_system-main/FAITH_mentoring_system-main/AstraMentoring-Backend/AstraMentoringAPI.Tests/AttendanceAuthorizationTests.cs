using System.Net;
using System.Net.Http.Json;
using Dapper;

namespace AstraMentoringAPI.Tests;

// Attendance is the system's core record of truth — these tests exist
// because AttendanceController previously had no role or ownership check
// at all (see ARCHITECTURE.md, "Security pattern"). Every rejection test
// here is a request that used to succeed.
public class AttendanceAuthorizationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    public AttendanceAuthorizationTests(TestWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Mentee_Cannot_List_All_Attendance()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MenteeEmail));

        var response = await client.GetAsync("/api/Attendance");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mentee_Cannot_Edit_Any_Attendance_Record()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MenteeEmail));

        var response = await client.PutAsJsonAsync($"/api/Attendance/{TestAccounts.MentorOwnedAttendanceId}", new
        {
            AttendanceID = TestAccounts.MentorOwnedAttendanceId,
            SessionID = TestAccounts.MentorOwnedSessionId,
            MenteeID = TestAccounts.MenteeId,
            IsPresent = false,
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mentee_Cannot_Delete_Any_Attendance_Record()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MenteeEmail));

        var response = await client.DeleteAsync($"/api/Attendance/{TestAccounts.MentorOwnedAttendanceId}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mentor_Cannot_Edit_Another_Mentors_Attendance_Record()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.OtherMentorEmail));

        var response = await client.PatchAsJsonAsync(
            $"/api/Attendance/{TestAccounts.MentorOwnedAttendanceId}/text-fields",
            new { remarks = "hijack attempt", mentorNotes = (string?)null, absenceReason = (string?)null });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Owning_Mentor_Can_Edit_Their_Own_Attendance_Record()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MentorEmail));

        // Real dev database: keep the current values and put them back afterwards.
        TextFields original;
        using (var conn = TestDb.Open())
            original = await conn.QuerySingleAsync<TextFields>(
                "SELECT Remarks, MentorNotes, AbsenceReason FROM Attendance WHERE AttendanceID = @id",
                new { id = TestAccounts.MentorOwnedAttendanceId });

        try
        {
            var response = await client.PatchAsJsonAsync(
                $"/api/Attendance/{TestAccounts.MentorOwnedAttendanceId}/text-fields",
                new { remarks = "automated-test-marker", mentorNotes = original.MentorNotes, absenceReason = original.AbsenceReason });

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        finally
        {
            await client.PatchAsJsonAsync(
                $"/api/Attendance/{TestAccounts.MentorOwnedAttendanceId}/text-fields",
                new { remarks = original.Remarks, mentorNotes = original.MentorNotes, absenceReason = original.AbsenceReason });
        }
    }

    private class TextFields
    {
        public string? Remarks { get; set; }
        public string? MentorNotes { get; set; }
        public string? AbsenceReason { get; set; }
    }
}
