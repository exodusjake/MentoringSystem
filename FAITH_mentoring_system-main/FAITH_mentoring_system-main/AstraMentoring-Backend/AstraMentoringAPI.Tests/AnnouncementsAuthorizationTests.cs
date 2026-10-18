using System.Net;
using System.Net.Http.Json;

namespace AstraMentoringAPI.Tests;

// AnnouncementsController previously trusted PostedByUserID straight from
// the request body with no role check — a mentee could post content that
// displayed as if it came from Admin, or delete/edit anyone else's post.
public class AnnouncementsAuthorizationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    public AnnouncementsAuthorizationTests(TestWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Mentee_Cannot_Post_An_Announcement()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MenteeEmail));

        var response = await client.PostAsJsonAsync("/api/Announcements", new
        {
            Title = "Impersonation attempt",
            Content = "<script>alert(1)</script>",
            TargetAudience = "Mentee",
            PostedByUserID = 22, // claims to be a different (Admin) account
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mentor_Cannot_Delete_Another_Mentors_Announcement()
    {
        var client = _factory.CreateClient();
        var ownerToken = await AuthHelper.GetTokenAsync(client, TestAccounts.MentorEmail);
        AuthHelper.SetBearerToken(client, ownerToken);

        var created = await client.PostAsJsonAsync("/api/Announcements", new
        {
            Title = "automated-test-marker",
            Content = "temporary",
            TargetAudience = "Mentee",
            PostedByUserID = TestAccounts.MentorId,
        });
        created.EnsureSuccessStatusCode();
        var body = await created.Content.ReadFromJsonAsync<CreatedAnnouncementDto>();

        try
        {
            AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.OtherMentorEmail));
            var deleteAttempt = await client.DeleteAsync($"/api/Announcements/{body!.AnnouncementID}");
            Assert.Equal(HttpStatusCode.Forbidden, deleteAttempt.StatusCode);
        }
        finally
        {
            AuthHelper.SetBearerToken(client, ownerToken);
            await client.DeleteAsync($"/api/Announcements/{body!.AnnouncementID}");
        }
    }

    [Fact]
    public async Task Posting_Mentor_Can_Post_And_Delete_Their_Own_Announcement()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MentorEmail));

        var created = await client.PostAsJsonAsync("/api/Announcements", new
        {
            Title = "automated-test-marker",
            Content = "temporary",
            TargetAudience = "Mentee",
            PostedByUserID = 999, // claimed value — must be ignored server-side
        });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var body = await created.Content.ReadFromJsonAsync<CreatedAnnouncementDto>();

        var deleteResponse = await client.DeleteAsync($"/api/Announcements/{body!.AnnouncementID}");
        Assert.Equal(HttpStatusCode.OK, deleteResponse.StatusCode);
    }

    private record CreatedAnnouncementDto(string Message, int AnnouncementID);
}
