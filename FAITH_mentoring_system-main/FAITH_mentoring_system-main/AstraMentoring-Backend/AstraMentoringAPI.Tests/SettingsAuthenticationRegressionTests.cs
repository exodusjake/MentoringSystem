using System.Security.Claims;
using AstraMentoringAPI.Authentication;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;

namespace AstraMentoringAPI.Tests;

// Isolated authentication event tests: delegates replace DB access; no app host.
public class SettingsAuthenticationRegressionTests
{
    private static readonly AuthenticationScheme Scheme = new("Bearer",null,typeof(JwtBearerHandler));
    private static TokenValidatedContext Context(string? id = "12")
    {
        var http = new DefaultHttpContext();
        http.Response.Body = new MemoryStream();
        return new TokenValidatedContext(http,Scheme,new JwtBearerOptions()) {
            Principal = new ClaimsPrincipal(new ClaimsIdentity(id == null ? Array.Empty<Claim>() : new[] {new Claim(ClaimTypes.NameIdentifier,id)},"test")) };
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    [InlineData(null)]
    public async Task ActiveCheckRemainsRequired(bool? active)
    {
        var context=Context();
        await AccountAuthenticationEvents.ValidateAsync(context,_=>Task.FromResult(active));
        if(active==true) Assert.Null(context.Result);
        else Assert.NotNull(context.Result?.Failure);
        var challenge=new JwtBearerChallengeContext(context.HttpContext,Scheme,context.Options,new AuthenticationProperties());
        await AccountAuthenticationEvents.ChallengeAsync(challenge);
        Assert.False(challenge.Handled); // middleware's genuine 401 behavior retained
    }

    [Fact]
    public async Task LookupTimeoutFailsClosedWith503InsteadOfLogout401()
    {
        var context=Context();
        await AccountAuthenticationEvents.ValidateAsync(context,_=>throw new TimeoutException());
        Assert.NotNull(context.Result?.Failure);
        var challenge=new JwtBearerChallengeContext(context.HttpContext,Scheme,context.Options,new AuthenticationProperties());
        await AccountAuthenticationEvents.ChallengeAsync(challenge);
        Assert.True(challenge.Handled);
        Assert.Equal(503,context.Response.StatusCode);
    }

    [Fact]
    public async Task InvalidIdentityCannotUseUnavailableFallback()
    {
        var context=Context(null);
        await AccountAuthenticationEvents.ValidateAsync(context,_=>throw new Exception("Lookup must not run"));
        Assert.NotNull(context.Result?.Failure);
        var challenge=new JwtBearerChallengeContext(context.HttpContext,Scheme,context.Options,new AuthenticationProperties());
        await AccountAuthenticationEvents.ChallengeAsync(challenge);
        Assert.False(challenge.Handled);
    }
}
