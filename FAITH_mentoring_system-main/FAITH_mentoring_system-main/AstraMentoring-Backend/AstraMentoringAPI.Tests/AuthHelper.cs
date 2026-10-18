using System.Net.Http.Json;

namespace AstraMentoringAPI.Tests;

public static class AuthHelper
{
    private record LoginRequestDto(string Email, string Password);
    private record LoginResponseDto(string Token, string Role);

    // Logs in for real over HTTP, the same as every portal's own login
    // flow — returns a genuine, currently-valid JWT rather than a
    // hand-built one, so these tests exercise the exact token the app
    // itself issues.
    // One login per account per test run: Auth/login is rate-limited to 5 per minute.
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, Lazy<Task<string>>> Tokens = new();

    public static Task<string> GetTokenAsync(HttpClient client, string email, string? password = null)
        => Tokens.GetOrAdd(email, _ => new Lazy<Task<string>>(() => LoginAsync(client, email, password))).Value;

    private static async Task<string> LoginAsync(HttpClient client, string email, string? password)
    {
        var response = await client.PostAsJsonAsync("/api/Auth/login", new LoginRequestDto(email, password ?? TestAccounts.Password));
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<LoginResponseDto>();
        return body?.Token ?? throw new InvalidOperationException($"Login for {email} returned no token.");
    }

    public static void SetBearerToken(HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
    }
}
