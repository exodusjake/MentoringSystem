using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Data.SqlClient;
using System.Security.Claims;

namespace AstraMentoringAPI.Authentication;

public static class AccountAuthenticationEvents
{
    private static readonly object UnavailableKey = new();

    public static async Task ValidateAsync(TokenValidatedContext context, Func<int, Task<bool?>> lookupActive)
    {
        if (!int.TryParse(context.Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var userId))
        {
            context.Fail("Invalid token.");
            return;
        }
        try
        {
            if (await lookupActive(userId) != true)
                context.Fail("This account has been deactivated.");
        }
        catch (Exception error) when (error is SqlException or TimeoutException)
        {
            // Fail closed, but an unavailable account lookup does not prove
            // that this user's signed token is invalid. Do not turn it into 401.
            context.HttpContext.Items[UnavailableKey] = true;
            context.Fail("Account verification unavailable.");
        }
    }

    public static async Task ChallengeAsync(JwtBearerChallengeContext context)
    {
        if (!context.HttpContext.Items.ContainsKey(UnavailableKey)) return;
        context.HandleResponse();
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { message = "Account verification is temporarily unavailable. Please try again." });
    }
}
