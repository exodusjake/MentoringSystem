using System.Net;
using System.Net.Http.Json;

namespace AstraMentoringAPI.Tests;

// QRAttendanceController previously had no role restriction at all —
// a mentee could call the mentor-only /scan endpoint directly and mark
// any session's attendance without ever being scanned by an actual
// mentor. /generate and /scan don't get exercised end-to-end here
// (a real scan marks real attendance and completes a real session —
// too destructive to run repeatedly against the shared dev database);
// these tests only prove the role boundary itself.
public class QRAttendanceAuthorizationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    public QRAttendanceAuthorizationTests(TestWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Mentee_Cannot_Call_The_Mentor_Only_Scan_Endpoint()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MenteeEmail));

        var response = await client.PostAsJsonAsync("/api/QRAttendance/scan", new { token = "not-a-real-token" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mentor_Cannot_Call_The_Mentee_Only_Generate_Endpoint()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MentorEmail));

        var response = await client.PostAsJsonAsync("/api/QRAttendance/generate", new
        {
            sessionId = TestAccounts.MentorOwnedSessionId,
            menteeId = TestAccounts.MenteeId,
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
