using System.Net;
using System.Net.Http.Json;
using Dapper;

namespace AstraMentoringAPI.Tests;

// SessionsController previously had no role or ownership check — any
// signed-in account could create/edit/delete any session, and a PUT body
// could silently reassign a session's MentorID via the generic repo's
// full-column UPDATE. None of these tests touch the real owned session
// destructively — the one positive-path test restores what it changes.
public class SessionsAuthorizationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    public SessionsAuthorizationTests(TestWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Mentee_Cannot_Create_A_Session()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MenteeEmail));

        var response = await client.PostAsJsonAsync("/api/Sessions", new
        {
            MentorID = TestAccounts.MentorId,
            SessionDate = DateTime.Today.AddDays(30),
            Status = "Scheduled",
            Notes = "[BS IE 1A] impersonation attempt",
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mentor_Cannot_Create_A_Session_Claiming_Another_Mentors_Id()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.OtherMentorEmail));

        var response = await client.PostAsJsonAsync("/api/Sessions", new
        {
            MentorID = TestAccounts.MentorId, // claims to be a different mentor
            SessionDate = DateTime.Today.AddDays(30),
            Status = "Scheduled",
            Notes = "[BS IE 1A] hijack attempt",
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mentor_Cannot_Delete_A_Session_They_Dont_Own()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.OtherMentorEmail));

        var response = await client.DeleteAsync($"/api/Sessions/{TestAccounts.MentorOwnedSessionId}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mentor_Cannot_Patch_Log_Status_On_A_Session_They_Dont_Own()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.OtherMentorEmail));

        var response = await client.PatchAsJsonAsync(
            $"/api/Sessions/{TestAccounts.MentorOwnedSessionId}/log-status",
            new { logStatus = "Draft" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Owning_Mentor_Can_Patch_Their_Own_Sessions_Log_Status()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MentorEmail));

        // Real dev database: keep LogStatus and SubmittedAt (re-stamped on every
        // "Submitted") and put both back afterwards.
        SessionLogState original;
        using (var conn = TestDb.Open())
            original = await conn.QuerySingleAsync<SessionLogState>(
                "SELECT LogStatus, SubmittedAt FROM Sessions WHERE SessionID = @id",
                new { id = TestAccounts.MentorOwnedSessionId });
        var originalLogStatus = original.LogStatus ?? "Submitted";

        try
        {
            var response = await client.PatchAsJsonAsync(
                $"/api/Sessions/{TestAccounts.MentorOwnedSessionId}/log-status",
                new { logStatus = originalLogStatus == "Draft" ? "Submitted" : "Draft" });

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        finally
        {
            using var conn = TestDb.Open();
            await conn.ExecuteAsync(
                "UPDATE Sessions SET LogStatus = @LogStatus, SubmittedAt = @SubmittedAt WHERE SessionID = @id",
                new { original.LogStatus, original.SubmittedAt, id = TestAccounts.MentorOwnedSessionId });
        }
    }

    private class SessionLogState
    {
        public string? LogStatus { get; set; }
        public DateTime? SubmittedAt { get; set; }
    }
}
