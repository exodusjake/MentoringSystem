using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace AstraMentoringAPI.Tests;

// Hosts the real app in-process against the same appsettings.json (and so
// the same LocalDB) the app uses for local dev — these are integration
// tests against real data, the same way this project has always been
// verified (curl + direct SQL checks), just automated and repeatable.
// Forced to "Development" so Program.cs's Production-only startup guards
// (refusing to boot on the checked-in LocalDB connection string / dev JWT
// key) never fire here.
public class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        // Blank the Brevo key (local user secrets have a real one) so tests never send emails.
        builder.ConfigureAppConfiguration((_, config) =>
            config.AddInMemoryCollection(new Dictionary<string, string?> { ["Brevo:ApiKey"] = "", ["Smtp:Password"] = "", ["Auth:RequireEmailCode"] = "false" }));
    }
}
