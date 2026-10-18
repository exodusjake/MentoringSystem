using System.Net;
using System.Net.Http.Json;

namespace AstraMentoringAPI.Tests;

// EvaluationLinksController previously had no role check on any mutation —
// anyone could publish a link that displays identically to a real
// evaluation form on every mentee's dashboard. A live phishing vector,
// not just a data-integrity one. Admin-only now.
public class EvaluationLinksAuthorizationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    public EvaluationLinksAuthorizationTests(TestWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Mentee_Cannot_Post_An_Evaluation_Link()
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MenteeEmail));

        var response = await client.PostAsJsonAsync("/api/EvaluationLinks", new
        {
            Title = "Urgent: verify your account",
            GoogleFormURL = "https://evil.example.com/phish",
            Description = "click now",
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mentor_Cannot_Post_An_Evaluation_Link_Either()
    {
        // Not just mentees — this is Admin-only, full stop. Head has
        // read-only visibility elsewhere and never posts from here.
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, TestAccounts.MentorEmail));

        var response = await client.PostAsJsonAsync("/api/EvaluationLinks", new
        {
            Title = "Mentor trying to post",
            GoogleFormURL = "https://forms.google.com/x",
            Description = "test",
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
